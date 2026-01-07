import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { 
  Download,
  Filter
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import OwnerBadge from '@/components/ui/OwnerBadge';
import { format } from 'date-fns';

const transactionTypeColors = {
  Receive: 'bg-emerald-100 text-emerald-700',
  CutCreateChild: 'bg-violet-100 text-violet-700',
  Ship: 'bg-blue-100 text-blue-700',
  Return: 'bg-amber-100 text-amber-700',
  Adjustment: 'bg-orange-100 text-orange-700',
  Scrap: 'bg-red-100 text-red-700',
  Transfer: 'bg-cyan-100 text-cyan-700',
  Allocate: 'bg-indigo-100 text-indigo-700',
  Reserve: 'bg-purple-100 text-purple-700',
  BundleAdd: 'bg-pink-100 text-pink-700',
  BundleRemove: 'bg-slate-100 text-slate-700',
};

export default function Transactions() {
  const [ownerFilter, setOwnerFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ['transactions'],
    queryFn: () => base44.entities.Transaction.list('-created_date', 1000),
  });

  const filteredTransactions = transactions.filter(tx => {
    if (ownerFilter !== 'all' && tx.inventory_owner !== ownerFilter) return false;
    if (typeFilter !== 'all' && tx.transaction_type !== typeFilter) return false;
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      return (
        tx.roll_tag?.toLowerCase().includes(search) ||
        tx.product_name?.toLowerCase().includes(search) ||
        tx.dye_lot?.toLowerCase().includes(search) ||
        tx.notes?.toLowerCase().includes(search)
      );
    }
    if (dateFrom && new Date(tx.created_date) < new Date(dateFrom)) return false;
    if (dateTo && new Date(tx.created_date) > new Date(dateTo + 'T23:59:59')) return false;
    return true;
  });

  const exportCSV = () => {
    const headers = ['Date', 'Type', 'Owner', 'Roll Tag', 'Product', 'Dye Lot', 'Width', 'Length Change', 'Before', 'After', 'Job', 'Notes', 'User'];
    const rows = filteredTransactions.map(tx => [
      format(new Date(tx.created_date), 'yyyy-MM-dd HH:mm'),
      tx.transaction_type,
      tx.inventory_owner,
      tx.roll_tag,
      tx.product_name,
      tx.dye_lot,
      tx.width_ft,
      tx.length_change_ft,
      tx.length_before_ft,
      tx.length_after_ft,
      tx.job_name,
      tx.notes,
      tx.performed_by
    ]);
    
    const csv = [headers, ...rows].map(row => row.map(c => `"${c || ''}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transactions_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-slate-800">Transaction Log</h1>
          <p className="text-slate-500 mt-1">{filteredTransactions.length} transactions</p>
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
      <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
        <div className="flex flex-wrap gap-3">
          <Input
            placeholder="Search roll tag, product, dye lot..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-64"
          />
          
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="Receive">Receive</SelectItem>
              <SelectItem value="CutCreateChild">Cut/Create Child</SelectItem>
              <SelectItem value="Ship">Ship</SelectItem>
              <SelectItem value="Return">Return</SelectItem>
              <SelectItem value="Adjustment">Adjustment</SelectItem>
              <SelectItem value="Scrap">Scrap</SelectItem>
              <SelectItem value="Transfer">Transfer</SelectItem>
              <SelectItem value="Reserve">Reserve</SelectItem>
              <SelectItem value="BundleAdd">Bundle Add</SelectItem>
              <SelectItem value="BundleRemove">Bundle Remove</SelectItem>
            </SelectContent>
          </Select>

          <Input
            type="date"
            placeholder="From"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-40"
          />
          <Input
            type="date"
            placeholder="To"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-40"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-4">
            {[1, 2, 3, 4, 5].map(i => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="font-semibold">Date</TableHead>
                  <TableHead className="font-semibold">Type</TableHead>
                  <TableHead className="font-semibold">Owner</TableHead>
                  <TableHead className="font-semibold">Roll Tag</TableHead>
                  <TableHead className="font-semibold">Product</TableHead>
                  <TableHead className="font-semibold">Dye Lot</TableHead>
                  <TableHead className="font-semibold">Length Change</TableHead>
                  <TableHead className="font-semibold">Before → After</TableHead>
                  <TableHead className="font-semibold">Notes</TableHead>
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
                      <TableCell className="text-slate-600 whitespace-nowrap">
                        {format(new Date(tx.created_date), 'MMM d, h:mm a')}
                      </TableCell>
                      <TableCell>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${transactionTypeColors[tx.transaction_type] || 'bg-slate-100 text-slate-600'}`}>
                          {tx.transaction_type}
                        </span>
                      </TableCell>
                      <TableCell>
                        {tx.inventory_owner && <OwnerBadge owner={tx.inventory_owner} size="sm" />}
                      </TableCell>
                      <TableCell className="font-mono">{tx.roll_tag}</TableCell>
                      <TableCell>{tx.product_name}</TableCell>
                      <TableCell className="text-slate-600">{tx.dye_lot}</TableCell>
                      <TableCell>
                        {tx.length_change_ft !== 0 && (
                          <span className={tx.length_change_ft > 0 ? 'text-emerald-600' : 'text-red-600'}>
                            {tx.length_change_ft > 0 ? '+' : ''}{tx.length_change_ft}ft
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-slate-600">
                        {tx.length_before_ft}ft → {tx.length_after_ft}ft
                      </TableCell>
                      <TableCell className="text-slate-500 max-w-[200px] truncate">
                        {tx.notes || '-'}
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