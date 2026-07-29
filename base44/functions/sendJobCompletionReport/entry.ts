import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { channel, jobId } = await req.json();

    if (!channel || !jobId) {
      return Response.json({ error: 'Channel and jobId are required' }, { status: 400 });
    }

    // Fetch job details
    const jobs = await base44.asServiceRole.entities.Job.filter({ id: jobId });
    const job = jobs[0];

    if (!job) {
      return Response.json({ error: 'Job not found' }, { status: 404 });
    }

    // Fetch allocations
    const allocations = await base44.asServiceRole.entities.Allocation.filter({ job_id: jobId });

    // Fetch return transactions
    const returnTransactions = await base44.asServiceRole.entities.Transaction.filter({
      job_id: jobId,
      transaction_type: 'ReturnFromJob'
    });

    // Calculate metrics.
    // Prefer the dispatch transactions: they record what physically left the yard.
    // Summing every allocation counted Cancelled and never-dispatched Planned lines
    // too, which overstated usage and disagreed with the Turf Overage report.
    const sendTransactions = await base44.asServiceRole.entities.Transaction.filter({
      job_id: jobId,
      transaction_type: 'SendOutToJob'
    });

    // Allocations created by the cut-to-job flow omit item_type.
    const isRollAllocation = (a: any) =>
      a.item_type === 'roll' || (!a.item_type && (a.allocated_roll_ids || []).length > 0);

    const liveAllocations = allocations.filter(
      (a: any) => a.status !== 'Cancelled' && a.status !== 'Completed'
    );
    const turfAllocations = allocations.filter(isRollAllocation);

    let totalAllocated = sendTransactions.reduce(
      (sum: number, t: any) => sum + Math.abs(parseFloat(t.length_change_ft) || 0),
      0
    );
    if (totalAllocated === 0) {
      totalAllocated = turfAllocations
        .filter((a: any) => a.status !== 'Cancelled')
        .reduce((sum: number, a: any) => sum + (parseFloat(a.requested_length_ft) || 0), 0);
    }

    // Scrapped footage was written off, not put back on the shelf, so counting it
    // as returned made the job look under budget by the amount that was binned.
    // Looked up one id at a time: the Base44 filter API takes plain equality maps,
    // not Mongo-style operators like $in.
    const rollIds = [...new Set(returnTransactions.map((t: any) => t.roll_id).filter(Boolean))];
    const returnedRolls = await Promise.all(
      rollIds.map((id: string) =>
        base44.asServiceRole.entities.Roll.filter({ id }).then((r: any[]) => r[0]).catch(() => null)
      )
    );
    const scrappedIds = new Set(
      returnedRolls
        .filter((r: any) => r && r.status === 'Scrapped')
        .map((r: any) => r.id)
    );

    const totalReturned = returnTransactions
      .filter((t: any) => !t.roll_id || !scrappedIds.has(t.roll_id))
      .reduce((sum: number, t: any) => sum + (parseFloat(t.length_change_ft) || 0), 0);
    const totalUsed = totalAllocated - totalReturned;

    // Slack rejects payloads past roughly 50 blocks, which 500'd the whole report.
    const MAX_LINE_BLOCKS = 20;
    const truncatedAllocations = liveAllocations.length > MAX_LINE_BLOCKS;

    // Build allocation blocks
    const allocationBlocks = liveAllocations.slice(0, MAX_LINE_BLOCKS).map(allocation => {
      if (allocation.item_type === 'roll') {
        return {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `• *${allocation.product_name}*\n  ${allocation.width_ft}ft × ${allocation.requested_length_ft}ft • Dye Lot: ${allocation.dye_lot_preference || 'N/A'}`
          }
        };
      } else {
        return {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `• *${allocation.product_name}*\n  ${allocation.requested_quantity || 1} ${allocation.unit_of_measure || 'unit'}`
          }
        };
      }
    });

    if (truncatedAllocations) {
      allocationBlocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `_…and ${liveAllocations.length - MAX_LINE_BLOCKS} more line(s). Open the job for the full list._`
        }
      });
    }

    // Build return blocks
    const returnBlocks = returnTransactions.slice(0, MAX_LINE_BLOCKS).map(tx => ({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `• *${tx.product_name}*\n  Returned: ${tx.length_change_ft}ft • Tag: ${tx.tt_sku_tag_number}${
          tx.roll_id && scrappedIds.has(tx.roll_id) ? ' • _scrapped, not back in stock_' : ''
        }`
      }
    }));

    if (returnTransactions.length > MAX_LINE_BLOCKS) {
      returnBlocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `_…and ${returnTransactions.length - MAX_LINE_BLOCKS} more return(s)._`
        }
      });
    }

    const blocks = [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "✅ Job Completion Report",
          emoji: true
        }
      },
      {
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: `*Job Number:*\n${job.job_number}`
          },
          {
            type: "mrkdwn",
            text: `*Customer:*\n${job.customer_name || 'N/A'}`
          },
          {
            type: "mrkdwn",
            text: `*Fulfillment For:*\n${job.fulfillment_for}`
          },
          {
            type: "mrkdwn",
            text: `*Status:*\n${job.status}`
          }
        ]
      },
      {
        type: "divider"
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*📦 Materials Allocated*"
        }
      },
      ...allocationBlocks,
      {
        type: "divider"
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*📊 Turf Usage Summary*"
        }
      },
      {
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: `*Allocated (Sent Out):*\n${totalAllocated} ft`
          },
          {
            type: "mrkdwn",
            text: `*Returned:*\n${totalReturned} ft`
          },
          {
            type: "mrkdwn",
            text: `*Used:*\n${totalUsed} ft`
          }
        ]
      }
    ];

    // Add returns section if there are any
    if (returnTransactions.length > 0) {
      blocks.push(
        {
          type: "divider"
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "*🔄 Returned Products*"
          }
        },
        ...returnBlocks
      );
    }

    // Get Slack access token
    const accessToken = await base44.asServiceRole.connectors.getAccessToken('slack');

    // Send to Slack
    const slackResponse = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: channel,
        text: `✅ Job Completion Report: ${job.job_number}`,
        blocks: blocks,
      }),
    });

    const result = await slackResponse.json();

    if (!result.ok) {
      return Response.json({ 
        error: 'Failed to send Slack report', 
        details: result.error 
      }, { status: 500 });
    }

    return Response.json({ 
      success: true, 
      timestamp: result.ts,
      channel: result.channel 
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});