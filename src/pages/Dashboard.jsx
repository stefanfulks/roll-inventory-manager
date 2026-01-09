import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import {
  Package,
  Ruler,
  DollarSign,
  TrendingUp,
  Scissors,
  Truck,
  Clock,
  AlertTriangle,
  Send,
  Settings as SettingsIcon } from
'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import DashboardCustomizer from '@/components/dashboard/DashboardCustomizer';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import StatCard from '@/components/ui/StatCard';
import StatusBadge from '@/components/ui/StatusBadge';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle } from
"@/components/ui/dialog";

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

export default function Dashboard() {
  const queryClient = useQueryClient();
  const [showLowInventory, setShowLowInventory] = useState(false);
  const [lowInventoryItems, setLowInventoryItems] = useState([]);
  const [slackChannel, setSlackChannel] = useState('');
  const [sendingSlack, setSendingSlack] = useState(false);
  const [showCustomizer, setShowCustomizer] = useState(false);
  const [showTotalRollsDetail, setShowTotalRollsDetail] = useState(false);
  const [showSqFtDetail, setShowSqFtDetail] = useState(false);
  const [showSittingInventoryDetail, setShowSittingInventoryDetail] = useState(false);
  const [visibleCharts, setVisibleCharts] = useState([
  'turf_type_distribution', 'shipped_total', 'top_turf', 'length_distribution',
  'roll_type', 'full_vs_partial_count', 'full_vs_partial_sqft']
  );

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

  const getSetting = (key, defaultValue) => {
    const setting = settings.find((s) => s.setting_key === key);
    return setting ? parseInt(setting.setting_value) : defaultValue;
  };

  const longSittingDays = getSetting('long_sitting_days', 180);

  const filteredRolls = rolls.filter((r) => r.inventory_owner === 'TexasTurf');

  const handleSendLowStockAlert = async () => {
    if (!slackChannel.trim()) {
      toast.error('Please enter a Slack channel name');
      return;
    }

    if (lowInventory.length === 0) {
      toast.error('No low stock items to report');
      return;
    }

    setSendingSlack(true);
    try {
      const lowStockProducts = lowInventory.map((item) => ({
        product_name: item.name,
        current_stock: item.current,
        min_stock: item.minimum,
        shortage: item.minimum - item.current,
        unit: item.unit
      }));

      await base44.functions.invoke('sendLowStockAlert', {
        channel: slackChannel.startsWith('#') ? slackChannel : `#${slackChannel}`,
        lowStockProducts
      });

      toast.success(`Low stock alert sent to ${slackChannel}`);
      setShowLowInventory(false);
    } catch (error) {
      toast.error(error.message || 'Failed to send Slack alert');
    } finally {
      setSendingSlack(false);
    }
  };

  // Calculate metrics
  const availableRolls = filteredRolls.filter((r) => r.status === 'Available');
  const totalRolls = filteredRolls.length;
  const parentRolls = filteredRolls.filter((r) => r.roll_type === 'Parent');
  const childRolls = filteredRolls.filter((r) => r.roll_type === 'Child');

  const totalSqft = availableRolls.reduce((sum, r) => sum + r.current_length_ft * r.width_ft, 0);

  // Calculate low inventory items
  const lowInventory = [];

  // Check turf products
  products.forEach((product) => {
    if (product.min_stock_level_ft) {
      const productRolls = availableRolls.filter((r) => r.product_id === product.id);
      const totalFt = productRolls.reduce((sum, r) => sum + r.current_length_ft, 0);

      if (totalFt < product.min_stock_level_ft) {
        lowInventory.push({
          type: 'Product',
          name: product.product_name,
          current: totalFt,
          minimum: product.min_stock_level_ft,
          unit: 'ft',
          rolls: productRolls
        });
      }
    }
  });

  // Check inventory items
  inventoryItems.forEach((item) => {
    if (item.min_stock_level_units && item.quantity_on_hand < item.min_stock_level_units) {
      lowInventory.push({
        type: item.category,
        name: item.item_name,
        current: item.quantity_on_hand || 0,
        minimum: item.min_stock_level_units,
        unit: item.unit_of_measure || 'units'
      });
    }
  });

  // Calculate sitting inventory
  const today = new Date();
  const cutoffDate = new Date(today.getTime() - longSittingDays * 24 * 60 * 60 * 1000);
  const sittingRolls = availableRolls.filter((r) => {
    if (!r.date_received) return false;
    const receivedDate = new Date(r.date_received);
    return receivedDate < cutoffDate;
  });

  // Calculate shipped out products (total sqft)
  const shippedOutSqft = transactions.
  filter((t) => t.transaction_type === 'SendOutToJob' && t.fulfillment_for === 'TexasTurf').
  reduce((sum, t) => {
    const sqft = Math.abs(t.length_change_ft || 0) * (t.width_ft || 0);
    return sum + sqft;
  }, 0);

  // Calculate top products by number of jobs
  const productJobCount = {};
  allocations.forEach((alloc) => {
    if (alloc.product_name) {
      if (!productJobCount[alloc.product_name]) {
        productJobCount[alloc.product_name] = new Set();
      }
      productJobCount[alloc.product_name].add(alloc.job_id);
    }
  });

  const topProductsData = Object.entries(productJobCount).
  map(([name, jobSet]) => ({ name, value: jobSet.size })).
  sort((a, b) => b.value - a.value).
  slice(0, 8);

  // Inventory by Turf Type
  const getProductAbbreviation = (productName) => {
    let cleanName = productName;
    let suffix = '';

    if (cleanName.endsWith('+')) {
      suffix = '+';
      cleanName = cleanName.slice(0, -1);
    }

    const words = cleanName.split(' ').filter(word => word.length > 0);
    let abbreviation = '';

    if (words.length === 1) {
      abbreviation = words[0].substring(0, Math.min(3, words[0].length));
    } else {
      for (let i = 0; i < Math.min(words.length, 3); i++) {
        abbreviation += words[i][0];
      }
    }

    return abbreviation.toUpperCase() + suffix;
  };

  const turfTypeDistribution = products.reduce((acc, product) => {
    const rollCount = availableRolls.filter(r => r.product_id === product.id).length;
    const abbreviatedName = getProductAbbreviation(product.product_name);
    acc.push({
      name: abbreviatedName,
      fullName: product.product_name,
      value: rollCount
    });
    return acc;
  }, []);

  const turfTypeChartData = turfTypeDistribution.sort((a, b) => b.value - a.value);

  // Length buckets
  const lengthBuckets = [
  { name: '0-10ft', min: 0, max: 10 },
  { name: '10-25ft', min: 10, max: 25 },
  { name: '25-50ft', min: 25, max: 50 },
  { name: '50-75ft', min: 50, max: 75 },
  { name: '75-100ft', min: 75, max: 100 },
  { name: '100ft+', min: 100, max: 999 }];


  const lengthData = lengthBuckets.map((bucket) => ({
    name: bucket.name,
    value: availableRolls.filter((r) =>
    r.current_length_ft >= bucket.min && r.current_length_ft < bucket.max
    ).length
  }));

  if (loadingRolls) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) =>
          <Skeleton key={i} className="h-32 rounded-2xl" />
          )}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[1, 2, 3, 4].map((i) =>
          <Skeleton key={i} className="h-80 rounded-2xl" />
          )}
        </div>
      </div>);

  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-slate-50 text-2xl font-bold lg:text-3xl">Dashboard</h1>
        </div>
        <Button variant="outline" onClick={() => setShowCustomizer(true)}>
          <SettingsIcon className="h-4 w-4 mr-2" />
          Customize
        </Button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div onClick={() => setShowTotalRollsDetail(true)} className="cursor-pointer hover:opacity-80 transition-opacity">
          <StatCard
            title="Total Rolls"
            value={totalRolls.toLocaleString()}
            subtitle={`${parentRolls.length} parent, ${childRolls.length} child`}
            icon={Package}
            iconBg="bg-emerald-100"
            iconColor="text-emerald-600" />
        </div>

        <div onClick={() => setShowSqFtDetail(true)} className="cursor-pointer hover:opacity-80 transition-opacity">
          <StatCard
            title="Total Sq Ft in Stock"
            value={totalSqft.toLocaleString()}
            subtitle={`${availableRolls.length} available rolls`}
            icon={Ruler}
            iconBg="bg-blue-100"
            iconColor="text-blue-600" />
        </div>

        <div
          onClick={() => lowInventory.length > 0 && setShowLowInventory(true)}
          className={lowInventory.length > 0 ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}>

          <StatCard
            title="Low Inventory"
            value={lowInventory.length}
            subtitle="Items below minimum"
            icon={AlertTriangle}
            iconBg={lowInventory.length > 0 ? "bg-amber-100" : "bg-slate-100"}
            iconColor={lowInventory.length > 0 ? "text-amber-600" : "text-slate-400"} />

        </div>

        <div 
          onClick={() => sittingRolls.length > 0 && setShowSittingInventoryDetail(true)} 
          className={sittingRolls.length > 0 ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}>
          <StatCard
            title="Sitting Inventory"
            value={sittingRolls.length}
            subtitle={`Over ${longSittingDays} days old`}
            icon={Clock}
            iconBg={sittingRolls.length > 0 ? "bg-orange-100" : "bg-slate-100"}
            iconColor={sittingRolls.length > 0 ? "text-orange-600" : "text-slate-400"} />
        </div>

      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Inventory by Turf Type */}
        {visibleCharts.includes('turf_type_distribution') &&
        <div className="bg-white dark:bg-[#2d2d2d] rounded-2xl p-6 border border-slate-100 dark:border-slate-700/50 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-4">Inventory by Turf Type</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={turfTypeChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" stroke="#64748b" tick={{ fontSize: 11 }} />
                <YAxis stroke="#64748b" />
                <Tooltip 
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="bg-white dark:bg-slate-800 p-3 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700">
                          <p className="font-medium dark:text-white">{payload[0].payload.fullName}</p>
                          <p className="text-sm text-slate-600 dark:text-slate-300">
                            Rolls: <span className="font-semibold">{payload[0].value}</span>
                          </p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar dataKey="value" fill="#87c71a" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        }

        {/* Shipped Out Tracking */}
        {visibleCharts.includes('shipped_total') &&
        <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">Total Shipped Out</h3>
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="text-5xl font-bold text-blue-600 mb-2">
                {shippedOutSqft.toLocaleString()}
              </div>
              <div className="text-slate-600">Square Feet Shipped</div>
              <div className="text-sm text-slate-400 mt-2">All-time total from warehouse</div>
            </div>
          </div>
        </div>
        }

        {/* Top Turf by Jobs */}
        {visibleCharts.includes('top_turf') &&
        <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">Top Turf by Jobs</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topProductsData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" tick={{ fontSize: 12 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={100} />
                <Tooltip formatter={(value) => `${value} jobs`} />
                <Bar dataKey="value" fill="#10b981" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        }

        {/* Length Distribution */}
        {visibleCharts.includes('length_distribution') &&
        <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">Remaining Length Buckets</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={lengthData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        }

        {/* Roll Type Distribution */}
        {visibleCharts.includes('roll_type') &&
        <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">Parent vs Child Rolls</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={[
                  { name: 'Parent Rolls', value: parentRolls.length },
                  { name: 'Child Rolls', value: childRolls.length }]
                  }
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="value"
                  label={({ name, value }) => `${name}: ${value}`}
                  labelLine={false}>

                  <Cell fill="#64748b" />
                  <Cell fill="#8b5cf6" />
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
        }

        {/* Full vs Partial Rolls Count */}
        {visibleCharts.includes('full_vs_partial_count') &&
        <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">Full vs Partial Rolls by Turf</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={Object.entries(
                  availableRolls.reduce((acc, r) => {
                    if (!acc[r.product_name]) {
                      acc[r.product_name] = { name: r.product_name, full: 0, partial: 0 };
                    }
                    if (r.current_length_ft >= r.original_length_ft * 0.95) {
                      acc[r.product_name].full++;
                    } else {
                      acc[r.product_name].partial++;
                    }
                    return acc;
                  }, {})
                ).map(([_, data]) => data).sort((a, b) => b.full + b.partial - (a.full + a.partial)).slice(0, 8)}
                layout="vertical">

                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" tick={{ fontSize: 12 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={100} />
                <Tooltip />
                <Legend />
                <Bar dataKey="full" stackId="a" fill="#10b981" name="Full Rolls" />
                <Bar dataKey="partial" stackId="a" fill="#f59e0b" name="Partial Rolls" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        }

        {/* Full vs Partial Sq Ft */}
        {visibleCharts.includes('full_vs_partial_sqft') &&
        <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">Full vs Partial Sq Ft by Turf</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={Object.entries(
                  availableRolls.reduce((acc, r) => {
                    if (!acc[r.product_name]) {
                      acc[r.product_name] = { name: r.product_name, full: 0, partial: 0 };
                    }
                    const sqft = r.current_length_ft * r.width_ft;
                    if (r.current_length_ft >= r.original_length_ft * 0.95) {
                      acc[r.product_name].full += sqft;
                    } else {
                      acc[r.product_name].partial += sqft;
                    }
                    return acc;
                  }, {})
                ).map(([_, data]) => ({ ...data, full: Math.round(data.full), partial: Math.round(data.partial) })).sort((a, b) => b.full + b.partial - (a.full + a.partial)).slice(0, 8)}
                layout="vertical">

                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" tick={{ fontSize: 12 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={100} />
                <Tooltip formatter={(value) => `${value.toLocaleString()} sq ft`} />
                <Legend />
                <Bar dataKey="full" stackId="a" fill="#10b981" name="Full Rolls" />
                <Bar dataKey="partial" stackId="a" fill="#f59e0b" name="Partial Rolls" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        }
      </div>

      {/* Dashboard Customizer */}
      <DashboardCustomizer
        open={showCustomizer}
        onOpenChange={setShowCustomizer}
        visibleCharts={visibleCharts}
        onSave={handleSavePreferences} />


      {/* Total Rolls Detail Dialog */}
      <Dialog open={showTotalRollsDetail} onOpenChange={setShowTotalRollsDetail}>
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
        </DialogContent>
      </Dialog>

      {/* Total Sq Ft Detail Dialog */}
      <Dialog open={showSqFtDetail} onOpenChange={setShowSqFtDetail}>
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
        </DialogContent>
      </Dialog>

      {/* Sitting Inventory Detail Dialog */}
      <Dialog open={showSittingInventoryDetail} onOpenChange={setShowSittingInventoryDetail}>
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
        </DialogContent>
      </Dialog>

      {/* Low Inventory Dialog */}
      <Dialog open={showLowInventory} onOpenChange={setShowLowInventory}>
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
        </DialogContent>
      </Dialog>
    </div>);

}