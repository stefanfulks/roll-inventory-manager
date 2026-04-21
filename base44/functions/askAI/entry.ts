/**
 * askAI — Base44 backend function.
 *
 * Chat endpoint for the TexasTurf Inventory Assistant. Encodes the Roll
 * Selection Guidelines SOP in the system prompt and exposes tools that
 * apply SOP priority rules (child-first, dye-lot consistency, etc.).
 *
 * Required env:  ANTHROPIC_API_KEY
 *
 * Request:       { messages: [{role, content}, ...] }
 * Response:      { reply: string, actionsTaken: string[], error?: string }
 */

import Anthropic from '@anthropic-ai/sdk';
import { createClientFromRequest } from '@base44/sdk';

// Canonical statuses — mirror of rollStatus.js
const ROLL_STATUS = {
  AVAILABLE: 'Available',
  PLANNED: 'Planned',
  ALLOCATED: 'Allocated',
  STAGED: 'Staged',
  DISPATCHED: 'Dispatched',
  CONSUMED: 'Consumed',
  RETURNED_HOLD: 'ReturnedHold',
  AWAITING_LOCATION: 'AwaitingLocation',
  SCRAPPED: 'Scrapped',
};
const ROLL_ACTIVE_JOB = ['Planned', 'Allocated', 'Staged', 'Dispatched'];

function rollStatusFromAlloc(s) {
  if (s === 'Cancelled') return 'Available';
  return ROLL_ACTIVE_JOB.includes(s) ? s : null;
}

// ---------- Tools ----------
const TOOLS = [
  {
    name: 'search_rolls',
    description:
      'Search for rolls by product, dye lot, status, tag number, or location. ' +
      'Use this first to resolve a roll reference from the user before acting on it.',
    input_schema: {
      type: 'object',
      properties: {
        product_name: { type: 'string' },
        dye_lot: { type: 'string' },
        status: {
          type: 'string',
          enum: Object.values(ROLL_STATUS),
        },
        tag: { type: 'string', description: 'TT SKU tag number or manufacturer roll number' },
        min_length_ft: { type: 'number' },
        max_results: { type: 'number' },
      },
    },
  },
  {
    name: 'get_roll',
    description: 'Fetch a single roll by id.',
    input_schema: {
      type: 'object',
      properties: { roll_id: { type: 'string' } },
      required: ['roll_id'],
    },
  },
  {
    name: 'search_jobs',
    description: 'Search jobs by job number, customer, or status.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        status: { type: 'string' },
        max_results: { type: 'number' },
      },
    },
  },
  {
    name: 'suggest_rolls_for_job',
    description:
      'Recommend rolls to plan for a specific linear run, applying the SOP priority rules: ' +
      '(1) child rolls before parent rolls, (2) dye-lot consistency within the area, ' +
      '(3) exact-length child rolls preferred, (4) older rolls before newer, ' +
      '(5) more-accessible warehouse locations first. Returns ranked suggestions — ' +
      'this tool does NOT modify data. Use for planning guidance before assign_roll_to_job.',
    input_schema: {
      type: 'object',
      properties: {
        product_name: { type: 'string', description: 'SKU / product name to plan for' },
        required_length_ft: { type: 'number', description: 'Linear feet needed for this run' },
        width_ft: { type: 'number', description: 'Required width in feet (e.g., 15)' },
        dye_lot: {
          type: 'string',
          description: 'If set, filter to this dye lot only (for continuous areas)',
        },
        max_suggestions: { type: 'number' },
      },
      required: ['product_name', 'required_length_ft'],
    },
  },
  {
    name: 'assign_roll_to_job',
    description:
      'Assign a roll to a job. Creates an allocation and updates roll.status. ' +
      'The SOP distinguishes two assignment phases: ' +
      'Planned (Office, forecasting, any time) and Allocated (Warehouse, ~1 week before install). ' +
      'Default is Planned. ALWAYS confirm the roll and job with the user before calling.',
    input_schema: {
      type: 'object',
      properties: {
        roll_id: { type: 'string' },
        job_id: { type: 'string' },
        allocation_status: {
          type: 'string',
          enum: ['Planned', 'Allocated', 'Staged'],
          description: 'Initial status (default Planned per SOP)',
        },
      },
      required: ['roll_id', 'job_id'],
    },
  },
  {
    name: 'release_roll_from_job',
    description:
      'Release a roll from its currently-assigned job. Deletes the active allocation ' +
      'and sets the roll back to Available. ALWAYS confirm with the user first.',
    input_schema: {
      type: 'object',
      properties: { roll_id: { type: 'string' } },
      required: ['roll_id'],
    },
  },
  {
    name: 'update_roll_status',
    description:
      'Manually change a roll to a non-job status ' +
      '(AwaitingLocation, ReturnedHold, Consumed, Scrapped) or back to Available when ' +
      'no allocation exists. For job assignment/release, use assign_roll_to_job or ' +
      'release_roll_from_job instead.',
    input_schema: {
      type: 'object',
      properties: {
        roll_id: { type: 'string' },
        status: {
          type: 'string',
          enum: ['Available', 'AwaitingLocation', 'ReturnedHold', 'Consumed', 'Scrapped'],
        },
      },
      required: ['roll_id', 'status'],
    },
  },
  {
    name: 'get_dashboard_stats',
    description: 'Live dashboard: total rolls, sq ft, counts by status, low-stock products.',
    input_schema: { type: 'object', properties: {} },
  },
];

