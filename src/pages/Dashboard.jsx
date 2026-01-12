import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import DashboardCustomizer from '@/components/dashboard/DashboardCustomizer';
import TurfDashboard from '@/components/dashboard/TurfDashboard';
import OtherProductsDashboard from '@/components/dashboard/OtherProductsDashboard';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Settings as SettingsIcon } from 'lucide-react';

export default function Dashboard() {
  const queryClient = useQueryClient();
  const [showCustomizer, setShowCustomizer] = useState(false);
  const [activeTab, setActiveTab] = useState('turf');
  const [visibleCharts, setVisibleCharts] = useState([
    'turf_type_distribution', 'shipped_total', 'top_turf', 'length_distribution',
    'roll_type', 'full_vs_partial_count', 'full_vs_partial_sqft'
  ]);

  const { data: rolls = [], isLoading: loadingRolls } = useQuery({
    queryKey: ['rolls'],
    queryFn: () => base44.entities.Roll.list('-created_date', 1000),
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false
  });

  const { data: transactions = [], isLoading: loadingTx } = useQuery({
    queryKey: ['transactions'],
    queryFn: () => base44.entities.Transaction.list('-created_date', 1000),
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false
  });

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => base44.entities.Product.list(),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false
  });

  const { data: inventoryItems = [] } = useQuery({
    queryKey: ['inventoryItems'],
    queryFn: () => base44.entities.InventoryItem.list(),
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false
  });

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => base44.entities.Product.list(),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false
  });

  const { data: allocations = [] } = useQuery({
    queryKey: ['allocations'],
    queryFn: () => base44.entities.Allocation.list(),
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false
  });

  const { data: settings = [] } = useQuery({
    queryKey: ['settings'],
    queryFn: () => base44.entities.Settings.list(),
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false
  });

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me(),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false
  });

  const { data: userPrefs } = useQuery({
    queryKey: ['userPreferences', user?.email],
    queryFn: () => base44.entities.UserPreferences.filter({ user_email: user.email }),
    enabled: !!user?.email,
    select: (data) => data[0],
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false
  });

  const savePreferencesMutation = useMutation({
    mutationFn: async (charts) => {
      if (userPrefs) {
        await base44.entities.UserPreferences.update(userPrefs.id, {
          visible_dashboard_charts: charts
        });
      } else {
        await base44.entities.UserPreferences.create({
          user_email: user.email,
          visible_dashboard_charts: charts
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userPreferences'] });
      toast.success('Dashboard preferences saved');
    }
  });

  useEffect(() => {
    if (userPrefs?.visible_dashboard_charts) {
      setVisibleCharts(userPrefs.visible_dashboard_charts);
    }
  }, [userPrefs]);

  const handleSavePreferences = (charts) => {
    setVisibleCharts(charts);
    savePreferencesMutation.mutate(charts);
  };

  if (loadingRolls) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-80 rounded-2xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-slate-800 dark:text-white text-2xl font-bold lg:text-3xl">Dashboard</h1>
        </div>
        <Button variant="outline" onClick={() => setShowCustomizer(true)} className="dark:border-slate-700 dark:text-slate-300">
          <SettingsIcon className="h-4 w-4 mr-2" />
          Customize
        </Button>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2 dark:bg-slate-800">
          <TabsTrigger value="turf" className="dark:data-[state=active]:bg-slate-700">Turf</TabsTrigger>
          <TabsTrigger value="other" className="dark:data-[state=active]:bg-slate-700">Other Products</TabsTrigger>
        </TabsList>

        <TabsContent value="turf" className="mt-6">
          <TurfDashboard 
            rolls={rolls}
            transactions={transactions}
            products={products}
            allocations={allocations}
            settings={settings}
            visibleCharts={visibleCharts}
          />
        </TabsContent>

        <TabsContent value="other" className="mt-6">
          <OtherProductsDashboard 
            inventoryItems={inventoryItems}
            settings={settings}
          />
        </TabsContent>
      </Tabs>




      {/* Dashboard Customizer */}
      <DashboardCustomizer
        open={showCustomizer}
        onOpenChange={setShowCustomizer}
        visibleCharts={visibleCharts}
        onSave={handleSavePreferences} />
        <DialogContent className="max-w-5xl max-h-[80vh] overflow-y-auto dark:bg-[#2d2d2d] dark:border-slate-700/50">
          <DialogHeader>
            <DialogTitle className="dark:text-white">Total Rolls - {totalRolls.toLocaleString()}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg">
                <p className="text-sm text-slate-600 dark:text-slate-400">Parent Rolls</p>
                <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{parentRolls.length}</p>
              </div>
              <div className="p-4 bg-violet-50 dark:bg-violet-900/20 rounded-lg">
                <p className="text-sm text-slate-600 dark:text-slate-400">Child Rolls</p>
                <p className="text-2xl font-bold text-violet-600 dark:text-violet-400">{childRolls.length}</p>
              </div>
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <p className="text-sm text-slate-600 dark:text-slate-400">Available</p>
                <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{availableRolls.length}</p>
              </div>
            </div>
            <div className="overflow-x-auto border dark:border-slate-700 rounded-lg">
              <table className="w-full">
                <thead className="bg-slate-50 dark:bg-slate-800/50">
                  <tr>
                    <th className="px-4 py-2 text-left text-sm font-semibold dark:text-slate-300">TT SKU #</th>
                    <th className="px-4 py-2 text-left text-sm font-semibold dark:text-slate-300">Product</th>
                    <th className="px-4 py-2 text-left text-sm font-semibold dark:text-slate-300">Type</th>
                    <th className="px-4 py-2 text-left text-sm font-semibold dark:text-slate-300">Status</th>
                    <th className="px-4 py-2 text-left text-sm font-semibold dark:text-slate-300">Length</th>
                    <th className="px-4 py-2 text-left text-sm font-semibold dark:text-slate-300">Location</th>
                  </tr>
                </thead>
                <tbody className="divide-y dark:divide-slate-700">
                  {filteredRolls.map((roll) => (
                    <tr key={roll.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                      <td className="px-4 py-2 text-sm font-mono dark:text-white">{roll.tt_sku_tag_number || roll.roll_tag}</td>
                      <td className="px-4 py-2 text-sm dark:text-white">
                        <Link to={createPageUrl(`RollDetail?id=${roll.id}`)} className="hover:text-emerald-600 dark:hover:text-emerald-400 hover:underline">
                          {roll.product_name}
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-sm"><StatusBadge status={roll.roll_type} size="sm" /></td>
                      <td className="px-4 py-2 text-sm"><StatusBadge status={roll.status} size="sm" /></td>
                      <td className="px-4 py-2 text-sm dark:text-white">{roll.current_length_ft}ft</td>
                      <td className="px-4 py-2 text-sm dark:text-slate-300">{roll.location_bin && roll.location_row ? `${roll.location_bin}-${roll.location_row}` : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        <DialogContent className="max-w-5xl max-h-[80vh] overflow-y-auto dark:bg-[#2d2d2d] dark:border-slate-700/50">
          <DialogHeader>
            <DialogTitle className="dark:text-white">Total Square Footage - {totalSqft.toLocaleString()} sq ft</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">Breakdown by Product</p>
              <div className="space-y-2">
                {Object.entries(availableRolls.reduce((acc, r) => {
                  if (!acc[r.product_name]) acc[r.product_name] = 0;
                  acc[r.product_name] += r.current_length_ft * r.width_ft;
                  return acc;
                }, {})).sort((a, b) => b[1] - a[1]).map(([product, sqft]) => (
                  <div key={product} className="flex justify-between items-center">
                    <span className="font-medium dark:text-white">{product}</span>
                    <span className="text-blue-600 dark:text-blue-400 font-bold">{Math.round(sqft).toLocaleString()} sq ft</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="overflow-x-auto border dark:border-slate-700 rounded-lg">
              <table className="w-full">
                <thead className="bg-slate-50 dark:bg-slate-800/50">
                  <tr>
                    <th className="px-4 py-2 text-left text-sm font-semibold dark:text-slate-300">TT SKU #</th>
                    <th className="px-4 py-2 text-left text-sm font-semibold dark:text-slate-300">Product</th>
                    <th className="px-4 py-2 text-left text-sm font-semibold dark:text-slate-300">Width</th>
                    <th className="px-4 py-2 text-left text-sm font-semibold dark:text-slate-300">Length</th>
                    <th className="px-4 py-2 text-left text-sm font-semibold dark:text-slate-300">Sq Ft</th>
                    <th className="px-4 py-2 text-left text-sm font-semibold dark:text-slate-300">Location</th>
                  </tr>
                </thead>
                <tbody className="divide-y dark:divide-slate-700">
                  {availableRolls.map((roll) => (
                    <tr key={roll.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                      <td className="px-4 py-2 text-sm font-mono dark:text-white">{roll.tt_sku_tag_number || roll.roll_tag}</td>
                      <td className="px-4 py-2 text-sm dark:text-white">
                        <Link to={createPageUrl(`RollDetail?id=${roll.id}`)} className="hover:text-emerald-600 dark:hover:text-emerald-400 hover:underline">
                          {roll.product_name}
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-sm dark:text-white">{roll.width_ft}ft</td>
                      <td className="px-4 py-2 text-sm dark:text-white">{roll.current_length_ft}ft</td>
                      <td className="px-4 py-2 text-sm font-bold text-blue-600 dark:text-blue-400">{Math.round(roll.current_length_ft * roll.width_ft).toLocaleString()} sq ft</td>
                      <td className="px-4 py-2 text-sm dark:text-slate-300">{roll.location_bin && roll.location_row ? `${roll.location_bin}-${roll.location_row}` : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        <DialogContent className="max-w-5xl max-h-[80vh] overflow-y-auto dark:bg-[#2d2d2d] dark:border-slate-700/50">
          <DialogHeader>
            <DialogTitle className="dark:text-white">Sitting Inventory - {sittingRolls.length} rolls over {longSittingDays} days</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="p-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">These rolls have been in inventory for more than {longSittingDays} days</p>
            </div>
            <div className="overflow-x-auto border dark:border-slate-700 rounded-lg">
              <table className="w-full">
                <thead className="bg-slate-50 dark:bg-slate-800/50">
                  <tr>
                    <th className="px-4 py-2 text-left text-sm font-semibold dark:text-slate-300">TT SKU #</th>
                    <th className="px-4 py-2 text-left text-sm font-semibold dark:text-slate-300">Product</th>
                    <th className="px-4 py-2 text-left text-sm font-semibold dark:text-slate-300">Date Received</th>
                    <th className="px-4 py-2 text-left text-sm font-semibold dark:text-slate-300">Days Old</th>
                    <th className="px-4 py-2 text-left text-sm font-semibold dark:text-slate-300">Length</th>
                    <th className="px-4 py-2 text-left text-sm font-semibold dark:text-slate-300">Location</th>
                  </tr>
                </thead>
                <tbody className="divide-y dark:divide-slate-700">
                  {sittingRolls.map((roll) => {
                    const daysOld = Math.floor((today - new Date(roll.date_received)) / (1000 * 60 * 60 * 24));
                    return (
                      <tr key={roll.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                        <td className="px-4 py-2 text-sm font-mono dark:text-white">{roll.tt_sku_tag_number || roll.roll_tag}</td>
                        <td className="px-4 py-2 text-sm dark:text-white">
                          <Link to={createPageUrl(`RollDetail?id=${roll.id}`)} className="hover:text-emerald-600 dark:hover:text-emerald-400 hover:underline">
                            {roll.product_name}
                          </Link>
                        </td>
                        <td className="px-4 py-2 text-sm dark:text-slate-300">{format(new Date(roll.date_received), 'MMM d, yyyy')}</td>
                        <td className="px-4 py-2 text-sm font-bold text-orange-600 dark:text-orange-400">{daysOld} days</td>
                        <td className="px-4 py-2 text-sm dark:text-white">{roll.current_length_ft}ft</td>
                        <td className="px-4 py-2 text-sm dark:text-slate-300">{roll.location_bin && roll.location_row ? `${roll.location_bin}-${roll.location_row}` : '-'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Low Inventory Items</DialogTitle>
          </DialogHeader>
          
          {/* Slack Alert Section */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
            <div className="flex items-start gap-3">
              <Send className="h-5 w-5 text-blue-600 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium text-blue-900 mb-2">Send Alert to Slack</p>
                <div className="flex gap-2">
                  <Input
                    placeholder="Channel name (e.g., #inventory)"
                    value={slackChannel}
                    onChange={(e) => setSlackChannel(e.target.value)}
                    className="flex-1" />

                  <Button
                    onClick={handleSendLowStockAlert}
                    disabled={sendingSlack}
                    className="bg-blue-600 hover:bg-blue-700">

                    {sendingSlack ? 'Sending...' : 'Send Alert'}
                  </Button>
                </div>
                <p className="text-xs text-blue-600 mt-1">
                  Note: Slack must be authorized first in app settings
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-4 mt-4">
            {lowInventory.map((item, idx) =>
            <div key={idx} className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-800">{item.name}</span>
                      <span className="text-xs px-2 py-0.5 bg-slate-200 text-slate-600 rounded">
                        {item.type}
                      </span>
                    </div>
                    <div className="text-sm text-slate-600 mt-1">
                      Current: <span className="font-medium text-amber-700">{item.current} {item.unit}</span>
                      {' '} / Minimum: <span className="font-medium">{item.minimum} {item.unit}</span>
                    </div>
                  </div>
                </div>
                {item.rolls && item.rolls.length > 0 &&
              <div className="mt-3 pt-3 border-t border-amber-200">
                    <p className="text-xs font-medium text-slate-600 mb-2">Available Rolls:</p>
                    <div className="flex flex-wrap gap-2">
                      {item.rolls.map((roll) =>
                  <Link
                    key={roll.id}
                    to={createPageUrl(`RollDetail?id=${roll.id}`)}
                    className="text-xs px-2 py-1 bg-white border border-amber-300 rounded hover:bg-amber-100 transition-colors">

                          {roll.tt_sku_tag_number || roll.roll_tag} ({roll.current_length_ft}ft)
                        </Link>
                  )}
                    </div>
                  </div>
              }
              </div>
            )}
          </div>
    </div>
  );
}