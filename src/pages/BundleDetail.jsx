import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { 
  ArrowLeft, 
  Plus, 
  Trash2,
  Truck,
  Check,
  Package
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import StatusBadge from '@/components/ui/StatusBadge';
import OwnerBadge from '@/components/ui/OwnerBadge';
import RollSearch from '@/components/inventory/RollSearch';
import { format } from 'date-fns';

export default function BundleDetail() {
  const queryClient = useQueryClient();
  const params = new URLSearchParams(window.location.search);
  const bundleId = params.get('id');

  const [showAddRoll, setShowAddRoll] = useState(false);
  const [selectedRoll, setSelectedRoll] = useState(null);

  const { data: bundle, isLoading } = useQuery({
    queryKey: ['bundle', bundleId],
    queryFn: () => base44.entities.Bundle.filter({ id: bundleId }),
    enabled: !!bundleId,
    select: (data) => data[0],
  });

  const { data: bundleItems = [] } = useQuery({
    queryKey: ['bundle-items', bundleId],
    queryFn: () => base44.entities.BundleItem.filter({ bundle_id: bundleId }),
    enabled: !!bundleId,
  });

  const { data: availableRolls = [] } = useQuery({
    queryKey: ['available-rolls', bundle?.inventory_owner],
    queryFn: () => base44.entities.Roll.filter(
      { status: 'Available', inventory_owner: bundle?.inventory_owner },
      '-created_date',
      500
    ),
    enabled: !!bundle?.inventory_owner,
  });

  const addRollMutation = useMutation({
    mutationFn: async (roll) => {
      // Create bundle item
      await base44.entities.BundleItem.create({
        bundle_id: bundleId,
        roll_id: roll.id,
        roll_tag: roll.roll_tag,
        product_name: roll.product_name,
        dye_lot: roll.dye_lot,
        width_ft: roll.width_ft,
        length_ft_included: roll.current_length_ft
      });

      // Update roll status
      await base44.entities.Roll.update(roll.id, { status: 'Bundled' });

      // Create transaction
      await base44.entities.Transaction.create({
        transaction_type: 'BundleAdd',
        inventory_owner: roll.inventory_owner,
        roll_id: roll.id,
        roll_tag: roll.roll_tag,
        bundle_id: bundleId,
        length_change_ft: 0,
        length_before_ft: roll.current_length_ft,
        length_after_ft: roll.current_length_ft,
        product_name: roll.product_name,
        dye_lot: roll.dye_lot,
        width_ft: roll.width_ft,
        notes: `Added to bundle ${bundle.bundle_tag}`
      });

      // Update bundle totals
      const newTotalSqft = (bundle.total_sqft || 0) + (roll.current_length_ft * roll.width_ft);
      const newTotalLinearFt = (bundle.total_linear_ft || 0) + roll.current_length_ft;
      await base44.entities.Bundle.update(bundleId, {
        total_sqft: newTotalSqft,
        total_linear_ft: newTotalLinearFt
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bundle', bundleId] });
      queryClient.invalidateQueries({ queryKey: ['bundle-items', bundleId] });
      queryClient.invalidateQueries({ queryKey: ['available-rolls'] });
      queryClient.invalidateQueries({ queryKey: ['rolls'] });
      setShowAddRoll(false);
      setSelectedRoll(null);
      toast.success('Roll added to bundle');
    }
  });

  const removeRollMutation = useMutation({
    mutationFn: async (item) => {
      // Delete bundle item
      await base44.entities.BundleItem.delete(item.id);

      // Update roll status back to Available
      await base44.entities.Roll.update(item.roll_id, { status: 'Available' });

      // Create transaction
      await base44.entities.Transaction.create({
        transaction_type: 'BundleRemove',
        inventory_owner: bundle.inventory_owner,
        roll_id: item.roll_id,
        roll_tag: item.roll_tag,
        bundle_id: bundleId,
        length_change_ft: 0,
        length_before_ft: item.length_ft_included,
        length_after_ft: item.length_ft_included,
        notes: `Removed from bundle ${bundle.bundle_tag}`
      });

      // Update bundle totals
      const sqftReduction = item.length_ft_included * item.width_ft;
      const newTotalSqft = Math.max(0, (bundle.total_sqft || 0) - sqftReduction);
      const newTotalLinearFt = Math.max(0, (bundle.total_linear_ft || 0) - item.length_ft_included);
      await base44.entities.Bundle.update(bundleId, {
        total_sqft: newTotalSqft,
        total_linear_ft: newTotalLinearFt
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bundle', bundleId] });
      queryClient.invalidateQueries({ queryKey: ['bundle-items', bundleId] });
      queryClient.invalidateQueries({ queryKey: ['available-rolls'] });
      queryClient.invalidateQueries({ queryKey: ['rolls'] });
      toast.success('Roll removed from bundle');
    }
  });

  const updateStatusMutation = useMutation({
    mutationFn: async (newStatus) => {
      const updateData = { status: newStatus };
      
      if (newStatus === 'Shipped') {
        updateData.shipped_at = new Date().toISOString();

        // Update all rolls in bundle to Shipped
        for (const item of bundleItems) {
          await base44.entities.Roll.update(item.roll_id, { status: 'Shipped' });
          await base44.entities.Transaction.create({
            transaction_type: 'Ship',
            inventory_owner: bundle.inventory_owner,
            roll_id: item.roll_id,
            roll_tag: item.roll_tag,
            bundle_id: bundleId,
            length_change_ft: -item.length_ft_included,
            length_before_ft: item.length_ft_included,
            length_after_ft: 0,
            notes: `Shipped in bundle ${bundle.bundle_tag}`
          });
        }
      }

      await base44.entities.Bundle.update(bundleId, updateData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bundle', bundleId] });
      queryClient.invalidateQueries({ queryKey: ['rolls'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      toast.success('Bundle status updated');
    }
  });

  const handleSearchRoll = (searchTerm) => {
    const found = availableRolls.find(r => 
      r.roll_tag?.toLowerCase() === searchTerm.toLowerCase() ||
      r.roll_tag?.toLowerCase().includes(searchTerm.toLowerCase())
    );
    if (found) {
      setSelectedRoll(found);
    } else {
      toast.error('Roll not found or not available');
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  if (!bundle) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-500">Bundle not found</p>
        <Link to={createPageUrl('Bundles')}>
          <Button variant="link" className="mt-2">Back to Bundles</Button>
        </Link>
      </div>
    );
  }

  const canEdit = ['Draft', 'Picking'].includes(bundle.status);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link to={createPageUrl('Bundles')}>
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl lg:text-3xl font-bold text-slate-800 font-mono">{bundle.bundle_tag}</h1>
              <StatusBadge status={bundle.status} />
            </div>
            <p className="text-slate-500 mt-1">
              {bundle.customer_name || 'No customer'} • {bundle.destination_address || 'No address'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && (
            <Dialog open={showAddRoll} onOpenChange={setShowAddRoll}>
              <DialogTrigger asChild>
                <Button className="bg-emerald-600 hover:bg-emerald-700">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Roll
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Add Roll to Bundle</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <RollSearch 
                    onSearch={handleSearchRoll}
                    placeholder="Scan roll tag..."
                    autoFocus
                  />
                  
                  {selectedRoll && (
                    <div className="p-4 bg-slate-50 rounded-lg border">
                      <p className="font-mono font-bold">{selectedRoll.roll_tag}</p>
                      <p className="text-sm text-slate-600">
                        {selectedRoll.product_name} • {selectedRoll.dye_lot}
                      </p>
                      <p className="text-sm text-slate-500">
                        {selectedRoll.width_ft}ft × {selectedRoll.current_length_ft}ft = 
                        {(selectedRoll.width_ft * selectedRoll.current_length_ft).toLocaleString()} sq ft
                      </p>
                      <Button 
                        onClick={() => addRollMutation.mutate(selectedRoll)}
                        disabled={addRollMutation.isPending}
                        className="w-full mt-3 bg-emerald-600 hover:bg-emerald-700"
                      >
                        Add to Bundle
                      </Button>
                    </div>
                  )}
                </div>
              </DialogContent>
            </Dialog>
          )}

          {bundle.status === 'Draft' && bundleItems.length > 0 && (
            <Button 
              onClick={() => updateStatusMutation.mutate('Picking')}
              variant="outline"
            >
              Start Picking
            </Button>
          )}

          {bundle.status === 'Picking' && (
            <Button 
              onClick={() => updateStatusMutation.mutate('Ready')}
              variant="outline"
            >
              <Check className="h-4 w-4 mr-2" />
              Mark Ready
            </Button>
          )}

          {bundle.status === 'Ready' && (
            <Button 
              onClick={() => updateStatusMutation.mutate('Shipped')}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Truck className="h-4 w-4 mr-2" />
              Ship Bundle
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Bundle Info */}
        <Card className="rounded-2xl border-slate-100 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Bundle Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Owner</span>
              <OwnerBadge owner={bundle.inventory_owner} size="sm" />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Total Sq Ft</span>
              <span className="font-semibold">{bundle.total_sqft?.toLocaleString() || 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Total Linear Ft</span>
              <span className="font-semibold">{bundle.total_linear_ft?.toLocaleString() || 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Rolls</span>
              <span className="font-semibold">{bundleItems.length}</span>
            </div>
            {bundle.job_name && (
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Job</span>
                <span className="font-medium">{bundle.job_name}</span>
              </div>
            )}
            {bundle.shipped_at && (
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Shipped</span>
                <span className="font-medium">
                  {format(new Date(bundle.shipped_at), 'MMM d, yyyy h:mm a')}
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Dye Lot Summary */}
        <Card className="rounded-2xl border-slate-100 shadow-sm lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">Dye Lot Summary</CardTitle>
          </CardHeader>
          <CardContent>
            {bundleItems.length === 0 ? (
              <p className="text-slate-400 text-center py-4">No rolls in bundle</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {Object.entries(
                  bundleItems.reduce((acc, item) => {
                    const key = `${item.product_name} - ${item.dye_lot}`;
                    if (!acc[key]) acc[key] = 0;
                    acc[key] += item.length_ft_included * item.width_ft;
                    return acc;
                  }, {})
                ).map(([key, sqft]) => (
                  <div key={key} className="px-3 py-2 bg-slate-100 rounded-lg">
                    <p className="font-medium text-sm">{key}</p>
                    <p className="text-xs text-slate-500">{sqft.toLocaleString()} sq ft</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Rolls Table */}
      <Card className="rounded-2xl border-slate-100 shadow-sm overflow-hidden">
        <CardHeader>
          <CardTitle className="text-lg">Rolls in Bundle</CardTitle>
        </CardHeader>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead>Roll Tag</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Dye Lot</TableHead>
                <TableHead>Width</TableHead>
                <TableHead>Length</TableHead>
                <TableHead>Sq Ft</TableHead>
                {canEdit && <TableHead>Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {bundleItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={canEdit ? 7 : 6} className="text-center py-8 text-slate-500">
                    No rolls added yet
                  </TableCell>
                </TableRow>
              ) : (
                bundleItems.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-mono font-medium">{item.roll_tag}</TableCell>
                    <TableCell>{item.product_name}</TableCell>
                    <TableCell>{item.dye_lot}</TableCell>
                    <TableCell>{item.width_ft}ft</TableCell>
                    <TableCell>{item.length_ft_included}ft</TableCell>
                    <TableCell>{(item.width_ft * item.length_ft_included).toLocaleString()}</TableCell>
                    {canEdit && (
                      <TableCell>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => removeRollMutation.mutate(item)}
                          disabled={removeRollMutation.isPending}
                          className="text-red-500 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}