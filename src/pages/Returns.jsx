import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Search,
  Check,
  CheckCircle2,
  ArrowLeft,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { toast } from 'sonner';
import StatusBadge from '@/components/ui/StatusBadge';
import UnmarkedReturnForm from '@/components/returns/UnmarkedReturnForm';
import { ROLL_STATUS, STATUS_LABELS } from '@/lib/rollStatus';
import { formatFeetInches } from '@/lib/dateHelpers';

const CONDITION_OPTIONS = ['Good', 'Used', 'Damaged', 'Scrap'];

/**
 * Returns page — job-driven return flow with Pending review option.
 *
 * Flow:
 * 1. User picks a job that has dispatched rolls.
 * 2. Page shows all allocated rolls for that job (status Allocated / Staged / Dispatched).
 * 3. User ticks the rolls to return, fills per-roll return details.
 * 4. Each roll: user chooses Full or Partial return.
 *    - Full: existing roll flips to Pending (or direct) status.
 *    - Partial: existing roll stays, NEW child roll is created with parent_roll_id set
 *      to the original and with the user-entered TT SKU tag.
 * 5. On submit: confirmation screen shows everything that was processed.
 */
export default function Returns() {
  const queryClient = useQueryClient();

  // View states: 'select-job' | 'detail' | 'confirm' | 'unmarked'
  const [view, setView] = useState('select-job');

  const [selectedJobId, setSelectedJobId] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [rollForms, setRollForms] = useState({}); // { rollId: { selected, condition, returnedLength, isPartial, newTag, location_id, sendToPending, targetStatus, notes } }
  const [isProcessing, setIsProcessing] = useState(false);
  const [confirmationResults, setConfirmationResults] = useState([]);

  // ---- Data ----
  // Filter client-side: the Base44 filter API takes plain equality maps, so the
  // Mongo-style `{ status: { $in: [...] } }` this used to send matched nothing and
  // the job dropdown came up empty.
  const RETURNABLE_JOB_STATUSES = ['Dispatched', 'AwaitingReturnInventory', 'Completed'];

  const { data: jobs = [] } = useQuery({
    queryKey: ['jobs-for-returns'],
    queryFn: async () => {
      const all = await base44.entities.Job.list('-created_date', 1000);
      return all.filter(j => RETURNABLE_JOB_STATUSES.includes(j.status));
    },
  });

  const { data: allRolls = [] } = useQuery({
    queryKey: ['rolls'],
    queryFn: () => base44.entities.Roll.list('-created_date', 5000),
  });

  // Explicit page size — an unbounded list only returned the first page, so older
  // jobs looked like they had no allocated rolls at all.
  const { data: allAllocations = [] } = useQuery({
    queryKey: ['allocations'],
    queryFn: () => base44.entities.Allocation.list('-created_date', 5000),
  });

  const { data: locations = [] } = useQuery({
    queryKey: ['locations'],
    queryFn: async () => {
      const locs = await base44.entities.Location.list();
      return locs.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    },
  });

  const selectedJob = jobs.find(j => j.id === selectedJobId);

  // Rolls allocated to the selected job, in statuses that can be returned.
  const returnableRolls = useMemo(() => {
    if (!selectedJobId) return [];
    const jobAllocations = allAllocations.filter(
      a =>
        a.job_id === selectedJobId &&
        a.item_type === 'roll' &&
        a.status !== 'Cancelled' &&
        a.status !== 'Completed',
    );
    const rollIds = jobAllocations.flatMap(a => a.allocated_roll_ids || []);
    const rolls = allRolls.filter(r => rollIds.includes(r.id));
    // Filter by search term if provided
    if (!searchTerm) return rolls;
    const q = searchTerm.toLowerCase();
    return rolls.filter(
      r =>
        (r.tt_sku_tag_number || '').toLowerCase().includes(q) ||
        (r.roll_tag || '').toLowerCase().includes(q) ||
        (r.product_name || '').toLowerCase().includes(q) ||
        (r.dye_lot || '').toLowerCase().includes(q),
    );
  }, [selectedJobId, allAllocations, allRolls, searchTerm]);

  // ---- Form helpers ----
  const getForm = rollId => {
    return (
      rollForms[rollId] || {
        selected: false,
        condition: 'Good',
        returnedLength: '',
        returnedWidth: '',
        isPartial: false,
        newTag: '',
        location_id: '',
        sendToPending: true, // default ON
        targetStatus: ROLL_STATUS.PENDING_AVAILABLE,
        notes: '',
      }
    );
  };

  const updateForm = (rollId, patch) => {
    setRollForms(prev => ({
      ...prev,
      [rollId]: { ...getForm(rollId), ...patch },
    }));
  };

  const toggleSelected = roll => {
    const f = getForm(roll.id);
    updateForm(roll.id, {
      selected: !f.selected,
      returnedLength: !f.selected
        ? String(roll.current_length_ft || 0)
        : f.returnedLength,
      returnedWidth: !f.selected
        ? String(roll.width_ft || '')
        : f.returnedWidth,
    });
  };

  // Derive default target status from condition.
  // Damaged / Scrap → PendingScrap (or Scrapped if pending off)
  // Good / Used → PendingAvailable (or Available if pending off)
  const defaultTargetFor = (condition, sendToPending) => {
    const isBad = condition === 'Damaged' || condition === 'Scrap';
    if (sendToPending) {
      return isBad ? ROLL_STATUS.PENDING_SCRAP : ROLL_STATUS.PENDING_AVAILABLE;
    }
    return isBad ? ROLL_STATUS.SCRAPPED : ROLL_STATUS.AVAILABLE;
  };

  const setCondition = (rollId, condition) => {
    const f = getForm(rollId);
    updateForm(rollId, {
      condition,
      targetStatus: defaultTargetFor(condition, f.sendToPending),
    });
  };

  const setSendToPending = (rollId, sendToPending) => {
    const f = getForm(rollId);
    updateForm(rollId, {
      sendToPending,
      targetStatus: defaultTargetFor(f.condition, sendToPending),
    });
  };

  // ---- Submit ----
  const submitMutation = useMutation({
    mutationFn: async () => {
      const user = await base44.auth.me();
      const results = [];

      const selectedRolls = returnableRolls.filter(r => getForm(r.id).selected);
      if (selectedRolls.length === 0) {
        throw new Error('No rolls selected to return.');
      }

      for (const roll of selectedRolls) {
        const f = getForm(roll.id);
        const returnedLengthNum = parseFloat(f.returnedLength) || 0;

        if (returnedLengthNum <= 0) {
          throw new Error(`Roll ${roll.tt_sku_tag_number}: returned length must be > 0`);
        }
        if (returnedLengthNum > (roll.current_length_ft || 0)) {
          throw new Error(
            `Roll ${roll.tt_sku_tag_number}: returned length ${returnedLengthNum} exceeds roll length ${roll.current_length_ft}`,
          );
        }

        const loc = locations.find(l => l.id === f.location_id);
        const locName = loc?.name || '';

        // Width can shrink if the crew trimmed the piece before sending it back.
        const returnedWidthNum = parseFloat(f.returnedWidth);
        const finalWidth = Number.isFinite(returnedWidthNum) && returnedWidthNum > 0
          ? returnedWidthNum
          : roll.width_ft;
        if (finalWidth > (roll.width_ft || 0) + 0.01) {
          throw new Error(
            `Roll ${roll.tt_sku_tag_number}: returned width ${finalWidth} ft is wider than the roll that went out (${roll.width_ft} ft)`,
          );
        }

        const isFull =
          returnedLengthNum >= (roll.current_length_ft || 0) &&
          finalWidth >= (roll.width_ft || 0);
        let targetRoll = roll;
        let createdChildRoll = null;

        if (isFull) {
          // Full return: update the original roll.
          await base44.entities.Roll.update(roll.id, {
            status: f.targetStatus,
            condition: f.condition,
            location_id: f.location_id || roll.location_id,
            location_name: locName || roll.location_name,
            allocated_job_id: null,
          });
          targetRoll = { ...roll, status: f.targetStatus };
        } else {
          // Partial return: create a child roll for what came back.
          if (!f.newTag || !f.newTag.trim()) {
            throw new Error(
              `Roll ${roll.tt_sku_tag_number}: new tag number required for partial return`,
            );
          }
          // Check tag uniqueness
          const existing = allRolls.find(
            r => r.tt_sku_tag_number === f.newTag.trim(),
          );
          if (existing) {
            throw new Error(
              `Tag ${f.newTag} is already used by another roll.`,
            );
          }

          const childRollData = {
            tt_sku_tag_number: f.newTag.trim(),
            parent_roll_id: roll.id,
            parent_tt_sku_tag_number: roll.tt_sku_tag_number,
            vendor_id: roll.vendor_id,
            vendor_name: roll.vendor_name,
            product_id: roll.product_id,
            product_name: roll.product_name,
            manufacturer_roll_number: roll.manufacturer_roll_number,
            dye_lot: roll.dye_lot,
            width_ft: finalWidth,
            original_length_ft: returnedLengthNum,
            current_length_ft: returnedLengthNum,
            roll_type: 'Child',
            condition: f.condition,
            location_id: f.location_id,
            location_name: locName,
            status: f.targetStatus,
            date_received: new Date().toISOString().split('T')[0],
            inventory_owner: roll.inventory_owner,
            notes: `Partial return from parent ${roll.tt_sku_tag_number} (job ${selectedJob?.job_number || selectedJobId})`,
          };
          createdChildRoll = await base44.entities.Roll.create(childRollData);
          targetRoll = createdChildRoll;

          // The parent physically left as one roll and only this remnant came back,
          // so the parent is used up. Without this the parent kept its full length
          // and the same turf was counted twice — once on the parent, once on the
          // new child. Its job reference stays so reports show where it went.
          await base44.entities.Roll.update(roll.id, {
            status: ROLL_STATUS.CONSUMED,
            current_length_ft: 0,
            allocated_job_id: roll.allocated_job_id || selectedJobId,
            notes: [
              roll.notes,
              `Used on job ${selectedJob?.job_number || selectedJobId}; ` +
                `${returnedLengthNum} ft returned as child roll ${f.newTag.trim()}.`,
            ]
              .filter(Boolean)
              .join(' '),
          });
        }

        // Create return transaction
        await base44.entities.Transaction.create({
          transaction_type: 'ReturnFromJob',
          fulfillment_for: selectedJob?.fulfillment_for,
          roll_id: targetRoll.id,
          tt_sku_tag_number: targetRoll.tt_sku_tag_number,
          parent_roll_id: isFull ? null : roll.id,
          parent_tt_sku_tag_number: isFull ? null : roll.tt_sku_tag_number,
          job_id: selectedJobId,
          job_number: selectedJob?.job_number,
          product_name: roll.product_name,
          dye_lot: roll.dye_lot,
          width_ft: finalWidth,
          length_change_ft: returnedLengthNum,
          length_before_ft: 0,
          length_after_ft: returnedLengthNum,
          location_to: locName,
          performed_by: user.full_name || user.email,
          notes: `${isFull ? 'Full' : 'Partial'} return — condition ${f.condition}. ${f.notes || ''}`.trim(),
        });

        results.push({
          originalRoll: roll,
          targetRoll,
          returnType: isFull ? 'Full' : 'Partial',
          returnedLength: returnedLengthNum,
          condition: f.condition,
          targetStatus: f.targetStatus,
          location: locName,
          childCreated: !!createdChildRoll,
        });
      }

      // Close out allocations whose every roll has now come back, so those rolls
      // stop being offered for return and the job can actually be completed.
      const handledRollIds = new Set(selectedRolls.map(r => r.id));
      const jobAllocations = allAllocations.filter(
        a =>
          a.job_id === selectedJobId &&
          a.item_type === 'roll' &&
          a.status !== 'Cancelled' &&
          a.status !== 'Completed',
      );
      for (const allocation of jobAllocations) {
        const lineIds = allocation.allocated_roll_ids || [];
        if (lineIds.length > 0 && lineIds.every(id => handledRollIds.has(id))) {
          await base44.entities.Allocation.update(allocation.id, { status: 'Completed' });
        }
      }

      return results;
    },
    onSuccess: results => {
      queryClient.invalidateQueries({ queryKey: ['rolls'] });
      queryClient.invalidateQueries({ queryKey: ['allocations'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['returnTransactions'] });
      queryClient.invalidateQueries({ queryKey: ['job', selectedJobId] });
      setConfirmationResults(results);
      setView('confirm');
    },
    onError: err => {
      console.error('Return submit failed:', err);
      toast.error(`Return failed: ${err?.message || 'Unknown error'}`);
    },
  });

  const handleReset = () => {
    setView('select-job');
    setSelectedJobId('');
    setSearchTerm('');
    setRollForms({});
    setConfirmationResults([]);
  };

  // ---- UI ----
  if (view === 'confirm') {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-8 w-8 text-emerald-600" />
            <div>
              <h1 className="text-2xl lg:text-3xl font-bold text-slate-800">
                Returns Processed
              </h1>
              <p className="text-slate-500 mt-1">
                {confirmationResults.length} roll{confirmationResults.length === 1 ? '' : 's'}{' '}
                returned from job{' '}
                <span className="font-medium">{selectedJob?.job_number}</span>
              </p>
            </div>
          </div>
          <Button onClick={handleReset}>
            Return more rolls
          </Button>
        </div>

        <Card className="rounded-2xl border-slate-100 shadow-sm">
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="px-4 py-3 font-medium text-slate-600">Original Roll</th>
                  <th className="px-4 py-3 font-medium text-slate-600">Result</th>
                  <th className="px-4 py-3 font-medium text-slate-600">Length</th>
                  <th className="px-4 py-3 font-medium text-slate-600">Condition</th>
                  <th className="px-4 py-3 font-medium text-slate-600">Status</th>
                  <th className="px-4 py-3 font-medium text-slate-600">Location</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {confirmationResults.map((r, i) => (
                  <tr key={i}>
                    <td className="px-4 py-3 font-mono">{r.originalRoll.tt_sku_tag_number}</td>
                    <td className="px-4 py-3">
                      {r.childCreated ? (
                        <>
                          Partial → new child{' '}
                          <span className="font-mono font-medium">
                            {r.targetRoll.tt_sku_tag_number}
                          </span>
                        </>
                      ) : (
                        'Full return'
                      )}
                    </td>
                    <td className="px-4 py-3">{r.returnedLength} ft</td>
                    <td className="px-4 py-3">{r.condition}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={r.targetStatus} size="sm" />
                    </td>
                    <td className="px-4 py-3">{r.location || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <p className="text-sm text-slate-500">
          Rolls in a <StatusBadge status="PendingAvailable" size="sm" /> or{' '}
          <StatusBadge status="PendingScrap" size="sm" /> status are awaiting review on the{' '}
          <span className="font-medium">Pending Returns</span> page before they re-enter
          inventory or are scrapped.
        </p>
      </div>
    );
  }

  // View: select-job OR detail
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold text-slate-800">Returns</h1>
        <p className="text-slate-500 mt-1">
          Select a job, pick the rolls coming back, and choose how each should be processed.
        </p>
      </div>

      {view === 'select-job' && (
        <Card className="rounded-2xl border-slate-100 shadow-sm">
          <CardHeader>
            <CardTitle>Which job are these returns from?</CardTitle>
            <CardDescription>
              Only jobs with dispatched rolls appear here.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Job</Label>
              <Select
                value={selectedJobId}
                onValueChange={v => setSelectedJobId(v)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a job" />
                </SelectTrigger>
                <SelectContent>
                  {jobs.length === 0 ? (
                    <div className="px-3 py-4 text-sm text-slate-500">
                      No jobs in Dispatched, Awaiting Return, or Completed status.
                    </div>
                  ) : (
                    jobs.map(j => (
                      <SelectItem key={j.id} value={j.id}>
                        {j.job_number} — {j.customer_name || 'No customer'} ({j.status})
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <Button
              disabled={!selectedJobId}
              onClick={() => setView('detail')}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              Continue
            </Button>

            <div className="pt-4 mt-4 border-t border-slate-100">
              <p className="text-sm text-slate-600 mb-2">
                Don't know which job this came from?
              </p>
              <Button
                variant="outline"
                onClick={() => setView('unmarked')}
              >
                Receive without a job
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {view === 'unmarked' && (
        <UnmarkedReturnForm
          onCancel={() => setView('select-job')}
          onSuccess={() => setView('select-job')}
        />
      )}

      {view === 'detail' && (
        <>
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              onClick={() => {
                setView('select-job');
                setRollForms({});
                setSearchTerm('');
              }}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <div className="text-sm text-slate-600">
              Job{' '}
              <span className="font-medium text-slate-800">
                {selectedJob?.job_number}
              </span>{' '}
              — {selectedJob?.customer_name || 'No customer'}
            </div>
          </div>

          <Card className="rounded-2xl border-slate-100 shadow-sm">
            <CardHeader>
              <CardTitle>Allocated rolls ({returnableRolls.length})</CardTitle>
              <CardDescription>
                Tick the rolls coming back. For partial returns, a new child roll is
                created with a new TT SKU tag.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Filter allocated rolls by tag, product, or dye lot…"
                  className="pl-10"
                />
              </div>

              {returnableRolls.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  No rolls are currently allocated to this job.
                </div>
              ) : (
                <div className="space-y-3">
                  {returnableRolls.map(roll => {
                    const f = getForm(roll.id);
                    // A return is partial if either dimension came back smaller —
                    // width used to be ignored here, so a trimmed piece was treated
                    // as a full return and no child roll was created.
                    const enteredLength = parseFloat(f.returnedLength);
                    const enteredWidth = parseFloat(f.returnedWidth);
                    const isPartialReturn =
                      enteredLength > 0 &&
                      (enteredLength < (roll.current_length_ft || 0) ||
                        (Number.isFinite(enteredWidth) &&
                          enteredWidth > 0 &&
                          enteredWidth < (roll.width_ft || 0)));
                    return (
                      <div
                        key={roll.id}
                        className={`rounded-lg border p-4 ${
                          f.selected
                            ? 'border-emerald-400 bg-emerald-50/40'
                            : 'border-slate-200'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={f.selected}
                            onChange={() => toggleSelected(roll)}
                            className="mt-1.5 h-4 w-4"
                          />
                          <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono font-medium">
                                {roll.tt_sku_tag_number || roll.roll_tag}
                              </span>
                              <StatusBadge status={roll.status} size="sm" />
                              <StatusBadge
                                status={roll.roll_type || 'Parent'}
                                size="sm"
                              />
                              <span className="text-sm text-slate-500">
                                {roll.product_name} • {formatFeetInches(roll.width_ft)} ×{' '}
                                {formatFeetInches(roll.current_length_ft)} • Dye lot {roll.dye_lot}
                              </span>
                            </div>

                            {f.selected && (
                              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                                {/* Returned length */}
                                <div>
                                  <Label className="text-xs">
                                    Returned length (ft)
                                  </Label>
                                  <Input
                                    type="number"
                                    min="0"
                                    max={roll.current_length_ft || 0}
                                    step="0.01"
                                    value={f.returnedLength}
                                    onChange={e => {
                                      const val = e.target.value;
                                      updateForm(roll.id, {
                                        returnedLength: val,
                                        isPartial:
                                          parseFloat(val) > 0 &&
                                          parseFloat(val) < (roll.current_length_ft || 0),
                                      });
                                    }}
                                  />
                                  <p className="text-xs text-slate-500 mt-1">
                                    Went out at {formatFeetInches(roll.current_length_ft)}. Enter
                                    less for a partial return.
                                  </p>
                                </div>

                                {/* Returned width — the crew may have trimmed it narrower */}
                                <div>
                                  <Label className="text-xs">Returned width (ft)</Label>
                                  <Input
                                    type="number"
                                    min="0"
                                    max={roll.width_ft || undefined}
                                    step="0.01"
                                    value={f.returnedWidth}
                                    onChange={e =>
                                      updateForm(roll.id, { returnedWidth: e.target.value })
                                    }
                                  />
                                  <p className="text-xs text-slate-500 mt-1">
                                    Went out at {formatFeetInches(roll.width_ft)}. Change it only
                                    if the piece was trimmed narrower.
                                  </p>
                                </div>

                                {/* Condition */}
                                <div>
                                  <Label className="text-xs">Condition</Label>
                                  <Select
                                    value={f.condition}
                                    onValueChange={v => setCondition(roll.id, v)}
                                  >
                                    <SelectTrigger>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {CONDITION_OPTIONS.map(c => (
                                        <SelectItem key={c} value={c}>
                                          {c}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>

                                {/* Partial return tag */}
                                {isPartialReturn && (
                                  <div className="md:col-span-2">
                                    <Label className="text-xs">
                                      New TT SKU tag number (for the child roll coming back)
                                    </Label>
                                    <Input
                                      value={f.newTag}
                                      onChange={e =>
                                        updateForm(roll.id, {
                                          newTag: e.target.value,
                                        })
                                      }
                                      placeholder="Scan or enter the new pre-printed tag"
                                      className="font-mono"
                                    />
                                    <p className="text-xs text-slate-500 mt-1">
                                      Parent {roll.tt_sku_tag_number} was used on this job and
                                      will be marked Consumed. The piece coming back becomes
                                      this new child roll.
                                    </p>
                                  </div>
                                )}

                                {/* Location */}
                                <div>
                                  <Label className="text-xs">Location</Label>
                                  <Select
                                    value={f.location_id}
                                    onValueChange={v =>
                                      updateForm(roll.id, { location_id: v })
                                    }
                                  >
                                    <SelectTrigger>
                                      <SelectValue placeholder="Pick a location" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {locations.map(l => (
                                        <SelectItem key={l.id} value={l.id}>
                                          {l.name}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>

                                {/* Pending toggle */}
                                <div className="md:col-span-2 flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                                  <div>
                                    <p className="text-sm font-medium">
                                      Send to Pending Review
                                    </p>
                                    <p className="text-xs text-slate-500 mt-0.5">
                                      Will land as{' '}
                                      <span className="font-medium">
                                        {STATUS_LABELS[f.targetStatus]}
                                      </span>{' '}
                                      and require sign-off before joining inventory.
                                    </p>
                                  </div>
                                  <Switch
                                    checked={f.sendToPending}
                                    onCheckedChange={v => setSendToPending(roll.id, v)}
                                  />
                                </div>

                                {/* Notes */}
                                <div className="md:col-span-2">
                                  <Label className="text-xs">Notes (optional)</Label>
                                  <Textarea
                                    value={f.notes}
                                    onChange={e =>
                                      updateForm(roll.id, { notes: e.target.value })
                                    }
                                    placeholder="Anything worth logging about this return"
                                    rows={2}
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  onClick={() => submitMutation.mutate()}
                  disabled={
                    submitMutation.isPending ||
                    !Object.values(rollForms).some(f => f.selected)
                  }
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  <Check className="h-4 w-4 mr-2" />
                  Process returns
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
