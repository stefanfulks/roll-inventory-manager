import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import {
  Eye,
  ChevronDown,
  Scissors,
  Trash2,
  Edit,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  RefreshCw,
  AlertTriangle
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
import StatusBadge from '@/components/ui/StatusBadge';
import {
  ROLL_STATUS,
  ROLL_STATUS_OPTIONS,
  ROLL_ACTIVE_JOB_STATUSES,
  MANUAL_ROLL_STATUS_OPTIONS,
  STATUS_LABELS,
  findActiveAllocationForRoll,
  setRollStatusManually,
} from '@/lib/rollStatus';
import { formatFeetInches } from '@/lib/dateHelpers';
import { describeError } from '@/lib/query-client';

export default function Inventory() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  // Initialize filters from URL so dashboard can deep-link in pre-filtered.
  const urlParams = new URLSearchParams(window.location.search);
  const [statusFilter, setStatusFilter] = useState(urlParams.get('status') || 'all');
  const [typeFilter, setTypeFilter] = useState(urlParams.get('type') || 'all');
  const [productFilter, setProductFilter] = useState(urlParams.get('product') || 'all');
  const [searchTerm, setSearchTerm] = useState(urlParams.get('q') || '');
  const [selectedRolls, setSelectedRolls] = useState([]);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingRoll, setEditingRoll] = useState(null);
  const [sortColumn, setSortColumn] = useState('created_date');
  const [sortDirection, setSortDirection] = useState('desc');
  const [isSaving, setIsSaving] = useState(false);
  const [editForm, setEditForm] = useState({
    tt_sku_tag_number: '',
    manufacturer_roll_number: '',
    location_id: '',
    dye_lot: '',
    status: '',
    notes: ''
  });

  const { data: rolls = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['rolls', sortColumn, sortDirection],
    queryFn: () => {
      const sortParam = sortDirection === 'desc' ? `-${sortColumn}` : sortColumn;
      return base44.entities.Roll.list(sortParam, 1000);
    },
    placeholderData: keepPreviousData,
  });

  useQuery({
    queryKey: ['products'],
    queryFn: () => base44.entities.Product.list(),
  });

  // Needed so a manual status change can't desync a live allocation.
  const { data: allAllocations = [] } = useQuery({
    queryKey: ['allocations'],
    queryFn: () => base44.entities.Allocation.list('-created_date', 5000),
  });

  const { data: locations = [] } = useQuery({
    queryKey: ['locations', 'turf'],
    queryFn: async () => {
      const locs = await base44.entities.Location.list();
      return locs
        .filter(l => l.designated_for === 'all' || l.designated_for === 'turf_only')
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    },
  });

  const filteredRolls = rolls.filter(roll => {
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

  // Selection survives filter changes, so only ever act on rolls the user can see.
  const selectedVisibleRolls = filteredRolls.filter(r => selectedRolls.includes(r.id));
  const allVisibleSelected = filteredRolls.length > 0 && filteredRolls.every(r => selectedRolls.includes(r.id));

  const editingAllocation = editingRoll ? findActiveAllocationForRoll(editingRoll.id, allAllocations) : null;
  const editStatusOptions = editingAllocation
    ? ROLL_STATUS_OPTIONS.filter(s => ROLL_ACTIVE_JOB_STATUSES.includes(s) || s === editingRoll?.status)
    : MANUAL_ROLL_STATUS_OPTIONS;

  const updateRollMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Roll.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rolls'] });
      toast.success('Roll updated successfully');
    },
    onError: (err) => {
      toast.error(`Couldn't save this roll: ${describeError(err)}`);
    }
  });

  const deleteRollsMutation = useMutation({
    mutationFn: async (rollIds) => {
      const results = await Promise.allSettled(
        rollIds.map(id => base44.entities.Roll.delete(id))
      );
      const failures = results.filter(r => r.status === 'rejected');
      return { total: rollIds.length, failures };
    },
    onSuccess: ({ total, failures }) => {
      queryClient.invalidateQueries({ queryKey: ['rolls'] });
      setSelectedRolls([]);
      if (failures.length === 0) {
        toast.success(`${total} roll${total === 1 ? '' : 's'} deleted`);
      } else {
        toast.error(
          `Deleted ${total - failures.length} of ${total} — ${failures.length} failed: ${describeError(failures[0].reason)}`
        );
      }
    },
    onError: (err) => {
      queryClient.invalidateQueries({ queryKey: ['rolls'] });
      toast.error(`Delete failed: ${describeError(err)}`);
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
      location_id: roll.location_id || '',
      dye_lot: roll.dye_lot || '',
      status: roll.status || '',
      notes: roll.notes || ''
    });
    setShowEditDialog(true);
  };

  const handleSaveEdit = async () => {
    if (!editingRoll) return;
    const roll = editingRoll;

    // Built unconditionally so blanking a field actually clears it.
    const candidate = {
      tt_sku_tag_number: editForm.tt_sku_tag_number.trim(),
      manufacturer_roll_number: editForm.manufacturer_roll_number.trim(),
      dye_lot: editForm.dye_lot.trim(),
      notes: editForm.notes,
    };
    if (editForm.location_id) {
      const location = locations.find(l => l.id === editForm.location_id);
      candidate.location_id = editForm.location_id;
      candidate.location_name = location?.name || '';
    }

    const updates = {};
    Object.entries(candidate).forEach(([key, value]) => {
      if (value !== (roll[key] ?? '')) updates[key] = value;
    });

    const statusChanged = !!editForm.status && editForm.status !== roll.status;

    setIsSaving(true);
    try {
      // Status must go through the allocation guardrails, never straight to Roll.update.
      if (statusChanged) {
        const result = await setRollStatusManually(roll, editForm.status, allAllocations);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
      }

      if (Object.keys(updates).length > 0) {
        await updateRollMutation.mutateAsync({ id: roll.id, data: updates });
      } else if (statusChanged) {
        queryClient.invalidateQueries({ queryKey: ['rolls'] });
        queryClient.invalidateQueries({ queryKey: ['allocations'] });
        toast.success('Roll updated successfully');
      }

      setShowEditDialog(false);
      setEditingRoll(null);
    } catch {
      // Already reported by onError. A status change may have landed before the
      // field write failed, so refresh and leave the dialog open for a retry.
      queryClient.invalidateQueries({ queryKey: ['rolls'] });
      queryClient.invalidateQueries({ queryKey: ['allocations'] });
    } finally {
      setIsSaving(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedVisibleRolls.length === 0) return;

    const tags = selectedVisibleRolls.slice(0, 5).map(r => r.tt_sku_tag_number || r.roll_tag || r.id);
    const more = selectedVisibleRolls.length > tags.length
      ? `\n...and ${selectedVisibleRolls.length - tags.length} more`
      : '';
    const message =
      `Delete ${selectedVisibleRolls.length} roll${selectedVisibleRolls.length === 1 ? '' : 's'}?\n\n` +
      `${tags.join('\n')}${more}\n\nThis cannot be undone.`;
    if (!confirm(message)) return;

    try {
      await deleteRollsMutation.mutateAsync(selectedVisibleRolls.map(r => r.id));
    } catch {
      // Already reported by onError.
    }
  };

  const handleSort = (column) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const renderSortIcon = (column) => {
    if (sortColumn !== column) return <ArrowUpDown className="h-3 w-3 opacity-30" />;
    return sortDirection === 'asc'
      ? <ArrowUp className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
      : <ArrowDown className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-slate-800 dark:text-white">Inventory</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">{filteredRolls.length} rolls found</p>
        </div>
        {selectedVisibleRolls.length > 0 && (
          <Button
            variant="destructive"
            onClick={handleBulkDelete}
            disabled={deleteRollsMutation.isPending}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete ({selectedVisibleRolls.length})
          </Button>
        )}
      </div>

      {/* Search & Filters */}
      <div className="bg-white dark:bg-[#2d2d2d] rounded-2xl p-4 border border-slate-100 dark:border-slate-700/50 shadow-sm space-y-4">
        <RollSearch
          onSearch={setSearchTerm}
          initialValue={searchTerm}
          placeholder="Search TT SKU #, product, dye lot, location..."
          autoFocus
        />
        
        <div className="flex flex-wrap gap-3">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px] dark:bg-slate-800 dark:text-white dark:border-slate-700">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent className="dark:bg-[#2d2d2d] dark:border-slate-700">
              <SelectItem value="all">All Status</SelectItem>
              {ROLL_STATUS_OPTIONS.map(s => (
                <SelectItem key={s} value={s}>{STATUS_LABELS[s] || s}</SelectItem>
              ))}
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
        ) : isError ? (
          <div className="p-12 text-center space-y-3">
            <AlertTriangle className="h-8 w-8 mx-auto text-amber-500" />
            <p className="font-semibold text-slate-800 dark:text-white">Couldn&apos;t load inventory</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              The roll list failed to load, so nothing is shown here — this is not a filter problem.
            </p>
            <Button
              variant="outline"
              onClick={() => refetch()}
              className="dark:border-slate-700 dark:text-slate-300"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50 dark:bg-slate-800/50 border-b dark:border-slate-700/50">
                  <TableHead className="w-12 dark:text-slate-300">
                    <Checkbox
                      checked={allVisibleSelected}
                      onCheckedChange={handleSelectAll}
                    />
                  </TableHead>
                  <TableHead className="font-semibold dark:text-slate-300 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700" onClick={() => handleSort('tt_sku_tag_number')}>
                    <div className="flex items-center gap-1">
                      TT SKU # {renderSortIcon('tt_sku_tag_number')}
                    </div>
                  </TableHead>
                  <TableHead className="font-semibold dark:text-slate-300 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700" onClick={() => handleSort('manufacturer_roll_number')}>
                    <div className="flex items-center gap-1">
                      Mfr Roll # {renderSortIcon('manufacturer_roll_number')}
                    </div>
                  </TableHead>
                  <TableHead className="font-semibold dark:text-slate-300 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700" onClick={() => handleSort('product_name')}>
                    <div className="flex items-center gap-1">
                      Product {renderSortIcon('product_name')}
                    </div>
                  </TableHead>
                  <TableHead className="font-semibold dark:text-slate-300 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700" onClick={() => handleSort('dye_lot')}>
                    <div className="flex items-center gap-1">
                      Dye Lot {renderSortIcon('dye_lot')}
                    </div>
                  </TableHead>
                  <TableHead className="font-semibold dark:text-slate-300 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700" onClick={() => handleSort('width_ft')}>
                    <div className="flex items-center gap-1">
                      Width {renderSortIcon('width_ft')}
                    </div>
                  </TableHead>
                  <TableHead className="font-semibold dark:text-slate-300 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700" onClick={() => handleSort('current_length_ft')}>
                    <div className="flex items-center gap-1">
                      Length {renderSortIcon('current_length_ft')}
                    </div>
                  </TableHead>
                  <TableHead className="font-semibold dark:text-slate-300 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700" onClick={() => handleSort('roll_type')}>
                    <div className="flex items-center gap-1">
                      Type {renderSortIcon('roll_type')}
                    </div>
                  </TableHead>
                  <TableHead className="font-semibold dark:text-slate-300 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700" onClick={() => handleSort('status')}>
                    <div className="flex items-center gap-1">
                      Status {renderSortIcon('status')}
                    </div>
                  </TableHead>
                  <TableHead className="font-semibold dark:text-slate-300 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700" onClick={() => handleSort('location_name')}>
                    <div className="flex items-center gap-1">
                      Location {renderSortIcon('location_name')}
                    </div>
                  </TableHead>
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
                    <TableRow 
                      key={roll.id} 
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors border-b dark:border-slate-700/30 cursor-pointer"
                      onClick={() => navigate(createPageUrl(`RollDetail?id=${roll.id}`))}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedRolls.includes(roll.id)}
                          onCheckedChange={(checked) => handleSelectRoll(roll.id, checked)}
                        />
                      </TableCell>
                      <TableCell className="font-mono font-medium dark:text-white">{roll.tt_sku_tag_number || roll.roll_tag}</TableCell>
                      <TableCell className="font-mono text-slate-600 dark:text-slate-300">{roll.manufacturer_roll_number || '-'}</TableCell>
                      <TableCell className="font-medium dark:text-white">
                        <Link 
                          to={createPageUrl(`RollDetail?id=${roll.id}`)} 
                          className="hover:text-emerald-600 dark:hover:text-emerald-400 hover:underline transition-colors"
                        >
                          {roll.product_name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-slate-600 dark:text-slate-300">{roll.dye_lot || '-'}</TableCell>
                      <TableCell className="dark:text-white">{formatFeetInches(roll.width_ft) || '-'}</TableCell>
                      <TableCell className="dark:text-white">
                        <span className="font-medium">{formatFeetInches(roll.current_length_ft) || '-'}</span>
                        <span className="text-slate-400 dark:text-slate-500"> / {formatFeetInches(roll.original_length_ft) || '-'}</span>
                      </TableCell>
                      <TableCell><StatusBadge status={roll.roll_type || 'Parent'} size="sm" /></TableCell>
                      <TableCell><StatusBadge status={roll.status} size="sm" /></TableCell>
                      <TableCell className="text-slate-600 dark:text-slate-300">
                        {roll.location_name || '-'}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
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
                            {roll.status === ROLL_STATUS.AVAILABLE && roll.current_length_ft > 0 && (
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
              {editingAllocation && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Allocated to a job — changing to a job-state status updates the allocation. To free the roll, cancel the allocation from the job page.
                </p>
              )}
              <Select
                value={editForm.status}
                onValueChange={v => setEditForm(p => ({ ...p, status: v }))}
              >
                <SelectTrigger className="dark:bg-slate-800 dark:text-white dark:border-slate-700"><SelectValue placeholder="Select status" /></SelectTrigger>
                <SelectContent className="dark:bg-[#2d2d2d] dark:border-slate-700">
                  {editStatusOptions.map(s => (
                    <SelectItem key={s} value={s}>{STATUS_LABELS[s] || s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="dark:text-slate-300">Location</Label>
              <Select
                value={editForm.location_id}
                onValueChange={v => setEditForm(p => ({ ...p, location_id: v }))}
              >
                <SelectTrigger className="dark:bg-slate-800 dark:text-white dark:border-slate-700"><SelectValue placeholder="Select location" /></SelectTrigger>
                <SelectContent className="dark:bg-[#2d2d2d] dark:border-slate-700">
                  {locations.map(l => (
                    <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {(editingRoll?.location_bin || editingRoll?.location_row) && (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Bin/row from receiving: {editingRoll.location_bin || '-'}{editingRoll.location_row || ''}
                </p>
              )}
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
              disabled={isSaving}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {isSaving ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}