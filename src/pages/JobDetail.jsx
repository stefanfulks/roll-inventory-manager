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
  Send,
  MessageSquare
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
  const [returnInventoryItems, setReturnInventoryItems] = useState([]);
  const [slackChannel, setSlackChannel] = useState('');
  const [sendingReport, setSendingReport] = useState(false);

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

  const { data: allRolls = [] } = useQuery({
    queryKey: ['rolls'],
    queryFn: () => base44.entities.Roll.list(),
  });

  const rolls = allRolls.filter(r => r.status === 'Available');

  const { data: inventoryItems = [] } = useQuery({
    queryKey: ['inventoryItems'],
    queryFn: () => base44.entities.InventoryItem.list(),
  });

  const { data: returnTransactions = [] } = useQuery({
    queryKey: ['returnTransactions', jobId],
    queryFn: () => base44.entities.Transaction.filter({ 
      job_id: jobId, 
      transaction_type: 'ReturnFromJob' 
    }),
    enabled: !!jobId,
  });

  const { data: locations = [] } = useQuery({
    queryKey: ['locations'],
    queryFn: () => base44.entities.Location.list(),
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
        } else if (item.type === 'inventory_item') {
          await base44.entities.Allocation.create({
            job_id: jobId,
            job_name: job.job_name || job.job_number,
            product_name: item.item_name,
            item_id: item.id,
            item_type: 'inventory_item',
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

  const reopenJobMutation = useMutation({
    mutationFn: async () => {
      await base44.entities.Job.update(jobId, { status: 'AwaitingReturnInventory' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job', jobId] });
      toast.success('Job re-opened');
    }
  });

  const handleSendJobReport = async () => {
    if (!slackChannel.trim()) {
      toast.error('Please enter a Slack channel name');
      return;
    }

    setSendingReport(true);
    try {
      await base44.functions.invoke('sendJobCompletionReport', {
        channel: slackChannel.startsWith('#') ? slackChannel : `#${slackChannel}`,
        jobId: jobId
      });

      toast.success(`Job report sent to ${slackChannel}`);
    } catch (error) {
      toast.error(error.message || 'Failed to send Slack report');
    } finally {
      setSendingReport(false);
    }
  };

  const receiveReturnsMutation = useMutation({
    mutationFn: async (returns) => {
      const user = await base44.auth.me();
      
      for (const returnItem of returns) {
        if (returnItem.type === 'roll') {
          const roll = allRolls.find(r => r.id === returnItem.id);
          if (roll) {
            const finalStatus = returnItem.condition === 'Scrapped' ? 'Scrapped' : 'Available';
            const finalTTSKU = returnItem.has_existing_tag === 'new' ? returnItem.new_tt_sku : (roll.tt_sku_tag_number || roll.roll_tag);

            // Update roll status, length, tag, location, and condition
            await base44.entities.Roll.update(returnItem.id, {
              status: finalStatus,
              current_length_ft: returnItem.returned_length_ft,
              tt_sku_tag_number: finalTTSKU,
              condition: returnItem.condition || 'New',
              location_id: returnItem.location_id || roll.location_id,
              location_name: returnItem.location_name || roll.location_name
            });
            
            // Create transaction
            await base44.entities.Transaction.create({
              transaction_type: 'ReturnFromJob',
              fulfillment_for: job.fulfillment_for,
              roll_id: returnItem.id,
              tt_sku_tag_number: finalTTSKU,
              job_id: jobId,
              job_number: job.job_number,
              product_name: roll.product_name,
              dye_lot: roll.dye_lot,
              width_ft: roll.width_ft,
              length_change_ft: returnItem.returned_length_ft,
              length_before_ft: 0,
              length_after_ft: returnItem.returned_length_ft,
              performed_by: user.full_name || user.email,
              notes: `Returned from job ${job.job_number} - Condition: ${returnItem.condition || 'New'}${returnItem.has_existing_tag === 'new' ? ' - New tag assigned' : ''} - Location: ${returnItem.location_name || roll.location_name}`
            });
          }
        } else if (returnItem.type === 'inventory_item') {
          const inventoryItem = inventoryItems.find(i => i.id === returnItem.id);
          if (inventoryItem) {
            // Increment inventory quantity
            await base44.entities.InventoryItem.update(returnItem.id, {
              quantity_on_hand: inventoryItem.quantity_on_hand + returnItem.returned_quantity
            });
            
            // Create transaction
            await base44.entities.Transaction.create({
              transaction_type: 'ReturnFromJob',
              fulfillment_for: job.fulfillment_for,
              job_id: jobId,
              job_number: job.job_number,
              product_name: inventoryItem.item_name,
              performed_by: user.full_name || user.email,
              notes: `Returned ${returnItem.returned_quantity} ${inventoryItem.unit_of_measure} from job ${job.job_number}`
            });
          }
        }
      }
      
      // Update job status to Completed
      await base44.entities.Job.update(jobId, { status: 'Completed' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job', jobId] });
      queryClient.invalidateQueries({ queryKey: ['rolls'] });
      queryClient.invalidateQueries({ queryKey: ['inventoryItems'] });
      queryClient.invalidateQueries({ queryKey: ['returnTransactions', jobId] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      setShowReceiveReturns(false);
      setReturnItems([]);
      setReturnInventoryItems([]);
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
            const roll = allRolls.find(r => r.id === rollId);
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
                performed_by: user.full_name || user.email,
                notes: `Sent out to job ${job.job_number}`
              });
            }
          }
        } else if (allocation.item_type === 'inventory_item') {
          // Decrement inventory item quantity
          const inventoryItem = inventoryItems.find(i => i.id === allocation.item_id);
          if (inventoryItem) {
            await base44.entities.InventoryItem.update(allocation.item_id, {
              quantity_on_hand: inventoryItem.quantity_on_hand - (allocation.requested_quantity || 1)
            });
            
            // Create transaction
            await base44.entities.Transaction.create({
              transaction_type: 'SendOutToJob',
              fulfillment_for: job.fulfillment_for,
              job_id: jobId,
              job_number: job.job_number,
              product_name: inventoryItem.item_name,
              performed_by: user.full_name || user.email,
              notes: `Sent ${allocation.requested_quantity || 1} ${inventoryItem.unit_of_measure} to job ${job.job_number}`
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
      queryClient.invalidateQueries({ queryKey: ['inventoryItems'] });
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

  const filteredInventory = [...rolls, ...inventoryItems].filter(item => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    const isTurf = item.tt_sku_tag_number !== undefined;
    const isInventoryItem = item.item_name !== undefined;
    
    if (isTurf) {
      return (
        item.tt_sku_tag_number?.toLowerCase().includes(search) ||
        item.product_name?.toLowerCase().includes(search) ||
        item.dye_lot?.toLowerCase().includes(search)
      );
    } else if (isInventoryItem) {
      return (
        item.item_name?.toLowerCase().includes(search) ||
        item.sku?.toLowerCase().includes(search) ||
        item.category?.toLowerCase().includes(search)
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
  const turfVariance = totalUsed - (job.requested_total_turf_length_ft || 0);

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
            <>
              {job.status === 'AwaitingReturnInventory' && (
                <div className="flex gap-2 items-center">
                  <Input
                    placeholder="Slack channel (e.g., #jobs)"
                    value={slackChannel}
                    onChange={(e) => setSlackChannel(e.target.value)}
                    className="w-48"
                  />
                  <Button 
                    onClick={handleSendJobReport}
                    disabled={sendingReport}
                    variant="outline"
                    className="border-blue-600 text-blue-600 hover:bg-blue-50"
                  >
                    <MessageSquare className="h-4 w-4 mr-2" />
                    {sendingReport ? 'Sending...' : 'Send Report'}
                  </Button>
                </div>
              )}
              <Button 
                onClick={() => completeJobMutation.mutate()}
                disabled={completeJobMutation.isPending}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                Complete Job
              </Button>
            </>
          )}
          {job.status === 'Completed' && (
            <Button 
              onClick={() => reopenJobMutation.mutate()}
              disabled={reopenJobMutation.isPending}
              variant="outline"
              className="border-amber-600 text-amber-600 hover:bg-amber-50"
            >
              Re-open Job
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
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
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
              <div className={`p-4 rounded-lg ${turfVariance > 0 ? 'bg-red-50' : turfVariance < 0 ? 'bg-green-50' : 'bg-slate-50'}`}>
                <p className="text-sm text-slate-500 mb-1">Variance</p>
                <p className={`text-2xl font-bold ${turfVariance > 0 ? 'text-red-600' : turfVariance < 0 ? 'text-green-600' : 'text-slate-600'}`}>
                  {turfVariance > 0 ? '+' : ''}{turfVariance} ft
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
                        const itemType = isTurf ? 'roll' : 'inventory_item';
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
                                     <StatusBadge status={item.roll_type} size="sm" />
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
                      {allocation.item_type === 'roll' ? (
                        <div className="flex gap-2">
                          <StatusBadge 
                            status={rolls.find(r => allocation.allocated_roll_ids?.includes(r.id))?.roll_type || 'Parent'} 
                            size="sm" 
                          />
                        </div>
                      ) : (
                       <StatusBadge 
                         status="Item" 
                         size="sm" 
                       />
                      )}
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
              {allocations.filter(a => a.status === 'Fulfilled').length === 0 ? (
                <div className="p-8 text-center text-slate-500">
                  No items were sent out for this job
                </div>
              ) : (
                allocations.filter(a => a.status === 'Fulfilled').map(allocation => {
                  if (allocation.item_type === 'inventory_item') {
                    const item = inventoryItems.find(i => i.id === allocation.item_id);
                    if (!item) return null;
                    
                    const returnItem = returnInventoryItems.find(r => r.id === item.id);
                    
                    return (
                      <div key={`item-${item.id}`} className="p-4 border-b last:border-b-0">
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={!!returnItem}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setReturnInventoryItems(prev => [...prev, {
                                  id: item.id,
                                  type: 'inventory_item',
                                  returned_quantity: allocation.requested_quantity || 1
                                }]);
                              } else {
                                setReturnInventoryItems(prev => prev.filter(r => r.id !== item.id));
                              }
                            }}
                            className="mt-1"
                          />
                          <div className="flex-1">
                            <p className="font-medium">{item.item_name}</p>
                            <p className="text-sm text-slate-600">
                              SKU: {item.sku || 'N/A'} • Sent: {allocation.requested_quantity || 1} {item.unit_of_measure}
                            </p>
                            
                            {returnItem && (
                              <div className="mt-3 p-3 bg-slate-50 rounded-lg">
                                <Label className="text-xs font-semibold">Returned Quantity *</Label>
                                <Input
                                  type="number"
                                  step="1"
                                  value={returnItem.returned_quantity}
                                  onChange={(e) => {
                                    setReturnInventoryItems(prev => prev.map(r => 
                                      r.id === item.id 
                                        ? { ...r, returned_quantity: parseInt(e.target.value) || 0 }
                                        : r
                                    ));
                                  }}
                                  placeholder="0"
                                  className="mt-1"
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  }
                  
                  // Handle turf rolls
                  if (allocation.item_type === 'roll') {
                  const rollIds = allocation.allocated_roll_ids || [];
                  return rollIds.map(rollId => {
                    const roll = allRolls.find(r => r.id === rollId);
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
                                  returned_length_ft: roll.current_length_ft || 0,
                                  has_existing_tag: 'existing',
                                  new_tt_sku: '',
                                  condition: 'New',
                                  location_id: '',
                                  location_name: ''
                                  }]);
                              } else {
                                setReturnItems(prev => prev.filter(r => r.id !== rollId));
                              }
                            }}
                            className="mt-1"
                          />
                          <div className="flex-1">
                            <p className="font-medium">{roll.tt_sku_tag_number || roll.roll_tag || 'No tag'}</p>
                            <p className="text-sm text-slate-600">
                              {roll.product_name} • {roll.width_ft}ft × {roll.current_length_ft}ft • Dye Lot: {roll.dye_lot}
                            </p>
                            <p className="text-xs text-slate-500 mt-1">
                              Sent out: {roll.current_length_ft}ft • Type: {roll.roll_type}
                            </p>
                            
                            {returnItem && (
                              <div className="mt-3 space-y-3 p-3 bg-slate-50 rounded-lg">
                                <div>
                                  <Label className="text-xs font-semibold">Returned Length (ft) *</Label>
                                  <Input
                                    type="number"
                                    step="0.1"
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
                                  <Label className="text-xs font-semibold">Does this roll have a tag? *</Label>
                                  <Select
                                    value={returnItem.has_existing_tag}
                                    onValueChange={(v) => {
                                      setReturnItems(prev => prev.map(r => 
                                        r.id === rollId 
                                          ? { ...r, has_existing_tag: v }
                                          : r
                                      ));
                                    }}
                                  >
                                    <SelectTrigger className="mt-1">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="existing">Yes - Use existing tag</SelectItem>
                                      <SelectItem value="new">No - Assign new TT SKU tag</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                
                                {returnItem.has_existing_tag === 'new' && (
                                  <div>
                                    <Label className="text-xs font-semibold">New TT SKU Tag Number *</Label>
                                    <Input
                                      value={returnItem.new_tt_sku}
                                      onChange={(e) => {
                                        setReturnItems(prev => prev.map(r => 
                                          r.id === rollId 
                                            ? { ...r, new_tt_sku: e.target.value }
                                            : r
                                        ));
                                      }}
                                      placeholder="Enter new tag number"
                                      className="mt-1 font-mono"
                                    />
                                  </div>
                                )}
                                
                                <div>
                                  <Label className="text-xs font-semibold">Condition *</Label>
                                  <Select
                                    value={returnItem.condition}
                                    onValueChange={(v) => {
                                      setReturnItems(prev => prev.map(r => 
                                        r.id === rollId 
                                          ? { ...r, condition: v }
                                          : r
                                      ));
                                    }}
                                  >
                                    <SelectTrigger className="mt-1">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="New">New - Add back to inventory</SelectItem>
                                      <SelectItem value="Damaged">Damaged - Add back to inventory</SelectItem>
                                      <SelectItem value="Scrapped">Scrapped - Do not add to inventory</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>

                                <div>
                                  <Label className="text-xs font-semibold">Location *</Label>
                                  <Select
                                    value={returnItem.location_id || ''}
                                    onValueChange={(v) => {
                                      const loc = locations.find(l => l.id === v);
                                      setReturnItems(prev => prev.map(r => 
                                        r.id === rollId 
                                          ? { ...r, location_id: v, location_name: loc?.name || '' }
                                          : r
                                      ));
                                    }}
                                  >
                                    <SelectTrigger className="mt-1">
                                      <SelectValue placeholder="Select location" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {locations.map(loc => (
                                        <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  });
                  }
                  return null;
                })
              )}
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
                onClick={() => receiveReturnsMutation.mutate([...returnItems, ...returnInventoryItems])}
                disabled={receiveReturnsMutation.isPending || (returnItems.length === 0 && returnInventoryItems.length === 0)}
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