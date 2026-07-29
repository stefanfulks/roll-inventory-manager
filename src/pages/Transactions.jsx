import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Download,
  RotateCcw
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from '@/components/ui/skeleton';
import OwnerFilter from '@/components/inventory/OwnerFilter';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { safeFormat } from '@/lib/dateHelpers';
import { describeError } from '@/lib/query-client';
import {
  ROLL_STATUS,
  STATUS_LABELS,
  TRANSACTION_TYPE,
  TRANSACTION_TYPE_OPTIONS,
  TRANSACTION_TYPE_LABELS,
  findActiveAllocationForRoll,
  releaseRoll,
} from '@/lib/rollStatus';

// Colour per canonical transaction type; anything unmapped falls back to slate.
const TYPE_COLORS = {
  [TRANSACTION_TYPE.RECEIVE_ROLL]: 'text-emerald-600 bg-emerald-50',
  [TRANSACTION_TYPE.PENDING_REVIEW]: 'text-amber-600 bg-amber-50',
  [TRANSACTION_TYPE.PLAN_FOR_JOB]: 'text-violet-600 bg-violet-50',
  [TRANSACTION_TYPE.ALLOCATE_FOR_JOB]: 'text-indigo-600 bg-indigo-50',
  [TRANSACTION_TYPE.ASSIGN_TO_JOB]: 'text-indigo-600 bg-indigo-50',
  [TRANSACTION_TYPE.SEND_OUT_TO_JOB]: 'text-blue-600 bg-blue-50',
  [TRANSACTION_TYPE.RETURN_FROM_JOB]: 'text-orange-600 bg-orange-50',
  [TRANSACTION_TYPE.CUT_CREATE_CHILD]: 'text-purple-600 bg-purple-50',
  [TRANSACTION_TYPE.ROLL_SWAP]: 'text-cyan-600 bg-cyan-50',
  [TRANSACTION_TYPE.ADJUSTMENT]: 'text-slate-600 bg-slate-50',
  [TRANSACTION_TYPE.REVERSAL]: 'text-red-600 bg-red-50',
};

const DISPOSITION_FILTERS = [
  { value: 'all', label: 'All Dispositions' },
  { value: 'terminal', label: 'Consumed or Scrapped' },
  { value: ROLL_STATUS.CONSUMED, label: STATUS_LABELS[ROLL_STATUS.CONSUMED] },
  { value: ROLL_STATUS.SCRAPPED, label: STATUS_LABELS[ROLL_STATUS.SCRAPPED] },
];

const csvCell = value => `"${String(value ?? '').replace(/"/g, '""')}"`;

const toCsv = rows => rows.map(row => row.map(csvCell).join(',')).join('\n');

