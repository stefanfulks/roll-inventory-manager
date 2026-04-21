import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { 
  FileText, 
  Download,
  Filter
} from 'lucide-react';
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
import { format } from 'date-fns';

export default function Transactions() {
  const [ownerFilter, setOwnerFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ['transactions'],
    queryFn: () => base44.entities.Transaction.list('-created_date', 1000),
  });

  const filteredTransactions = transactions.filter(tx => {
    if (ownerFilter !== 'all' && tx.inventory_owner !== ownerFilter) return false;
    if (typeFilter !== 'all' && tx.transaction_type !== typeFilter) return false;
    return true;
  });

  const transactionTypes = [
    'Receive',
    'CutCreateChild',
    'Ship',
    'Return',
    'Adjustment',
    'Scrap',
    'Transfer',
    'Allocate',
    'Reserve',
    'BundleAdd',
    'BundleRemove'
  ];

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
      'Bundle',
      'Performed By',
      'Notes'
    ];
    
    const rows = filteredTransactions.map(tx => [
      format(new Date(tx.created_date), 'yyyy-MM-dd HH:mm:ss'),
      tx.transaction_type,
      tx.inventory_owner,
      tx.roll_tag,
      tx.product_name,
      tx.dye_lot,
      tx.width_ft,
      tx.length_change_ft,
      tx.length_before_ft,
      tx.length_after_ft,
      tx.job_name || '',
      tx.bundle_id || '',
      tx.performed_by || '',
      tx.notes || ''
    ]);
    
    const csv = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transactions_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const getTypeColor = (type) => {
    const colors = {
      Receive: 'text-emerald-600 bg-emerald-50',
      CutCreateChild: 'text-purple-600 bg-purple-50',
      Ship: 'text-blue-600 bg-blue-50',
      Return: 'text-orange-600 bg-orange-50',
      Adjustment: 'text-amber-600 bg-amber-50',
      Scrap: 'text-red-600 bg-red-50',
      Transfer: 'text-slate-600 bg-slate-50',
      Allocate: 'text-indigo-600 bg-indigo-50',
      Reserve: 'text-violet-600 bg-violet-50',
      BundleAdd: 'text-cyan-600 bg-cyan-50',
      BundleRemove: 'text-pink-600 bg-pink-50'
    };
    return colors[type] || 'text-slate-600 bg-slate-50';
  };

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
            {transactionTypes.map(type => (
              <SelectItem key={type} value={type}>{type}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 border border-slate-100">
          <p className="text-sm text-slate-500 mb-1">Total Transactions</p>
          <p className="text-2xl font-bold text-slate-800">{filteredTransactions.length}</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-slate-100">
          <p className="text-sm text-slate-500 mb-1">Receives</p>
          <p className="text-2xl font-bold text-emerald-600">
            {filteredTransactions.filter(t => t.transaction_type === 'ReceiveRoll').length}
          </p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-slate-100">
          <p className="text-sm text-slate-500 mb-1">Ships</p>
          <p className="text-2xl font-bold text-blue-600">
            {filteredTransactions.filter(t => t.transaction_type === 'SendOutToJob').length}
          </p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-slate-100">
          <p className="text-sm text-slate-500 mb-1">Returns</p>
          <p className="text-2xl font-bold text-orange-600">
            {filteredTransactions.filter(t => t.transaction_type === 'ReturnFromJob').length}
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
                  <TableHead className="font-semibold">Change</TableHead>
                  <TableHead className="font-semibold">Before</TableHead>
                  <TableHead className="font-semibold">After</TableHead>
                  <TableHead className="font-semibold">Notes</TableHead>
                  <TableHead className="font-semibold">Performed By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTransactions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-12 text-slate-500">
                      No transactions found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredTransactions.map((tx) => (
                    <TableRow key={tx.id} className="hover:bg-slate-50 transition-colors">
                      <TableCell className="font-mono text-xs whitespace-nowrap">
                        {format(new Date(tx.created_date), 'MMM d, HH:mm')}
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded ${getTypeColor(tx.transaction_type)}`}>
                          {tx.transaction_type}
                        </span>
                      </TableCell>
                      <TableCell className="font-mono text-sm">{tx.roll_tag}</TableCell>
                      <TableCell className="text-slate-600 max-w-xs truncate">
                        {tx.product_name || '-'}
                      </TableCell>
                      <TableCell>
                        {tx.length_change_ft !== 0 && (
                          <span className={`font-medium ${tx.length_change_ft > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                            {tx.length_change_ft > 0 ? '+' : ''}{tx.length_change_ft}ft
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-slate-500">{tx.length_before_ft || '-'} ft</TableCell>
                      <TableCell className="text-slate-500">{tx.length_after_ft || '-'} ft</TableCell>
                      <TableCell className="text-slate-600 max-w-xs truncate text-xs">
                        {tx.notes || '-'}
                      </TableCell>
                      <TableCell className="text-slate-500 text-xs">
                        {tx.performed_by || tx.created_by || '-'}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}