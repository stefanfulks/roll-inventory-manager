import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { 
  ArrowLeft, 
  Plus, 
  Trash2,
  Calendar,
  MapPin
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
    product_id: '',
    product_name: '',
    width_ft: '',
    dye_lot_preference: '',
    requested_length_ft: ''
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

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => base44.entities.Product.filter({ status: 'active' }),
  });

  const createAllocationMutation = useMutation({
    mutationFn: async (data) => {
      return await base44.entities.Allocation.create({
        ...data,
        job_id: jobId,
        job_name: job.job_name,
        status: 'Planned'
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allocations', jobId] });
      setShowAddAllocation(false);
      setNewAllocation({
        product_id: '',
        product_name: '',
        width_ft: '',
        dye_lot_preference: '',
        requested_length_ft: ''
      });
      toast.success('Allocation added');
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

  const handleProductSelect = (productId) => {
    const product = products.find(p => p.id === productId);
    if (product) {
      setNewAllocation(prev => ({
        ...prev,
        product_id: productId,
        product_name: product.product_name
      }));
    }
  };

  const handleAddAllocation = () => {
    if (!newAllocation.product_name || !newAllocation.width_ft || !newAllocation.requested_length_ft) {
      toast.error('Please fill in product, width, and requested length');
      return;
    }
    createAllocationMutation.mutate(newAllocation);
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
          <p className="text-slate-500 mt-1">{job.customer_name}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Job Info */}
        <Card className="rounded-2xl border-slate-100 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Job Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-slate-500 mb-1">Customer</p>
              <p className="font-medium text-slate-800">{job.customer_name}</p>
            </div>
            {job.job_address && (
              <div>
                <p className="text-sm text-slate-500 mb-1 flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  Address
                </p>
                <p className="font-medium text-slate-800">{job.job_address}</p>
              </div>
            )}
            {job.inventory_owner && (
              <div>
                <p className="text-sm text-slate-500 mb-1">Owner</p>
                <OwnerBadge owner={job.inventory_owner} />
              </div>
            )}
            {job.scheduled_date && (
              <div>
                <p className="text-sm text-slate-500 mb-1 flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  Scheduled
                </p>
                <p className="font-medium text-slate-800">
                  {format(new Date(job.scheduled_date), 'MMMM d, yyyy')}
                </p>
              </div>
            )}
            {job.notes && (
              <div>
                <p className="text-sm text-slate-500 mb-1">Notes</p>
                <p className="text-slate-600 text-sm">{job.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Allocation Summary */}
        <Card className="rounded-2xl border-slate-100 shadow-sm lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">Allocation Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-slate-50 rounded-lg">
                <p className="text-sm text-slate-500 mb-1">Total Requested</p>
                <p className="text-2xl font-bold text-slate-800">{totalRequested} ft</p>
              </div>
              <div className="p-4 bg-emerald-50 rounded-lg">
                <p className="text-sm text-slate-500 mb-1">Total Allocated</p>
                <p className="text-2xl font-bold text-emerald-600">{totalAllocated} ft</p>
              </div>
              <div className="p-4 bg-blue-50 rounded-lg">
                <p className="text-sm text-slate-500 mb-1">Allocations</p>
                <p className="text-2xl font-bold text-blue-600">{allocations.length}</p>
              </div>
              <div className="p-4 bg-amber-50 rounded-lg">
                <p className="text-sm text-slate-500 mb-1">Fulfillment</p>
                <p className="text-2xl font-bold text-amber-600">
                  {totalRequested > 0 ? Math.round((totalAllocated / totalRequested) * 100) : 0}%
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Allocations */}
      <Card className="rounded-2xl border-slate-100 shadow-sm overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Allocations</CardTitle>
          <Dialog open={showAddAllocation} onOpenChange={setShowAddAllocation}>
            <DialogTrigger asChild>
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700">
                <Plus className="h-4 w-4 mr-2" />
                Add Allocation
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Add Allocation Request</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label>Product *</Label>
                  <Select 
                    value={newAllocation.product_id} 
                    onValueChange={handleProductSelect}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select product" />
                    </SelectTrigger>
                    <SelectContent>
                      {products.map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.product_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Width (ft) *</Label>
                  <Select 
                    value={newAllocation.width_ft} 
                    onValueChange={v => setNewAllocation(p => ({ ...p, width_ft: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select width" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="13">13 ft</SelectItem>
                      <SelectItem value="15">15 ft</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Requested Length (ft) *</Label>
                  <Input 
                    type="number"
                    min="1"
                    value={newAllocation.requested_length_ft}
                    onChange={e => setNewAllocation(p => ({ ...p, requested_length_ft: e.target.value }))}
                    placeholder="Length needed"
                  />
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
                  disabled={createAllocationMutation.isPending}
                  className="w-full bg-emerald-600 hover:bg-emerald-700"
                >
                  Add Allocation
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead>Product</TableHead>
                <TableHead>Width</TableHead>
                <TableHead>Requested</TableHead>
                <TableHead>Allocated</TableHead>
                <TableHead>Dye Lot Preference</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allocations.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-slate-500">
                    No allocations yet
                  </TableCell>
                </TableRow>
              ) : (
                allocations.map((allocation) => (
                  <TableRow key={allocation.id}>
                    <TableCell className="font-medium">{allocation.product_name}</TableCell>
                    <TableCell>{allocation.width_ft} ft</TableCell>
                    <TableCell>{allocation.requested_length_ft} ft</TableCell>
                    <TableCell className="font-medium text-emerald-600">
                      {allocation.allocated_length_ft || 0} ft
                    </TableCell>
                    <TableCell className="text-slate-600">
                      {allocation.dye_lot_preference || '-'}
                    </TableCell>
                    <TableCell><StatusBadge status={allocation.status} size="sm" /></TableCell>
                    <TableCell>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => deleteAllocationMutation.mutate(allocation.id)}
                        disabled={deleteAllocationMutation.isPending}
                        className="text-red-500 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
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