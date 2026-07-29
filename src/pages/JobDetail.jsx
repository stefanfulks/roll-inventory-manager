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
  MessageSquare,
  RefreshCw
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import UnmarkedReturnForm from '@/components/returns/UnmarkedReturnForm';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import SwapRollDialog from '@/components/job/SwapRollDialog';
import { format } from 'date-fns';
import { parseLocalDate } from '@/lib/dateHelpers';
import {
  ROLL_STATUS,
  ALLOCATION_STATUS,
  ALLOCATION_STATUS_OPTIONS,
  STATUS_LABELS,
  createAllocationWithSync,
  updateAllocationStatusWithSync,
  deleteAllocationWithSync,
} from '@/lib/rollStatus';
import { formatFeetInches } from '@/lib/dateHelpers';
import { describeError } from '@/lib/query-client';

export default function JobDetail() {
  const queryClient = useQueryClient();
  const params = new URLSearchParams(window.location.search);
  const jobId = params.get('id');

  const [showAddProducts, setShowAddProducts] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedItems, setSelectedItems] = useState([]);
  const [showReceiveReturns, setShowReceiveReturns] = useState(false);
  const [showUnmarkedReturns, setShowUnmarkedReturns] = useState(false);
  const [returnItems, setReturnItems] = useState([]);
  const [returnInventoryItems, setReturnInventoryItems] = useState([]);
  const [slackChannel, setSlackChannel] = useState('');
  const [sendingReport, setSendingReport] = useState(false);
  const [showOutsideMaterialsDialog, setShowOutsideMaterialsDialog] = useState(false);
  const [outsideMaterial, setOutsideMaterial] = useState({
    vendor: '',
    material: '',
    quantity: '',
    quantity_definition: '',
    notes: ''
  });
  const [showSwapDialog, setShowSwapDialog] = useState(false);
  const [swapAllocation, setSwapAllocation] = useState(null);
  const [swapCurrentRoll, setSwapCurrentRoll] = useState(null);

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

  // Explicit page size: an unbounded .list() only returns the SDK's default first
  // page, which silently hid rolls from the Add Products and Receive Returns lists.
  const { data: allRolls = [] } = useQuery({
    queryKey: ['rolls'],
    queryFn: () => base44.entities.Roll.list('-created_date', 5000),
  });

  const rolls = allRolls.filter(r => r.status === ROLL_STATUS.AVAILABLE);

  const { data: inventoryItems = [] } = useQuery({
    queryKey: ['inventoryItems'],
    queryFn: () => base44.entities.InventoryItem.list('-created_date', 1000),
  });

  const { data: returnTransactions = [] } = useQuery({
    queryKey: ['returnTransactions', jobId],
    queryFn: () => base44.entities.Transaction.filter({ 
      job_id: jobId, 
      transaction_type: 'ReturnFromJob' 
    }),
    enabled: !!jobId,
  });

  const { data: outsideMaterials = [] } = useQuery({
    queryKey: ['outsideMaterials', jobId],
    queryFn: () => base44.entities.JobOutsideMaterial.filter({ job_id: jobId }),
    enabled: !!jobId,
  });

  const { data: locations = [] } = useQuery({
    queryKey: ['locations'],
    queryFn: async () => {
      const locs = await base44.entities.Location.list();
      return locs
        .filter(l => l.designated_for === 'all' || l.designated_for === 'turf_only')
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    },
  });

  const createAllocationMutation = useMutation({
    mutationFn: async (items) => {
      for (const item of items) {
        if (item.type === 'roll') {
          // createAllocationWithSync also updates the roll's status + allocated_job_id
          await createAllocationWithSync({
            job_id: jobId,
            job_name: job.job_name || job.job_number,
            product_id: item.product_id,
            product_name: item.product_name,
            width_ft: item.width_ft,
            dye_lot_preference: item.dye_lot,
            requested_length_ft: item.current_length_ft,
            allocated_roll_ids: [item.id],
            item_type: 'roll',
            status: ALLOCATION_STATUS.PLANNED,
          });
        } else if (item.type === 'inventory_item') {
          await base44.entities.Allocation.create({
            job_id: jobId,
            job_name: job.job_name || job.job_number,
            product_name: item.item_name,
            item_id: item.id,
            item_type: 'inventory_item',
            requested_quantity: item.requested_quantity || 1,
            unit_of_measure: item.unit_of_measure,
            status: ALLOCATION_STATUS.PLANNED,
          });
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allocations', jobId] });
      queryClient.invalidateQueries({ queryKey: ['allocations'] });
      queryClient.invalidateQueries({ queryKey: ['rolls'] });
      queryClient.invalidateQueries({ queryKey: ['job', jobId] });
      setShowAddProducts(false);
      setSelectedItems([]);
      setSearchTerm('');
      toast.success('Items added to job');
    },
  });

  const deleteAllocationMutation = useMutation({
    mutationFn: async (allocationId) => {
      // Find the full allocation object so we can release its rolls. Fall back to a
      // fresh read rather than silently no-op'ing on a stale list.
      let allocation = allocations.find(a => a.id === allocationId);
      if (!allocation) {
        const [fresh] = await base44.entities.Allocation.filter({ id: allocationId });
        allocation = fresh;
      }
      if (!allocation) {
        throw new Error('That allocation no longer exists. Refresh the page.');
      }
      await deleteAllocationWithSync(allocation);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allocations', jobId] });
      queryClient.invalidateQueries({ queryKey: ['allocations'] });
      queryClient.invalidateQueries({ queryKey: ['rolls'] });
      queryClient.invalidateQueries({ queryKey: ['job', jobId] });
      toast.success('Allocation removed and rolls released');
    },
  });

  const updateAllocationStatusMutation = useMutation({
    mutationFn: async ({ allocationId, status }) => {
      const allocation = allocations.find(a => a.id === allocationId);
      await updateAllocationStatusWithSync(allocationId, status, allocation);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allocations', jobId] });
      queryClient.invalidateQueries({ queryKey: ['allocations'] });
      queryClient.invalidateQueries({ queryKey: ['rolls'] });
      toast.success('Allocation status updated');
    },
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

  const markJobReadyMutation = useMutation({
    mutationFn: async () => {
      await base44.entities.Job.update(jobId, { status: 'Ready' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job', jobId] });
      toast.success('Job marked as ready');
    }
  });

  const addOutsideMaterialMutation = useMutation({
    mutationFn: async (material) => {
      await base44.entities.JobOutsideMaterial.create({
        job_id: jobId,
        ...material
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['outsideMaterials', jobId] });
      setShowOutsideMaterialsDialog(false);
      setOutsideMaterial({
        vendor: '',
        material: '',
        quantity: '',
        quantity_definition: '',
        notes: ''
      });
      toast.success('Outside material added');
    }
  });

  const deleteOutsideMaterialMutation = useMutation({
    mutationFn: async (materialId) => {
      await base44.entities.JobOutsideMaterial.delete(materialId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['outsideMaterials', jobId] });
      toast.success('Material removed');
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

      // Validate before touching anything — a blank length used to be sent
      // straight to the API, which rejected it and left the dialog looking dead.
      for (const returnItem of returns) {
        if (returnItem.type === 'roll') {
          const roll = allRolls.find(r => r.id === returnItem.id);
          const tag = roll?.tt_sku_tag_number || roll?.roll_tag || 'this roll';
          const isZeroLength =
            returnItem.condition === 'Scrapped' || returnItem.condition === 'Consumed';
          const len = parseFloat(returnItem.returned_length_ft);

          if (!isZeroLength) {
            if (!Number.isFinite(len) || len <= 0) {
              throw new Error(
                `${tag}: enter how many feet came back (or mark it Consumed / Scrapped).`,
              );
            }
            if (roll && len > (roll.current_length_ft || 0) + 0.01) {
              throw new Error(
                `${tag}: ${formatFeetInches(len)} came back but only ${formatFeetInches(
                  roll.current_length_ft,
                )} went out.`,
              );
            }
          }
          if (
            returnItem.has_existing_tag === 'new' &&
            !(returnItem.new_tt_sku || '').trim()
          ) {
            throw new Error(`${tag}: enter the new TT SKU tag number.`);
          }
        } else if (returnItem.type === 'inventory_item') {
          const qty = parseFloat(returnItem.returned_quantity);
          if (!Number.isFinite(qty) || qty < 0) {
            const item = inventoryItems.find(i => i.id === returnItem.id);
            throw new Error(
              `${item?.item_name || 'Item'}: enter a valid returned quantity.`,
            );
          }
        }
      }

      for (const returnItem of returns) {
        if (returnItem.type === 'roll') {
          const roll = allRolls.find(r => r.id === returnItem.id);
          if (roll) {
            // Determine final status
            let finalStatus;
            let finalLength = parseFloat(returnItem.returned_length_ft) || 0;

            if (returnItem.condition === 'Scrapped') {
              finalStatus = ROLL_STATUS.SCRAPPED;
              finalLength = 0; // Scrapped rolls have no length
            } else if (returnItem.condition === 'Consumed') {
              // Fully used on this job — keep it out of inventory but keep the
              // job on the record so reports can show where it went.
              finalStatus = ROLL_STATUS.CONSUMED;
              finalLength = 0;
            } else if (returnItem.condition === 'Damaged') {
              finalStatus = ROLL_STATUS.RETURNED_HOLD;
            } else {
              // Check if required fields are missing
              const hasLocation = returnItem.location_id && returnItem.location_id.trim() !== '';
              const hasTag = returnItem.has_existing_tag === 'existing' || (returnItem.has_existing_tag === 'new' && returnItem.new_tt_sku && returnItem.new_tt_sku.trim() !== '');
              const hasCondition = returnItem.condition && returnItem.condition.trim() !== '';
              
              if (!hasLocation || !hasTag || !hasCondition) {
                finalStatus = ROLL_STATUS.AWAITING_LOCATION;
              } else {
                finalStatus = ROLL_STATUS.AVAILABLE;
              }
            }

            const finalTTSKU = returnItem.has_existing_tag === 'new' ? returnItem.new_tt_sku : (roll.tt_sku_tag_number || roll.roll_tag);

            // Build transaction notes
            let transactionNotes = `Returned from job ${job.job_number} - Condition: ${returnItem.condition || 'New'}`;
            if (returnItem.has_existing_tag === 'new') {
              transactionNotes += ' - New tag assigned';
            }
            if (returnItem.condition === 'Scrapped' && returnItem.scrapped_length_ft && returnItem.scrapped_width_ft) {
              transactionNotes += ` - Scrapped dimensions: ${returnItem.scrapped_length_ft}ft × ${returnItem.scrapped_width_ft}ft`;
            }
            if (returnItem.location_name) {
              transactionNotes += ` - Location: ${returnItem.location_name}`;
            }

            // Consumed/Scrapped rolls keep their job reference so reports can show
            // where they went; everything else is released back off the job.
            const keepsJobReference =
              finalStatus === ROLL_STATUS.CONSUMED || finalStatus === ROLL_STATUS.SCRAPPED;

            await base44.entities.Roll.update(returnItem.id, {
              status: finalStatus,
              current_length_ft: finalLength,
              tt_sku_tag_number: finalTTSKU || roll.tt_sku_tag_number,
              condition: returnItem.condition || roll.condition || 'New',
              location_id: returnItem.location_id || roll.location_id,
              location_name: returnItem.location_name || roll.location_name,
              allocated_job_id: keepsJobReference ? roll.allocated_job_id || jobId : null,
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
              length_change_ft: finalLength,
              length_before_ft: 0,
              length_after_ft: finalLength,
              performed_by: user.full_name || user.email,
              notes: transactionNotes
            });
          }
        } else if (returnItem.type === 'inventory_item') {
          const inventoryItem = inventoryItems.find(i => i.id === returnItem.id);
          if (inventoryItem) {
            const returnedQty = parseFloat(returnItem.returned_quantity) || 0;
            const shouldAddToInventory = inventoryItem.partial_return_type !== 'full_unit_only' || returnItem.is_unopened;
            const quantityToAdd = shouldAddToInventory ? returnedQty : 0;

            // Increment inventory quantity (only if should add)
            if (quantityToAdd > 0) {
              await base44.entities.InventoryItem.update(returnItem.id, {
                quantity_on_hand: (inventoryItem.quantity_on_hand || 0) + quantityToAdd
              });
            }
            
            // Create transaction
            await base44.entities.Transaction.create({
              transaction_type: 'ReturnFromJob',
              fulfillment_for: job.fulfillment_for,
              job_id: jobId,
              job_number: job.job_number,
              product_name: inventoryItem.item_name,
              performed_by: user.full_name || user.email,
              notes: shouldAddToInventory
                ? `Returned ${returnedQty} ${inventoryItem.unit_of_measure} from job ${job.job_number} - Added to inventory`
                : `Returned ${returnedQty} ${inventoryItem.unit_of_measure} from job ${job.job_number} - Used/Opened, not added to inventory`
            });
          }
        }
      }

      // Close out any allocation whose every line has now been received, so those
      // rolls stop showing up as still out on the job.
      const processedIds = new Set(returns.map(r => r.id));
      for (const allocation of returnableAllocations) {
        const lineIds =
          allocation.item_type === 'roll'
            ? allocation.allocated_roll_ids || []
            : [allocation.item_id];
        const allReceived = lineIds.length > 0 && lineIds.every(id => processedIds.has(id));
        if (allReceived) {
          await base44.entities.Allocation.update(allocation.id, {
            status: ALLOCATION_STATUS.COMPLETED,
          });
        }
      }

      // Receiving returns does NOT complete the job — per the warehouse SOP a job
      // is "fulfilled" when it leaves the yard and "complete" when the crew is done.
      // Park it in Awaiting Return Inventory so Complete Job stays available and
      // more returns can still be received.
      if (job.status !== 'Completed') {
        await base44.entities.Job.update(jobId, { status: 'AwaitingReturnInventory' });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job', jobId] });
      queryClient.invalidateQueries({ queryKey: ['allocations', jobId] });
      queryClient.invalidateQueries({ queryKey: ['allocations'] });
      queryClient.invalidateQueries({ queryKey: ['rolls'] });
      queryClient.invalidateQueries({ queryKey: ['inventoryItems'] });
      queryClient.invalidateQueries({ queryKey: ['returnTransactions', jobId] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      setShowReceiveReturns(false);
      setReturnItems([]);
      setReturnInventoryItems([]);
      toast.success('Returns processed. Click Complete Job when the crew is finished.');
    },
    onError: (error) => {
      console.error('[Receive returns] failed:', error);
      toast.error(describeError(error));
    },
  });

  const dispatchJobMutation = useMutation({
    mutationFn: async () => {
      const user = await base44.auth.me();

      // Only live allocations get fulfilled. Sweeping Cancelled/Completed ones back
      // to Dispatched used to resurrect released rolls onto the job.
      const toDispatch = allocations.filter(
        a =>
          a.status !== ALLOCATION_STATUS.CANCELLED &&
          a.status !== ALLOCATION_STATUS.COMPLETED &&
          a.status !== ALLOCATION_STATUS.DISPATCHED,
      );

      if (toDispatch.length === 0) {
        throw new Error(
          'Nothing on this job is ready to fulfil. Add products to the job first.',
        );
      }

      await base44.entities.Job.update(jobId, { status: 'Dispatched' });

      for (const allocation of toDispatch) {
        if (allocation.item_type === 'roll' && allocation.allocated_roll_ids?.length > 0) {
          for (const rollId of allocation.allocated_roll_ids) {
            await base44.entities.Roll.update(rollId, {
              status: ROLL_STATUS.DISPATCHED,
              allocated_job_id: jobId,
            });

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
                notes: `Fulfilled to job ${job.job_number}`
              });
            }
          }
        } else if (allocation.item_type === 'inventory_item') {
          // Decrement inventory item quantity
          const inventoryItem = inventoryItems.find(i => i.id === allocation.item_id);
          if (inventoryItem) {
            // Clamp at zero — going negative silently corrupted the on-hand count.
            const shipped = parseFloat(allocation.requested_quantity) || 1;
            await base44.entities.InventoryItem.update(allocation.item_id, {
              quantity_on_hand: Math.max(0, (inventoryItem.quantity_on_hand || 0) - shipped)
            });

            // Create transaction
            await base44.entities.Transaction.create({
              transaction_type: 'SendOutToJob',
              fulfillment_for: job.fulfillment_for,
              job_id: jobId,
              job_number: job.job_number,
              product_name: inventoryItem.item_name,
              performed_by: user.full_name || user.email,
              notes: `Fulfilled ${allocation.requested_quantity || 1} ${inventoryItem.unit_of_measure} to job ${job.job_number}`
            });
          }
        }
        
        await base44.entities.Allocation.update(allocation.id, {
          status: ALLOCATION_STATUS.DISPATCHED,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job', jobId] });
      queryClient.invalidateQueries({ queryKey: ['allocations', jobId] });
      queryClient.invalidateQueries({ queryKey: ['rolls'] });
      queryClient.invalidateQueries({ queryKey: ['inventoryItems'] });
      toast.success('Job dispatched successfully');
    },
    onError: (error) => {
      console.error('[Dispatch] failed:', error);
      toast.error(`Couldn't mark as fulfilled: ${describeError(error)}`);
    }
  });

  const handleToggleItem = (item) => {
    const exists = selectedItems.find(i => i.id === item.id && i.type === item.type);
    if (exists) {
      setSelectedItems(prev => prev.filter(i => !(i.id === item.id && i.type === item.type)));
    } else {
      const newItem = { ...item };
      if (item.type === 'inventory_item') {
        newItem.requested_quantity = 1;
      }
      setSelectedItems(prev => [...prev, newItem]);
    }
  };

  const handleQuantityChange = (itemId, itemType, quantity) => {
    setSelectedItems(prev => prev.map(i => 
      i.id === itemId && i.type === itemType 
        ? { ...i, requested_quantity: quantity }
        : i
    ));
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
  // "Allocated" = anything from Planned phase onward (excluding Cancelled/Completed).
  // Reflects all rolls assigned to the job regardless of fulfillment progress.
  const ALLOCATED_STATUSES = ['Planned', 'Allocated', 'Staged', 'Dispatched'];
  const totalAllocatedSentOut = turfAllocations
    .filter(a => ALLOCATED_STATUSES.includes(a.status))
    .reduce((sum, a) => sum + (a.requested_length_ft || 0), 0);
  
  const totalReturned = returnTransactions.reduce((sum, t) => sum + (t.length_change_ft || 0), 0);
  const totalUsed = totalAllocatedSentOut - totalReturned;
  const turfVariance = totalUsed - (job.requested_total_turf_length_ft || 0);

  // Anything still live on the job can come back. Previously this only accepted
  // allocations at exactly 'Dispatched', so a job whose allocations sat at
  // Allocated or Staged showed "No items were sent out for this job" and the
  // returns could never be received.
  const returnableAllocations = allocations.filter(
    a =>
      a.status !== ALLOCATION_STATUS.CANCELLED &&
      a.status !== ALLOCATION_STATUS.COMPLETED,
  );

  const allocatedRollIds = returnableAllocations
    .filter(a => a.item_type === 'roll')
    .flatMap(a => a.allocated_roll_ids || []);

  const availableRollsForReturn = allRolls.filter(r => allocatedRollIds.includes(r.id));

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
              onClick={() => markJobReadyMutation.mutate()}
              disabled={markJobReadyMutation.isPending}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              Mark as Ready
            </Button>
          )}
          {job.status === 'Ready' && (
            <Button 
              onClick={() => dispatchJobMutation.mutate()}
              disabled={dispatchJobMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Send className="h-4 w-4 mr-2" />
              Mark as Fulfilled
            </Button>
          )}
          {/* Returns are receivable for every owner, and stay receivable after the
              job moves to Awaiting Return Inventory — previously TurfCasa jobs had
              no returns path at all and the button vanished after the first batch. */}
          {(job.status === 'Dispatched' || job.status === 'AwaitingReturnInventory') && (
            <Button
              onClick={() => setShowReceiveReturns(true)}
              className="bg-amber-600 hover:bg-amber-700"
            >
              Receive Returns
            </Button>
          )}
          {(job.status === 'Dispatched' || job.status === 'AwaitingReturnInventory') && (
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
                  {format(parseLocalDate(job.scheduled_date), 'MMMM d, yyyy')}
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
                <p className="text-sm text-slate-500 mb-1">Requested (LF)</p>
                <p className="text-2xl font-bold text-slate-800">
                  {job.requested_total_turf_length_ft || 0} ft
                </p>
              </div>
              <div className="p-4 bg-blue-50 rounded-lg">
                <p className="text-sm text-slate-500 mb-1">Allocated</p>
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



      {/* Outside Materials */}
      {outsideMaterials.length > 0 && (
        <Card className="rounded-2xl border-slate-100 shadow-sm overflow-hidden dark:bg-[#2d2d2d]">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg dark:text-white">Outside Materials (Informational)</CardTitle>
            <Button 
              size="sm" 
              onClick={() => setShowOutsideMaterialsDialog(true)}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Material
            </Button>
          </CardHeader>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50 dark:bg-slate-800/50">
                  <TableHead className="dark:text-slate-300">Vendor</TableHead>
                  <TableHead className="dark:text-slate-300">Material</TableHead>
                  <TableHead className="dark:text-slate-300">Quantity</TableHead>
                  <TableHead className="dark:text-slate-300">Notes</TableHead>
                  <TableHead className="dark:text-slate-300">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {outsideMaterials.map((material) => (
                  <TableRow key={material.id} className="dark:hover:bg-slate-800/30">
                    <TableCell className="font-medium dark:text-white">{material.vendor}</TableCell>
                    <TableCell className="dark:text-slate-300">{material.material}</TableCell>
                    <TableCell className="dark:text-slate-300">
                      {material.quantity} {material.quantity_definition}
                    </TableCell>
                    <TableCell className="text-slate-600 dark:text-slate-400 text-sm">
                      {material.notes || '-'}
                    </TableCell>
                    <TableCell>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => deleteOutsideMaterialMutation.mutate(material.id)}
                        disabled={deleteOutsideMaterialMutation.isPending}
                        className="text-red-500 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {!outsideMaterials.length && (
        <Button 
          variant="outline"
          onClick={() => setShowOutsideMaterialsDialog(true)}
          className="w-full"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Outside Materials (picked up from external vendors)
        </Button>
      )}

      {/* Returned Items */}
      {returnTransactions.length > 0 && (
        <Card className="rounded-2xl border-slate-100 shadow-sm overflow-hidden dark:bg-[#2d2d2d]">
          <CardHeader>
            <CardTitle className="text-lg dark:text-white">Returned Items</CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50 dark:bg-slate-800/50">
                  <TableHead className="dark:text-slate-300">Type</TableHead>
                  <TableHead className="dark:text-slate-300">Item Name</TableHead>
                  <TableHead className="dark:text-slate-300">Details</TableHead>
                  <TableHead className="dark:text-slate-300">Status/Condition</TableHead>
                  <TableHead className="dark:text-slate-300">Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {returnTransactions.map((transaction) => {
                  const isTurfRoll = !!transaction.roll_id;
                  const roll = isTurfRoll ? allRolls.find(r => r.id === transaction.roll_id) : null;
                  
                  return (
                    <TableRow key={transaction.id} className="dark:hover:bg-slate-800/30">
                      <TableCell>
                        <StatusBadge 
                          status={isTurfRoll ? "Roll" : "Item"} 
                          size="sm" 
                        />
                      </TableCell>
                      <TableCell className="font-medium dark:text-white">
                        {isTurfRoll && roll ? (
                          <Link 
                            to={createPageUrl('RollDetail') + `?id=${roll.id}`}
                            className="text-blue-600 hover:text-blue-800 hover:underline"
                          >
                            {transaction.product_name}
                          </Link>
                        ) : (
                          transaction.product_name
                        )}
                      </TableCell>
                      <TableCell className="dark:text-slate-300">
                        {isTurfRoll ? (
                          <>
                            {formatFeetInches(transaction.width_ft)} × {formatFeetInches(transaction.length_after_ft)}
                            {transaction.dye_lot && ` • Dye Lot: ${transaction.dye_lot}`}
                          </>
                        ) : (
                          transaction.notes?.match(/Returned (\S+)/)?.[1] || '-'
                        )}
                      </TableCell>
                      <TableCell>
                        {isTurfRoll ? (
                          <StatusBadge status={roll?.status || 'Unknown'} size="sm" />
                        ) : (
                          <span className={`inline-flex items-center px-3 py-1 text-sm font-medium rounded-full ${
                            transaction.notes?.includes('Added to inventory')
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                              : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                          }`}>
                            {transaction.notes?.includes('Added to inventory') ? 'Added to Inventory' : 'Not Added'}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-slate-600 dark:text-slate-400 text-sm">
                        {transaction.notes}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {/* Allocations */}
      <Card className="rounded-2xl border-slate-100 shadow-sm overflow-hidden dark:bg-[#2d2d2d]">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg dark:text-white">Allocations</CardTitle>
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
                                     <StatusBadge status={item.roll_type || 'Parent'} size="sm" />
                                   </div>
                                   <p className="text-sm font-medium text-slate-800 mt-1">
                                     {item.product_name}
                                   </p>
                                   <div className="flex gap-3 mt-1 text-sm text-slate-600">
                                     <span>Dye Lot: {item.dye_lot}</span>
                                     <span>•</span>
                                     <span>{formatFeetInches(item.width_ft)} × {formatFeetInches(item.current_length_ft)}</span>
                                     <span>•</span>
                                     <span>{item.location_bin && item.location_row ? `${item.location_bin}-${item.location_row}` : 'No location'}</span>
                                   </div>
                                 </>
                                ) : (
                                 <>
                                   <p className="font-medium text-slate-800">{item.item_name}</p>
                                   <p className="text-sm text-slate-600 mt-1">
                                     SKU: {item.sku || 'N/A'} • {item.unit_of_measure} • Available: {item.quantity_on_hand || 0}
                                   </p>
                                   {isSelected && (
                                     <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                                       <Label className="text-xs font-semibold">Quantity Needed</Label>
                                       <Input
                                         type="number"
                                         min="1"
                                         max={item.quantity_on_hand || 999}
                                         step="0.25"
                                         value={isSelected.requested_quantity || 1}
                                         onChange={(e) => handleQuantityChange(item.id, itemType, e.target.value === '' ? '' : parseFloat(e.target.value))}
                                         className="mt-1 w-24"
                                       />
                                     </div>
                                   )}
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
                <TableHead>Roll #</TableHead>
                <TableHead>Details</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allocations.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-slate-500">
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
                           status={allRolls.find(r => allocation.allocated_roll_ids?.includes(r.id))?.roll_type || 'Parent'} 
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
                    <TableCell className="font-medium">
                     {allocation.item_type === 'roll' && allocation.allocated_roll_ids?.length > 0 ? (
                       <Link 
                         to={createPageUrl('RollDetail') + `?id=${allocation.allocated_roll_ids[0]}`}
                         className="text-blue-600 hover:text-blue-800 hover:underline"
                       >
                         {allocation.product_name}
                       </Link>
                     ) : allocation.item_type === 'inventory_item' && allocation.item_id ? (
                       <Link 
                         to={createPageUrl('InventoryItems')}
                         className="text-blue-600 hover:text-blue-800 hover:underline"
                       >
                         {allocation.product_name}
                       </Link>
                     ) : (
                       allocation.product_name
                     )}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-slate-600">
                      {allocation.item_type === 'roll' && allocation.allocated_roll_ids?.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {allocation.allocated_roll_ids.map(rid => {
                            const r = allRolls.find(x => x.id === rid);
                            const tag = r?.tt_sku_tag_number || r?.roll_tag || rid.slice(0, 6);
                            return (
                              <Link
                                key={rid}
                                to={createPageUrl('RollDetail') + `?id=${rid}`}
                                className="bg-slate-100 hover:bg-slate-200 px-2 py-0.5 rounded"
                                title={
                                  r?.manufacturer_roll_number
                                    ? `Manufacturer roll # ${r.manufacturer_roll_number}`
                                    : undefined
                                }
                              >
                                {tag}
                                {r?.manufacturer_roll_number && (
                                  <span className="ml-1 text-slate-400">
                                    / {r.manufacturer_roll_number}
                                  </span>
                                )}
                              </Link>
                            );
                          })}
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-slate-600">
                      {allocation.item_type === 'roll' ? (
                        <>
                          {formatFeetInches(allocation.width_ft)} × {formatFeetInches(allocation.requested_length_ft)}
                          {allocation.dye_lot_preference && ` • Dye Lot: ${allocation.dye_lot_preference}`}
                        </>
                      ) : (
                        <>
                          {allocation.requested_quantity || 1} {allocation.unit_of_measure || 'unit'}
                        </>
                      )}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={allocation.status || ALLOCATION_STATUS.PLANNED}
                        onValueChange={(newStatus) => updateAllocationStatusMutation.mutate({ allocationId: allocation.id, status: newStatus })}
                        disabled={updateAllocationStatusMutation.isPending}
                      >
                        <SelectTrigger className="w-32 h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ALLOCATION_STATUS_OPTIONS.map(s => (
                            <SelectItem key={s} value={s}>{STATUS_LABELS[s] || s}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        {allocation.item_type === 'roll' && allocation.status === 'Allocated' && allocation.allocated_roll_ids?.[0] && (
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => {
                              const roll = allRolls.find(r => r.id === allocation.allocated_roll_ids[0]);
                              setSwapAllocation(allocation);
                              setSwapCurrentRoll(roll);
                              setShowSwapDialog(true);
                            }}
                            className="text-blue-600 hover:text-blue-700"
                          >
                            <RefreshCw className="h-4 w-4" />
                          </Button>
                        )}
                        {/* Removable at any stage. This used to be disabled unless the
                            job was still a Draft, which is why the trash icon looked
                            like a dead button on every live job. */}
                        <Button
                          variant="ghost"
                          size="sm"
                          title="Remove from job and release the roll back to inventory"
                          onClick={() => {
                            const shipped =
                              allocation.status === ALLOCATION_STATUS.DISPATCHED;
                            if (
                              shipped &&
                              !window.confirm(
                                `${allocation.product_name} is already marked fulfilled. Remove it from this job and put it back in inventory as Available?`,
                              )
                            ) {
                              return;
                            }
                            deleteAllocationMutation.mutate(allocation.id);
                          }}
                          disabled={deleteAllocationMutation.isPending}
                          className="text-red-500 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
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
              {returnableAllocations.length === 0 ? (
                <div className="p-8 text-center text-slate-500">
                  Nothing is currently allocated to this job, so there's nothing to
                  receive back. If a roll came back anyway, use the link below.
                </div>
              ) : (
                returnableAllocations.map(allocation => {
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
                                  returned_quantity: allocation.requested_quantity || 1,
                                  is_unopened: true
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
                              <div className="mt-3 p-3 bg-slate-50 rounded-lg space-y-3">
                                <div>
                                  <Label className="text-xs font-semibold">
                                    Returned Quantity * 
                                    {item.partial_return_type === 'quarter_yard' && ' (¼ yd³ increments)'}
                                    {item.partial_return_type === 'quarter_pail' && ' (¼ pail increments)'}
                                    {item.partial_return_type === 'by_foot' && ' (feet)'}
                                  </Label>
                                  <Input
                                    type="number"
                                    step={item.partial_return_type === 'quarter_yard' || item.partial_return_type === 'quarter_pail' ? '0.25' : '1'}
                                    value={returnItem.returned_quantity}
                                    onChange={(e) => {
                                     const inputValue = e.target.value;
                                     let value = inputValue === '' ? '' : parseFloat(inputValue);
                                     if (typeof value === 'number' && (item.partial_return_type === 'quarter_yard' || item.partial_return_type === 'quarter_pail')) {
                                       value = Math.round(value * 4) / 4;
                                     }
                                     setReturnInventoryItems(prev => prev.map(r => 
                                       r.id === item.id 
                                         ? { ...r, returned_quantity: value }
                                         : r
                                     ));
                                    }}
                                    placeholder="0"
                                    className="mt-1"
                                  />
                                </div>
                                {item.partial_return_type === 'full_unit_only' && (
                                  <div>
                                    <Label className="text-xs font-semibold">Condition *</Label>
                                    <Select
                                      value={returnItem.is_unopened ? 'unopened' : 'used'}
                                      onValueChange={(v) => {
                                        setReturnInventoryItems(prev => prev.map(r => 
                                          r.id === item.id 
                                            ? { ...r, is_unopened: v === 'unopened', returned_quantity: v === 'unopened' ? returnItem.returned_quantity : 0 }
                                            : r
                                        ));
                                      }}
                                    >
                                      <SelectTrigger className="mt-1">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="unopened">Unopened/Whole - Add to inventory</SelectItem>
                                        <SelectItem value="used">Opened/Used - Do not add to inventory</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                )}
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
                    const roll = availableRollsForReturn.find(r => r.id === rollId);
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
                                  returned_length_ft: '',
                                  has_existing_tag: 'existing',
                                  new_tt_sku: '',
                                  condition: 'New',
                                  location_id: '',
                                  location_name: '',
                                  scrapped_length_ft: '',
                                  scrapped_width_ft: ''
                                  }]);
                              } else {
                                setReturnItems(prev => prev.filter(r => r.id !== rollId));
                              }
                            }}
                            className="mt-1"
                          />
                          <div className="flex-1">
                            <p className="font-medium">
                              {roll.tt_sku_tag_number || roll.roll_tag || 'No tag'}
                              {(!roll.tt_sku_tag_number || roll.tt_sku_tag_number === 'na') && (
                                <span className="ml-2 text-xs font-normal text-amber-600">(no tag — please assign one)</span>
                              )}
                            </p>
                            <p className="text-sm text-slate-600">
                              {roll.product_name} • {formatFeetInches(roll.width_ft)} × {formatFeetInches(roll.current_length_ft)} • Dye Lot: {roll.dye_lot}
                            </p>
                            <p className="text-xs text-slate-500 mt-1">
                              Type: {roll.roll_type || 'Parent'} • Status: {roll.status}
                              {roll.parent_tt_sku_tag_number && (
                                <> • From parent <span className="font-mono">{roll.parent_tt_sku_tag_number}</span></>
                              )}
                              {' '}• Job <span className="font-medium">{job.job_number}</span>
                            </p>
                            
                            {returnItem && (
                              <div className="mt-3 space-y-3 p-3 bg-slate-50 rounded-lg">
                                {/* 1. Condition first */}
                                <div>
                                 <Label className="text-xs font-semibold">Condition *</Label>
                                 <Select
                                   value={returnItem.condition}
                                   onValueChange={(v) => {
                                     setReturnItems(prev => prev.map(r => 
                                       r.id === rollId 
                                         ? { 
                                             ...r,
                                             condition: v,
                                             // Nothing re-enters inventory, so no new tag is needed
                                             has_existing_tag:
                                               v === 'Scrapped' || v === 'Consumed'
                                                 ? 'existing'
                                                 : r.has_existing_tag,
                                             new_tt_sku:
                                               v === 'Scrapped' || v === 'Consumed'
                                                 ? ''
                                                 : r.new_tt_sku,
                                           }
                                         : r
                                     ));
                                   }}
                                 >
                                   <SelectTrigger className="mt-1">
                                     <SelectValue />
                                   </SelectTrigger>
                                   <SelectContent>
                                     <SelectItem value="New">New — add back to inventory</SelectItem>
                                     <SelectItem value="Damaged">Damaged — hold for review</SelectItem>
                                     <SelectItem value="Consumed">Consumed — fully used on this job</SelectItem>
                                     <SelectItem value="Scrapped">Scrapped — written off, do not add to inventory</SelectItem>
                                   </SelectContent>
                                 </Select>
                                </div>

                                {/* 2. Tag question — only for rolls that re-enter inventory */}
                                {returnItem.condition !== 'Scrapped' &&
                                  returnItem.condition !== 'Consumed' && (
                                  <>
                                    <div>
                                     <Label className="text-xs font-semibold">Does this roll have a tag?</Label>
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
                                       <Label className="text-xs font-semibold">New TT SKU Tag Number</Label>
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
                                  </>
                                )}

                                {/* 3. Dimensions. Consumed/Scrapped rolls come back at
                                       zero length, so the field would only confuse. */}
                                {returnItem.condition !== 'Scrapped' &&
                                  returnItem.condition !== 'Consumed' && (
                                  <div>
                                    <Label className="text-xs font-semibold">Returned Length (ft) *</Label>
                                    <Input
                                      type="number"
                                      step="0.01"
                                      min="0"
                                      max={roll.current_length_ft || undefined}
                                      value={returnItem.returned_length_ft}
                                      onChange={(e) => {
                                       const value = e.target.value === '' ? '' : parseFloat(e.target.value);
                                       setReturnItems(prev => prev.map(r =>
                                         r.id === rollId
                                           ? { ...r, returned_length_ft: value }
                                           : r
                                       ));
                                      }}
                                      placeholder="0"
                                      className="mt-1"
                                    />
                                    <p className="text-xs text-slate-500 mt-1">
                                      Went out at {formatFeetInches(roll.current_length_ft)}.
                                      Enter how much came back.
                                    </p>
                                  </div>
                                )}

                                {returnItem.condition === 'Scrapped' && (
                                  <div>
                                    <Label className="text-xs font-semibold">Scrapped Dimensions *</Label>
                                    <div className="flex gap-2 mt-1">
                                      <Input
                                        type="number"
                                        placeholder="Length (ft)"
                                        value={returnItem.scrapped_length_ft}
                                        onChange={(e) => setReturnItems(prev => prev.map(r => 
                                          r.id === rollId ? { ...r, scrapped_length_ft: e.target.value === '' ? '' : parseFloat(e.target.value) } : r
                                        ))}
                                        className="w-1/2"
                                      />
                                      <Input
                                        type="number"
                                        placeholder="Width (ft)"
                                        value={returnItem.scrapped_width_ft}
                                        onChange={(e) => setReturnItems(prev => prev.map(r => 
                                          r.id === rollId ? { ...r, scrapped_width_ft: e.target.value === '' ? '' : parseFloat(e.target.value) } : r
                                        ))}
                                        className="w-1/2"
                                      />
                                    </div>
                                  </div>
                                )}

                                <div>
                                 <Label className="text-xs font-semibold">Location</Label>
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

            <div className="pt-3 mt-3 border-t border-slate-100 text-center">
              <button
                type="button"
                onClick={() => {
                  setShowReceiveReturns(false);
                  setShowUnmarkedReturns(true);
                }}
                className="text-sm text-slate-500 hover:text-slate-800 underline"
              >
                Receive an unidentified roll (unknown or different job)
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Unmarked returns dialog (fallback when source is unknown) */}
      <Dialog open={showUnmarkedReturns} onOpenChange={setShowUnmarkedReturns}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Receive without a job</DialogTitle>
          </DialogHeader>
          <UnmarkedReturnForm
            onCancel={() => setShowUnmarkedReturns(false)}
            onSuccess={() => setShowUnmarkedReturns(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Outside Materials Dialog */}
      <Dialog open={showOutsideMaterialsDialog} onOpenChange={setShowOutsideMaterialsDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Outside Material</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Vendor *</Label>
              <Input
                value={outsideMaterial.vendor}
                onChange={(e) => setOutsideMaterial(p => ({ ...p, vendor: e.target.value }))}
                placeholder="Where material was picked up"
                className="mt-1"
              />
            </div>
            <div>
              <Label>Material *</Label>
              <Input
                value={outsideMaterial.material}
                onChange={(e) => setOutsideMaterial(p => ({ ...p, material: e.target.value }))}
                placeholder="Material name/description"
                className="mt-1"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Quantity *</Label>
                <Input
                  type="number"
                  value={outsideMaterial.quantity}
                  onChange={(e) => setOutsideMaterial(p => ({ ...p, quantity: parseFloat(e.target.value) }))}
                  placeholder="0"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Unit *</Label>
                <Input
                  value={outsideMaterial.quantity_definition}
                  onChange={(e) => setOutsideMaterial(p => ({ ...p, quantity_definition: e.target.value }))}
                  placeholder="yards, tons, sq ft"
                  className="mt-1"
                />
              </div>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea
                value={outsideMaterial.notes}
                onChange={(e) => setOutsideMaterial(p => ({ ...p, notes: e.target.value }))}
                placeholder="Additional notes"
                rows={2}
                className="mt-1"
              />
            </div>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                onClick={() => setShowOutsideMaterialsDialog(false)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button 
                onClick={() => addOutsideMaterialMutation.mutate(outsideMaterial)}
                disabled={!outsideMaterial.vendor || !outsideMaterial.material || !outsideMaterial.quantity || !outsideMaterial.quantity_definition}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700"
              >
                Add Material
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Swap Roll Dialog */}
      <SwapRollDialog
        open={showSwapDialog}
        onOpenChange={setShowSwapDialog}
        allocation={swapAllocation}
        job={job}
        currentRoll={swapCurrentRoll}
      />
    </div>
  );
}