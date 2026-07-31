import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import StatCard from '@/components/ui/StatCard';
import { Package, Ruler, AlertTriangle, Clock, DollarSign, ArrowRight } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
import ForecastChart from '@/components/dashboard/ForecastChart';
import { ALLOCATION_STATUS, ROLL_STATUS } from '@/lib/rollStatus';
import { useIsAdmin } from '@/lib/AuthContext';
import {
  DEFAULT_LONG_SITTING_DAYS,
  longSittingRolls,
  rollValue,
  inventoryValue,
  daysSinceReceived,
  formatCurrency,
} from '@/lib/costing';
import { formatFeetInches } from '@/lib/dateHelpers';

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
  const isAdmin = useIsAdmin();
  const [showLowInventoryDialog, setShowLowInventoryDialog] = useState(false);
  const [shippedTimeRange, setShippedTimeRange] = useState('all');

  const num = (value) => parseFloat(value) || 0;
  const sqftOf = (roll) => num(roll.current_length_ft) * num(roll.width_ft);

  const allRolls = rolls;
  const availableRolls = allRolls.filter(r => r.status === ROLL_STATUS.AVAILABLE);
  // Total Rolls now counts ALL non-terminal rolls (Available + on-hold/allocated/etc.)
  // so counts don't silently hide when statuses change.
  const terminalStatuses = [ROLL_STATUS.CONSUMED, ROLL_STATUS.SCRAPPED];
  const activeRolls = allRolls.filter(r => !terminalStatuses.includes(r.status));
  const totalRolls = activeRolls.length;
  // Legacy rolls may not have roll_type set — treat them as Parent by default
  // (overwhelmingly the common case since children are created via CutRoll).
  const childRolls = activeRolls.filter(r => r.roll_type === 'Child');
  const parentRolls = activeRolls.filter(r => r.roll_type !== 'Child');
  const totalSqft = availableRolls.reduce((sum, r) => sum + sqftOf(r), 0);

  // Roll → product matcher with legacy-data fallback.
  // Match by product_id when both sides have it; fall back to product_name.
  const rollMatchesProduct = (roll, product) => {
    if (roll.product_id && product.id && roll.product_id === product.id) return true;
    if (roll.product_name && product.product_name && roll.product_name === product.product_name) return true;
    return false;
  };

  const getSetting = (key, defaultValue) => {
    const setting = settings.find(s => s.setting_key === key);
    const parsed = parseInt(setting?.setting_value, 10);
    return Number.isFinite(parsed) ? parsed : defaultValue;
  };

  const longSittingDays = getSetting('long_sitting_days', DEFAULT_LONG_SITTING_DAYS);

  // Low inventory - products below minimum
  const lowInventoryProducts = products.filter(product => {
    if (!product.min_stock_level_ft) return false;
    const productRolls = availableRolls.filter(r => rollMatchesProduct(r, product));
    const totalFt = productRolls.reduce((sum, r) => sum + num(r.current_length_ft), 0);
    return totalFt < num(product.min_stock_level_ft);
  });

  // Sitting inventory — same rule and threshold as the table below the cards.
  const sittingRolls = longSittingRolls(availableRolls, longSittingDays);

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
    .reduce((sum, t) => sum + Math.abs(num(t.length_change_ft)) * num(t.width_ft), 0);

  // Top products by jobs. Allocations created by the cut-to-job flow omit item_type,
  // so a roll allocation is one that either says 'roll' or carries roll ids.
  const isRollAllocation = (alloc) =>
    alloc.item_type === 'roll' ||
    (!alloc.item_type && (alloc.allocated_roll_ids || []).length > 0);

  const productJobCount = {};
  allocations.forEach(alloc => {
    if (!alloc.product_name || !alloc.job_id) return;
    if (!isRollAllocation(alloc)) return;
    if (alloc.status === ALLOCATION_STATUS.CANCELLED) return;
    if (!productJobCount[alloc.product_name]) {
      productJobCount[alloc.product_name] = new Set();
    }
    productJobCount[alloc.product_name].add(alloc.job_id);
  });

  const topProductsData = Object.entries(productJobCount)
    .map(([name, jobSet]) => ({ name, value: jobSet.size }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  // Turf type distribution with actual data.
  const turfTypeChartData = products
    .map(product => {
      const rollCount = availableRolls.filter(r => rollMatchesProduct(r, product)).length;
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
    value: availableRolls.filter(r => {
      const length = num(r.current_length_ft);
      return length >= bucket.min && length < bucket.max;
    }).length
  }));

  // Uncut vs remnant is a length measurement, not a parent/child one: a Parent roll
  // that has been cut into is a remnant here. Rolls with no original length can't be
  // classified at all, so they're left out rather than counted as uncut.
  const isUncut = (roll) => {
    const original = num(roll.original_length_ft);
    if (original <= 0) return null;
    return num(roll.current_length_ft) >= original * 0.95;
  };

  const uncutVsRemnantByProduct = (amountFor) =>
    Object.values(
      availableRolls.reduce((acc, r) => {
        const uncut = isUncut(r);
        if (uncut === null) return acc;
        const name = r.product_name || 'Unspecified product';
        if (!acc[name]) {
          acc[name] = { name, uncut: 0, remnant: 0 };
        }
        acc[name][uncut ? 'uncut' : 'remnant'] += amountFor(r);
        return acc;
      }, {})
    )
      .sort((a, b) => b.uncut + b.remnant - (a.uncut + a.remnant))
      .slice(0, 8);

  const uncutCountData = uncutVsRemnantByProduct(() => 1);
  const uncutSqftData = uncutVsRemnantByProduct(sqftOf).map(d => ({
    ...d,
    uncut: Math.round(d.uncut),
    remnant: Math.round(d.remnant),
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
            subtitle={`All rolls except Consumed/Scrapped — ${parentRolls.length} parent, ${childRolls.length} child`}
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
            value={Math.round(totalSqft).toLocaleString()}
            subtitle={`Available rolls only — ${availableRolls.length} rolls`}
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
            subtitle="Products below minimum in Available stock"
            icon={AlertTriangle}
            iconBg={lowInventoryProducts.length > 0 ? "bg-amber-100" : "bg-slate-100"}
            iconColor={lowInventoryProducts.length > 0 ? "text-amber-600" : "text-slate-400"}
          />
        </div>

        <div 
          onClick={() => navigate(createPageUrl('AgingReport'))}
          className="cursor-pointer hover:opacity-80 transition-opacity"
        >
          <StatCard
            title="Sitting Inventory"
            value={sittingRolls.length}
            subtitle={`Available rolls over ${longSittingDays} days old`}
            icon={Clock}
            iconBg={sittingRolls.length > 0 ? "bg-orange-100" : "bg-slate-100"}
            iconColor={sittingRolls.length > 0 ? "text-orange-600" : "text-slate-400"}
          />
        </div>
      </div>

      {/* Admin-only: Inventory value */}
      {isAdmin && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div
            onClick={() => navigate(createPageUrl('AgingReport'))}
            className="cursor-pointer hover:opacity-80 transition-opacity"
          >
            <StatCard
              title="Inventory Value"
              value={formatCurrency(inventoryValue(availableRolls, products))}
              subtitle="Admin only — total cash in Available stock"
              icon={DollarSign}
              iconBg="bg-emerald-100"
              iconColor="text-emerald-600"
            />
          </div>
          <div
            onClick={() => navigate(createPageUrl('AgingReport'))}
            className="cursor-pointer hover:opacity-80 transition-opacity"
          >
            <StatCard
              title={`Value Sitting ${longSittingDays}+ Days`}
              value={formatCurrency(
                inventoryValue(
                  availableRolls.filter(r => {
                    const d = daysSinceReceived(r);
                    return d != null && d >= longSittingDays;
                  }),
                  products,
                ),
              )}
              subtitle="Admin only — aging cash"
              icon={DollarSign}
              iconBg="bg-orange-100"
              iconColor="text-orange-600"
            />
          </div>
        </div>
      )}

      {/* Rolls that need to move — top 10 oldest */}
      {(() => {
        const top = sittingRolls.slice(0, 10);
        if (top.length === 0) return null;
        return (
          <div className="bg-white dark:bg-[#2d2d2d] rounded-2xl p-6 border border-slate-100 dark:border-slate-700/50 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-800 dark:text-white">
                  Rolls that need to move
                </h3>
                <p className="text-sm text-slate-500 mt-0.5">
                  Available inventory over {longSittingDays} days old, oldest first.
                </p>
              </div>
              <Button
                variant="ghost"
                onClick={() => navigate(createPageUrl('AgingReport'))}
                className="text-slate-600"
              >
                Full report <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-slate-500">
                  <tr>
                    <th className="pb-2 font-medium">TT SKU</th>
                    <th className="pb-2 font-medium">Product</th>
                    <th className="pb-2 font-medium">Size</th>
                    <th className="pb-2 font-medium">Days sitting</th>
                    {isAdmin && <th className="pb-2 font-medium text-right">Value</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {top.map(r => (
                    <tr
                      key={r.id}
                      className="hover:bg-slate-50 cursor-pointer"
                      onClick={() => navigate(createPageUrl('RollDetail') + `?id=${r.id}`)}
                    >
                      <td className="py-2 font-mono">{r.tt_sku_tag_number || r.roll_tag}</td>
                      <td className="py-2">{r.product_name}</td>
                      <td className="py-2">
                        {formatFeetInches(r.width_ft)} × {formatFeetInches(r.current_length_ft)}
                      </td>
                      <td className="py-2">
                        <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-orange-100 text-orange-700">
                          {r.__daysSitting} days
                        </span>
                      </td>
                      {isAdmin && (
                        <td className="py-2 text-right font-medium">
                          {formatCurrency(rollValue(r, products))}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

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
                  {Math.round(shippedOutSqft).toLocaleString()}
                </div>
                <div className="text-slate-600 dark:text-slate-300">Square Feet Shipped</div>
                <div className="text-sm text-slate-400 mt-2">
                  {shippedTimeRange === 'all'
                    ? `Across the ${transactions.length.toLocaleString()} most recent transactions`
                    : shippedTimeRange === 'week' ? 'Last 7 days' :
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
                    onClick={(data) => {
                      const name = data?.payload?.name || data?.name;
                      if (name) {
                        navigate(createPageUrl(`Inventory?product=${encodeURIComponent(name)}`));
                      }
                    }}
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
            <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-4">Uncut vs Remnant Rolls by Turf</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={uncutCountData}
                  layout="vertical"
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" tick={{ fontSize: 12 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={100} />
                  <Tooltip />
                  <Legend />
                  <Bar
                    dataKey="uncut"
                    stackId="a"
                    fill="#10b981"
                    name="Uncut Rolls"
                    style={{ cursor: 'pointer' }}
                    onClick={(data) =>
                      navigate(createPageUrl(`Inventory?product=${encodeURIComponent(data.name)}&status=${ROLL_STATUS.AVAILABLE}`))
                    }
                  />
                  <Bar
                    dataKey="remnant"
                    stackId="a"
                    fill="#f59e0b"
                    name="Remnants"
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
            <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-4">Uncut vs Remnant Sq Ft by Turf</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={uncutSqftData}
                  layout="vertical"
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" tick={{ fontSize: 12 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={100} />
                  <Tooltip formatter={(value) => `${value.toLocaleString()} sq ft`} />
                  <Legend />
                  <Bar
                    dataKey="uncut"
                    stackId="a"
                    fill="#10b981"
                    name="Uncut Rolls"
                    style={{ cursor: 'pointer' }}
                    onClick={(data) =>
                      navigate(createPageUrl(`Inventory?product=${encodeURIComponent(data.name)}&status=${ROLL_STATUS.AVAILABLE}`))
                    }
                  />
                  <Bar
                    dataKey="remnant"
                    stackId="a"
                    fill="#f59e0b"
                    name="Remnants"
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
              const productRolls = availableRolls.filter(r => rollMatchesProduct(r, product));
              const totalFt = productRolls.reduce((sum, r) => sum + num(r.current_length_ft), 0);
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
    </div>
  );
}