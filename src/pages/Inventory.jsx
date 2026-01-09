import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { 
  Package, 
  Filter, 
  Download,
  Eye,
  ChevronDown,
  Scissors,
  Trash2,
  Edit,
  CheckSquare,
  Square
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import RollSearch from '@/components/inventory/RollSearch';
import OwnerFilter from '@/components/inventory/OwnerFilter';
import StatusBadge from '@/components/ui/StatusBadge';
import OwnerBadge from '@/components/ui/OwnerBadge';

export default function Inventory() {
  const queryClient = useQueryClient();
  const [ownerFilter, setOwnerFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [productFilter, setProductFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRolls, setSelectedRolls] = useState([]);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingRoll, setEditingRoll] = useState(null);
  const [editForm, setEditForm] = useState({
    tt_sku_tag_number: '',
    manufacturer_roll_number: '',
    location_bin: '',
    location_row: '',
    dye_lot: '',
    status: '',
    notes: ''
  });

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
        roll.tt_sku_tag_number?.toLowerCase().includes(search) ||
        roll.roll_tag?.toLowerCase().includes(search) ||
        roll.product_name?.toLowerCase().includes(search) ||
        roll.dye_lot?.toLowerCase().includes(search) ||
        roll.location_name?.toLowerCase().includes(search)
      );
    }
    return true;
  });

  const uniqueProducts = [...new Set(rolls.map(r => r.product_name).filter(Boolean))];

  const updateRollMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Roll.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rolls'] });
      toast.success('Roll updated successfully');
    }
  });

  const deleteRollsMutation = useMutation({
    mutationFn: async (rollIds) => {
      for (const id of rollIds) {
        await base44.entities.Roll.delete(id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rolls'] });
      setSelectedRolls([]);
      toast.success('Rolls deleted successfully');
    }
  });

  const handleSelectAll = (checked) => {
    if (checked) {
      setSelectedRolls(filteredRolls.map(r => r.id));
    } else {
      setSelectedRolls([]);
    }
  };

  const handleSelectRoll = (rollId, checked) => {
    if (checked) {
      setSelectedRolls(prev => [...prev, rollId]);
    } else {
      setSelectedRolls(prev => prev.filter(id => id !== rollId));
    }
  };

  const handleEditRoll = (roll) => {
    setEditingRoll(roll);
    setEditForm({
      tt_sku_tag_number: roll.tt_sku_tag_number || '',
      manufacturer_roll_number: roll.manufacturer_roll_number || '',
      location_bin: roll.location_bin || '',
      location_row: roll.location_row || '',
      dye_lot: roll.dye_lot || '',
      status: roll.status || '',
      notes: roll.notes || ''
    });
    setShowEditDialog(true);
  };

  const handleSaveEdit = async () => {
    if (!editingRoll) return;
    
    const updates = {};
    if (editForm.tt_sku_tag_number) updates.tt_sku_tag_number = editForm.tt_sku_tag_number;
    if (editForm.manufacturer_roll_number) updates.manufacturer_roll_number = editForm.manufacturer_roll_number;
    if (editForm.location_bin && editForm.location_row) {
      updates.location_bin = editForm.location_bin;
      updates.location_row = editForm.location_row;
    }
    if (editForm.dye_lot) updates.dye_lot = editForm.dye_lot;
    if (editForm.status) updates.status = editForm.status;
    if (editForm.notes !== undefined) updates.notes = editForm.notes;

    await updateRollMutation.mutateAsync({ id: editingRoll.id, data: updates });
    setShowEditDialog(false);
    setEditingRoll(null);
  };

  const handleBulkDelete = async () => {
    if (selectedRolls.length === 0) return;
    if (!confirm(`Delete ${selectedRolls.length} selected rolls? This cannot be undone.`)) return;
    
    await deleteRollsMutation.mutateAsync(selectedRolls);
  };

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
          <h1 className="text-2xl lg:text-3xl font-bold text-slate-800 dark:text-white">Inventory</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">{filteredRolls.length} rolls found</p>
        </div>
        <div className="flex items-center gap-2">
          <OwnerFilter value={ownerFilter} onChange={setOwnerFilter} />
          {selectedRolls.length > 0 && (
            <Button 
              variant="destructive" 
              onClick={handleBulkDelete}
              disabled={deleteRollsMutation.isPending}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete ({selectedRolls.length})
            </Button>
          )}
          <Button variant="outline" onClick={exportCSV}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="bg-white dark:bg-[#2d2d2d] rounded-2xl p-4 border border-slate-100 dark:border-slate-700/50 shadow-sm space-y-4">
        <RollSearch 
          onSearch={setSearchTerm} 
          placeholder="Search TT SKU #, product, dye lot, location..."
          autoFocus
        />
        
        <div className="flex flex-wrap gap-3">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px] dark:bg-slate-800 dark:text-white dark:border-slate-700">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent className="dark:bg-[#2d2d2d] dark:border-slate-700">
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
            <SelectTrigger className="w-[130px] dark:bg-slate-800 dark:text-white dark:border-slate-700">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent className="dark:bg-[#2d2d2d] dark:border-slate-700">
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="Parent">Parent</SelectItem>
              <SelectItem value="Child">Child</SelectItem>
            </SelectContent>
          </Select>

          <Select value={productFilter} onValueChange={setProductFilter}>
            <SelectTrigger className="w-[160px] dark:bg-slate-800 dark:text-white dark:border-slate-700">
              <SelectValue placeholder="Product" />
            </SelectTrigger>
            <SelectContent className="dark:bg-[#2d2d2d] dark:border-slate-700">
              <SelectItem value="all">All Products</SelectItem>
              {uniqueProducts.map(p => (
                <SelectItem key={p} value={p}>{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-[#2d2d2d] rounded-2xl border border-slate-100 dark:border-slate-700/50 shadow-sm overflow-hidden">
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
                <TableRow className="bg-slate-50 dark:bg-slate-800/50 border-b dark:border-slate-700/50">
                  <TableHead className="w-12 dark:text-slate-300">
                    <Checkbox 
                      checked={selectedRolls.length === filteredRolls.length && filteredRolls.length > 0}
                      onCheckedChange={handleSelectAll}
                    />
                  </TableHead>
                  <TableHead className="font-semibold dark:text-slate-300">TT SKU #</TableHead>
                  <TableHead className="font-semibold dark:text-slate-300">Owner</TableHead>
                  <TableHead className="font-semibold dark:text-slate-300">Product</TableHead>
                  <TableHead className="font-semibold dark:text-slate-300">Dye Lot</TableHead>
                  <TableHead className="font-semibold dark:text-slate-300">Width</TableHead>
                  <TableHead className="font-semibold dark:text-slate-300">Length</TableHead>
                  <TableHead className="font-semibold dark:text-slate-300">Type</TableHead>
                  <TableHead className="font-semibold dark:text-slate-300">Status</TableHead>
                  <TableHead className="font-semibold dark:text-slate-300">Location</TableHead>
                  <TableHead className="font-semibold dark:text-slate-300">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRolls.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center py-12 text-slate-500 dark:text-slate-400">
                      No rolls found matching your filters
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRolls.map((roll) => (
                    <TableRow key={roll.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors border-b dark:border-slate-700/30">
                      <TableCell>
                        <Checkbox 
                          checked={selectedRolls.includes(roll.id)}
                          onCheckedChange={(checked) => handleSelectRoll(roll.id, checked)}
                        />
                      </TableCell>
                      <TableCell className="font-mono font-medium dark:text-white">{roll.tt_sku_tag_number || roll.roll_tag}</TableCell>
                      <TableCell><OwnerBadge owner={roll.inventory_owner} size="sm" /></TableCell>
                      <TableCell className="font-medium dark:text-white">
                        <Link 
                          to={createPageUrl(`RollDetail?id=${roll.id}`)} 
                          className="hover:text-emerald-600 dark:hover:text-emerald-400 hover:underline transition-colors"
                        >
                          {roll.product_name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-slate-600 dark:text-slate-300">{roll.dye_lot}</TableCell>
                      <TableCell className="dark:text-white">{roll.width_ft}ft</TableCell>
                      <TableCell className="dark:text-white">
                        <span className="font-medium">{roll.current_length_ft}</span>
                        <span className="text-slate-400 dark:text-slate-500">/{roll.original_length_ft}ft</span>
                      </TableCell>
                      <TableCell><StatusBadge status={roll.roll_type} size="sm" /></TableCell>
                      <TableCell><StatusBadge status={roll.status} size="sm" /></TableCell>
                      <TableCell className="text-slate-600 dark:text-slate-300">
                        {roll.location_bin && roll.location_row ? `${roll.location_bin}-${roll.location_row}` : '-'}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <ChevronDown className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="dark:bg-[#2d2d2d] dark:border-slate-700">
                            <DropdownMenuItem asChild className="dark:hover:bg-slate-700">
                              <Link to={createPageUrl(`RollDetail?id=${roll.id}`)} className="flex items-center dark:text-white">
                                <Eye className="h-4 w-4 mr-2" />
                                View Details
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleEditRoll(roll)} className="dark:hover:bg-slate-700 dark:text-white">
                              <Edit className="h-4 w-4 mr-2" />
                              Edit Roll
                            </DropdownMenuItem>
                            {roll.status === 'Available' && roll.current_length_ft > 0 && (
                              <DropdownMenuItem asChild className="dark:hover:bg-slate-700">
                                <Link to={createPageUrl(`CutRoll?roll_id=${roll.id}`)} className="flex items-center dark:text-white">
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

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="sm:max-w-md dark:bg-[#2d2d2d] dark:border-slate-700/50">
          <DialogHeader>
            <DialogTitle className="dark:text-white">Edit Roll: {editingRoll?.tt_sku_tag_number || editingRoll?.roll_tag}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="dark:text-slate-300">TT SKU Tag Number</Label>
              <Input 
                value={editForm.tt_sku_tag_number}
                onChange={e => setEditForm(p => ({ ...p, tt_sku_tag_number: e.target.value }))}
                placeholder="TT SKU tag number"
                className="font-mono dark:bg-slate-800 dark:text-white dark:border-slate-700"
              />
            </div>
            <div className="space-y-2">
              <Label className="dark:text-slate-300">Manufacturer Roll Number</Label>
              <Input 
                value={editForm.manufacturer_roll_number}
                onChange={e => setEditForm(p => ({ ...p, manufacturer_roll_number: e.target.value }))}
                placeholder="From manufacturer's roll tag"
                className="dark:bg-slate-800 dark:text-white dark:border-slate-700"
              />
            </div>
            <div className="space-y-2">
              <Label className="dark:text-slate-300">Dye Lot</Label>
              <Input 
                value={editForm.dye_lot}
                onChange={e => setEditForm(p => ({ ...p, dye_lot: e.target.value }))}
                placeholder="Dye lot number"
                className="dark:bg-slate-800 dark:text-white dark:border-slate-700"
              />
            </div>
            <div className="space-y-2">
              <Label className="dark:text-slate-300">Status</Label>
              <Select
                value={editForm.status}
                onValueChange={v => setEditForm(p => ({ ...p, status: v }))}
              >
                <SelectTrigger className="dark:bg-slate-800 dark:text-white dark:border-slate-700"><SelectValue placeholder="Select status" /></SelectTrigger>
                <SelectContent className="dark:bg-[#2d2d2d] dark:border-slate-700">
                  <SelectItem value="Available">Available</SelectItem>
                  <SelectItem value="Reserved">Reserved</SelectItem>
                  <SelectItem value="AwaitingLocation">Awaiting Location</SelectItem>
                  <SelectItem value="Consumed">Consumed</SelectItem>
                  <SelectItem value="SentOut">Sent Out</SelectItem>
                  <SelectItem value="Scrapped">Scrapped</SelectItem>
                  <SelectItem value="Damaged">Damaged</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="dark:text-slate-300">Location Bin</Label>
                <Select
                  value={editForm.location_bin}
                  onValueChange={v => setEditForm(p => ({ ...p, location_bin: v }))}
                >
                  <SelectTrigger className="dark:bg-slate-800 dark:text-white dark:border-slate-700"><SelectValue placeholder="1-9" /></SelectTrigger>
                  <SelectContent className="dark:bg-[#2d2d2d] dark:border-slate-700">
                    {Array.from({ length: 9 }, (_, i) => i + 1).map(bin => (
                      <SelectItem key={bin} value={bin.toString()}>{bin}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="dark:text-slate-300">Location Row</Label>
                <Select
                  value={editForm.location_row}
                  onValueChange={v => setEditForm(p => ({ ...p, location_row: v }))}
                >
                  <SelectTrigger className="dark:bg-slate-800 dark:text-white dark:border-slate-700"><SelectValue placeholder="A-C" /></SelectTrigger>
                  <SelectContent className="dark:bg-[#2d2d2d] dark:border-slate-700">
                    {['A', 'B', 'C'].map(row => (
                      <SelectItem key={row} value={row}>{row}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="dark:text-slate-300">Notes</Label>
              <Input 
                value={editForm.notes}
                onChange={e => setEditForm(p => ({ ...p, notes: e.target.value }))}
                placeholder="Optional notes"
                className="dark:bg-slate-800 dark:text-white dark:border-slate-700"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)} className="dark:border-slate-700 dark:text-slate-300">
              Cancel
            </Button>
            <Button 
              onClick={handleSaveEdit}
              disabled={updateRollMutation.isPending}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}