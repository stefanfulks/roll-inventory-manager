# TexasTurf Roll Inventory — Fixes & AI Assistant (v2, SOP-aligned)

This patch aligns the code with your **Roll Selection Guidelines SOP**, fixes the roll-status sync bugs, makes the dashboard interactive, and adds an SOP-trained AI assistant.

**What changed in v2 vs v1:** I had renamed `Planned → TempHold` in v1 based on outdated Help text. That was wrong — your SOP formally defines `Planned` (Office action) vs `Allocated` (Warehouse action) as distinct phases. V2 reverts that rename and uses SOP vocabulary throughout.

---

## How to apply

Unzip at your repo root (paths match your project layout), then:

```bash
npm install   # adds @anthropic-ai/sdk for the askAI backend function
```

Push to the Base44-connected GitHub repo. Base44 picks up the frontend changes automatically.

For the AI assistant backend:
1. In Base44, make sure the new function `base44/functions/askAI` is registered
2. Set env var `ANTHROPIC_API_KEY` on that function (get a key at console.anthropic.com)

---

## Canonical status taxonomy (SOP-aligned)

| Roll status | Owner | Timing | Meaning |
| --- | --- | --- | --- |
| `Available` | — | — | In stock, no job binding |
| `Planned` | Office | Any time after job creation | Forecast / tentative commitment |
| `Allocated` | Warehouse | ~1 week before install | Firm commitment, not yet moved |
| `Staged` | Warehouse | <1 week before install | Physically pulled, in staging area |
| `Dispatched` | Warehouse | Day of install | Shipped — **displays as "Fulfilled" in UI** |
| `Consumed` | — | — | Fully used |
| `ReturnedHold` | Returns flow | — | Returned damaged, pending review |
| `AwaitingLocation` | Receive flow | — | Received but not shelved |
| `Scrapped` | — | — | Written off |

**Rule:** A roll's status mirrors its active allocation's status. If no active allocation, the roll is Available (or a terminal non-job state). All status-changing flows go through helpers in `src/lib/rollStatus.js`.

**Note on Dispatched → "Fulfilled":** The database keeps the value `Dispatched` (so Returns and dispatch flows still work). The UI *displays* it as "Fulfilled" to match SOP vocabulary. If you want to fully rename later, update `ROLL_STATUS.DISPATCHED` in `rollStatus.js` and migrate records.

---

## Bugs fixed

1. **Releasing an allocation now releases its rolls** (your main bug). `deleteAllocationMutation` in JobDetail.jsx was deleting the allocation record but leaving the roll's status pointing at the dead job.
2. **Adding rolls to a job now updates their status**. `createAllocationMutation` was leaving rolls as Available.
3. **Changing an allocation's status now syncs the roll**. Previously these drifted.
4. **Dashboard "Total Rolls" no longer silently hides non-Available rolls** — it counts all active (non-terminal) rolls.

---

## New features

### Dashboard is interactive
- Every stat card (Total Rolls, Total Sq Ft, Low Inventory, Sitting Inventory) is clickable
- Every chart bar/slice (turf type, length buckets, parent/child pie, full/partial stacks, top turf) is clickable
- Clicks deep-link into Inventory with `?status=X&product=Y&type=Z` filters pre-applied

### Roll detail page
- New **Edit Status** button + dialog with guardrails (can't set Available while allocated; routes job-state changes through the allocation)

### SOP-trained AI assistant
Floating sparkle button bottom-right. System prompt encodes the SOP; tools execute against Base44.

Tools:
- `search_rolls`, `get_roll`, `search_jobs`, `get_dashboard_stats` — read
- `assign_roll_to_job`, `release_roll_from_job`, `update_roll_status` — write
- **`suggest_rolls_for_job`** — applies SOP priority rules (child-first, exact-length, older-first, front-row-first) and groups candidates by dye lot so you can see dye-lot-consistent sets. Does not modify data — pure recommendation.

Example prompts:
- *"What rolls should I plan for 40 linear feet of TurfX 15 on job 9001?"* → returns SOP-ranked suggestions with warnings for short child rolls
- *"Assign roll TT-1234 to job 9001."* → confirms, then executes
- *"What rolls are on temp hold that haven't been allocated yet?"* → searches by status=Planned
- *"Which products are below minimum stock?"* → pulls dashboard stats

The assistant will refuse to assign a roll that's already on another job without explicit confirmation (per SOP change protocol).

---

## Files in this bundle

**New:**
- `src/lib/rollStatus.js` — single source of truth + sync helpers
- `src/components/InventoryAssistant.jsx` — chat widget (mounted globally by Layout.jsx)
- `base44/functions/askAI/entry.ts` — AI backend with SOP-aware tools

**Modified:**
- `src/components/ui/StatusBadge.jsx` — canonical label map (Dispatched → "Fulfilled")
- `src/pages/JobDetail.jsx` — **bug fixes**: sync helpers for create/update/delete allocation
- `src/pages/RollDetail.jsx` — Edit Status dialog with guardrails, uses sync helpers
- `src/pages/Inventory.jsx` — canonical status dropdowns + URL param filters
- `src/components/dashboard/TurfDashboard.jsx` — clickable cards and chart bars
- `src/Layout.jsx` — mounts `<InventoryAssistant />`
- `package.json` — adds `@anthropic-ai/sdk`

---

## Testing checklist

After applying:

- [ ] Add a roll to a job from JobDetail → Add Products. Inventory page shows it as **Planned**.
- [ ] Click the trash icon on that allocation on JobDetail. Roll returns to **Available** on Inventory.
- [ ] RollDetail **Edit Status**: if the roll is assigned, Available is disabled with a reason.
- [ ] From RollDetail, click **Plan for Job** → pick a job. Allocation shows Planned on the JobDetail page.
- [ ] Change that allocation's status from Planned → Allocated → Staged on JobDetail. RollDetail reflects the changes immediately.
- [ ] Click **Total Rolls** on the dashboard → Inventory opens unfiltered. Click a turf-type bar → Inventory opens filtered to that product + Available.
- [ ] Open the assistant (sparkle button). Ask: *"Suggest rolls for 35 feet of \<product> for job \<number>."* Expect SOP-ranked suggestions with dye-lot groupings.
- [ ] Ask the assistant to assign a roll. It should confirm first, then perform the action and invalidate caches so Inventory updates without a refresh.

---

## SOP-related decisions still open (flagged in the SOP itself)

These aren't implemented yet because the SOP marks them TBD. Let me know when each is decided and I can wire it in:

1. **Minimum child roll length protection** — the AI's `suggest_rolls_for_job` currently warns about child rolls under 20 LF but doesn't block them. Once you finalize the threshold and authority-to-override, we can add a hard block + approval flow.
2. **Warehouse bin/row naming convention** — the code reads `location_bin` + `location_row`, and the ranking prefers row A > B > C. If you pick a different system, one tweak to `rankRollsForPlanning()`.
3. **Multi-child-roll fulfillment rule** — currently `suggest_rolls_for_job` ranks individual rolls. If you decide multi-roll seams are allowed (same dye lot, non-visible locations), I can add a combo-suggestion mode that proposes sets of 2+ rolls summing to the required length.
4. **Approval/escalation path** — no UI for this yet. When you define the roles, we can gate `assign_roll_to_job` on protected-child overrides requiring approver notes.
