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
import { formatFeetInches } from '@/lib/dateHelpers';
import { describeError } from '@/lib/query-client';
import { ROLL_STATUS, TRANSACTION_TYPE } from '@/lib/rollStatus';

// Locations named like "3-B" also fill the legacy bin/row fields so both
// spellings of a roll's location agree; any other name clears them.
const binRowFromName = (name) => {
  const m = /^\s*([A-Za-z0-9]+)\s*-\s*([A-Za-z0-9]+)\s*$/.exec(name || '');
  return m
    ? { location_bin: m[1], location_row: m[2] }
    : { location_bin: null, location_row: null };
};

export default function PendingInventory() {
  const queryClient = useQueryClient();
  const [editingRolls, setEditingRolls] = useState({});

  const { data: pendingRolls = [], isLoading } = useQuery({
    queryKey: ['pendingRolls'],
    queryFn: () => base44.entities.Roll.filter({ status: ROLL_STATUS.AWAITING_LOCATION }),
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

  const completeRollMutation = useMutation({
    mutationFn: async ({ roll, data, previousTag }) => {
      const user = await base44.auth.me();

      await base44.entities.Roll.update(roll.id, {
        ...data,
        status: ROLL_STATUS.AVAILABLE
      });

      if (previousTag !== data.tt_sku_tag_number) {
        // Rapid receive filed the ReceiveRoll transaction under a throwaway tag,
        // so without this row the receipt is unreachable by the real tag.
        await base44.entities.Transaction.create({
          transaction_type: TRANSACTION_TYPE.ADJUSTMENT,
          fulfillment_for: roll.inventory_owner,
          roll_id: roll.id,
          tt_sku_tag_number: data.tt_sku_tag_number,
          manufacturer_roll_number: data.manufacturer_roll_number,
          product_name: roll.product_name,
          dye_lot: roll.dye_lot,
          width_ft: roll.width_ft,
          length_change_ft: 0,
          length_before_ft: roll.current_length_ft,
          length_after_ft: roll.current_length_ft,
          location_to: data.location_name,
          performed_by: user.full_name || user.email,
          notes: `Tag reassigned: ${previousTag || '(none)'} → ${data.tt_sku_tag_number}. Shelved at ${data.location_name}.`,
        });
      }

      return roll.id;
    },
    onSuccess: (rollId) => {
      queryClient.invalidateQueries({ queryKey: ['pendingRolls'] });
      queryClient.invalidateQueries({ queryKey: ['rolls'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      setEditingRolls(prev => {
        const next = { ...prev };
        delete next[rollId];
        return next;
      });
      toast.success('Roll completed and added to inventory');
    },
    onError: (error) => {
      toast.error(`Couldn't complete this roll: ${describeError(error)}`);
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

  // Edits win, otherwise fall back to what the roll already carries — rolls
  // arriving from a job return already have a real tag and roll number.
  const fieldValue = (roll, field) =>
    editingRolls[roll.id]?.[field] ?? roll[field] ?? '';

  const handleSaveRoll = (roll) => {
    const tt_sku_tag_number = String(fieldValue(roll, 'tt_sku_tag_number')).trim();
    const manufacturer_roll_number = String(fieldValue(roll, 'manufacturer_roll_number')).trim();
    const loc = locations.find(l => l.id === editingRolls[roll.id]?.location_id);

    // location_id and location_name have to be written as a pair or the rest of
    // the app reads a different bin than this page just assigned.
    if (!loc) {
      toast.error('Pick a location from the list before saving.');
      return;
    }

    completeRollMutation.mutate({
      roll,
      previousTag: roll.tt_sku_tag_number || '',
      data: {
        tt_sku_tag_number,
        manufacturer_roll_number,
        location_id: loc.id,
        location_name: loc.name,
        ...binRowFromName(loc.name),
      }
    });
  };

  const isRollComplete = (roll) => {
    const edits = editingRolls[roll.id] || {};
    return Boolean(
      fieldValue(roll, 'tt_sku_tag_number') &&
      fieldValue(roll, 'manufacturer_roll_number') &&
      edits.location_id
    );
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
                          <span>{formatFeetInches(roll.width_ft)} × {formatFeetInches(roll.current_length_ft)}</span>
                          <span>•</span>
                          <span>Vendor: {roll.vendor_name}</span>
                          {roll.condition && (
                            <>
                              <span>•</span>
                              <span>Condition: {roll.condition}</span>
                            </>
                          )}
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