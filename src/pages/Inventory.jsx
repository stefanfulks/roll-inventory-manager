import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { 
  Package, 
  Filter, 
  Download,
  Eye,
  ChevronDown,
  Scissors
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from '@/components/ui/skeleton';
import RollSearch from '@/components/inventory/RollSearch';
import OwnerFilter from '@/components/inventory/OwnerFilter';
import StatusBadge from '@/components/ui/StatusBadge';
import OwnerBadge from '@/components/ui/OwnerBadge';

export default function Inventory() {
  const [ownerFilter, setOwnerFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [productFilter, setProductFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  const { data: rolls = [], isLoading } = useQuery({
    queryKey: ['rolls'],
    queryFn: () => base44.entities.Roll.list('-created_date', 1000),
  });

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => base44.entities.Product.list(),
  });

  const filteredRolls = rolls.filter(roll => {
    if (ownerFilter !== 'all' && roll.inventory_owner !== ownerFilter) return false;
    if (statusFilter !== 'all' && roll.status !== statusFilter) return false;
    if (typeFilter !== 'all' && roll.roll_type !== typeFilter) return false;
    if (productFilter !== 'all' && roll.product_name !== productFilter) return false;
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      return (
        roll.roll_tag?.toLowerCase().includes(search) ||
        roll.product_name?.toLowerCase().includes(search) ||
        roll.dye_lot?.toLowerCase().includes(search) ||
        roll.location_name?.toLowerCase().includes(search)
      );
    }
    return true;
  });

  const uniqueProducts = [...new Set(rolls.map(r => r.product_name).filter(Boolean))];

  const exportCSV = () => {
    const headers = ['Roll Tag', 'SKU', 'Owner', 'Product', 'Dye Lot', 'Width', 'Current Length', 'Type', 'Status', 'Location', 'Condition'];
    const rows = filteredRolls.map(r => [
      r.roll_tag,
      r.custom_roll_sku,
      r.inventory_owner,
      r.product_name,
      r.dye_lot,
      r.width_ft,
      r.current_length_ft,
      r.roll_type,
      r.status,
      r.location_name,
      r.condition
    ]);
    
    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inventory_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-slate-800">Inventory</h1>
          <p className="text-slate-500 mt-1">{filteredRolls.length} rolls found</p>
        </div>
        <div className="flex items-center gap-2">
          <OwnerFilter value={ownerFilter} onChange={setOwnerFilter} />
          <Button variant="outline" onClick={exportCSV}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm space-y-4">
        <RollSearch 
          onSearch={setSearchTerm} 
          placeholder="Search roll tag, product, dye lot, location..."
          autoFocus
        />
        
        <div className="flex flex-wrap gap-3">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="Available">Available</SelectItem>
              <SelectItem value="Reserved">Reserved</SelectItem>
              <SelectItem value="Allocated">Allocated</SelectItem>
              <SelectItem value="Bundled">Bundled</SelectItem>
              <SelectItem value="Shipped">Shipped</SelectItem>
              <SelectItem value="Consumed">Consumed</SelectItem>
              <SelectItem value="Scrapped">Scrapped</SelectItem>
              <SelectItem value="ReturnedHold">Returned Hold</SelectItem>
            </SelectContent>
          </Select>

          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[130px]">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="Parent">Parent</SelectItem>
              <SelectItem value="Child">Child</SelectItem>
            </SelectContent>
          </Select>

          <Select value={productFilter} onValueChange={setProductFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Product" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Products</SelectItem>
              {uniqueProducts.map(p => (
                <SelectItem key={p} value={p}>{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
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
                  <TableHead className="font-semibold">Roll Tag</TableHead>
                  <TableHead className="font-semibold">Owner</TableHead>
                  <TableHead className="font-semibold">Product</TableHead>
                  <TableHead className="font-semibold">Dye Lot</TableHead>
                  <TableHead className="font-semibold">Width</TableHead>
                  <TableHead className="font-semibold">Length</TableHead>
                  <TableHead className="font-semibold">Type</TableHead>
                  <TableHead className="font-semibold">Status</TableHead>
                  <TableHead className="font-semibold">Location</TableHead>
                  <TableHead className="font-semibold">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRolls.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-12 text-slate-500">
                      No rolls found matching your filters
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRolls.map((roll) => (
                    <TableRow key={roll.id} className="hover:bg-slate-50 transition-colors">
                      <TableCell className="font-mono font-medium">{roll.roll_tag}</TableCell>
                      <TableCell><OwnerBadge owner={roll.inventory_owner} size="sm" /></TableCell>
                      <TableCell className="font-medium">{roll.product_name}</TableCell>
                      <TableCell className="text-slate-600">{roll.dye_lot}</TableCell>
                      <TableCell>{roll.width_ft}ft</TableCell>
                      <TableCell>
                        <span className="font-medium">{roll.current_length_ft}</span>
                        <span className="text-slate-400">/{roll.original_length_ft}ft</span>
                      </TableCell>
                      <TableCell><StatusBadge status={roll.roll_type} size="sm" /></TableCell>
                      <TableCell><StatusBadge status={roll.status} size="sm" /></TableCell>
                      <TableCell className="text-slate-600">{roll.location_name || '-'}</TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <ChevronDown className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link to={createPageUrl(`RollDetail?id=${roll.id}`)}>
                                <Eye className="h-4 w-4 mr-2" />
                                View Details
                              </Link>
                            </DropdownMenuItem>
                            {roll.status === 'Available' && roll.current_length_ft > 0 && (
                              <DropdownMenuItem asChild>
                                <Link to={createPageUrl(`CutRoll?roll_id=${roll.id}`)}>
                                  <Scissors className="h-4 w-4 mr-2" />
                                  Cut Roll
                                </Link>
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
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