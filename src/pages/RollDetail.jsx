import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import {
  ArrowLeft,
  Scissors,
  Briefcase,
  RotateCcw,
  Pencil
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import StatusBadge from '@/components/ui/StatusBadge';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  ROLL_STATUS,
  ALLOCATION_STATUS,
  ROLL_STATUS_OPTIONS,
  MANUAL_ROLL_STATUS_OPTIONS,
  ROLL_ACTIVE_JOB_STATUSES,
  STATUS_LABELS,
  createAllocationWithSync,
  setRollStatusManually,
  findActiveAllocationForRoll,
} from '@/lib/rollStatus';
import { formatFeetInches, parseLocalDate } from '@/lib/dateHelpers';
import { describeError } from '@/lib/query-client';

const ROLL_CONDITION_OPTIONS = ['New', 'Good', 'Used', 'Damaged', 'Scrap'];
const ROLL_TYPE_OPTIONS = ['Parent', 'Child'];

export default function RollDetail() {
  const queryClient = useQueryClient();
  const params = new URLSearchParams(window.location.search);
  const rollId = params.get('id');
  const [showPlanDialog, setShowPlanDialog] = useState(false);
  const [showAllocateDialog, setShowAllocateDialog] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState('');
  const [showStatusEditor, setShowStatusEditor] = useState(false);
  const [newStatusValue, setNewStatusValue] = useState('');
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [parentSearch, setParentSearch] = useState('');

  const { data: roll, isLoading } = useQuery({
    queryKey: ['roll', rollId],
    queryFn: () => base44.entities.Roll.filter({ id: rollId }),
    enabled: !!rollId,
    select: (data) => data[0],
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ['transactions', rollId],
    queryFn: () => base44.entities.Transaction.filter({ roll_id: rollId }, '-created_date', 50),
    enabled: !!rollId,
  });

  const mostRecentTxId = transactions[0]?.id;

  const { data: childRolls = [] } = useQuery({
    queryKey: ['childRolls', rollId],
    queryFn: () => base44.entities.Roll.filter({ parent_roll_id: rollId }),
    enabled: !!rollId && roll?.roll_type === 'Parent',
  });

  const { data: parentRoll } = useQuery({
    queryKey: ['parentRoll', roll?.parent_roll_id],
    queryFn: () => base44.entities.Roll.filter({ id: roll.parent_roll_id }),
    enabled: !!roll?.parent_roll_id,
    select: (data) => data[0],
  });

  const { data: jobs = [] } = useQuery({
    queryKey: ['jobs'],
    queryFn: async () => {
      const allJobs = await base44.entities.Job.list();
      return allJobs.filter(j => j.status !== 'Archived');
    },
  });

  const { data: allAllocations = [] } = useQuery({
    queryKey: ['allocations'],
    queryFn: () => base44.entities.Allocation.list(),
  });

  // Must stay above the early returns below so hook order never changes.
  const activeAllocation = useMemo(
    () => (roll?.id ? findActiveAllocationForRoll(roll.id, allAllocations) : null),
    [roll?.id, allAllocations]
  );

  const { data: products = [] } = useQuery({
    queryKey: ['products', 'all'],
    queryFn: () => base44.entities.Product.list('-created_date', 500),
    enabled: showEditDialog,
  });

  const { data: parentCandidates = [] } = useQuery({
    queryKey: ['rolls', 'parentPicker'],
    queryFn: () => base44.entities.Roll.list('-created_date', 1000),
    enabled: showEditDialog && editForm?.roll_type === 'Child',
  });

  const parentMatches = useMemo(() => {
    const term = parentSearch.trim().toLowerCase();
    if (!term) return [];
    return parentCandidates
      .filter(r =>
        r.id !== rollId &&
        r.parent_roll_id !== rollId &&
        (r.tt_sku_tag_number?.toLowerCase().includes(term) ||
          r.roll_tag?.toLowerCase().includes(term) ||
          r.manufacturer_roll_number?.toLowerCase().includes(term))
      )
      .slice(0, 8);
  }, [parentSearch, parentCandidates, rollId]);

  const planForJobMutation = useMutation({
    mutationFn: async (jobId) => {
      console.log('[Plan] Starting plan for job:', jobId, 'roll:', roll?.id);
      if (!jobId) throw new Error('Please pick a job from the list before confirming.');
      if (!roll?.id) throw new Error('Roll data is not loaded yet. Please refresh and try again.');
      const user = await base44.auth.me();
      const job = jobs.find(j => j.id === jobId);
      if (!job) {
        throw new Error(`Job not found in the loaded jobs list. Try refreshing the page.`);
      }

      // createAllocationWithSync also updates roll.status to Planned.
      await createAllocationWithSync({
        job_id: jobId,
        job_name: job.job_name || job.job_number,
        product_id: roll.product_id,
        product_name: roll.product_name,
        width_ft: roll.width_ft,
        dye_lot_preference: roll.dye_lot,
        requested_length_ft: roll.current_length_ft,
        allocated_roll_ids: [roll.id],
        item_type: 'roll',
        status: ALLOCATION_STATUS.PLANNED,
      });

      await base44.entities.Transaction.create({
        transaction_type: 'PlanForJob',
        fulfillment_for: job.fulfillment_for,
        roll_id: roll.id,
        tt_sku_tag_number: roll.tt_sku_tag_number || roll.roll_tag,
        job_id: jobId,
        job_number: job.job_number,
        product_name: roll.product_name,
        dye_lot: roll.dye_lot,
        width_ft: roll.width_ft,
        performed_by: user.full_name || user.email,
        notes: `Planned for job ${job.job_number}`,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roll', rollId] });
      queryClient.invalidateQueries({ queryKey: ['rolls'] });
      queryClient.invalidateQueries({ queryKey: ['allocations'] });
      setShowPlanDialog(false);
      setSelectedJobId('');
      toast.success('Roll planned for job');
    },
    onError: (err) => {
      console.error('planForJobMutation failed:', err);
      toast.error(`Plan failed: ${err?.message || 'Unknown error'}`);
    },
  });

  const allocateForJobMutation = useMutation({
    mutationFn: async (jobId) => {
      console.log('[Allocate] Starting allocation for job:', jobId, 'roll:', roll?.id);
      if (!jobId) throw new Error('Please pick a job from the list before confirming.');
      if (!roll?.id) throw new Error('Roll data is not loaded yet. Please refresh and try again.');
      const user = await base44.auth.me();
      const job = jobs.find(j => j.id === jobId);
      if (!job) {
        throw new Error(`Job not found in the loaded jobs list. Try refreshing the page.`);
      }
      const requestedLength = parseFloat(roll.current_length_ft);
      if (!requestedLength || requestedLength <= 0) {
        throw new Error(`Roll has no usable length (current_length_ft = ${roll.current_length_ft}).`);
      }

      console.log('[Allocate] Calling createAllocationWithSync...');
      await createAllocationWithSync({
        job_id: jobId,
        job_name: job.job_name || job.job_number,
        product_id: roll.product_id,
        product_name: roll.product_name,
        width_ft: roll.width_ft,
        dye_lot_preference: roll.dye_lot,
        requested_length_ft: requestedLength,
        allocated_roll_ids: [roll.id],
        item_type: 'roll',
        status: ALLOCATION_STATUS.ALLOCATED,
      });
      console.log('[Allocate] Allocation created successfully');

      await base44.entities.Transaction.create({
        transaction_type: 'AllocateForJob',
        fulfillment_for: job.fulfillment_for,
        roll_id: roll.id,
        tt_sku_tag_number: roll.tt_sku_tag_number || roll.roll_tag,
        job_id: jobId,
        job_number: job.job_number,
        product_name: roll.product_name,
        dye_lot: roll.dye_lot,
        width_ft: roll.width_ft,
        performed_by: user.full_name || user.email,
        notes: `Allocated for job ${job.job_number}`,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roll', rollId] });
      queryClient.invalidateQueries({ queryKey: ['rolls'] });
      queryClient.invalidateQueries({ queryKey: ['allocations'] });
      setShowAllocateDialog(false);
      setSelectedJobId('');
      toast.success('Roll allocated for job');
    },
    onError: (err) => {
      console.error('allocateForJobMutation failed:', err);
      toast.error(`Allocate failed: ${err?.message || 'Unknown error'}`);
    },
  });

  const changeStatusMutation = useMutation({
    mutationFn: async (newStatus) => {
      const result = await setRollStatusManually(roll, newStatus, allAllocations);
      if (!result.ok) throw new Error(result.error);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roll', rollId] });
      queryClient.invalidateQueries({ queryKey: ['rolls'] });
      queryClient.invalidateQueries({ queryKey: ['allocations'] });
      setShowStatusEditor(false);
      toast.success('Status updated');
    },
    onError: (err) => {
      toast.error(err.message || 'Failed to update status');
    },
  });

  const undoTransactionMutation = useMutation({
    mutationFn: async (tx) => {
      if (tx.length_before_ft == null) throw new Error('No previous length recorded for this transaction');
      if (activeAllocation) {
        throw new Error(
          'This roll is committed to a job. Release it from the job (cancel or delete the allocation) before undoing this transaction.'
        );
      }

      // A cut's child roll is a separate Roll record; leaving it behind would
      // double-count its footage once the parent's length is restored.
      let childRoll = null;
      if (tx.child_roll_id) {
        const found = await base44.entities.Roll.filter({ id: tx.child_roll_id });
        childRoll = found[0] || null;
        if (childRoll) {
          const childLabel = childRoll.tt_sku_tag_number || childRoll.roll_tag || tx.child_roll_id;
          if (findActiveAllocationForRoll(childRoll.id, allAllocations) || childRoll.allocated_job_id ||
              ROLL_ACTIVE_JOB_STATUSES.includes(childRoll.status)) {
            throw new Error(`Child roll ${childLabel} is already committed to a job. Release it first, then undo this cut.`);
          }
          if (childRoll.status === ROLL_STATUS.CONSUMED || childRoll.status === ROLL_STATUS.SCRAPPED) {
            throw new Error(`Child roll ${childLabel} is ${childRoll.status}. It can't be removed, so this cut can't be undone.`);
          }
          const grandChildren = await base44.entities.Roll.filter({ parent_roll_id: childRoll.id });
          if (grandChildren.length > 0) {
            throw new Error(`Child roll ${childLabel} has itself been cut. Undo those cuts first.`);
          }
          const childCurrent = Number(childRoll.current_length_ft);
          const childOriginal = Number(childRoll.original_length_ft);
          if (Number.isFinite(childCurrent) && Number.isFinite(childOriginal) && childCurrent !== childOriginal) {
            throw new Error(`Child roll ${childLabel} is no longer its original length, so this cut can't be undone.`);
          }
        }
      }

      const user = await base44.auth.me();

      await base44.entities.Roll.update(rollId, {
        current_length_ft: tx.length_before_ft,
      });
      if (childRoll) {
        await base44.entities.Roll.delete(childRoll.id);
      }
      const statusResult = await setRollStatusManually(roll, ROLL_STATUS.AVAILABLE, allAllocations);
      if (!statusResult.ok) throw new Error(statusResult.error);

      await base44.entities.Transaction.update(tx.id, {
        notes: `[REVERSED] ${tx.notes || ''}`,
        transaction_type: 'Reversed_' + tx.transaction_type,
      });
      await base44.entities.Transaction.create({
        transaction_type: 'Reversal',
        roll_id: rollId,
        tt_sku_tag_number: tx.tt_sku_tag_number || roll?.tt_sku_tag_number,
        product_name: tx.product_name,
        dye_lot: tx.dye_lot,
        width_ft: tx.width_ft,
        length_change_ft: (tx.length_before_ft || 0) - (tx.length_after_ft || 0),
        length_before_ft: tx.length_after_ft,
        length_after_ft: tx.length_before_ft,
        performed_by: user.full_name || user.email,
        notes: childRoll
          ? `Reversed: ${tx.transaction_type}. Removed child roll ${childRoll.tt_sku_tag_number || childRoll.roll_tag}.`
          : `Reversed: ${tx.transaction_type}`,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roll', rollId] });
      queryClient.invalidateQueries({ queryKey: ['transactions', rollId] });
      queryClient.invalidateQueries({ queryKey: ['childRolls', rollId] });
      queryClient.invalidateQueries({ queryKey: ['rolls'] });
      queryClient.invalidateQueries({ queryKey: ['allocations'] });
      toast.success('Transaction reversed');
    },
    onError: (err) => toast.error(describeError(err)),
  });

  const editRollMutation = useMutation({
    mutationFn: async (form) => {
      const width = Number(form.width_ft);
      const currentLength = Number(form.current_length_ft);
      const originalLength = Number(form.original_length_ft);

      if (!form.product_id) throw new Error('Pick a product.');
      if (!Number.isFinite(width) || width <= 0) throw new Error('Width must be a number greater than zero.');
      if (!Number.isFinite(currentLength) || currentLength <= 0) {
        throw new Error('Current length must be a number greater than zero.');
      }
      if (!Number.isFinite(originalLength) || originalLength <= 0) {
        throw new Error('Original length must be a number greater than zero.');
      }
      if (form.roll_type === 'Child' && !form.parent_roll_id) {
        throw new Error('A child roll needs a parent roll. Pick one, or set the type back to Parent.');
      }

      const user = await base44.auth.me();
      const isChild = form.roll_type === 'Child';

      await base44.entities.Roll.update(rollId, {
        product_id: form.product_id,
        product_name: form.product_name,
        manufacturer_roll_number: form.manufacturer_roll_number || null,
        dye_lot: form.dye_lot || null,
        width_ft: width,
        current_length_ft: currentLength,
        original_length_ft: originalLength,
        condition: form.condition,
        roll_type: form.roll_type,
        notes: form.notes || null,
        // Both link fields have to be rewritten together — a Parent that keeps a
        // parent_roll_id still shows up as somebody's child roll.
        parent_roll_id: isChild ? form.parent_roll_id : null,
        parent_tt_sku_tag_number: isChild ? (form.parent_tt_sku_tag_number || null) : null,
      });

      const rawBefore = Number(roll.current_length_ft);
      const lengthBefore = Number.isFinite(rawBefore) ? rawBefore : null;
      if (lengthBefore !== currentLength) {
        await base44.entities.Transaction.create({
          transaction_type: 'Adjustment',
          roll_id: rollId,
          roll_tag: roll.roll_tag,
          tt_sku_tag_number: roll.tt_sku_tag_number || roll.roll_tag,
          product_name: form.product_name,
          dye_lot: form.dye_lot || null,
          width_ft: width,
          length_before_ft: lengthBefore,
          length_after_ft: currentLength,
          length_change_ft: lengthBefore == null ? null : currentLength - lengthBefore,
          performed_by: user.full_name || user.email,
          notes: 'Manual correction of roll details — length edited by hand, not by a cut, job, or return.',
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roll', rollId] });
      queryClient.invalidateQueries({ queryKey: ['transactions', rollId] });
      queryClient.invalidateQueries({ queryKey: ['childRolls', rollId] });
      queryClient.invalidateQueries({ queryKey: ['rolls'] });
      setShowEditDialog(false);
      toast.success('Roll updated');
    },
    onError: (err) => toast.error(describeError(err)),
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  if (!roll) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-500">Roll not found</p>
        <Link to={createPageUrl('Inventory')}>
          <Button variant="link" className="mt-2">Back to Inventory</Button>
        </Link>
      </div>
    );
  }

  const sqft = Number(roll.current_length_ft) * Number(roll.width_ft);
  const sqftLabel = Number.isFinite(sqft) ? `${Math.round(sqft).toLocaleString()} sq ft` : '—';
  const statusOptions = activeAllocation ? ROLL_STATUS_OPTIONS : MANUAL_ROLL_STATUS_OPTIONS;

  const formatLengthChange = (change) => {
    const n = Number(change);
    if (!Number.isFinite(n)) return '';
    const sign = n > 0 ? '+' : n < 0 ? '-' : '';
    return `${sign}${formatFeetInches(Math.abs(n))}`;
  };

  const undoConfirmMessage = (tx) => {
    const lines = [
      `Undo this ${tx.transaction_type}?`,
      `• Roll length goes back to ${formatFeetInches(tx.length_before_ft)} (from ${formatFeetInches(tx.length_after_ft)}).`,
      '• Roll status is set back to Available and any job link is cleared.',
    ];
    if (tx.child_roll_id) {
      const child = childRolls.find(c => c.id === tx.child_roll_id);
      const childLabel = child ? (child.tt_sku_tag_number || child.roll_tag) : 'the roll this cut created';
      lines.push(`• Child roll ${childLabel} is permanently deleted.`);
    }
    lines.push('', 'This reversal is recorded in the transaction history.');
    return lines.join('\n');
  };

  const openEditDialog = () => {
    setEditForm({
      product_id: roll.product_id || '',
      product_name: roll.product_name || '',
      manufacturer_roll_number: roll.manufacturer_roll_number || '',
      dye_lot: roll.dye_lot || '',
      width_ft: roll.width_ft ?? '',
      current_length_ft: roll.current_length_ft ?? '',
      original_length_ft: roll.original_length_ft ?? '',
      condition: roll.condition || 'New',
      roll_type: roll.roll_type || 'Parent',
      parent_roll_id: roll.parent_roll_id || '',
      parent_tt_sku_tag_number: roll.parent_tt_sku_tag_number || '',
      notes: roll.notes || '',
    });
    setParentSearch('');
    setShowEditDialog(true);
  };

  const patchEditForm = (patch) => setEditForm(f => ({ ...f, ...patch }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link to={createPageUrl('Inventory')}>
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl lg:text-3xl font-bold text-slate-800 font-mono">
                {roll.tt_sku_tag_number || roll.roll_tag}
              </h1>
              <StatusBadge status={roll.roll_type || 'Parent'} />
              <StatusBadge status={roll.status} />
            </div>
            <p className="text-slate-500 mt-1">{roll.product_name} • {roll.dye_lot}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={openEditDialog}>
            <Pencil className="h-4 w-4 mr-2" />
            Edit Roll
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setNewStatusValue(roll.status);
              setShowStatusEditor(true);
            }}
          >
            Edit Status
          </Button>
          {roll.status === ROLL_STATUS.AVAILABLE && roll.current_length_ft > 0 && !activeAllocation && (
            <>
              <Button
                onClick={() => setShowPlanDialog(true)}
                variant="outline"
                className="border-purple-600 text-purple-600 hover:bg-purple-50"
              >
                <Briefcase className="h-4 w-4 mr-2" />
                Plan for Job
              </Button>
              <Button
                onClick={() => setShowAllocateDialog(true)}
                variant="outline"
                className="border-yellow-600 text-yellow-600 hover:bg-yellow-50"
              >
                <Briefcase className="h-4 w-4 mr-2" />
                Allocate for Job
              </Button>
              <Link to={createPageUrl(`CutRoll?roll_id=${roll.id}`)}>
                <Button className="bg-emerald-600 hover:bg-emerald-700">
                  <Scissors className="h-4 w-4 mr-2" />
                  Cut Roll
                </Button>
              </Link>
            </>
          )}
          {ROLL_ACTIVE_JOB_STATUSES.includes(roll.status) && roll.allocated_job_id && (
            <Link to={createPageUrl(`JobDetail?id=${roll.allocated_job_id}`)}>
              <Button
                variant="outline"
                className="border-blue-600 text-blue-600 hover:bg-blue-50"
              >
                <Briefcase className="h-4 w-4 mr-2" />
                View Job
              </Button>
            </Link>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Info */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="rounded-2xl border-slate-100 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Roll Information</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-6">
              <div>
                <p className="text-sm text-slate-500 mb-1">Vendor</p>
                <p className="font-medium text-slate-800">{roll.vendor_name || roll.vendor || '-'}</p>
              </div>
              <div>
                <p className="text-sm text-slate-500 mb-1">Product</p>
                <p className="font-medium text-slate-800">{roll.product_name}</p>
              </div>
              <div>
                <p className="text-sm text-slate-500 mb-1">Manufacturer Roll #</p>
                <p className="font-medium text-slate-800">{roll.manufacturer_roll_number || '-'}</p>
              </div>
              <div>
                <p className="text-sm text-slate-500 mb-1">Dye Lot</p>
                <p className="font-medium text-slate-800">{roll.dye_lot}</p>
              </div>
              <div>
                <p className="text-sm text-slate-500 mb-1">Width</p>
                <p className="font-medium text-slate-800">{formatFeetInches(roll.width_ft)}</p>
              </div>
              <div>
                <p className="text-sm text-slate-500 mb-1">Current Length</p>
                <p className="font-medium text-slate-800">{formatFeetInches(roll.current_length_ft)}</p>
              </div>
              <div>
                <p className="text-sm text-slate-500 mb-1">Original Length</p>
                <p className="font-medium text-slate-800">{formatFeetInches(roll.original_length_ft)}</p>
              </div>
              <div>
                <p className="text-sm text-slate-500 mb-1">Current Sq Ft</p>
                <p className="font-medium text-slate-800">{sqftLabel}</p>
              </div>
              <div>
                <p className="text-sm text-slate-500 mb-1">Location</p>
                <p className="font-medium text-slate-800">{roll.location_name || '-'}</p>
              </div>
              <div>
                <p className="text-sm text-slate-500 mb-1">Condition</p>
                <StatusBadge status={roll.condition} size="sm" />
              </div>
              {roll.custom_roll_sku && (
                <div>
                  <p className="text-sm text-slate-500 mb-1">Custom SKU</p>
                  <p className="font-mono text-slate-800">{roll.custom_roll_sku}</p>
                </div>
              )}
              {roll.vendor && roll.vendor !== roll.vendor_name && (
                <div>
                  <p className="text-sm text-slate-500 mb-1">Vendor (as entered)</p>
                  <p className="font-medium text-slate-800">{roll.vendor}</p>
                </div>
              )}
              {roll.purchase_order && (
                <div>
                  <p className="text-sm text-slate-500 mb-1">PO#</p>
                  <p className="font-medium text-slate-800">{roll.purchase_order}</p>
                </div>
              )}
              {parseLocalDate(roll.date_received) && (
                <div>
                  <p className="text-sm text-slate-500 mb-1">Date Received</p>
                  <p className="font-medium text-slate-800">
                    {format(parseLocalDate(roll.date_received), 'MMM d, yyyy')}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Parent Roll Info (for child rolls) */}
          {roll.roll_type === 'Child' && parentRoll && (
            <Card className="rounded-2xl border-slate-100 shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg">Parent Roll</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-slate-500 mb-1">TT SKU #</p>
                    <p className="font-mono font-medium text-slate-800">
                      {parentRoll.tt_sku_tag_number || parentRoll.roll_tag}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-500 mb-1">Manufacturer Roll #</p>
                    <p className="font-medium text-slate-800">{parentRoll.manufacturer_roll_number || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-500 mb-1">Product</p>
                    <p className="font-medium text-slate-800">{parentRoll.product_name}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-500 mb-1">Dye Lot</p>
                    <p className="font-medium text-slate-800">{parentRoll.dye_lot}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-500 mb-1">Current Length</p>
                    <p className="font-medium text-slate-800">{formatFeetInches(parentRoll.current_length_ft)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-500 mb-1">Status</p>
                    <StatusBadge status={parentRoll.status} size="sm" />
                  </div>
                </div>
                <Link 
                  to={createPageUrl(`RollDetail?id=${roll.parent_roll_id}`)}
                  className="inline-block text-emerald-600 hover:text-emerald-700 font-medium text-sm"
                >
                  View Full Parent Details →
                </Link>
              </CardContent>
            </Card>
          )}

          {/* Child Rolls (for parent rolls) */}
          {roll.roll_type === 'Parent' && childRolls.length > 0 && (
            <Card className="rounded-2xl border-slate-100 shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg">Child Rolls ({childRolls.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {childRolls.map(child => (
                    <Link
                      key={child.id}
                      to={createPageUrl(`RollDetail?id=${child.id}`)}
                      className="block p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-mono text-sm font-medium">
                          {child.tt_sku_tag_number || child.roll_tag}
                        </span>
                        <StatusBadge status={child.status} size="sm" />
                      </div>
                      <div className="flex items-center gap-4 text-xs text-slate-600">
                        <span>{formatFeetInches(child.width_ft)} × {formatFeetInches(child.current_length_ft)}</span>
                        <span>•</span>
                        <span>Dye Lot: {child.dye_lot}</span>
                        {child.location_bin && child.location_row && (
                          <>
                            <span>•</span>
                            <span>Location: {child.location_bin}-{child.location_row}</span>
                          </>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Notes */}
          {roll.notes && (
            <Card className="rounded-2xl border-slate-100 shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg">Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-slate-600">{roll.notes}</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Transaction History */}
        <div className="lg:col-span-1">
          <Card className="rounded-2xl border-slate-100 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Transaction History</CardTitle>
            </CardHeader>
            <CardContent>
              {transactions.length === 0 ? (
                <p className="text-slate-500 text-sm">No transactions yet</p>
              ) : (
                <div className="space-y-4">
                  {transactions.map((tx) => {
                    const canUndo = tx.id === mostRecentTxId &&
                      tx.length_before_ft != null &&
                      !tx.transaction_type?.startsWith('Reversed_') &&
                      tx.transaction_type !== 'Reversal';
                    const lengthChangeLabel = formatLengthChange(tx.length_change_ft);
                    return (
                      <div key={tx.id} className={`flex gap-3 ${tx.transaction_type?.startsWith('Reversed_') || tx.transaction_type === 'Reversal' ? 'opacity-50' : ''}`}>
                        <div className="w-2 h-2 bg-emerald-500 rounded-full mt-2 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-medium text-sm text-slate-800">{tx.transaction_type}</p>
                            {canUndo && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-amber-600 hover:text-amber-700 hover:bg-amber-50 text-xs"
                                onClick={() => {
                                  if (confirm(undoConfirmMessage(tx))) {
                                    undoTransactionMutation.mutate(tx);
                                  }
                                }}
                                disabled={undoTransactionMutation.isPending}
                              >
                                <RotateCcw className="h-3 w-3 mr-1" />
                                Undo
                              </Button>
                            )}
                          </div>
                          {tx.length_change_ft !== 0 && (
                            <p className="text-sm text-slate-500">
                              {formatFeetInches(tx.length_before_ft)} → {formatFeetInches(tx.length_after_ft)}
                              {lengthChangeLabel && (
                                <span className={tx.length_change_ft < 0 ? 'text-red-500' : 'text-emerald-500'}>
                                  {' '}({lengthChangeLabel})
                                </span>
                              )}
                            </p>
                          )}
                          {tx.notes && (
                            <p className="text-xs text-slate-400 truncate">{tx.notes}</p>
                          )}
                          <p className="text-xs text-slate-400 mt-1">
                            {format(new Date(tx.created_date), 'MMM d, h:mm a')}
                            {tx.performed_by && ` • ${tx.performed_by}`}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Edit Roll Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Roll</DialogTitle>
          </DialogHeader>
          {editForm && (
            <div className="space-y-4">
              <p className="text-sm text-slate-500">
                Status stays with the Edit Status button so job allocations don&apos;t get out of sync.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <Label htmlFor="edit-product">Product</Label>
                  <Select
                    value={editForm.product_id}
                    onValueChange={(v) => {
                      const product = products.find(p => p.id === v);
                      patchEditForm({
                        product_id: v,
                        product_name: product?.product_name || editForm.product_name,
                      });
                    }}
                  >
                    <SelectTrigger id="edit-product" className="w-full">
                      <SelectValue placeholder={editForm.product_name || 'Select a product'} />
                    </SelectTrigger>
                    <SelectContent>
                      {products.map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.product_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="edit-mfr-roll">Manufacturer Roll #</Label>
                  <Input
                    id="edit-mfr-roll"
                    value={editForm.manufacturer_roll_number}
                    onChange={(e) => patchEditForm({ manufacturer_roll_number: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="edit-dye-lot">Dye Lot</Label>
                  <Input
                    id="edit-dye-lot"
                    value={editForm.dye_lot}
                    onChange={(e) => patchEditForm({ dye_lot: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="edit-width">Width (ft)</Label>
                  <Input
                    id="edit-width"
                    type="number"
                    step="0.01"
                    min="0"
                    value={editForm.width_ft}
                    onChange={(e) => patchEditForm({ width_ft: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="edit-condition">Condition</Label>
                  <Select
                    value={editForm.condition}
                    onValueChange={(v) => patchEditForm({ condition: v })}
                  >
                    <SelectTrigger id="edit-condition" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLL_CONDITION_OPTIONS.map(c => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="edit-current-length">Current Length (ft)</Label>
                  <Input
                    id="edit-current-length"
                    type="number"
                    step="0.01"
                    min="0"
                    value={editForm.current_length_ft}
                    onChange={(e) => patchEditForm({ current_length_ft: e.target.value })}
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Changing this writes an Adjustment to the transaction history.
                  </p>
                </div>
                <div>
                  <Label htmlFor="edit-original-length">Original Length (ft)</Label>
                  <Input
                    id="edit-original-length"
                    type="number"
                    step="0.01"
                    min="0"
                    value={editForm.original_length_ft}
                    onChange={(e) => patchEditForm({ original_length_ft: e.target.value })}
                  />
                </div>
                <div className="md:col-span-2">
                  <Label htmlFor="edit-roll-type">Roll Type</Label>
                  <Select
                    value={editForm.roll_type}
                    onValueChange={(v) => patchEditForm({
                      roll_type: v,
                      ...(v === 'Parent' && { parent_roll_id: '', parent_tt_sku_tag_number: '' }),
                    })}
                  >
                    <SelectTrigger id="edit-roll-type" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLL_TYPE_OPTIONS.map(t => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {editForm.roll_type === 'Child' && (
                <div className="rounded-lg border border-slate-200 p-3 space-y-2">
                  <Label>Parent Roll</Label>
                  {editForm.parent_roll_id ? (
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-mono text-sm text-slate-800">
                        {editForm.parent_tt_sku_tag_number || editForm.parent_roll_id}
                      </p>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => patchEditForm({ parent_roll_id: '', parent_tt_sku_tag_number: '' })}
                      >
                        Change
                      </Button>
                    </div>
                  ) : (
                    <>
                      <Input
                        placeholder="Search by tag or manufacturer roll #"
                        value={parentSearch}
                        onChange={(e) => setParentSearch(e.target.value)}
                      />
                      {parentSearch.trim() && parentMatches.length === 0 && (
                        <p className="text-sm text-slate-500">No matching rolls.</p>
                      )}
                      <div className="space-y-1">
                        {parentMatches.map(candidate => (
                          <button
                            key={candidate.id}
                            type="button"
                            onClick={() => patchEditForm({
                              parent_roll_id: candidate.id,
                              parent_tt_sku_tag_number: candidate.tt_sku_tag_number || candidate.roll_tag || '',
                            })}
                            className="w-full text-left p-2 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors"
                          >
                            <span className="font-mono text-sm">
                              {candidate.tt_sku_tag_number || candidate.roll_tag}
                            </span>
                            <span className="text-xs text-slate-500 ml-2">
                              {candidate.product_name} • {formatFeetInches(candidate.current_length_ft)}
                            </span>
                          </button>
                        ))}
                      </div>
                      <p className="text-xs text-slate-500">
                        A child roll needs a parent. Pick one, or set the type back to Parent.
                      </p>
                    </>
                  )}
                </div>
              )}

              <div>
                <Label htmlFor="edit-notes">Notes</Label>
                <Textarea
                  id="edit-notes"
                  rows={3}
                  value={editForm.notes}
                  onChange={(e) => patchEditForm({ notes: e.target.value })}
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowEditDialog(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => editRollMutation.mutate(editForm)}
                  disabled={editRollMutation.isPending}
                >
                  Save Changes
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Status Dialog */}
      <Dialog open={showStatusEditor} onOpenChange={setShowStatusEditor}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Roll Status</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {activeAllocation && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
                This roll is allocated to a job. Changing to a job-state status (Planned / Allocated / Staged / Fulfilled) will update the associated allocation. To release the roll, cancel or delete the allocation from the job page.
              </div>
            )}
            <div>
              <Label htmlFor="status-select">Status</Label>
              <Select value={newStatusValue} onValueChange={setNewStatusValue}>
                <SelectTrigger id="status-select" className="w-full">
                  <SelectValue placeholder="Select a status" />
                </SelectTrigger>
                <SelectContent>
                  {/* Job-state statuses only make sense while an allocation exists to carry
                      them — otherwise they'd strand the roll with no job to release it. */}
                  {statusOptions.map(s => {
                    // If allocated, only allow switching between job-state statuses
                    // (plus leaving it untouched) — disable Available/terminal states
                    // to force the user through the allocation flow.
                    const disabled =
                      !!activeAllocation &&
                      !ROLL_ACTIVE_JOB_STATUSES.includes(s) &&
                      s !== roll.status;
                    return (
                      <SelectItem key={s} value={s} disabled={disabled}>
                        {STATUS_LABELS[s] || s}
                        {disabled ? ' (release from job first)' : ''}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowStatusEditor(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => changeStatusMutation.mutate(newStatusValue)}
                disabled={!newStatusValue || newStatusValue === roll.status || changeStatusMutation.isPending}
              >
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Plan for Job Dialog */}
      <Dialog
        open={showPlanDialog}
        onOpenChange={(open) => {
          setShowPlanDialog(open);
          setSelectedJobId('');
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Plan Roll for Job</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="job-select-plan">Select Job</Label>
              <Select
                value={selectedJobId}
                onValueChange={setSelectedJobId}
              >
                <SelectTrigger id="job-select-plan" className="w-full">
                  <SelectValue placeholder="Select a job" />
                </SelectTrigger>
                <SelectContent>
                  {jobs.map((job) => (
                    <SelectItem key={job.id} value={job.id}>
                      {job.job_number} - {job.customer_name || 'No Customer'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowPlanDialog(false)}>
                Cancel
              </Button>
              <Button 
                onClick={() => planForJobMutation.mutate(selectedJobId)}
                disabled={!selectedJobId || planForJobMutation.isPending}
              >
                Confirm Plan
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Allocate for Job Dialog */}
      <Dialog
        open={showAllocateDialog}
        onOpenChange={(open) => {
          setShowAllocateDialog(open);
          setSelectedJobId('');
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Allocate Roll for Job</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="job-select-allocate">Select Job</Label>
              <Select
                value={selectedJobId}
                onValueChange={setSelectedJobId}
              >
                <SelectTrigger id="job-select-allocate" className="w-full">
                  <SelectValue placeholder="Select a job" />
                </SelectTrigger>
                <SelectContent>
                  {jobs.map((job) => (
                    <SelectItem key={job.id} value={job.id}>
                      {job.job_number} - {job.customer_name || 'No Customer'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowAllocateDialog(false)}>
                Cancel
              </Button>
              <Button 
                onClick={() => allocateForJobMutation.mutate(selectedJobId)}
                disabled={!selectedJobId || allocateForJobMutation.isPending}
              >
                Confirm Allocation
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}