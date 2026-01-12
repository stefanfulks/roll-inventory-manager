import React, { useState } from 'react';
import { Package, AlertTriangle, Clock } from 'lucide-react';
import StatCard from '@/components/ui/StatCard';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { format } from 'date-fns';

export default function OtherProductsDashboard({ inventoryItems, settings }) {
  const [showLowInventoryDialog, setShowLowInventoryDialog] = useState(false);
  const [showSittingGlueDialog, setShowSittingGlueDialog] = useState(false);

  const getSetting = (key, defaultValue) => {
    const setting = settings.find(s => s.setting_key === key);
    return setting ? parseInt(setting.setting_value) : defaultValue;
  };

  const longSittingDays = getSetting('long_sitting_days', 180);

  // Low inventory items
  const lowInventoryItems = inventoryItems.filter(item => 
    item.min_stock_level_units && item.quantity_on_hand < item.min_stock_level_units
  );

  // Sitting glue items
  const today = new Date();
  const cutoffDate = new Date(today.getTime() - longSittingDays * 24 * 60 * 60 * 1000);
  const sittingGlueItems = inventoryItems.filter(item => {
    if (item.category !== 'Adhesives (Glue)') return false;
    if (!item.date_received) return false;
    const receivedDate = new Date(item.date_received);
    return receivedDate < cutoffDate;
  });

  // Category breakdown
  const categoryBreakdown = inventoryItems.reduce((acc, item) => {
    if (!acc[item.category]) {
      acc[item.category] = 0;
    }
    acc[item.category]++;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Items"
          value={inventoryItems.length.toLocaleString()}
          subtitle="Other inventory items"
          icon={Package}
          iconBg="bg-emerald-100"
          iconColor="text-emerald-600"
        />

        <StatCard
          title="Categories"
          value={Object.keys(categoryBreakdown).length}
          subtitle="Unique categories"
          icon={Package}
          iconBg="bg-blue-100"
          iconColor="text-blue-600"
        />

        <div 
          onClick={() => lowInventoryItems.length > 0 && setShowLowInventoryDialog(true)}
          className={lowInventoryItems.length > 0 ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}
        >
          <StatCard
            title="Low Inventory"
            value={lowInventoryItems.length}
            subtitle="Items below minimum"
            icon={AlertTriangle}
            iconBg={lowInventoryItems.length > 0 ? "bg-amber-100" : "bg-slate-100"}
            iconColor={lowInventoryItems.length > 0 ? "text-amber-600" : "text-slate-400"}
          />
        </div>

        <div 
          onClick={() => sittingGlueItems.length > 0 && setShowSittingGlueDialog(true)}
          className={sittingGlueItems.length > 0 ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}
        >
          <StatCard
            title="Sitting Glue"
            value={sittingGlueItems.length}
            subtitle={`Over ${longSittingDays} days old`}
            icon={Clock}
            iconBg={sittingGlueItems.length > 0 ? "bg-orange-100" : "bg-slate-100"}
            iconColor={sittingGlueItems.length > 0 ? "text-orange-600" : "text-slate-400"}
          />
        </div>
      </div>

      {/* Category Breakdown */}
      <div className="bg-white dark:bg-[#2d2d2d] rounded-2xl p-6 border border-slate-100 dark:border-slate-700/50 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-4">Items by Category</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Object.entries(categoryBreakdown)
            .sort((a, b) => b[1] - a[1])
            .map(([category, count]) => (
              <div key={category} className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                <p className="text-sm text-slate-500 dark:text-slate-400">{category}</p>
                <p className="text-2xl font-bold text-slate-800 dark:text-white">{count}</p>
              </div>
            ))}
        </div>
      </div>

      {/* Low Inventory Dialog */}
      <Dialog open={showLowInventoryDialog} onOpenChange={setShowLowInventoryDialog}>
        <DialogContent className="max-w-2xl dark:bg-[#2d2d2d] dark:border-slate-700/50">
          <DialogHeader>
            <DialogTitle className="dark:text-white">Low Inventory Items ({lowInventoryItems.length})</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {lowInventoryItems.map(item => (
              <div key={item.id} className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-semibold text-slate-800 dark:text-white">{item.item_name}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{item.category}</p>
                    <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                      Current: <span className="font-medium text-amber-700 dark:text-amber-400">{item.quantity_on_hand || 0} {item.unit_of_measure}</span>
                      {' '} / Minimum: <span className="font-medium">{item.min_stock_level_units} {item.unit_of_measure}</span>
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Sitting Glue Dialog */}
      <Dialog open={showSittingGlueDialog} onOpenChange={setShowSittingGlueDialog}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto dark:bg-[#2d2d2d] dark:border-slate-700/50">
          <DialogHeader>
            <DialogTitle className="dark:text-white">Sitting Glue - {sittingGlueItems.length} items over {longSittingDays} days</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {sittingGlueItems.map(item => {
              const daysOld = Math.floor((today - new Date(item.date_received)) / (1000 * 60 * 60 * 24));
              return (
                <div key={item.id} className="p-3 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-medium text-slate-800 dark:text-white">{item.item_name}</p>
                      <p className="text-sm text-slate-600 dark:text-slate-300">
                        Quantity: {item.quantity_on_hand || 0} {item.unit_of_measure}
                        {item.condition && ` • Condition: ${item.condition}`}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        Received: {format(new Date(item.date_received), 'MMM d, yyyy')}
                      </p>
                      <p className="font-bold text-orange-600 dark:text-orange-400">{daysOld} days old</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}