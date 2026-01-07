import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Save, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function PendingInventory() {
  const queryClient = useQueryClient();
  const [editingRolls, setEditingRolls] = useState({});

  const { data: pendingRolls = [], isLoading } = useQuery({
    queryKey: ['pendingRolls'],
    queryFn: () => base44.entities.Roll.filter({ status: 'AwaitingLocation' }),
  });

  const completeRollMutation = useMutation({
    mutationFn: async ({ rollId, data }) => {
      return await base44.entities.Roll.update(rollId, {
        ...data,
        status: 'Available'
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pendingRolls'] });
      queryClient.invalidateQueries({ queryKey: ['rolls'] });
      toast.success('Roll completed and added to inventory');
    }
  });

  const handleFieldChange = (rollId, field, value) => {
    setEditingRolls(prev => ({
      ...prev,
      [rollId]: {
        ...prev[rollId],
        [field]: value
      }
    }));
  };

  const handleSaveRoll = (roll) => {
    const edits = editingRolls[roll.id] || {};
    const tt_sku_tag_number = edits.tt_sku_tag_number || '';
    const manufacturer_roll_number = edits.manufacturer_roll_number || '';
    const location = edits.location || '';

    if (!tt_sku_tag_number || !manufacturer_roll_number || !location) {
      toast.error('Please fill in TT SKU #, Manufacturer Roll #, and Location');
      return;
    }

    const [location_bin, location_row] = location.split('-');

    completeRollMutation.mutate({
      rollId: roll.id,
      data: {
        tt_sku_tag_number,
        manufacturer_roll_number,
        location_bin,
        location_row,
      }
    });
  };

  const isRollComplete = (rollId) => {
    const edits = editingRolls[rollId] || {};
    return edits.tt_sku_tag_number && edits.manufacturer_roll_number && edits.location;
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold text-slate-800">Pending Inventory</h1>
        <p className="text-slate-500 mt-1">
          Complete roll details to add them to available inventory
        </p>
      </div>

      {/* Alert Banner */}
      {pendingRolls.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-amber-800">
              {pendingRolls.length} roll{pendingRolls.length > 1 ? 's' : ''} pending completion
            </p>
            <p className="text-sm text-amber-700 mt-1">
              Fill in the missing information for each roll and click Save to add it to inventory
            </p>
          </div>
        </div>
      )}

      {/* Pending Rolls List */}
      <Card className="rounded-2xl border-slate-100 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Rolls Awaiting Information</CardTitle>
        </CardHeader>
        <CardContent>
          {pendingRolls.length === 0 ? (
            <div className="text-center py-12">
              <Package className="h-12 w-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 font-medium">No pending rolls</p>
              <p className="text-sm text-slate-400 mt-1">
                All rolls have been completed and added to inventory
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {pendingRolls.map((roll) => (
                <div
                  key={roll.id}
                  className="p-4 bg-slate-50 rounded-xl border border-slate-200"
                >
                  {/* Existing Roll Info */}
                  <div className="mb-4">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="font-medium text-slate-800 text-lg">{roll.product_name}</p>
                        <div className="flex items-center gap-3 text-sm text-slate-600 mt-1">
                          <span>Dye Lot: {roll.dye_lot}</span>
                          <span>•</span>
                          <span>{roll.width_ft}ft × {roll.current_length_ft}ft</span>
                          <span>•</span>
                          <span>Vendor: {roll.vendor_name}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Editable Fields */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-600">
                        TT SKU # *
                      </label>
                      <Input
                        value={editingRolls[roll.id]?.tt_sku_tag_number || ''}
                        onChange={(e) => handleFieldChange(roll.id, 'tt_sku_tag_number', e.target.value)}
                        placeholder="Enter SKU tag number"
                        className="h-9 font-mono text-sm"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-600">
                        Manufacturer Roll # *
                      </label>
                      <Input
                        value={editingRolls[roll.id]?.manufacturer_roll_number || ''}
                        onChange={(e) => handleFieldChange(roll.id, 'manufacturer_roll_number', e.target.value)}
                        placeholder="From roll tag"
                        className="h-9 text-sm"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-600">
                        Location (Bin-Row) *
                      </label>
                      <Select
                        value={editingRolls[roll.id]?.location || ''}
                        onValueChange={(v) => handleFieldChange(roll.id, 'location', v)}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Select location" />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 9 }, (_, i) => i + 1).flatMap(bin =>
                            ['A', 'B', 'C'].map(row => (
                              <SelectItem key={`${bin}-${row}`} value={`${bin}-${row}`}>
                                {bin}-{row}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-600">
                        Action
                      </label>
                      <Button
                        onClick={() => handleSaveRoll(roll)}
                        disabled={!isRollComplete(roll.id) || completeRollMutation.isPending}
                        className="w-full h-9 bg-emerald-600 hover:bg-emerald-700"
                      >
                        <Save className="h-3.5 w-3.5 mr-1.5" />
                        Save
                      </Button>
                    </div>
                  </div>

                  {roll.purchase_order && (
                    <p className="text-xs text-slate-500">
                      PO: {roll.purchase_order}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}