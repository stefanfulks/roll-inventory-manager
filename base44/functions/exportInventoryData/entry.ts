import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch all data
    const [rolls, jobs, transactions, allocations, products, inventoryItems] = await Promise.all([
      base44.asServiceRole.entities.Roll.list(),
      base44.asServiceRole.entities.Job.list(),
      base44.asServiceRole.entities.Transaction.list(),
      base44.asServiceRole.entities.Allocation.list(),
      base44.asServiceRole.entities.Product.list(),
      base44.asServiceRole.entities.InventoryItem.list()
    ]);

    const exportData = {
      export_date: new Date().toISOString(),
      exported_by: user.email,
      data: {
        rolls,
        jobs,
        transactions,
        allocations,
        products,
        inventory_items: inventoryItems
      }
    };

    return Response.json(exportData, {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="inventory-export-${new Date().toISOString().split('T')[0]}.json"`
      }
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});