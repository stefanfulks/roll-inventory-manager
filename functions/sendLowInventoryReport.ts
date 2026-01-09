import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Get all inventory items
    const items = await base44.asServiceRole.entities.InventoryItem.list();
    
    // Filter items that are below minimum stock level
    const lowStockItems = items.filter(item => 
      item.min_stock_level_units && 
      item.quantity_on_hand < item.min_stock_level_units
    );
    
    if (lowStockItems.length === 0) {
      return Response.json({ 
        message: 'No low stock items found',
        itemCount: 0 
      });
    }
    
    // Format message for Slack
    let message = `🚨 *Weekly Low Inventory Report*\n\n`;
    message += `Found *${lowStockItems.length}* item(s) below minimum stock level:\n\n`;
    
    lowStockItems.forEach(item => {
      const deficit = item.min_stock_level_units - item.quantity_on_hand;
      message += `• *${item.item_name}*\n`;
      message += `  SKU: ${item.sku || 'N/A'} | Category: ${item.category}\n`;
      message += `  On Hand: *${item.quantity_on_hand}* ${item.unit_of_measure} | Min Level: ${item.min_stock_level_units} ${item.unit_of_measure}\n`;
      message += `  📉 Short by: *${deficit}* ${item.unit_of_measure}\n\n`;
    });
    
    // Get Slack access token
    const accessToken = await base44.asServiceRole.connectors.getAccessToken('slack');
    
    // Send message to Slack
    const slackResponse = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        channel: '#low-inventory',
        text: message,
        mrkdwn: true
      })
    });
    
    const slackData = await slackResponse.json();
    
    if (!slackData.ok) {
      throw new Error(`Slack API error: ${slackData.error}`);
    }
    
    return Response.json({ 
      success: true,
      message: 'Low inventory report sent to #low-inventory',
      itemCount: lowStockItems.length
    });
    
  } catch (error) {
    console.error('Error sending low inventory report:', error);
    return Response.json({ 
      error: error.message 
    }, { status: 500 });
  }
});