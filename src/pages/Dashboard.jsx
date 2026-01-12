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
        onSave={handleSavePreferences}
      />
    </div>
  );
}