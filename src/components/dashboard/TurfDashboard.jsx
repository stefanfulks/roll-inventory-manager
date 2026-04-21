import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import StatCard from '@/components/ui/StatCard';
import { Package, Ruler, AlertTriangle, Clock } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { format } from 'date-fns';
import ForecastChart from '@/components/dashboard/ForecastChart';
import { ROLL_STATUS } from '@/lib/rollStatus';

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

export default function TurfDashboard({ 
  rolls, 
  transactions, 
  products, 
  allocations, 
  jobs,
  settings, 
  visibleCharts 
}) {
  const navigate = useNavigate();
  const [showLowInventoryDialog, setShowLowInventoryDialog] = useState(false);
  const [showSittingInventoryDialog, setShowSittingInventoryDialog] = useState(false);
  const [shippedTimeRange, setShippedTimeRange] = useState('all');

  const allRolls = rolls;
  const availableRolls = allRolls.filter(r => r.status === ROLL_STATUS.AVAILABLE);
  // Total Rolls now counts ALL non-terminal rolls (Available + on-hold/allocated/etc.)
  // so counts don't silently hide when statuses change.
  const terminalStatuses = [ROLL_STATUS.CONSUMED, ROLL_STATUS.SCRAPPED];
  const activeRolls = allRolls.filter(r => !terminalStatuses.includes(r.status));
  const totalRolls = activeRolls.length;
  const parentRolls = activeRolls.filter(r => r.roll_type === 'Parent');
  const childRolls = activeRolls.filter(r => r.roll_type === 'Child');
  const totalSqft = availableRolls.reduce((sum, r) => sum + r.current_length_ft * r.width_ft, 0);

  const getSetting = (key, defaultValue) => {
    const setting = settings.find(s => s.setting_key === key);
    return setting ? parseInt(setting.setting_value) : defaultValue;
  };

  const longSittingDays = getSetting('long_sitting_days', 180);

  // Low inventory - products below minimum
  const lowInventoryProducts = products.filter(product => {
    if (!product.min_stock_level_ft) return false;
    const productRolls = availableRolls.filter(r => r.product_id === product.id);
    const totalFt = productRolls.reduce((sum, r) => sum + r.current_length_ft, 0);
    return totalFt < product.min_stock_level_ft;
  });

  // Sitting inventory
  const today = new Date();
  const cutoffDate = new Date(today.getTime() - longSittingDays * 24 * 60 * 60 * 1000);
  const sittingRolls = availableRolls.filter(r => {
    if (!r.date_received) return false;
    const receivedDate = new Date(r.date_received);
    return receivedDate < cutoffDate;
  });

  // Shipped out total with time ranges
  const getTimeRangeCutoff = (range) => {
    const now = new Date();
    switch (range) {
      case 'week':
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      case 'month':
        return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      case 'year':
        return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      default:
        return null;
    }
  };

  const timeRangeCutoff = getTimeRangeCutoff(shippedTimeRange);
  const shippedOutSqft = transactions
    .filter(t => {
      if (t.transaction_type !== 'SendOutToJob' || t.fulfillment_for !== 'TexasTurf') return false;
      if (!timeRangeCutoff) return true;
      const txDate = new Date(t.created_date);
      return txDate >= timeRangeCutoff;
    })
    .reduce((sum, t) => sum + Math.abs(t.length_change_ft || 0) * (t.width_ft || 0), 0);

  // Top products by jobs
  const productJobCount = {};
  allocations.forEach(alloc => {
    if (alloc.product_name) {
      if (!productJobCount[alloc.product_name]) {
        productJobCount[alloc.product_name] = new Set();
      }
      productJobCount[alloc.product_name].add(alloc.job_id);
    }
  });

  const topProductsData = Object.entries(productJobCount)
    .map(([name, jobSet]) => ({ name, value: jobSet.size }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  // Turf type distribution with actual data
  const turfTypeChartData = products
    .map(product => {
      const rollCount = availableRolls.filter(r => r.product_id === product.id).length;
      return {
        name: product.product_name,
        value: rollCount
      };
    })
    .filter(item => item.value > 0)
    .sort((a, b) => b.value - a.value);

  // Length buckets
  const lengthBuckets = [
    { name: '0-10ft', min: 0, max: 10 },
    { name: '10-25ft', min: 10, max: 25 },
    { name: '25-50ft', min: 25, max: 50 },
    { name: '50-75ft', min: 50, max: 75 },
    { name: '75-100ft', min: 75, max: 100 },
    { name: '100ft+', min: 100, max: 999 }
  ];

  const lengthData = lengthBuckets.map(bucket => ({
    name: bucket.name,
    value: availableRolls.filter(r => r.current_length_ft >= bucket.min && r.current_length_ft < bucket.max).length
  }));

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div
          onClick={() => navigate(createPageUrl('Inventory'))}
          className="cursor-pointer hover:opacity-80 transition-opacity"
        >
          <StatCard
            title="Total Rolls"
            value={totalRolls.toLocaleString()}
            subtitle={`${parentRolls.length} parent, ${childRolls.length} child`}
            icon={Package}
            iconBg="bg-emerald-100"
            iconColor="text-emerald-600"
          />
        </div>

        <div
          onClick={() => navigate(createPageUrl(`Inventory?status=${ROLL_STATUS.AVAILABLE}`))}
          className="cursor-pointer hover:opacity-80 transition-opacity"
        >
          <StatCard
            title="Total Sq Ft in Stock"
            value={totalSqft.toLocaleString()}
            subtitle={`${availableRolls.length} available rolls`}
            icon={Ruler}
            iconBg="bg-blue-100"
            iconColor="text-blue-600"
          />
        </div>

        <div 
          onClick={() => lowInventoryProducts.length > 0 && setShowLowInventoryDialog(true)}
          className={lowInventoryProducts.length > 0 ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}
        >
          <StatCard
            title="Low Inventory"
            value={lowInventoryProducts.length}
            subtitle="Products below minimum"
            icon={AlertTriangle}
            iconBg={lowInventoryProducts.length > 0 ? "bg-amber-100" : "bg-slate-100"}
            iconColor={lowInventoryProducts.length > 0 ? "text-amber-600" : "text-slate-400"}
          />
        </div>

        <div 
          onClick={() => sittingRolls.length > 0 && setShowSittingInventoryDialog(true)}
          className={sittingRolls.length > 0 ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}
        >
          <StatCard
            title="Sitting Inventory"
            value={sittingRolls.length}
            subtitle={`Over ${longSittingDays} days old`}
            icon={Clock}
            iconBg={sittingRolls.length > 0 ? "bg-orange-100" : "bg-slate-100"}
            iconColor={sittingRolls.length > 0 ? "text-orange-600" : "text-slate-400"}
          />
        </div>
      </div>

      {/* Forecast Chart */}
      <ForecastChart rolls={rolls} jobs={jobs} />

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {visibleCharts.includes('turf_type_distribution') && (
          <div className="bg-white dark:bg-[#2d2d2d] rounded-2xl p-6 border border-slate-100 dark:border-slate-700/50 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-4">Inventory by Turf Type</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={turfTypeChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" stroke="#64748b" hide />
                  <YAxis stroke="#64748b" />
                  <Tooltip 
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        return (
                          <div className="bg-white dark:bg-slate-800 p-3 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700">
                            <p className="font-medium dark:text-white">{payload[0].payload.name}</p>
                            <p className="text-sm text-slate-600 dark:text-slate-300">
                              Rolls: <span className="font-semibold">{payload[0].value}</span>
                            </p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar
                    dataKey="value"
                    fill="#87c71a"
                    radius={[8, 8, 0, 0]}
                    style={{ cursor: 'pointer' }}
                    onClick={(data) =>
                      navigate(createPageUrl(`Inventory?product=${encodeURIComponent(data.name)}&status=${ROLL_STATUS.AVAILABLE}`))
                    }
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {visibleCharts.includes('shipped_total') && (
          <div className="bg-white dark:bg-[#2d2d2d] rounded-2xl p-6 border border-slate-100 dark:border-slate-700/50 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-800 dark:text-white">Total Shipped Out</h3>
              <div className="flex gap-1">
                {['week', 'month', 'year', 'all'].map(range => (
                  <button
                    key={range}
                    onClick={() => setShippedTimeRange(range)}
                    className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${
                      shippedTimeRange === range
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600'
                    }`}
                  >
                    {range === 'all' ? 'All Time' : range.charAt(0).toUpperCase() + range.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-center h-48">
              <div className="text-center">
                <div className="text-5xl font-bold text-blue-600 dark:text-blue-400 mb-2">
                  {shippedOutSqft.toLocaleString()}
                </div>
                <div className="text-slate-600 dark:text-slate-300">Square Feet Shipped</div>
                <div className="text-sm text-slate-400 mt-2">
                  {shippedTimeRange === 'all' ? 'All-time total' : 
                   shippedTimeRange === 'week' ? 'Last 7 days' :
                   shippedTimeRange === 'month' ? 'Last 30 days' : 'Last year'}
                </div>
              </div>
            </div>
          </div>
        )}

        {visibleCharts.includes('top_turf') && (
          <div className="bg-white dark:bg-[#2d2d2d] rounded-2xl p-6 border border-slate-100 dark:border-slate-700/50 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-4">Top Turf by Jobs</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topProductsData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" tick={{ fontSize: 12 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={100} />
                  <Tooltip formatter={(value) => `${value} jobs`} />
                  <Bar
                    dataKey="value"
                    fill="#10b981"
                    radius={[0, 4, 4, 0]}
                    style={{ cursor: 'pointer' }}
                    onClick={(data) =>
                      navigate(createPageUrl(`Inventory?product=${encodeURIComponent(data.name)}`))
                    }
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {visibleCharts.includes('length_distribution') && (
          <div className="bg-white dark:bg-[#2d2d2d] rounded-2xl p-6 border border-slate-100 dark:border-slate-700/50 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-4">Remaining Length Buckets</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={lengthData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar
                    dataKey="value"
                    fill="#3b82f6"
                    radius={[4, 4, 0, 0]}
                    style={{ cursor: 'pointer' }}
                    onClick={() => navigate(createPageUrl(`Inventory?status=${ROLL_STATUS.AVAILABLE}`))}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {visibleCharts.includes('roll_type') && (
          <div className="bg-white dark:bg-[#2d2d2d] rounded-2xl p-6 border border-slate-100 dark:border-slate-700/50 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-4">Parent vs Child Rolls</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={[
                      { name: 'Parent Rolls', value: parentRolls.length, type: 'Parent' },
                      { name: 'Child Rolls', value: childRolls.length, type: 'Child' }
                    ]}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                    label={({ name, value }) => `${name}: ${value}`}
                    labelLine={false}
                    style={{ cursor: 'pointer' }}
                    onClick={(data) =>
                      navigate(createPageUrl(`Inventory?type=${data.type}`))
                    }
                  >
                    <Cell fill="#64748b" />
                    <Cell fill="#8b5cf6" />
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {visibleCharts.includes('full_vs_partial_count') && (
          <div className="bg-white dark:bg-[#2d2d2d] rounded-2xl p-6 border border-slate-100 dark:border-slate-700/50 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-4">Full vs Partial Rolls by Turf</h3>
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
                  layout="vertical"
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" tick={{ fontSize: 12 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={100} />
                  <Tooltip />
                  <Legend />
                  <Bar
                    dataKey="full"
                    stackId="a"
                    fill="#10b981"
                    name="Full Rolls"
                    style={{ cursor: 'pointer' }}
                    onClick={(data) =>
                      navigate(createPageUrl(`Inventory?product=${encodeURIComponent(data.name)}&status=${ROLL_STATUS.AVAILABLE}`))
                    }
                  />
                  <Bar
                    dataKey="partial"
                    stackId="a"
                    fill="#f59e0b"
                    name="Partial Rolls"
                    style={{ cursor: 'pointer' }}
                    onClick={(data) =>
                      navigate(createPageUrl(`Inventory?product=${encodeURIComponent(data.name)}&status=${ROLL_STATUS.AVAILABLE}`))
                    }
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {visibleCharts.includes('full_vs_partial_sqft') && (
          <div className="bg-white dark:bg-[#2d2d2d] rounded-2xl p-6 border border-slate-100 dark:border-slate-700/50 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-4">Full vs Partial Sq Ft by Turf</h3>
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
                  layout="vertical"
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" tick={{ fontSize: 12 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={100} />
                  <Tooltip formatter={(value) => `${value.toLocaleString()} sq ft`} />
                  <Legend />
                  <Bar
                    dataKey="full"
                    stackId="a"
                    fill="#10b981"
                    name="Full Rolls"
                    style={{ cursor: 'pointer' }}
                    onClick={(data) =>
                      navigate(createPageUrl(`Inventory?product=${encodeURIComponent(data.name)}&status=${ROLL_STATUS.AVAILABLE}`))
                    }
                  />
                  <Bar
                    dataKey="partial"
                    stackId="a"
                    fill="#f59e0b"
                    name="Partial Rolls"
                    style={{ cursor: 'pointer' }}
                    onClick={(data) =>
                      navigate(createPageUrl(`Inventory?product=${encodeURIComponent(data.name)}&status=${ROLL_STATUS.AVAILABLE}`))
                    }
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      {/* Low Inventory Dialog */}
      <Dialog open={showLowInventoryDialog} onOpenChange={setShowLowInventoryDialog}>
        <DialogContent className="max-w-2xl dark:bg-[#2d2d2d] dark:border-slate-700/50">
          <DialogHeader>
            <DialogTitle className="dark:text-white">Low Inventory Products ({lowInventoryProducts.length})</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {lowInventoryProducts.map(product => {
              const productRolls = availableRolls.filter(r => r.product_id === product.id);
              const totalFt = productRolls.reduce((sum, r) => sum + r.current_length_ft, 0);
              return (
                <div key={product.id} className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-semibold text-slate-800 dark:text-white">{product.product_name}</p>
                      <p className="text-sm text-slate-600 dark:text-slate-300">
                        Current: <span className="font-medium text-amber-700 dark:text-amber-400">{totalFt.toFixed(0)} ft</span>
                        {' '} / Minimum: <span className="font-medium">{product.min_stock_level_ft} ft</span>
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      {/* Sitting Inventory Dialog */}
      <Dialog open={showSittingInventoryDialog} onOpenChange={setShowSittingInventoryDialog}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto dark:bg-[#2d2d2d] dark:border-slate-700/50">
          <DialogHeader>
            <DialogTitle className="dark:text-white">Sitting Inventory - {sittingRolls.length} rolls over {longSittingDays} days</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {sittingRolls.map(roll => {
              const daysOld = Math.floor((today - new Date(roll.date_received)) / (1000 * 60 * 60 * 24));
              return (
                <div key={roll.id} className="p-3 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg">
                  <div className="flex justify-between items-center">
                    <div>
                      <Link 
                        to={createPageUrl(`RollDetail?id=${roll.id}`)}
                        className="font-mono font-medium text-slate-800 dark:text-white hover:text-emerald-600 dark:hover:text-emerald-400 hover:underline"
                      >
                        {roll.tt_sku_tag_number || roll.roll_tag}
                      </Link>
                      <p className="text-sm text-slate-600 dark:text-slate-300">
                        {roll.product_name} • {roll.current_length_ft}ft • {roll.location_bin && roll.location_row ? `${roll.location_bin}-${roll.location_row}` : 'No location'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        Received: {format(new Date(roll.date_received), 'MMM d, yyyy')}
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