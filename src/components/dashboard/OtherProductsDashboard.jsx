import React, { useState } from 'react';
import { Package, AlertTriangle, Clock } from 'lucide-react';
import StatCard from '@/components/ui/StatCard';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DEFAULT_LONG_SITTING_DAYS } from '@/lib/costing';
import { parseLocalDate, safeFormat } from '@/lib/dateHelpers';

export default function OtherProductsDashboard({ inventoryItems, settings }) {
  const [showLowInventoryDialog, setShowLowInventoryDialog] = useState(false);
  const [showSittingGlueDialog, setShowSittingGlueDialog] = useState(false);

  // A non-numeric stored value yields NaN, which makes every date comparison false
  // and reports a reassuring zero instead of the real aging figure.
  const getSetting = (key, defaultValue) => {
    const setting = settings.find(s => s.setting_key === key);
    const parsed = parseInt(setting?.setting_value, 10);
    return Number.isFinite(parsed) ? parsed : defaultValue;
  };

  const longSittingDays = getSetting('long_sitting_days', DEFAULT_LONG_SITTING_DAYS);

  // An unknown quantity is not the same as zero: `undefined < min` is false, so
  // these used to be skipped while the table still rendered them as "0 on hand".
  const lowInventoryItems = inventoryItems.filter(item => {
    const min = parseFloat(item.min_stock_level_units);
    const qty = parseFloat(item.quantity_on_hand);
    return Number.isFinite(min) && min > 0 && Number.isFinite(qty) && qty < min;
  });

  // Sitting glue items
  const cutoffDate = new Date(Date.now() - longSittingDays * 24 * 60 * 60 * 1000);
  const sittingGlueItems = inventoryItems.filter(item => {
    if (item.category !== 'Adhesives (Glue)') return false;
    const receivedDate = parseLocalDate(item.date_received);
    if (!receivedDate) return false;
    return receivedDate < cutoffDate;
  });

  // Category breakdown
  const categoryBreakdown = inventoryItems.reduce((acc, item) => {
    const category = item.category || 'Uncategorised';
    if (!acc[category]) {
      acc[category] = 0;
    }
    acc[category]++;
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
              const received = parseLocalDate(item.date_received);
              const daysOld = received
                ? Math.floor((Date.now() - received.getTime()) / (1000 * 60 * 60 * 24))
                : null;
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
                        Received: {safeFormat(item.date_received, 'MMM d, yyyy')}
                      </p>
                      <p className="font-bold text-orange-600 dark:text-orange-400">
                        {daysOld === null ? 'age unknown' : `${daysOld} days old`}
                      </p>
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