import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { channel, lowStockProducts } = await req.json();

    if (!channel || !lowStockProducts || lowStockProducts.length === 0) {
      return Response.json({ error: 'Channel and low stock products are required' }, { status: 400 });
    }

    // Get Slack access token
    const accessToken = await base44.asServiceRole.connectors.getAccessToken('slack');

    // Build message blocks
    const productBlocks = lowStockProducts.map(product => ({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${product.product_name}*\nCurrent: ${product.current_stock} ft | Minimum: ${product.min_stock} ft\n_Shortage: ${product.shortage} ft_`
      }
    }));

    const blocks = [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "🚨 Low Stock Alert - TurfTracker",
          emoji: true
        }
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*${lowStockProducts.length}* product${lowStockProducts.length > 1 ? 's' : ''} below minimum stock level`
        }
      },
      {
        type: "divider"
      },
      ...productBlocks
    ];

    // Send to Slack
    const slackResponse = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: channel,
        text: `🚨 Low Stock Alert: ${lowStockProducts.length} products below minimum stock level`,
        blocks: blocks,
      }),
    });

    const result = await slackResponse.json();

    if (!result.ok) {
      return Response.json({ 
        error: 'Failed to send Slack alert', 
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