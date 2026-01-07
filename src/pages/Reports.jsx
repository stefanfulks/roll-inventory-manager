import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { 
  FileBarChart,
  Download,
  AlertTriangle,
  Clock,
  Package
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { format, differenceInDays } from 'date-fns';
import { toast } from 'sonner';

export default function Reports() {
  const { data: rolls = [], isLoading: rollsLoading } = useQuery({
    queryKey: ['rolls'],
    queryFn: () => base44.entities.Roll.list('-created_date', 5000),
  });

  const { data: transactions = [], isLoading: txLoading } = useQuery({
    queryKey: ['transactions'],
    queryFn: () => base44.entities.Transaction.list('-created_date', 5000),
  });

  const { data: products = [], isLoading: productsLoading } = useQuery({
    queryKey: ['products'],
    queryFn: () => base44.entities.Product.list(),
  });

  const { data: settings = [], isLoading: settingsLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => base44.entities.Settings.list(),
  });

  const getSetting = (key, defaultValue) => {
    const setting = settings.find(s => s.setting_key === key);
    return setting?.setting_value || defaultValue;
  };

  const lowThreshold = parseInt(getSetting('low_inventory_threshold', '5'));
  const longSittingDays = parseInt(getSetting('long_sitting_days', '90'));

  // Filter for TexasTurf only
  const texasTurfRolls = rolls.filter(r => r.inventory_owner === 'TexasTurf');

  // Calculate low inventory products
  const getLowInventoryProducts = () => {
    const productCounts = {};
    texasTurfRolls
      .filter(r => r.status === 'Available')
      .forEach(roll => {
        const key = `${roll.product_name}-${roll.width_ft}`;
        productCounts[key] = (productCounts[key] || 0) + 1;
      });

    return Object.entries(productCounts)
      .filter(([_, count]) => count <= lowThreshold)
      .map(([key, count]) => {
        const [product_name, width] = key.split('-');
        return { product_name, width_ft: parseFloat(width), count };
      });
  };

  // Calculate long-sitting products
  const getLongSittingRolls = () => {
    const today = new Date();
    return texasTurfRolls
      .filter(roll => {
        const daysSinceReceived = differenceInDays(today, new Date(roll.created_date));
        return daysSinceReceived >= longSittingDays && roll.status === 'Available';
      })
      .map(roll => ({
        ...roll,
        days_sitting: differenceInDays(today, new Date(roll.created_date))
      }));
  };

  const exportCurrentInventory = () => {
    const headers = [
      'Roll Tag',
      'Custom SKU',
      'Owner',
      'Product',
      'Dye Lot',
      'Width (ft)',
      'Current Length (ft)',
      'Type',
      'Status',
      'Condition',
      'Location',
      'Date Received',
      'Vendor',
      'Notes'
    ];

    const rows = texasTurfRolls.map(roll => [
      roll.roll_tag,
      roll.custom_roll_sku || '',
      roll.inventory_owner,
      roll.product_name,
      roll.dye_lot,
      roll.width_ft,
      roll.current_length_ft,
      roll.roll_type,
      roll.status,
      roll.condition,
      roll.location_name || '',
      roll.date_received ? format(new Date(roll.date_received), 'yyyy-MM-dd') : '',
      roll.vendor || '',
      roll.notes || ''
    ]);

    const csv = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    downloadCSV(csv, `inventory_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    toast.success('Inventory report exported');
  };

  const exportLowInventory = () => {
    const lowInventory = getLowInventoryProducts();
    const headers = ['Product', 'Width (ft)', 'Available Rolls', 'Status'];
    const rows = lowInventory.map(item => [
      item.product_name,
      item.width_ft,
      item.count,
      item.count <= lowThreshold ? 'LOW' : 'OK'
    ]);

    const csv = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    downloadCSV(csv, `low_inventory_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    toast.success('Low inventory report exported');
  };

  const exportLongSitting = () => {
    const longSitting = getLongSittingRolls();
    const headers = [
      'Roll Tag',
      'Product',
      'Dye Lot',
      'Width (ft)',
      'Length (ft)',
      'Location',
      'Date Received',
      'Days Sitting'
    ];

    const rows = longSitting.map(roll => [
      roll.roll_tag,
      roll.product_name,
      roll.dye_lot,
      roll.width_ft,
      roll.current_length_ft,
      roll.location_name || '',
      roll.date_received ? format(new Date(roll.date_received), 'yyyy-MM-dd') : '',
      roll.days_sitting
    ]);

    const csv = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    downloadCSV(csv, `long_sitting_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    toast.success('Long-sitting report exported');
  };

  const exportTransactions = () => {
    const texasTurfTx = transactions.filter(tx => tx.inventory_owner === 'TexasTurf');
    const headers = [
      'Date/Time',
      'Type',
      'Roll Tag',
      'Product',
      'Dye Lot',
      'Width (ft)',
      'Length Change (ft)',
      'Before (ft)',
      'After (ft)',
      'Job',
      'Bundle',
      'Performed By',
      'Notes'
    ];

    const rows = texasTurfTx.map(tx => [
      format(new Date(tx.created_date), 'yyyy-MM-dd HH:mm:ss'),
      tx.transaction_type,
      tx.roll_tag,
      tx.product_name || '',
      tx.dye_lot || '',
      tx.width_ft || '',
      tx.length_change_ft || 0,
      tx.length_before_ft || '',
      tx.length_after_ft || '',
      tx.job_name || '',
      tx.bundle_id || '',
      tx.performed_by || tx.created_by || '',
      tx.notes || ''
    ]);

    const csv = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    downloadCSV(csv, `transactions_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    toast.success('Transaction report exported');
  };

  const downloadCSV = (csv, filename) => {
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const isLoading = rollsLoading || txLoading || productsLoading || settingsLoading;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      </div>
    );
  }

  const lowInventory = getLowInventoryProducts();
  const longSitting = getLongSittingRolls();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
          <FileBarChart className="h-5 w-5 text-blue-600" />
        </div>
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-slate-800">Reports</h1>
          <p className="text-slate-500 mt-1">Generate and export inventory reports</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Current Inventory */}
        <Card className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-emerald-100 rounded-lg flex items-center justify-center">
                <Package className="h-6 w-6 text-emerald-600" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-800">Current Inventory</h3>
                <p className="text-sm text-slate-500">All rolls snapshot</p>
              </div>
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between items-center py-2 border-t">
              <span className="text-sm text-slate-600">Total Rolls</span>
              <span className="font-semibold text-slate-800">{texasTurfRolls.length}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-t">
              <span className="text-sm text-slate-600">Available</span>
              <span className="font-semibold text-emerald-600">
                {texasTurfRolls.filter(r => r.status === 'Available').length}
              </span>
            </div>
            <Button onClick={exportCurrentInventory} className="w-full mt-4">
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </Card>

        {/* Low Inventory */}
        <Card className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-amber-100 rounded-lg flex items-center justify-center">
                <AlertTriangle className="h-6 w-6 text-amber-600" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-800">Low Inventory Alert</h3>
                <p className="text-sm text-slate-500">Products below {lowThreshold} rolls</p>
              </div>
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between items-center py-2 border-t">
              <span className="text-sm text-slate-600">Low Stock Products</span>
              <span className="font-semibold text-amber-600">{lowInventory.length}</span>
            </div>
            {lowInventory.length > 0 && (
              <div className="text-xs text-slate-500 bg-slate-50 p-2 rounded">
                {lowInventory.slice(0, 3).map((item, idx) => (
                  <div key={idx} className="py-1">
                    {item.product_name} ({item.width_ft}ft): {item.count} rolls
                  </div>
                ))}
                {lowInventory.length > 3 && <div className="py-1">+ {lowInventory.length - 3} more...</div>}
              </div>
            )}
            <Button 
              onClick={exportLowInventory} 
              variant="outline" 
              className="w-full mt-4"
              disabled={lowInventory.length === 0}
            >
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </Card>

        {/* Long-Sitting Inventory */}
        <Card className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                <Clock className="h-6 w-6 text-orange-600" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-800">Long-Sitting Inventory</h3>
                <p className="text-sm text-slate-500">Over {longSittingDays} days old</p>
              </div>
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between items-center py-2 border-t">
              <span className="text-sm text-slate-600">Rolls Not Moved</span>
              <span className="font-semibold text-orange-600">{longSitting.length}</span>
            </div>
            {longSitting.length > 0 && (
              <div className="text-xs text-slate-500 bg-slate-50 p-2 rounded max-h-24 overflow-y-auto">
                {longSitting.slice(0, 3).map((roll, idx) => (
                  <div key={idx} className="py-1">
                    {roll.roll_tag} - {roll.days_sitting} days
                  </div>
                ))}
                {longSitting.length > 3 && <div className="py-1">+ {longSitting.length - 3} more...</div>}
              </div>
            )}
            <Button 
              onClick={exportLongSitting} 
              variant="outline" 
              className="w-full mt-4"
              disabled={longSitting.length === 0}
            >
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </Card>

        {/* Transaction Log */}
        <Card className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <FileBarChart className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-800">Transaction Log</h3>
                <p className="text-sm text-slate-500">Complete audit trail</p>
              </div>
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between items-center py-2 border-t">
              <span className="text-sm text-slate-600">Total Transactions</span>
              <span className="font-semibold text-slate-800">
                {transactions.filter(t => t.inventory_owner === 'TexasTurf').length}
              </span>
            </div>
            <div className="flex justify-between items-center py-2 border-t">
              <span className="text-sm text-slate-600">Date Range</span>
              <span className="text-xs text-slate-500">All time</span>
            </div>
            <Button onClick={exportTransactions} className="w-full mt-4">
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}