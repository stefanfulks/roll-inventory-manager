import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Search, RefreshCw } from 'lucide-react';
import StatusBadge from '@/components/ui/StatusBadge';
import { toast } from 'sonner';

export default function SwapRollDialog({ 
  open, 
  onOpenChange, 
  allocation, 
  job,
  currentRoll 
}) {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedReplacement, setSelectedReplacement] = useState(null);

  const { data: availableRolls = [] } = useQuery({
    queryKey: ['available-rolls-for-swap', allocation?.product_name, allocation?.width_ft],
    queryFn: () => base44.entities.Roll.filter({
      status: 'Available',
      product_name: allocation?.product_name,
      width_ft: allocation?.width_ft
    }),
    enabled: !!allocation,
  });

  const swapRollMutation = useMutation({
    mutationFn: async (replacementRoll) => {
      const user = await base44.auth.me();
      
      // 1. Return original roll to Available
      await base44.entities.Roll.update(currentRoll.id, { 
        status: 'Available',
        allocated_job_id: null
      });

      // 2. Allocate replacement roll
      await base44.entities.Roll.update(replacementRoll.id, { 
        status: 'Allocated',
        allocated_job_id: job.id
      });

      // 3. Update allocation to reference new roll
      const updatedRollIds = allocation.allocated_roll_ids.filter(id => id !== currentRoll.id);
      updatedRollIds.push(replacementRoll.id);
      
      await base44.entities.Allocation.update(allocation.id, {
        allocated_roll_ids: updatedRollIds
      });

      // 4. Create transactions
      await base44.entities.Transaction.create({
        transaction_type: 'RollSwap',
        fulfillment_for: job.fulfillment_for,
        roll_id: currentRoll.id,
        tt_sku_tag_number: currentRoll.tt_sku_tag_number || currentRoll.roll_tag,
        job_id: job.id,
        job_number: job.job_number,
        product_name: currentRoll.product_name,
        dye_lot: currentRoll.dye_lot,
        width_ft: currentRoll.width_ft,
        performed_by: user.full_name || user.email,
        notes: `Released from job ${job.job_number} - physically inaccessible, swapped with ${replacementRoll.tt_sku_tag_number}`
      });

      await base44.entities.Transaction.create({
        transaction_type: 'AllocateForJob',
        fulfillment_for: job.fulfillment_for,
        roll_id: replacementRoll.id,
        tt_sku_tag_number: replacementRoll.tt_sku_tag_number || replacementRoll.roll_tag,
        job_id: job.id,
        job_number: job.job_number,
        product_name: replacementRoll.product_name,
        dye_lot: replacementRoll.dye_lot,
        width_ft: replacementRoll.width_ft,
        performed_by: user.full_name || user.email,
        notes: `Allocated for job ${job.job_number} - swapped from ${currentRoll.tt_sku_tag_number}`
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rolls'] });
      queryClient.invalidateQueries({ queryKey: ['allocations'] });
      queryClient.invalidateQueries({ queryKey: ['job'] });
      onOpenChange(false);
      setSearchTerm('');
      setSelectedReplacement(null);
      toast.success('Roll swapped successfully');
    },
    onError: (error) => {
      toast.error('Failed to swap roll: ' + error.message);
    }
  });

  const filteredRolls = availableRolls.filter(roll => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      roll.tt_sku_tag_number?.toLowerCase().includes(search) ||
      roll.dye_lot?.toLowerCase().includes(search) ||
      roll.location_bin?.toString().toLowerCase().includes(search)
    );
  });

  const handleSwap = () => {
    if (!selectedReplacement) {
      toast.error('Please select a replacement roll');
      return;
    }
    swapRollMutation.mutate(selectedReplacement);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Swap Allocated Roll</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-sm text-amber-800 font-medium">Current Roll (Inaccessible)</p>
            <p className="font-mono text-lg font-bold mt-1">{currentRoll?.tt_sku_tag_number || currentRoll?.roll_tag}</p>
            <p className="text-sm text-slate-600">
              {currentRoll?.width_ft}ft × {currentRoll?.current_length_ft}ft • Dye Lot: {currentRoll?.dye_lot}
            </p>
          </div>

          <div>
            <Label>Search Available Replacement Rolls</Label>
            <div className="relative mt-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input 
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Search by TT SKU #, dye lot, or location..."
                className="pl-10"
              />
            </div>
          </div>

          <div className="border rounded-lg max-h-64 overflow-y-auto">
            {filteredRolls.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                No available replacement rolls found
              </div>
            ) : (
              <div className="divide-y">
                {filteredRolls.map(roll => (
                  <div 
                    key={roll.id}
                    onClick={() => setSelectedReplacement(roll)}
                    className={`p-3 cursor-pointer hover:bg-slate-50 transition-colors ${
                      selectedReplacement?.id === roll.id ? 'bg-emerald-50 border-l-4 border-emerald-600' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-mono font-medium">{roll.tt_sku_tag_number || roll.roll_tag}</p>
                        <p className="text-sm text-slate-600">
                          {roll.width_ft}ft × {roll.current_length_ft}ft • Dye Lot: {roll.dye_lot}
                        </p>
                        {roll.location_bin && roll.location_row && (
                          <p className="text-xs text-slate-500">
                            Location: {roll.location_bin}-{roll.location_row}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <StatusBadge status={roll.roll_type || 'Parent'} size="sm" />
                        {selectedReplacement?.id === roll.id && (
                          <div className="w-5 h-5 bg-emerald-600 rounded-full flex items-center justify-center">
                            <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleSwap}
            disabled={!selectedReplacement || swapRollMutation.isPending}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Swap Roll
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}