export default function Transactions() {
  const queryClient = useQueryClient();
  const [ownerFilter, setOwnerFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [dispositionFilter, setDispositionFilter] = useState('all');

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ['transactions'],
    queryFn: () => base44.entities.Transaction.list('-created_date', 1000),
  });

  const { data: rolls = [] } = useQuery({
    queryKey: ['rolls'],
    queryFn: () => base44.entities.Roll.list('-created_date', 5000),
  });

  const { data: allocations = [] } = useQuery({
    queryKey: ['allocations'],
    queryFn: () => base44.entities.Allocation.list('-created_date', 5000),
  });

  const rollStatusById = useMemo(() => {
    const map = {};
    for (const roll of rolls) map[roll.id] = roll.status;
    return map;
  }, [rolls]);

  // For each roll, find its most recent transaction id so we can show undo button
  const mostRecentTxByRoll = useMemo(() => {
    const map = {};
    // transactions are already sorted newest-first
    for (const tx of transactions) {
      if (tx.roll_id && !map[tx.roll_id]) map[tx.roll_id] = tx.id;
    }
    return map;
  }, [transactions]);

  const undoMutation = useMutation({
    mutationFn: async (tx) => {
      // Only undo if it's the most recent transaction for that roll
      if (mostRecentTxByRoll[tx.roll_id] !== tx.id) {
        throw new Error('This is not the most recent transaction for this roll. Cannot undo.');
      }
      const roll = rolls.find(r => r.id === tx.roll_id);
      if (!roll) throw new Error('Roll not found');

      // An undo that frees a roll still claimed by a live allocation would let it
      // be double-booked, so the allocation has to be dealt with on the job first.
      const activeAllocation = findActiveAllocationForRoll(tx.roll_id, allocations);
      if (activeAllocation) {
        throw new Error(
          `This roll is still allocated to ${activeAllocation.job_name || 'a job'}. Release it from the job (or cancel the allocation) before undoing this transaction.`
        );
      }

      const user = await base44.auth.me();

      // Restore roll length to before-state
      await base44.entities.Roll.update(tx.roll_id, {
        current_length_ft: tx.length_before_ft,
      });
      await releaseRoll(tx.roll_id);

      // Flag the original record without rewriting its type — the type is what
      // every filter and stat count reads, so the audit row must stay findable.
      await base44.entities.Transaction.update(tx.id, {
        reversed: true,
        notes: `[REVERSED] ${tx.notes || ''}`.trim(),
      });

      // Log a reversal transaction
      await base44.entities.Transaction.create({
        transaction_type: TRANSACTION_TYPE.REVERSAL,
        fulfillment_for: tx.fulfillment_for || roll.inventory_owner,
        roll_id: tx.roll_id,
        tt_sku_tag_number: tx.tt_sku_tag_number || roll.tt_sku_tag_number,
        job_id: tx.job_id || null,
        job_number: tx.job_number || null,
        product_name: tx.product_name,
        dye_lot: tx.dye_lot,
        width_ft: tx.width_ft,
        length_change_ft: (tx.length_before_ft || 0) - (tx.length_after_ft || 0),
        length_before_ft: tx.length_after_ft,
        length_after_ft: tx.length_before_ft,
        performed_by: user.full_name || user.email,
        notes: `Reversed transaction: ${tx.transaction_type} (original tx id: ${tx.id})`,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['rolls'] });
      queryClient.invalidateQueries({ queryKey: ['allocations'] });
      toast.success('Transaction reversed successfully');
    },
    onError: (err) => toast.error(describeError(err)),
  });

  const txOwner = tx => tx.fulfillment_for ?? tx.inventory_owner;

  const filteredTransactions = transactions.filter(tx => {
    if (ownerFilter !== 'all' && txOwner(tx) !== ownerFilter) return false;
    if (typeFilter !== 'all' && tx.transaction_type !== typeFilter) return false;
    if (dispositionFilter !== 'all') {
      const rollStatus = tx.roll_id ? rollStatusById[tx.roll_id] : null;
      if (dispositionFilter === 'terminal') {
        if (rollStatus !== ROLL_STATUS.CONSUMED && rollStatus !== ROLL_STATUS.SCRAPPED) return false;
      } else if (rollStatus !== dispositionFilter) {
        return false;
      }
    }
    return true;
  });

  const exportCSV = () => {
    const headers = [
      'Date',
      'Type',
      'Owner',
      'Roll Tag',
      'Product',
      'Dye Lot',
      'Width',
      'Length Change',
      'Before',
      'After',
      'Job',
      'Roll Status',
      'Bundle',
      'Performed By',
      'Notes'
    ];

    const rows = filteredTransactions.map(tx => [
      safeFormat(tx.created_date, 'yyyy-MM-dd HH:mm:ss', ''),
      tx.transaction_type,
      txOwner(tx) || '',
      tx.roll_tag || tx.tt_sku_tag_number || '',
      tx.product_name,
      tx.dye_lot,
      tx.width_ft,
      tx.length_change_ft,
      tx.length_before_ft,
      tx.length_after_ft,
      tx.job_number || tx.job_name || '',
      (tx.roll_id && rollStatusById[tx.roll_id]) || '',
      tx.bundle_id || '',
      tx.performed_by || '',
      tx.notes || ''
    ]);

    const blob = new Blob([toCsv([headers, ...rows])], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transactions_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const getTypeColor = (type) => TYPE_COLORS[type] || 'text-slate-600 bg-slate-50';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-slate-800">Transaction Log</h1>
          <p className="text-slate-500 mt-1">Complete audit trail of inventory movements</p>
        </div>
        <div className="flex items-center gap-2">
          <OwnerFilter value={ownerFilter} onChange={setOwnerFilter} />
          <Button variant="outline" onClick={exportCSV}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Transaction Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {TRANSACTION_TYPE_OPTIONS.map(type => (
              <SelectItem key={type} value={type}>
                {TRANSACTION_TYPE_LABELS[type] || type}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={dispositionFilter} onValueChange={setDispositionFilter}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Roll Disposition" />
          </SelectTrigger>
          <SelectContent>
            {DISPOSITION_FILTERS.map(o => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {dispositionFilter !== 'all' && (
        <p className="text-sm text-slate-500 -mt-3">
          Showing every movement of rolls whose current status is{' '}
          {dispositionFilter === 'terminal'
            ? 'Consumed or Scrapped'
            : STATUS_LABELS[dispositionFilter]}
          {' '}— use the Job column to see where they went.
        </p>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 border border-slate-100">
          <p className="text-sm text-slate-500 mb-1">Total Transactions</p>
          <p className="text-2xl font-bold text-slate-800">{filteredTransactions.length}</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-slate-100">
          <p className="text-sm text-slate-500 mb-1">Receives</p>
          <p className="text-2xl font-bold text-emerald-600">
            {filteredTransactions.filter(t => t.transaction_type === TRANSACTION_TYPE.RECEIVE_ROLL).length}
          </p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-slate-100">
          <p className="text-sm text-slate-500 mb-1">Ships</p>
          <p className="text-2xl font-bold text-blue-600">
            {filteredTransactions.filter(t => t.transaction_type === TRANSACTION_TYPE.SEND_OUT_TO_JOB).length}
          </p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-slate-100">
          <p className="text-sm text-slate-500 mb-1">Returns</p>
          <p className="text-2xl font-bold text-orange-600">
            {filteredTransactions.filter(t => t.transaction_type === TRANSACTION_TYPE.RETURN_FROM_JOB).length}
          </p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-4">
            {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="font-semibold">Date/Time</TableHead>
                  <TableHead className="font-semibold">Type</TableHead>
                  <TableHead className="font-semibold">Roll Tag</TableHead>
                  <TableHead className="font-semibold">Product</TableHead>
                  <TableHead className="font-semibold">Job</TableHead>
                  <TableHead className="font-semibold">Change</TableHead>
                  <TableHead className="font-semibold">Before</TableHead>
                  <TableHead className="font-semibold">After</TableHead>
                  <TableHead className="font-semibold">Notes</TableHead>
                  <TableHead className="font-semibold">Performed By</TableHead>
                  <TableHead className="font-semibold">Undo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTransactions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center py-12 text-slate-500">
                      No transactions found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredTransactions.map((tx) => {
                    // 'Reversed_' rows are legacy — historical undos rewrote the
                    // type before reversals were flagged with `reversed`.
                    const isReversed = tx.reversed || tx.transaction_type?.startsWith('Reversed_');
                    const canUndo = tx.roll_id &&
                      mostRecentTxByRoll[tx.roll_id] === tx.id &&
                      tx.length_before_ft != null &&
                      !isReversed &&
                      tx.transaction_type !== TRANSACTION_TYPE.REVERSAL;
                    const rollStatus = tx.roll_id ? rollStatusById[tx.roll_id] : null;
                    return (
                      <TableRow key={tx.id} className={`hover:bg-slate-50 transition-colors ${tx.transaction_type === TRANSACTION_TYPE.REVERSAL || isReversed ? 'opacity-50' : ''}`}>
                        <TableCell className="font-mono text-xs whitespace-nowrap">
                          {safeFormat(tx.created_date, 'MMM d, HH:mm')}
                        </TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded ${getTypeColor(tx.transaction_type)}`}>
                            {TRANSACTION_TYPE_LABELS[tx.transaction_type] || tx.transaction_type}
                          </span>
                        </TableCell>
                        <TableCell className="font-mono text-sm">{tx.roll_tag || tx.tt_sku_tag_number || '-'}</TableCell>
                        <TableCell className="text-slate-600 max-w-xs truncate">
                          {tx.product_name || '-'}
                        </TableCell>
                        <TableCell className="text-sm whitespace-nowrap">
                          {tx.job_number ? (
                            tx.job_id ? (
                              <Link
                                to={createPageUrl(`JobDetail?id=${tx.job_id}`)}
                                className="text-blue-600 hover:underline"
                              >
                                {tx.job_number}
                              </Link>
                            ) : (
                              tx.job_number
                            )
                          ) : (
                            '-'
                          )}
                          {(rollStatus === ROLL_STATUS.CONSUMED || rollStatus === ROLL_STATUS.SCRAPPED) && (
                            <span className="block text-xs text-slate-400">
                              {STATUS_LABELS[rollStatus]}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          {tx.length_change_ft != null && tx.length_change_ft !== 0 && (
                            <span className={`font-medium ${tx.length_change_ft > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                              {tx.length_change_ft > 0 ? '+' : ''}{tx.length_change_ft}ft
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-slate-500">{tx.length_before_ft ?? '-'} ft</TableCell>
                        <TableCell className="text-slate-500">{tx.length_after_ft ?? '-'} ft</TableCell>
                        <TableCell className="text-slate-600 max-w-xs truncate text-xs">
                          {tx.notes || '-'}
                        </TableCell>
                        <TableCell className="text-slate-500 text-xs">
                          {tx.performed_by || tx.created_by || '-'}
                        </TableCell>
                        <TableCell>
                          {canUndo && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                if (confirm('Undo this transaction? This will restore the roll to its previous length.')) {
                                  undoMutation.mutate(tx);
                                }
                              }}
                              disabled={undoMutation.isPending}
                              className="text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                              title="Undo this transaction"
                            >
                              <RotateCcw className="h-4 w-4" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}