import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { 
  Package, 
  Ruler, 
  DollarSign, 
  TrendingUp,
  Scissors,
  Truck,
  RotateCcw,
  AlertTriangle
} from 'lucide-react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import StatCard from '@/components/ui/StatCard';
import OwnerFilter from '@/components/inventory/OwnerFilter';
import { Skeleton } from '@/components/ui/skeleton';

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

export default function Dashboard() {
  const [ownerFilter, setOwnerFilter] = useState('TexasTurf');

  const { data: rolls = [], isLoading: loadingRolls } = useQuery({
    queryKey: ['rolls'],
    queryFn: () => base44.entities.Roll.list('-created_date', 1000),
  });

  const { data: transactions = [], isLoading: loadingTx } = useQuery({
    queryKey: ['transactions'],
    queryFn: () => base44.entities.Transaction.list('-created_date', 500),
  });

  const { data: bundles = [] } = useQuery({
    queryKey: ['bundles'],
    queryFn: () => base44.entities.Bundle.list('-created_date', 100),
  });

  const filteredRolls = rolls.filter(r => r.inventory_owner === 'TexasTurf');

  // Calculate metrics
  const availableRolls = filteredRolls.filter(r => r.status === 'Available');
  const totalRolls = filteredRolls.length;
  const parentRolls = filteredRolls.filter(r => r.roll_type === 'Parent');
  const childRolls = filteredRolls.filter(r => r.roll_type === 'Child');
  
  const totalSqft = availableRolls.reduce((sum, r) => sum + (r.current_length_ft * r.width_ft), 0);
  const totalLinearFt = availableRolls.reduce((sum, r) => sum + r.current_length_ft, 0);
  
  const lowInventoryRolls = filteredRolls.filter(r => 
    r.status === 'Available' && r.current_length_ft < 25
  );
  
  const returnedHoldRolls = filteredRolls.filter(r => r.status === 'ReturnedHold');

  // Status distribution
  const statusData = Object.entries(
    filteredRolls.reduce((acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1;
      return acc;
    }, {})
  ).map(([name, value]) => ({ name, value }));

  // Product distribution
  const productData = Object.entries(
    filteredRolls.reduce((acc, r) => {
      acc[r.product_name] = (acc[r.product_name] || 0) + (r.current_length_ft * r.width_ft);
      return acc;
    }, {})
  ).map(([name, value]) => ({ name, value: Math.round(value) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  // Owner distribution
  const ownerData = [
    { name: 'TexasTurf', value: rolls.filter(r => r.inventory_owner === 'TexasTurf').length },
    { name: 'TurfCasa', value: rolls.filter(r => r.inventory_owner === 'TurfCasa').length },
  ];

  // Width distribution
  const widthData = Object.entries(
    filteredRolls.reduce((acc, r) => {
      acc[`${r.width_ft}ft`] = (acc[`${r.width_ft}ft`] || 0) + 1;
      return acc;
    }, {})
  ).map(([name, value]) => ({ name, value }));

  // Length buckets
  const lengthBuckets = [
    { name: '0-10ft', min: 0, max: 10 },
    { name: '10-25ft', min: 10, max: 25 },
    { name: '25-50ft', min: 25, max: 50 },
    { name: '50-75ft', min: 50, max: 75 },
    { name: '75-100ft', min: 75, max: 100 },
    { name: '100ft+', min: 100, max: 999 },
  ];

  const lengthData = lengthBuckets.map(bucket => ({
    name: bucket.name,
    value: availableRolls.filter(r => 
      r.current_length_ft >= bucket.min && r.current_length_ft < bucket.max
    ).length
  }));

  if (loadingRolls) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-32 rounded-2xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-80 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-slate-800">Dashboard</h1>
          <p className="text-slate-500 mt-1">TexasTurf inventory overview and analytics</p>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Rolls"
          value={totalRolls.toLocaleString()}
          subtitle={`${parentRolls.length} parent, ${childRolls.length} child`}
          icon={Package}
          iconBg="bg-emerald-100"
          iconColor="text-emerald-600"
        />
        <StatCard
          title="Available Sq Ft"
          value={totalSqft.toLocaleString()}
          subtitle={`${totalLinearFt.toLocaleString()} linear ft`}
          icon={Ruler}
          iconBg="bg-blue-100"
          iconColor="text-blue-600"
        />
        <StatCard
          title="Low Inventory"
          value={lowInventoryRolls.length}
          subtitle="Rolls under 25ft"
          icon={AlertTriangle}
          iconBg={lowInventoryRolls.length > 0 ? "bg-amber-100" : "bg-slate-100"}
          iconColor={lowInventoryRolls.length > 0 ? "text-amber-600" : "text-slate-400"}
        />
        <StatCard
          title="Returns Hold"
          value={returnedHoldRolls.length}
          subtitle="Pending inspection"
          icon={RotateCcw}
          iconBg={returnedHoldRolls.length > 0 ? "bg-orange-100" : "bg-slate-100"}
          iconColor={returnedHoldRolls.length > 0 ? "text-orange-600" : "text-slate-400"}
        />
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Status Distribution */}
        <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">Inventory by Status</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="value"
                  label={({ name, value }) => `${name}: ${value}`}
                  labelLine={false}
                >
                  {statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Condition Distribution */}
        <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">Inventory by Condition</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={Object.entries(
                    filteredRolls.reduce((acc, r) => {
                      acc[r.condition] = (acc[r.condition] || 0) + 1;
                      return acc;
                    }, {})
                  ).map(([name, value]) => ({ name, value }))}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="value"
                  label={({ name, value }) => `${name}: ${value}`}
                  labelLine={false}
                >
                  {[0, 1, 2, 3, 4].map((index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Product Distribution */}
        <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">Top Products by Sq Ft</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={productData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" tick={{ fontSize: 12 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={100} />
                <Tooltip formatter={(value) => `${value.toLocaleString()} sq ft`} />
                <Bar dataKey="value" fill="#10b981" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Length Distribution */}
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

        {/* Width Distribution */}
        <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">Inventory by Width</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={widthData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="value"
                  label={({ name, value }) => `${name}: ${value}`}
                  labelLine={false}
                >
                  {widthData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Roll Type Distribution */}
        <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">Parent vs Child Rolls</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={[
                    { name: 'Parent Rolls', value: parentRolls.length },
                    { name: 'Child Rolls', value: childRolls.length },
                  ]}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="value"
                  label={({ name, value }) => `${name}: ${value}`}
                  labelLine={false}
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
      </div>
    </div>
  );
}