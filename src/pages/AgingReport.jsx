import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Clock, ChevronRight, DollarSign } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import StatusBadge from '@/components/ui/StatusBadge';
import { format } from 'date-fns';
import { useIsAdmin } from '@/lib/AuthContext';
import {
  AGING_BUCKETS,
  daysSinceReceived,
  agingBucketFor,
  rollValue,
  inventoryValue,
  formatCurrency,
  groupByAging,
} from '@/lib/costing';
import { ROLL_STATUS } from '@/lib/rollStatus';

export default function AgingReport() {
  const isAdmin = useIsAdmin();
  const [selectedBucket, setSelectedBucket] = useState(null);

  const { data: rolls = [], isLoading } = useQuery({
    queryKey: ['rolls'],
    queryFn: () => base44.entities.Roll.list('-created_date', 1000),
  });

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => base44.entities.Product.list('-created_date', 200),
  });

  // Only aging Available inventory — we don't want to double-count rolls that are actively on jobs.
  const availableRolls = useMemo(
    () => rolls.filter(r => r.status === ROLL_STATUS.AVAILABLE),
    [rolls],
  );

  const grouped = useMemo(() => groupByAging(availableRolls), [availableRolls]);

  const bucketSummaries = AGING_BUCKETS.map(b => {
    const bucketRolls = grouped[b.id] || [];
    return {
      ...b,
      count: bucketRolls.length,
      sqft: bucketRolls.reduce(
        (sum, r) => sum + (parseFloat(r.width_ft) || 0) * (parseFloat(r.current_length_ft) || 0),
        0,
      ),
      value: inventoryValue(bucketRolls, products),
      rolls: bucketRolls,
    };
  });

  const totalValue = inventoryValue(availableRolls, products);
  const totalSittingTooLongValue = bucketSummaries
    .filter(b => b.minDays >= 90)
    .reduce((sum, b) => sum + b.value, 0);

  const visibleRolls = selectedBucket
    ? (bucketSummaries.find(b => b.id === selectedBucket)?.rolls || [])
    : availableRolls;

  // Sort visible rolls by age (oldest first).
  const sortedRolls = [...visibleRolls].sort((a, b) => {
    const aDays = daysSinceReceived(a) ?? -1;
    const bDays = daysSinceReceived(b) ?? -1;
    return bDays - aDays;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Clock className="h-7 w-7 text-amber-600" />
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-slate-800">Aging Report</h1>
          <p className="text-slate-500 mt-1">
            How long available inventory has been sitting. Older rolls should move first.
          </p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {bucketSummaries.map(b => (
          <button
            key={b.id}
            onClick={() =>
              setSelectedBucket(selectedBucket === b.id ? null : b.id)
            }
            className={`rounded-xl p-4 text-left border-2 transition-all ${
              selectedBucket === b.id
                ? 'border-slate-800 shadow-md'
                : 'border-transparent hover:border-slate-300'
            } ${b.color}`}
          >
            <div className="text-xs font-medium uppercase tracking-wide opacity-70">
              {b.label}
            </div>
            <div className="text-2xl font-bold mt-1">{b.count}</div>
            <div className="text-xs mt-0.5">
              {Math.round(b.sqft).toLocaleString()} sqft
            </div>
            {isAdmin && (
              <div className="text-xs mt-0.5 font-medium">
                {formatCurrency(b.value)}
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Admin-only summary */}
      {isAdmin && (
        <Card className="rounded-2xl border-slate-100 shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-emerald-600" />
              <CardTitle className="text-lg">Inventory Value (Admin)</CardTitle>
            </div>
            <CardDescription>Cash tied up in Available inventory.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-lg bg-slate-50 p-4">
                <div className="text-sm text-slate-500">Total Available inventory</div>
                <div className="text-2xl font-bold text-slate-800 mt-1">
                  {formatCurrency(totalValue)}
                </div>
              </div>
              <div className="rounded-lg bg-orange-50 p-4">
                <div className="text-sm text-orange-800">Sitting 90+ days</div>
                <div className="text-2xl font-bold text-orange-900 mt-1">
                  {formatCurrency(totalSittingTooLongValue)}
                </div>
                <div className="text-xs text-orange-700 mt-0.5">
                  {totalValue > 0
                    ? `${((totalSittingTooLongValue / totalValue) * 100).toFixed(0)}% of inventory value`
                    : '—'}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Roll list */}
      <Card className="rounded-2xl border-slate-100 shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">
                {selectedBucket
                  ? `${AGING_BUCKETS.find(b => b.id === selectedBucket)?.label} rolls`
                  : 'All Available rolls'}{' '}
                ({sortedRolls.length})
              </CardTitle>
              <CardDescription>Sorted oldest first.</CardDescription>
            </div>
            {selectedBucket && (
              <Button variant="outline" onClick={() => setSelectedBucket(null)}>
                Show all
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 text-slate-500">Loading…</div>
          ) : sortedRolls.length === 0 ? (
            <div className="p-8 text-center text-slate-500">No rolls in this bucket.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead>TT SKU</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Dye Lot</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Received</TableHead>
                    <TableHead>Days Sitting</TableHead>
                    {isAdmin && <TableHead className="text-right">Value</TableHead>}
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedRolls.map(roll => {
                    const days = daysSinceReceived(roll);
                    const bucket = agingBucketFor(roll);
                    const bucketDef = AGING_BUCKETS.find(b => b.id === bucket);
                    return (
                      <TableRow key={roll.id}>
                        <TableCell className="font-mono font-medium">
                          {roll.tt_sku_tag_number || roll.roll_tag || '—'}
                        </TableCell>
                        <TableCell>{roll.product_name}</TableCell>
                        <TableCell className="text-slate-600">{roll.dye_lot}</TableCell>
                        <TableCell>
                          {roll.width_ft}ft × {roll.current_length_ft}ft
                        </TableCell>
                        <TableCell className="text-slate-600">
                          {roll.date_received
                            ? format(new Date(roll.date_received), 'MMM d, yyyy')
                            : '—'}
                        </TableCell>
                        <TableCell>
                          {days != null ? (
                            <span
                              className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${bucketDef?.color || 'bg-slate-100 text-slate-700'}`}
                            >
                              {days} days
                            </span>
                          ) : (
                            '—'
                          )}
                        </TableCell>
                        {isAdmin && (
                          <TableCell className="text-right font-medium">
                            {formatCurrency(rollValue(roll, products))}
                          </TableCell>
                        )}
                        <TableCell>
                          <Link to={createPageUrl('RollDetail') + `?id=${roll.id}`}>
                            <Button size="sm" variant="ghost">
                              <ChevronRight className="h-4 w-4" />
                            </Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {!isAdmin && (
        <p className="text-xs text-slate-500">
          Cost and inventory value data is only visible to admins.
        </p>
      )}
    </div>
  );
}
