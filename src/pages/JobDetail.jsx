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
  Package,
  Send
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
  const [showReceiveReturns, setShowReceiveReturns] = useState(false);
  const [returnItems, setReturnItems] = useState([]);

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

  const { data: materials = [] } = useQuery({
    queryKey: ['materials'],
    queryFn: () => base44.entities.Material.list(),
  });

  const { data: returnTransactions = [] } = useQuery({
    queryKey: ['returnTransactions', jobId],
    queryFn: () => base44.entities.Transaction.filter({ 
      job_id: jobId, 
      transaction_type: 'ReturnFromJob' 
    }),
    enabled: !!jobId,
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
            item_type: 'roll',
            status: 'Planned'
          });
        } else if (item.type === 'accessory') {
          await base44.entities.Allocation.create({
            job_id: jobId,
            job_name: job.job_name || job.job_number,
            product_name: item.item_name,
            item_id: item.id,
            item_type: 'accessory',
            requested_quantity: 1,
            unit_of_measure: item.unit_of_measure,
            status: 'Planned'
          });
        } else if (item.type === 'material') {
          await base44.entities.Allocation.create({
            job_id: jobId,
            job_name: job.job_name || job.job_number,
            product_name: item.item_name,
            item_id: item.id,
            item_type: 'material',
            requested_quantity: 1,
            unit_of_measure: item.unit_of_measure,
            status: 'Planned'
          });
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allocations', jobId] });
      queryClient.invalidateQueries({ queryKey: ['job', jobId] });
      setShowAddProducts(false);
      setSelectedItems([]);
      setSearchTerm('');
      toast.success('Items added to job');
    }
  });

  const deleteAllocationMutation = useMutation({
    mutationFn: async (allocationId) => {
      await base44.entities.Allocation.delete(allocationId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allocations', jobId] });
      queryClient.invalidateQueries({ queryKey: ['job', jobId] });
      toast.success('Allocation removed');
    }
  });

  const completeJobMutation = useMutation({
    mutationFn: async () => {
      await base44.entities.Job.update(jobId, { status: 'Completed' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job', jobId] });
      toast.success('Job completed');
    }
  });

  const receiveReturnsMutation = useMutation({
    mutationFn: async (returns) => {
      const user = await base44.auth.me();
      
      for (const returnItem of returns) {
        if (returnItem.type === 'roll') {
          const roll = rolls.find(r => r.id === returnItem.id);
          if (roll) {
            // Update roll status and length
            await base44.entities.Roll.update(returnItem.id, {
              status: 'Available',
              current_length_ft: returnItem.returned_length_ft,
              tt_sku_tag_number: returnItem.new_tt_sku || roll.tt_sku_tag_number
            });
            
            // Create transaction
            await base44.entities.Transaction.create({
              transaction_type: 'ReturnFromJob',
              fulfillment_for: job.fulfillment_for,
              roll_id: returnItem.id,
              tt_sku_tag_number: returnItem.new_tt_sku || roll.tt_sku_tag_number,
              job_id: jobId,
              job_number: job.job_number,
              product_name: roll.product_name,
              dye_lot: roll.dye_lot,
              width_ft: roll.width_ft,
              length_change_ft: returnItem.returned_length_ft,
              length_before_ft: 0,
              length_after_ft: returnItem.returned_length_ft,
              performed_by: user.email,
              notes: `Returned from job ${job.job_number}`
            });
          }
        }
      }
      
      // Update job status
      await base44.entities.Job.update(jobId, { status: 'AwaitingReturnInventory' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job', jobId] });
      queryClient.invalidateQueries({ queryKey: ['rolls'] });
      setShowReceiveReturns(false);
      setReturnItems([]);
      toast.success('Returns processed successfully');
    }
  });

  const sendOutMutation = useMutation({
    mutationFn: async () => {
      const user = await base44.auth.me();
      
      // Update job status to SentOut
      await base44.entities.Job.update(jobId, { status: 'SentOut' });

      // Process each allocation
      for (const allocation of allocations) {
        if (allocation.item_type === 'roll' && allocation.allocated_roll_ids?.length > 0) {
          for (const rollId of allocation.allocated_roll_ids) {
            // Update roll status
            await base44.entities.Roll.update(rollId, { status: 'SentOut' });
            
            // Create transaction
            const roll = rolls.find(r => r.id === rollId);
            if (roll) {
              await base44.entities.Transaction.create({
                transaction_type: 'SendOutToJob',
                fulfillment_for: job.fulfillment_for,
                roll_id: rollId,
                tt_sku_tag_number: roll.tt_sku_tag_number || roll.roll_tag,
                job_id: jobId,
                job_number: job.job_number,
                product_name: roll.product_name,
                dye_lot: roll.dye_lot,
                width_ft: roll.width_ft,
                length_change_ft: -roll.current_length_ft,
                length_before_ft: roll.current_length_ft,
                length_after_ft: 0,
                performed_by: user.email,
                notes: `Sent out to job ${job.job_number}`
              });
            }
          }
        } else if (allocation.item_type === 'accessory') {
          // Decrement accessory quantity
          const accessory = accessories.find(a => a.id === allocation.item_id);
          if (accessory) {
            await base44.entities.Accessory.update(allocation.item_id, {
              quantity_on_hand: accessory.quantity_on_hand - (allocation.requested_quantity || 1)
            });
            
            // Create transaction
            await base44.entities.Transaction.create({
              transaction_type: 'SendOutToJob',
              fulfillment_for: job.fulfillment_for,
              job_id: jobId,
              job_number: job.job_number,
              product_name: accessory.item_name,
              performed_by: user.email,
              notes: `Sent ${allocation.requested_quantity || 1} ${accessory.unit_of_measure} to job ${job.job_number}`
            });
          }
        } else if (allocation.item_type === 'material') {
          // Decrement material quantity
          const material = materials.find(m => m.id === allocation.item_id);
          if (material) {
            await base44.entities.Material.update(allocation.item_id, {
              quantity_on_hand: material.quantity_on_hand - (allocation.requested_quantity || 1)
            });
            
            // Create transaction
            await base44.entities.Transaction.create({
              transaction_type: 'SendOutToJob',
              fulfillment_for: job.fulfillment_for,
              job_id: jobId,
              job_number: job.job_number,
              product_name: material.item_name,
              performed_by: user.email,
              notes: `Sent ${allocation.requested_quantity || 1} ${material.unit_of_measure} to job ${job.job_number}`
            });
          }
        }
        
        // Update allocation status
        await base44.entities.Allocation.update(allocation.id, { status: 'Fulfilled' });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job', jobId] });
      queryClient.invalidateQueries({ queryKey: ['allocations', jobId] });
      queryClient.invalidateQueries({ queryKey: ['rolls'] });
      queryClient.invalidateQueries({ queryKey: ['accessories'] });
      queryClient.invalidateQueries({ queryKey: ['materials'] });
      toast.success('Job sent out successfully');
    },
    onError: (error) => {
      toast.error('Failed to send out job');
      console.error(error);
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

  const filteredInventory = [...rolls, ...accessories, ...materials].filter(item => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    const isTurf = item.tt_sku_tag_number !== undefined;
    const isAccessoryOrMaterial = item.item_name !== undefined;
    
    if (isTurf) {
      return (
        item.tt_sku_tag_number?.toLowerCase().includes(search) ||
        item.product_name?.toLowerCase().includes(search) ||
        item.dye_lot?.toLowerCase().includes(search)
      );
    } else if (isAccessoryOrMaterial) {
      return (
        item.item_name?.toLowerCase().includes(search) ||
        item.sku?.toLowerCase().includes(search)
      );
    }
    return false;
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

  // Calculate metrics for turf only
  const turfAllocations = allocations.filter(a => a.item_type === 'roll');
  const totalAllocatedSentOut = turfAllocations
    .filter(a => a.status === 'Fulfilled')
    .reduce((sum, a) => sum + (a.requested_length_ft || 0), 0);
  
  const totalReturned = returnTransactions.reduce((sum, t) => sum + (t.length_change_ft || 0), 0);
  const totalUsed = totalAllocatedSentOut - totalReturned;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link to={createPageUrl('Jobs')}>
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl lg:text-3xl font-bold text-slate-800">{job.job_number}</h1>
              <StatusBadge status={job.status} />
              <OwnerBadge owner={job.fulfillment_for} />
            </div>
            <p className="text-slate-500 mt-1">{job.customer_name || 'No customer name'}</p>
          </div>
        </div>
        <div className="flex gap-2">
          {job.status === 'Draft' && allocations.length > 0 && (
            <Button 
              onClick={() => sendOutMutation.mutate()}
              disabled={sendOutMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Send className="h-4 w-4 mr-2" />
              Send Out Job
            </Button>
          )}
          {job.status === 'SentOut' && job.fulfillment_for === 'TexasTurf' && (
            <Button 
              onClick={() => setShowReceiveReturns(true)}
              className="bg-amber-600 hover:bg-amber-700"
            >
              Receive Returns
            </Button>
          )}
          {((job.status === 'SentOut' && job.fulfillment_for === 'TurfCasa') || job.status === 'AwaitingReturnInventory') && (
            <Button 
              onClick={() => completeJobMutation.mutate()}
              disabled={completeJobMutation.isPending}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              Complete Job
            </Button>
          )}
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
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 bg-slate-50 rounded-lg">
                <p className="text-sm text-slate-500 mb-1">Requested (Job Form)</p>
                <p className="text-2xl font-bold text-slate-800">
                  {job.requested_total_turf_length_ft || 0} ft
                </p>
              </div>
              <div className="p-4 bg-blue-50 rounded-lg">
                <p className="text-sm text-slate-500 mb-1">Allocated (Sent Out)</p>
                <p className="text-2xl font-bold text-blue-600">{totalAllocatedSentOut} ft</p>
              </div>
              <div className="p-4 bg-amber-50 rounded-lg">
                <p className="text-sm text-slate-500 mb-1">Returned</p>
                <p className="text-2xl font-bold text-amber-600">{totalReturned} ft</p>
              </div>
              <div className="p-4 bg-emerald-50 rounded-lg">
                <p className="text-sm text-slate-500 mb-1">Used (Turf Only)</p>
                <p className="text-2xl font-bold text-emerald-600">{totalUsed} ft</p>
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
                        const itemType = isTurf ? 'roll' : (item.unit_of_measure && accessories.some(a => a.id === item.id) ? 'accessory' : 'material');
                        const isSelected = selectedItems.find(i => i.id === item.id && i.type === itemType);
                        
                        return (
                          <div 
                            key={`${itemType}-${item.id}`}
                            onClick={() => handleToggleItem({
                              ...item,
                              type: itemType
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
                <TableHead>Type</TableHead>
                <TableHead>Item</TableHead>
                <TableHead>Details</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allocations.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-slate-500">
                    No allocations yet
                  </TableCell>
                </TableRow>
              ) : (
                allocations.map((allocation) => (
                  <TableRow key={allocation.id}>
                    <TableCell>
                      <StatusBadge 
                        status={
                          allocation.item_type === 'roll' 
                            ? (rolls.find(r => allocation.allocated_roll_ids?.includes(r.id))?.roll_type || 'Parent')
                            : allocation.item_type === 'accessory' 
                            ? 'Accessory' 
                            : 'Material'
                        } 
                        size="sm" 
                      />
                    </TableCell>
                    <TableCell className="font-medium">{allocation.product_name}</TableCell>
                    <TableCell className="text-slate-600">
                      {allocation.item_type === 'roll' ? (
                        <>
                          {allocation.width_ft}ft × {allocation.requested_length_ft}ft
                          {allocation.dye_lot_preference && ` • Dye Lot: ${allocation.dye_lot_preference}`}
                        </>
                      ) : (
                        <>
                          {allocation.requested_quantity || 1} {allocation.unit_of_measure || 'unit'}
                        </>
                      )}
                    </TableCell>
                    <TableCell><StatusBadge status={allocation.status} size="sm" /></TableCell>
                    <TableCell>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => deleteAllocationMutation.mutate(allocation.id)}
                        disabled={deleteAllocationMutation.isPending || job.status !== 'Draft'}
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

      {/* Receive Returns Dialog */}
      <Dialog open={showReceiveReturns} onOpenChange={setShowReceiveReturns}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Receive Returns from Job</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Select rolls that were returned and specify their remaining length.
            </p>
            
            <div className="border rounded-lg max-h-96 overflow-y-auto">
              {turfAllocations.filter(a => a.status === 'Fulfilled').map(allocation => {
                const rollIds = allocation.allocated_roll_ids || [];
                return rollIds.map(rollId => {
                  const roll = rolls.find(r => r.id === rollId);
                  if (!roll) return null;
                  
                  const returnItem = returnItems.find(r => r.id === rollId);
                  
                  return (
                    <div key={rollId} className="p-4 border-b last:border-b-0">
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={!!returnItem}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setReturnItems(prev => [...prev, {
                                id: rollId,
                                type: 'roll',
                                returned_length_ft: 0,
                                new_tt_sku: ''
                              }]);
                            } else {
                              setReturnItems(prev => prev.filter(r => r.id !== rollId));
                            }
                          }}
                          className="mt-1"
                        />
                        <div className="flex-1">
                          <p className="font-medium">{roll.tt_sku_tag_number || roll.roll_tag}</p>
                          <p className="text-sm text-slate-600">
                            {roll.product_name} • {roll.width_ft}ft • Dye Lot: {roll.dye_lot}
                          </p>
                          
                          {returnItem && (
                            <div className="mt-3 space-y-2">
                              <div>
                                <Label className="text-xs">Returned Length (ft)</Label>
                                <Input
                                  type="number"
                                  value={returnItem.returned_length_ft}
                                  onChange={(e) => {
                                    setReturnItems(prev => prev.map(r => 
                                      r.id === rollId 
                                        ? { ...r, returned_length_ft: parseFloat(e.target.value) || 0 }
                                        : r
                                    ));
                                  }}
                                  placeholder="0"
                                  className="mt-1"
                                />
                              </div>
                              <div>
                                <Label className="text-xs">New TT SKU # (optional)</Label>
                                <Input
                                  value={returnItem.new_tt_sku}
                                  onChange={(e) => {
                                    setReturnItems(prev => prev.map(r => 
                                      r.id === rollId 
                                        ? { ...r, new_tt_sku: e.target.value }
                                        : r
                                    ));
                                  }}
                                  placeholder="Leave blank to keep existing"
                                  className="mt-1 font-mono"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                });
              })}
            </div>

            <div className="flex gap-2">
              <Button 
                variant="outline" 
                onClick={() => {
                  setShowReceiveReturns(false);
                  setReturnItems([]);
                }}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button 
                onClick={() => receiveReturnsMutation.mutate(returnItems)}
                disabled={receiveReturnsMutation.isPending || returnItems.length === 0}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700"
              >
                Process Returns
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}