// ---------- SOP-aware helpers ----------

/**
 * Rank rolls for planning per SOP Step 4-7:
 *   - Child rolls before parent rolls
 *   - Exact-length match > slight-over > significantly-over
 *   - Older (earlier date_received) before newer
 *   - More-accessible warehouse locations first (bin sort_order, row depth)
 *   - Minimum-child-length protection: flag child rolls under 20 LF (TBD rule)
 */
function rankRollsForPlanning(rolls, requiredLengthFt) {
  const PROTECTED_CHILD_MIN_FT = 20;

  const score = (r) => {
    let s = 0;
    // 1. Child preferred
    if (r.roll_type === 'Child') s += 1000;
    // 2. Length fit — closer to required is better (if >=)
    const len = r.current_length_ft || 0;
    if (len >= requiredLengthFt) {
      const overshoot = len - requiredLengthFt;
      s += 500 - Math.min(overshoot * 2, 400);
    } else {
      s -= 2000; // too short to fulfill solo
    }
    // 3. Older preferred (slightly)
    if (r.date_received) {
      const ageDays = (Date.now() - new Date(r.date_received)) / (1000 * 60 * 60 * 24);
      s += Math.min(ageDays / 10, 50);
    }
    // 4. Warehouse accessibility — row A (front) > B > C
    if (r.location_row === 'A') s += 30;
    else if (r.location_row === 'B') s += 15;

    return s;
  };

  return rolls
    .map(r => {
      const s = score(r);
      const warnings = [];
      if (r.roll_type === 'Child' && (r.current_length_ft || 0) < PROTECTED_CHILD_MIN_FT) {
        warnings.push(`Short child roll (${r.current_length_ft}ft < ${PROTECTED_CHILD_MIN_FT}ft) — SOP suggests preserving for future small jobs`);
      }
      if ((r.current_length_ft || 0) < requiredLengthFt) {
        warnings.push(`Only ${r.current_length_ft}ft available — shorter than the ${requiredLengthFt}ft requested run`);
      }
      return { ...r, _score: s, _warnings: warnings };
    })
    .sort((a, b) => b._score - a._score);
}

