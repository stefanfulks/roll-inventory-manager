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
  MapPin,
  Search,
  Package
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

  const [showAddProducts, setShowAddProducts] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedItems, setSelectedItems] = useState([]);

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

  const { data: rolls = [] } = useQuery({
    queryKey: ['rolls'],
    queryFn: () => base44.entities.Roll.filter({ status: 'Available' }),
  });

  const { data: accessories = [] } = useQuery({
    queryKey: ['accessories'],
    queryFn: () => base44.entities.Accessory.list(),
  });

  const createAllocationMutation = useMutation({
    mutationFn: async (items) => {
      for (const item of items) {
        if (item.type === 'roll') {
          await base44.entities.Allocation.create({
            job_id: jobId,
            job_name: job.job_name || job.job_number,
            product_id: item.product_id,
            product_name: item.product_name,
            width_ft: item.width_ft,
            dye_lot_preference: item.dye_lot,
            requested_length_ft: item.current_length_ft,
            allocated_roll_ids: [item.id],
            status: 'Planned'
          });
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allocations', jobId] });
      setShowAddProducts(false);
      setSelectedItems([]);
      setSearchTerm('');
      toast.success('Products added to job');
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

  const handleToggleItem = (item) => {
    const exists = selectedItems.find(i => i.id === item.id && i.type === item.type);
    if (exists) {
      setSelectedItems(prev => prev.filter(i => !(i.id === item.id && i.type === item.type)));
    } else {
      setSelectedItems(prev => [...prev, item]);
    }
  };

  const handleAddSelectedProducts = () => {
    if (selectedItems.length === 0) {
      toast.error('Please select at least one item');
      return;
    }
    createAllocationMutation.mutate(selectedItems);
  };

  const filteredInventory = [...rolls, ...accessories].filter(item => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    const isTurf = item.tt_sku_tag_number !== undefined;
    
    if (isTurf) {
      return (
        item.tt_sku_tag_number?.toLowerCase().includes(search) ||
        item.product_name?.toLowerCase().includes(search) ||
        item.dye_lot?.toLowerCase().includes(search)
      );
    } else {
      return (
        item.item_name?.toLowerCase().includes(search) ||
        item.sku?.toLowerCase().includes(search)
      );
    }
  });

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
          <Dialog open={showAddProducts} onOpenChange={setShowAddProducts}>
            <DialogTrigger asChild>
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700">
                <Plus className="h-4 w-4 mr-2" />
                Add Products
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-2xl max-h-[80vh]">
              <DialogHeader>
                <DialogTitle>Add Products from Inventory</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input 
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    placeholder="Search by TT SKU #, product name, or dye lot..."
                    className="pl-10"
                  />
                </div>
                
                <div className="border rounded-lg max-h-96 overflow-y-auto">
                  {filteredInventory.length === 0 ? (
                    <div className="text-center py-8 text-slate-500">
                      No items found
                    </div>
                  ) : (
                    <div className="divide-y">
                      {filteredInventory.map(item => {
                        const isTurf = item.tt_sku_tag_number !== undefined;
                        const isSelected = selectedItems.find(i => i.id === item.id && i.type === (isTurf ? 'roll' : 'accessory'));
                        
                        return (
                          <div 
                            key={`${isTurf ? 'roll' : 'accessory'}-${item.id}`}
                            onClick={() => handleToggleItem({
                              ...item,
                              type: isTurf ? 'roll' : 'accessory'
                            })}
                            className={`p-4 cursor-pointer hover:bg-slate-50 transition-colors ${
                              isSelected ? 'bg-emerald-50 border-l-4 border-emerald-600' : ''
                            }`}
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                {isTurf ? (
                                  <>
                                    <div className="flex items-center gap-2">
                                      <Package className="h-4 w-4 text-emerald-600" />
                                      <span className="font-mono font-medium">{item.tt_sku_tag_number}</span>
                                    </div>
                                    <p className="text-sm font-medium text-slate-800 mt-1">
                                      {item.product_name}
                                    </p>
                                    <div className="flex gap-3 mt-1 text-sm text-slate-600">
                                      <span>Dye Lot: {item.dye_lot}</span>
                                      <span>•</span>
                                      <span>{item.width_ft}ft × {item.current_length_ft}ft</span>
                                      <span>•</span>
                                      <span>{item.location_bin && item.location_row ? `${item.location_bin}-${item.location_row}` : 'No location'}</span>
                                    </div>
                                  </>
                                ) : (
                                  <>
                                    <p className="font-medium text-slate-800">{item.item_name}</p>
                                    <p className="text-sm text-slate-600 mt-1">
                                      SKU: {item.sku || 'N/A'} • {item.unit_of_measure}
                                    </p>
                                  </>
                                )}
                              </div>
                              {isSelected && (
                                <div className="flex-shrink-0 w-5 h-5 bg-emerald-600 rounded-full flex items-center justify-center">
                                  <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                  </svg>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {selectedItems.length > 0 && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                    <p className="text-sm text-emerald-800 font-medium">
                      {selectedItems.length} item{selectedItems.length > 1 ? 's' : ''} selected
                    </p>
                  </div>
                )}

                <Button 
                  onClick={handleAddSelectedProducts} 
                  disabled={createAllocationMutation.isPending || selectedItems.length === 0}
                  className="w-full bg-emerald-600 hover:bg-emerald-700"
                >
                  Add Selected Products
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