import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { 
  ArrowLeft, 
  Plus, 
  Package,
  Check,
  Trash2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { format } from 'date-fns';

export default function JobDetail() {
  const queryClient = useQueryClient();
  const params = new URLSearchParams(window.location.search);
  const jobId = params.get('id');

  const [showAddAllocation, setShowAddAllocation] = useState(false);
  const [newAllocation, setNewAllocation] = useState({
    product_name: '',
    width_ft: '',
    requested_length_ft: '',
    dye_lot_preference: ''
  });

  const { data: job, isLoading } = useQuery({
    queryKey: ['job', jobId],
    queryFn: () => base44.entities.Job.filter({ id: jobId }),
    enabled: !!jobId,
    select: (data) => data[0],
  });

  const { data: allocations = [] } = useQuery({
    queryKey: ['allocations', jobId],
    queryFn: () => base44.entities.Allocation.filter({ job_id: jobId }),
    enabled: !!jobId,
  });

  const { data: bundles = [] } = useQuery({
    queryKey: ['job-bundles', jobId],
    queryFn: () => base44.entities.Bundle.filter({ job_id: jobId }),
    enabled: !!jobId,
  });

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => base44.entities.Product.filter({ status: 'active' }),
  });

  const { data: availableRolls = [] } = useQuery({
    queryKey: ['available-rolls'],
    queryFn: () => base44.entities.Roll.filter({ status: 'Available' }, '-created_date', 500),
  });

  const addAllocationMutation = useMutation({
    mutationFn: async (data) => {
      return await base44.entities.Allocation.create({
        ...data,
        job_id: jobId,
        job_name: job?.job_name,
        status: 'Planned'
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allocations', jobId] });
      setShowAddAllocation(false);
      setNewAllocation({
        product_name: '',
        width_ft: '',
        requested_length_ft: '',
        dye_lot_preference: ''
      });
      toast.success('Allocation added');
    }
  });

  const reserveRollMutation = useMutation({
    mutationFn: async ({ allocation, roll }) => {
      // Update roll status
      await base44.entities.Roll.update(roll.id, { status: 'Reserved' });

      // Update allocation
      const existingRollIds = allocation.allocated_roll_ids || [];
      const newAllocatedLength = (allocation.allocated_length_ft || 0) + roll.current_length_ft;
      
      await base44.entities.Allocation.update(allocation.id, {
        allocated_roll_ids: [...existingRollIds, roll.id],
        allocated_length_ft: newAllocatedLength,
        status: newAllocatedLength >= allocation.requested_length_ft ? 'Reserved' : 'Planned'
      });

      // Create transaction
      await base44.entities.Transaction.create({
        transaction_type: 'Reserve',
        inventory_owner: roll.inventory_owner,
        roll_id: roll.id,
        roll_tag: roll.roll_tag,
        job_id: jobId,
        job_name: job?.job_name,
        length_change_ft: 0,
        length_before_ft: roll.current_length_ft,
        length_after_ft: roll.current_length_ft,
        product_name: roll.product_name,
        dye_lot: roll.dye_lot,
        width_ft: roll.width_ft,
        notes: `Reserved for job ${job?.job_name}`
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allocations', jobId] });
      queryClient.invalidateQueries({ queryKey: ['available-rolls'] });
      queryClient.invalidateQueries({ queryKey: ['rolls'] });
      toast.success('Roll reserved');
    }
  });

  const deleteAllocationMutation = useMutation({
    mutationFn: async (allocationId) => {
      await base44.entities.Allocation.delete(allocationId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allocations', jobId] });
      toast.success('Allocation removed');
    }
  });

  const updateJobStatusMutation = useMutation({
    mutationFn: async (newStatus) => {
      await base44.entities.Job.update(jobId, { status: newStatus });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job', jobId] });
      toast.success('Job status updated');
    }
  });

  const handleAddAllocation = () => {
    if (!newAllocation.product_name || !newAllocation.width_ft || !newAllocation.requested_length_ft) {
      toast.error('Please fill in all required fields');
      return;
    }
    addAllocationMutation.mutate(newAllocation);
  };

  // Get suggested rolls for an allocation
  const getSuggestedRolls = (allocation) => {
    return availableRolls
      .filter(r => 
        r.product_name === allocation.product_name &&
        r.width_ft === allocation.width_ft &&
        (!allocation.dye_lot_preference || r.dye_lot === allocation.dye_lot_preference) &&
        !(allocation.allocated_roll_ids || []).includes(r.id)
      )
      .sort((a, b) => {
        // Prefer same dye lot
        if (allocation.dye_lot_preference) {
          if (a.dye_lot === allocation.dye_lot_preference && b.dye_lot !== allocation.dye_lot_preference) return -1;
          if (b.dye_lot === allocation.dye_lot_preference && a.dye_lot !== allocation.dye_lot_preference) return 1;
        }
        // Prefer child rolls / smaller pieces first
        if (a.roll_type === 'Child' && b.roll_type === 'Parent') return -1;
        if (b.roll_type === 'Child' && a.roll_type === 'Parent') return 1;
        // Then by length (smaller first for efficiency)
        return a.current_length_ft - b.current_length_ft;
      })
      .slice(0, 5);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-500">Job not found</p>
        <Link to={createPageUrl('Jobs')}>
          <Button variant="link" className="mt-2">Back to Jobs</Button>
        </Link>
      </div>
    );
  }

  const totalRequested = allocations.reduce((sum, a) => sum + (a.requested_length_ft || 0), 0);
  const totalAllocated = allocations.reduce((sum, a) => sum + (a.allocated_length_ft || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link to={createPageUrl('Jobs')}>
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl lg:text-3xl font-bold text-slate-800">{job.job_name}</h1>
              <StatusBadge status={job.status} />
            </div>
            <p className="text-slate-500 mt-1">{job.customer_name} • {job.job_address || 'No address'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {job.inventory_owner && <OwnerBadge owner={job.inventory_owner} />}
          {job.status === 'Draft' && allocations.length > 0 && (
            <Button 
              onClick={() => updateJobStatusMutation.mutate('Allocated')}
              variant="outline"
            >
              Mark Allocated
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Job Summary */}
        <Card className="rounded-2xl border-slate-100 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Job Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Requested</span>
              <span className="font-semibold">{totalRequested} linear ft</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Allocated</span>
              <span className="font-semibold">{totalAllocated} linear ft</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Remaining</span>
              <span className={`font-semibold ${totalRequested - totalAllocated > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                {totalRequested - totalAllocated} linear ft
              </span>
            </div>
            {job.scheduled_date && (
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Scheduled</span>
                <span className="font-medium">
                  {format(new Date(job.scheduled_date), 'MMM d, yyyy')}
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Linked Bundles */}
        <Card className="rounded-2xl border-slate-100 shadow-sm lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Linked Bundles</CardTitle>
            <Link to={createPageUrl(`Bundles`)}>
              <Button variant="outline" size="sm">
                <Plus className="h-4 w-4 mr-1" />
                Create Bundle
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {bundles.length === 0 ? (
              <p className="text-slate-400 text-center py-4">No bundles linked to this job</p>
            ) : (
              <div className="space-y-2">
                {bundles.map(bundle => (
                  <Link
                    key={bundle.id}
                    to={createPageUrl(`BundleDetail?id=${bundle.id}`)}
                    className="flex items-center justify-between p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors"
                  >
                    <div>
                      <span className="font-mono font-medium">{bundle.bundle_tag}</span>
                      <span className="text-slate-500 ml-2">{bundle.total_sqft?.toLocaleString() || 0} sq ft</span>
                    </div>
                    <StatusBadge status={bundle.status} size="sm" />
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Allocations */}
      <Card className="rounded-2xl border-slate-100 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Allocations</CardTitle>
          <Dialog open={showAddAllocation} onOpenChange={setShowAddAllocation}>
            <DialogTrigger asChild>
              <Button className="bg-emerald-600 hover:bg-emerald-700">
                <Plus className="h-4 w-4 mr-2" />
                Add Allocation
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Allocation Request</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label>Product *</Label>
                  <Select 
                    value={newAllocation.product_name} 
                    onValueChange={v => setNewAllocation(p => ({ ...p, product_name: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select product" />
                    </SelectTrigger>
                    <SelectContent>
                      {products.map(p => (
                        <SelectItem key={p.id} value={p.product_name}>{p.product_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Width (ft) *</Label>
                    <Select 
                      value={newAllocation.width_ft} 
                      onValueChange={v => setNewAllocation(p => ({ ...p, width_ft: parseFloat(v) }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="13">13 ft</SelectItem>
                        <SelectItem value="15">15 ft</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Length (ft) *</Label>
                    <Input 
                      type="number"
                      value={newAllocation.requested_length_ft}
                      onChange={e => setNewAllocation(p => ({ ...p, requested_length_ft: parseFloat(e.target.value) || 0 }))}
                      placeholder="Required length"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Dye Lot Preference (optional)</Label>
                  <Input 
                    value={newAllocation.dye_lot_preference}
                    onChange={e => setNewAllocation(p => ({ ...p, dye_lot_preference: e.target.value }))}
                    placeholder="Preferred dye lot"
                  />
                </div>

                <Button 
                  onClick={handleAddAllocation}
                  disabled={addAllocationMutation.isPending}
                  className="w-full bg-emerald-600 hover:bg-emerald-700"
                >
                  Add Allocation
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {allocations.length === 0 ? (
            <p className="text-slate-400 text-center py-8">No allocations yet. Add what turf this job needs.</p>
          ) : (
            <div className="space-y-6">
              {allocations.map((allocation) => {
                const suggestedRolls = getSuggestedRolls(allocation);
                const progress = allocation.requested_length_ft > 0 
                  ? Math.min(100, (allocation.allocated_length_ft || 0) / allocation.requested_length_ft * 100)
                  : 0;

                return (
                  <div key={allocation.id} className="border border-slate-200 rounded-xl p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="font-semibold">{allocation.product_name}</p>
                        <p className="text-sm text-slate-500">
                          {allocation.width_ft}ft wide • 
                          {allocation.dye_lot_preference && ` Prefer: ${allocation.dye_lot_preference} •`} 
                          {' '}{allocation.allocated_length_ft || 0}/{allocation.requested_length_ft}ft
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={allocation.status} size="sm" />
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => deleteAllocationMutation.mutate(allocation.id)}
                          className="text-red-500 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div className="w-full bg-slate-100 rounded-full h-2 mb-4">
                      <div 
                        className={`h-2 rounded-full transition-all ${progress >= 100 ? 'bg-emerald-500' : 'bg-amber-500'}`}
                        style={{ width: `${progress}%` }}
                      />
                    </div>

                    {/* Suggested rolls */}
                    {allocation.status !== 'Fulfilled' && suggestedRolls.length > 0 && (
                      <div>
                        <p className="text-sm text-slate-500 mb-2">Suggested rolls:</p>
                        <div className="space-y-2">
                          {suggestedRolls.map(roll => (
                            <div 
                              key={roll.id}
                              className="flex items-center justify-between p-2 bg-slate-50 rounded-lg"
                            >
                              <div>
                                <span className="font-mono text-sm">{roll.roll_tag}</span>
                                <span className="text-slate-500 text-sm ml-2">
                                  {roll.dye_lot} • {roll.current_length_ft}ft
                                </span>
                                {roll.roll_type === 'Child' && (
                                  <StatusBadge status="Child" size="sm" />
                                )}
                              </div>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => reserveRollMutation.mutate({ allocation, roll })}
                                disabled={reserveRollMutation.isPending}
                              >
                                <Check className="h-4 w-4 mr-1" />
                                Reserve
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}