// ---------- Tool execution ----------
async function executeTool(base44, name, args, actionsTaken) {
  switch (name) {
    case 'search_rolls': {
      const filters = {};
      if (args.status) filters.status = args.status;
      if (args.dye_lot) filters.dye_lot = args.dye_lot;
      const max = args.max_results || 20;
      const all = await base44.entities.Roll.filter(filters, '-created_date', 500);
      let filtered = all;
      if (args.product_name) {
        const q = args.product_name.toLowerCase();
        filtered = filtered.filter(r => r.product_name?.toLowerCase().includes(q));
      }
      if (args.tag) {
        const q = args.tag.toLowerCase();
        filtered = filtered.filter(r =>
          r.tt_sku_tag_number?.toLowerCase().includes(q) ||
          r.roll_tag?.toLowerCase().includes(q) ||
          r.manufacturer_roll_number?.toLowerCase().includes(q)
        );
      }
      if (args.min_length_ft != null) {
        filtered = filtered.filter(r => (r.current_length_ft || 0) >= args.min_length_ft);
      }
      return filtered.slice(0, max).map(r => ({
        id: r.id,
        tag: r.tt_sku_tag_number || r.roll_tag,
        product_name: r.product_name,
        dye_lot: r.dye_lot,
        width_ft: r.width_ft,
        current_length_ft: r.current_length_ft,
        status: r.status,
        roll_type: r.roll_type,
        location: r.location_bin && r.location_row ? `${r.location_bin}-${r.location_row}` : null,
        allocated_job_id: r.allocated_job_id,
        date_received: r.date_received,
      }));
    }

    case 'get_roll': {
      const [r] = await base44.entities.Roll.filter({ id: args.roll_id });
      return r || { error: 'Roll not found' };
    }

    case 'search_jobs': {
      const filters = {};
      if (args.status) filters.status = args.status;
      const all = await base44.entities.Job.filter(filters, '-created_date', 200);
      const max = args.max_results || 20;
      let filtered = all;
      if (args.query) {
        const q = args.query.toLowerCase();
        filtered = filtered.filter(j =>
          j.job_number?.toLowerCase().includes(q) ||
          j.job_name?.toLowerCase().includes(q) ||
          j.customer_name?.toLowerCase().includes(q)
        );
      }
      return filtered.slice(0, max).map(j => ({
        id: j.id,
        job_number: j.job_number,
        job_name: j.job_name,
        customer_name: j.customer_name,
        status: j.status,
        fulfillment_for: j.fulfillment_for,
      }));
    }

    case 'suggest_rolls_for_job': {
      const q = (args.product_name || '').toLowerCase();
      const all = await base44.entities.Roll.filter(
        { status: ROLL_STATUS.AVAILABLE },
        '-created_date',
        1000
      );
      let candidates = all.filter(r => r.product_name?.toLowerCase().includes(q));
      if (args.width_ft) {
        candidates = candidates.filter(r => Number(r.width_ft) === Number(args.width_ft));
      }
      if (args.dye_lot) {
        candidates = candidates.filter(r => r.dye_lot === args.dye_lot);
      }

      const ranked = rankRollsForPlanning(candidates, args.required_length_ft);
      const topN = (args.max_suggestions || 5);

      // Also group top candidates by dye lot so the user can see dye-lot
      // consistency options (SOP Step 8).
      const byDyeLot = {};
      for (const r of ranked.slice(0, 50)) {
        const key = r.dye_lot || '(no dye lot)';
        if (!byDyeLot[key]) byDyeLot[key] = { dye_lot: key, rolls: [], total_length_ft: 0 };
        byDyeLot[key].rolls.push({
          id: r.id,
          tag: r.tt_sku_tag_number || r.roll_tag,
          length_ft: r.current_length_ft,
          width_ft: r.width_ft,
          roll_type: r.roll_type,
          location: r.location_bin && r.location_row ? `${r.location_bin}-${r.location_row}` : null,
        });
        byDyeLot[key].total_length_ft += (r.current_length_ft || 0);
      }

      return {
        sop_summary:
          "Ranked per SOP: child rolls first, exact-length preferred, older rolls first, " +
          "front-row locations preferred. Check dye-lot consistency before confirming.",
        top_suggestions: ranked.slice(0, topN).map(r => ({
          id: r.id,
          tag: r.tt_sku_tag_number || r.roll_tag,
          product_name: r.product_name,
          dye_lot: r.dye_lot,
          width_ft: r.width_ft,
          current_length_ft: r.current_length_ft,
          roll_type: r.roll_type,
          location: r.location_bin && r.location_row ? `${r.location_bin}-${r.location_row}` : null,
          date_received: r.date_received,
          warnings: r._warnings,
        })),
        by_dye_lot: Object.values(byDyeLot)
          .sort((a, b) => b.total_length_ft - a.total_length_ft)
          .slice(0, 5),
      };
    }

    case 'assign_roll_to_job': {
      const [roll] = await base44.entities.Roll.filter({ id: args.roll_id });
      const [job] = await base44.entities.Job.filter({ id: args.job_id });
      if (!roll) return { error: 'Roll not found' };
      if (!job) return { error: 'Job not found' };
      if (ROLL_ACTIVE_JOB.includes(roll.status)) {
        return {
          error: `Roll is already ${roll.status} on another job. Release it first or ask the user to confirm swap.`,
          current_job_id: roll.allocated_job_id,
        };
      }
      const allocStatus = args.allocation_status || ROLL_STATUS.PLANNED;
      const alloc = await base44.entities.Allocation.create({
        job_id: job.id,
        job_name: job.job_name || job.job_number,
        product_id: roll.product_id,
        product_name: roll.product_name,
        width_ft: roll.width_ft,
        dye_lot_preference: roll.dye_lot,
        requested_length_ft: roll.current_length_ft,
        allocated_roll_ids: [roll.id],
        item_type: 'roll',
        status: allocStatus,
      });
      await base44.entities.Roll.update(roll.id, {
        status: rollStatusFromAlloc(allocStatus),
        allocated_job_id: job.id,
      });
      actionsTaken.push(
        `Assigned roll ${roll.tt_sku_tag_number || roll.roll_tag} to job ${job.job_number} (${allocStatus})`
      );
      return { ok: true, allocation_id: alloc.id };
    }

    case 'release_roll_from_job': {
      const [roll] = await base44.entities.Roll.filter({ id: args.roll_id });
      if (!roll) return { error: 'Roll not found' };
      const allAllocs = await base44.entities.Allocation.list();
      const active = allAllocs.find(a =>
        (a.allocated_roll_ids || []).includes(roll.id) &&
        a.status !== 'Cancelled' &&
        a.status !== 'Completed'
      );
      if (active) await base44.entities.Allocation.delete(active.id);
      await base44.entities.Roll.update(roll.id, {
        status: ROLL_STATUS.AVAILABLE,
        allocated_job_id: null,
      });
      actionsTaken.push(`Released roll ${roll.tt_sku_tag_number || roll.roll_tag} back to Available`);
      return { ok: true };
    }

    case 'update_roll_status': {
      await base44.entities.Roll.update(args.roll_id, { status: args.status });
      actionsTaken.push(`Set roll ${args.roll_id} status to ${args.status}`);
      return { ok: true };
    }

    case 'get_dashboard_stats': {
      const [rolls, products, allocations] = await Promise.all([
        base44.entities.Roll.list('-created_date', 2000),
        base44.entities.Product.list(),
        base44.entities.Allocation.list(),
      ]);
      const terminal = ['Consumed', 'Scrapped'];
      const active = rolls.filter(r => !terminal.includes(r.status));
      const available = rolls.filter(r => r.status === ROLL_STATUS.AVAILABLE);
      const byStatus = {};
      for (const r of rolls) byStatus[r.status] = (byStatus[r.status] || 0) + 1;
      const totalSqft = available.reduce((s, r) => s + (r.current_length_ft * r.width_ft || 0), 0);

      const lowStock = products.filter(p => {
        if (!p.min_stock_level_ft) return false;
        const total = available
          .filter(r => r.product_id === p.id)
          .reduce((s, r) => s + (r.current_length_ft || 0), 0);
        return total < p.min_stock_level_ft;
      }).map(p => ({ product_name: p.product_name, min_ft: p.min_stock_level_ft }));

      return {
        total_rolls_active: active.length,
        total_rolls_available: available.length,
        total_sqft_available: Math.round(totalSqft),
        rolls_by_status: byStatus,
        low_stock_products: lowStock,
        active_allocations: allocations.filter(a => a.status !== 'Cancelled' && a.status !== 'Completed').length,
      };
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// ---------- System prompt ----------
const SYSTEM_PROMPT = `You are the TexasTurf Inventory Assistant embedded in the roll inventory app. You encode and enforce the Roll Selection Guidelines SOP.

TAXONOMY (SOP)
Roll statuses move through four job phases:
- Planned    — Office forecasts, any time after job creation
- Allocated  — Warehouse commits ~1 week before install
- Staged     — Warehouse physically pulls and stages <1 week before install
- Fulfilled  — Dispatched to job site (stored as "Dispatched" in the database; show it as "Fulfilled" to users)
Non-job statuses: Available, AwaitingLocation, ReturnedHold, Consumed, Scrapped.

SOP PRIORITY RULES FOR PLANNING
When planning rolls for a job, always follow this order:
1. Child rolls BEFORE parent rolls — exhaust child options first
2. Exact-length child rolls get top priority (provided dye lot matches)
3. Dye lot consistency within a continuous installation area is required
4. Different dye lots OK only if separated by concrete sidewalk, thick edging, hardscape (NOT metal edging or bendaboard)
5. Older rolls (earlier date_received) before newer
6. More-accessible warehouse rows (A > B > C) before less-accessible
7. Future rule (TBD): child rolls under ~20 LF may be protected — flag these with a warning
8. Evaluate across upcoming jobs, not just the current one

BEHAVIOR RULES
- For write actions (assign, release, update status), briefly confirm with the user before executing — UNLESS they've given clear authorization in their latest message ("Assign roll 1234 to job 9001" is authorization; "What rolls are on job 9001?" is not).
- Resolve names/tags to ids using search_rolls / search_jobs before acting. Never guess ids.
- If a search is ambiguous, ask the user to disambiguate.
- When the user asks "what rolls should I plan for job X / run Y / SKU Z", use suggest_rolls_for_job and present the SOP-ranked suggestions, NOT just a raw search.
- When suggesting rolls, surface any warnings from the tool (short child rolls, length shortfalls, dye-lot mix risk).
- Be concise. This is a work tool.
- Don't invent SOP rules. If the SOP is silent on something, say so and defer to the user.
`;

// ---------- Handler ----------
export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { messages } = req.body || {};
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages array required' });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

    const anthropic = new Anthropic({ apiKey });
    const base44 = createClientFromRequest(req);
    const actionsTaken = [];

    let conversation = [...messages];
    const MAX_ITERATIONS = 8;

    for (let i = 0; i < MAX_ITERATIONS; i += 1) {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-5',
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        tools: TOOLS,
        messages: conversation,
      });

      const textBlocks = response.content.filter(b => b.type === 'text').map(b => b.text);
      const toolUses = response.content.filter(b => b.type === 'tool_use');

      if (response.stop_reason === 'end_turn' || toolUses.length === 0) {
        return res.status(200).json({
          reply: textBlocks.join('\n\n').trim() || '(no reply)',
          actionsTaken,
        });
      }

      conversation.push({ role: 'assistant', content: response.content });

      const toolResults = [];
      for (const tu of toolUses) {
        try {
          const result = await executeTool(base44, tu.name, tu.input || {}, actionsTaken);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: tu.id,
            content: JSON.stringify(result),
          });
        } catch (e) {
          toolResults.push({
            type: 'tool_result',
            tool_use_id: tu.id,
            content: JSON.stringify({ error: e.message || String(e) }),
            is_error: true,
          });
        }
      }
      conversation.push({ role: 'user', content: toolResults });
    }

    return res.status(200).json({
      reply: 'Hit tool-use iteration limit. Try rephrasing?',
      actionsTaken,
    });
  } catch (e) {
    console.error('askAI error', e);
    return res.status(500).json({ error: e.message || 'Internal error' });
  }
}
