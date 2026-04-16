import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { channel, message, blocks } = await req.json();

    if (!channel || !message) {
      return Response.json({ error: 'Channel and message are required' }, { status: 400 });
    }

    // Get Slack access token from app connector
    const accessToken = await base44.asServiceRole.connectors.getAccessToken('slack');

    // Send message to Slack
    const slackResponse = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: channel,
        text: message,
        blocks: blocks || undefined,
      }),
    });

    const result = await slackResponse.json();

    if (!result.ok) {
      return Response.json({ 
        error: 'Failed to send Slack message', 
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