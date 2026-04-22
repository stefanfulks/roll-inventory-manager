import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ClipboardList,
  Check,
  X,
  CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { toast } from 'sonner';
import StatusBadge from '@/components/ui/StatusBadge';
import { ROLL_STATUS, ROLL_PENDING_STATUSES, STATUS_LABELS } from '@/lib/rollStatus';

const DISPOSITION_OPTIONS = [
  { value: ROLL_STATUS.AVAILABLE, label: 'Release to Available inventory' },
  { value: ROLL_STATUS.SCRAPPED, label: 'Scrap (write off)' },
];

/**
 * PendingReturns — reviewer workspace for rolls in PendingAvailable / PendingScrap statuses.
 *
 * Review flow:
 * 1. Page lists all rolls in pending statuses with their intended disposition.
 * 2. Reviewer clicks Review on a roll → dialog with location, final disposition,
 *    and notes.
 * 3. On confirm → roll moves to Available or Scrapped; confirmation toast shown.
 * 4. Summary view shows what was just finalized.
 */
export default function PendingReturns() {
  const queryClient = useQueryClient();
  const [reviewRoll, setReviewRoll] = useState(null);
  const [reviewForm, setReviewForm] = useState({
    disposition: ROLL_STATUS.AVAILABLE,
    location_id: '',
    notes: '',
  });
  const [lastFinalized, setLastFinalized] = useState(null);

  // ---- Data ----
  const { data: pendingRolls = [], isLoading } = useQuery({
    queryKey: ['pending-rolls'],
    queryFn: async () => {
      const rolls = await base44.entities.Roll.list('-created_date', 500);
      return rolls.filter(r => ROLL_PENDING_STATUSES.includes(r.status));
    },
  });

  const { data: locations = [] } = useQuery({
    queryKey: ['locations'],
    queryFn: async () => {
      const locs = await base44.entities.Location.list();
      return locs.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    },
  });

  const openReview = roll => {
    setReviewRoll(roll);
    setReviewForm({
      disposition:
        roll.status === ROLL_STATUS.PENDING_SCRAP
          ? ROLL_STATUS.SCRAPPED
          : ROLL_STATUS.AVAILABLE,
      location_id: roll.location_id || '',
      notes: '',
    });
  };

  const closeReview = () => {
    setReviewRoll(null);
  };

  // ---- Finalize mutation ----
  const finalizeMutation = useMutation({
    mutationFn: async () => {
      if (!reviewRoll) throw new Error('No roll selected');
      const user = await base44.auth.me();
      const loc = locations.find(l => l.id === reviewForm.location_id);

      if (reviewForm.disposition === ROLL_STATUS.AVAILABLE && !reviewForm.location_id) {
        throw new Error('A location is required when releasing to Available inventory.');
      }

      await base44.entities.Roll.update(reviewRoll.id, {
        status: reviewForm.disposition,
        location_id: reviewForm.location_id || reviewRoll.location_id,
        location_name: loc?.name || reviewRoll.location_name,
      });

      await base44.entities.Transaction.create({
        transaction_type: 'PendingReview',
        roll_id: reviewRoll.id,
        tt_sku_tag_number: reviewRoll.tt_sku_tag_number,
        parent_roll_id: reviewRoll.parent_roll_id || null,
        parent_tt_sku_tag_number: reviewRoll.parent_tt_sku_tag_number || null,
        product_name: reviewRoll.product_name,
        dye_lot: reviewRoll.dye_lot,
        width_ft: reviewRoll.width_ft,
        length_change_ft: 0,
        length_before_ft: reviewRoll.current_length_ft,
        length_after_ft: reviewRoll.current_length_ft,
        location_to: loc?.name || reviewRoll.location_name,
        performed_by: user.full_name || user.email,
        notes: `Pending review finalized: ${STATUS_LABELS[reviewForm.disposition]}. ${reviewForm.notes || ''}`.trim(),
      });

      return {
        roll: reviewRoll,
        disposition: reviewForm.disposition,
        location: loc?.name || '',
      };
    },
    onSuccess: result => {
      queryClient.invalidateQueries({ queryKey: ['pending-rolls'] });
      queryClient.invalidateQueries({ queryKey: ['rolls'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      setLastFinalized(result);
      closeReview();
      toast.success(`Roll ${result.roll.tt_sku_tag_number} → ${STATUS_LABELS[result.disposition]}`);
    },
    onError: err => {
      console.error('Pending finalize failed:', err);
      toast.error(err?.message || 'Could not finalize this roll.');
    },
  });

  // ---- UI ----
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <ClipboardList className="h-7 w-7 text-amber-600" />
            <h1 className="text-2xl lg:text-3xl font-bold text-slate-800">
              Pending Returns
            </h1>
          </div>
          <p className="text-slate-500 mt-1">
            Returns awaiting review. Assign a location and confirm whether each roll goes
            to Available inventory or is scrapped.
          </p>
        </div>
      </div>

      {lastFinalized && (
        <Card className="rounded-2xl border-emerald-200 bg-emerald-50/60 shadow-sm">
          <CardContent className="py-4 flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            <div className="text-sm">
              <span className="font-mono font-medium">
                {lastFinalized.roll.tt_sku_tag_number}
              </span>{' '}
              finalized as{' '}
              <StatusBadge status={lastFinalized.disposition} size="sm" />
              {lastFinalized.location && (
                <>
                  {' '}
                  at <span className="font-medium">{lastFinalized.location}</span>
                </>
              )}
              .
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto"
              onClick={() => setLastFinalized(null)}
            >
              <X className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      )}

      <Card className="rounded-2xl border-slate-100 shadow-sm">
        <CardHeader>
          <CardTitle>Rolls awaiting review ({pendingRolls.length})</CardTitle>
          <CardDescription>
            Each roll shows its intended path. You can override it during review.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 text-slate-500">Loading…</div>
          ) : pendingRolls.length === 0 ? (
            <div className="p-8 text-center text-slate-500">
              Nothing pending review. All returns have been processed.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="px-4 py-3 font-medium text-slate-600">TT SKU</th>
                  <th className="px-4 py-3 font-medium text-slate-600">Product</th>
                  <th className="px-4 py-3 font-medium text-slate-600">Lineage</th>
                  <th className="px-4 py-3 font-medium text-slate-600">Size</th>
                  <th className="px-4 py-3 font-medium text-slate-600">Condition</th>
                  <th className="px-4 py-3 font-medium text-slate-600">Intended</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pendingRolls.map(roll => (
                  <tr key={roll.id}>
                    <td className="px-4 py-3 font-mono">
                      <Link
                        to={createPageUrl('RollDetail') + `?id=${roll.id}`}
                        className="text-blue-600 hover:underline"
                      >
                        {roll.tt_sku_tag_number}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{roll.product_name}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {roll.parent_tt_sku_tag_number ? (
                        <>
                          Child of{' '}
                          <Link
                            to={
                              createPageUrl('RollDetail') +
                              `?id=${roll.parent_roll_id}`
                            }
                            className="font-mono text-blue-600 hover:underline"
                          >
                            {roll.parent_tt_sku_tag_number}
                          </Link>
                        </>
                      ) : (
                        'Parent roll'
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {roll.width_ft}ft × {roll.current_length_ft}ft
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={roll.condition || 'Used'} size="sm" />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={roll.status} size="sm" />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        size="sm"
                        onClick={() => openReview(roll)}
                        className="bg-emerald-600 hover:bg-emerald-700"
                      >
                        Review
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Review dialog */}
      <Dialog open={!!reviewRoll} onOpenChange={v => !v && closeReview()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Review: {reviewRoll?.tt_sku_tag_number}
            </DialogTitle>
          </DialogHeader>
          {reviewRoll && (
            <div className="space-y-4">
              <div className="rounded-lg bg-slate-50 p-3 text-sm space-y-1">
                <div>
                  <span className="text-slate-500">Product: </span>
                  <span className="font-medium">{reviewRoll.product_name}</span>
                </div>
                <div>
                  <span className="text-slate-500">Size: </span>
                  <span className="font-medium">
                    {reviewRoll.width_ft}ft × {reviewRoll.current_length_ft}ft
                  </span>
                </div>
                <div>
                  <span className="text-slate-500">Dye lot: </span>
                  <span className="font-medium">{reviewRoll.dye_lot}</span>
                </div>
                <div>
                  <span className="text-slate-500">Condition: </span>
                  <span className="font-medium">
                    {reviewRoll.condition || 'Unknown'}
                  </span>
                </div>
                {reviewRoll.parent_tt_sku_tag_number && (
                  <div>
                    <span className="text-slate-500">Parent: </span>
                    <span className="font-mono font-medium">
                      {reviewRoll.parent_tt_sku_tag_number}
                    </span>
                  </div>
                )}
                {reviewRoll.notes && (
                  <div className="pt-1 text-xs text-slate-600">
                    “{reviewRoll.notes}”
                  </div>
                )}
              </div>

              <div>
                <Label>Final disposition</Label>
                <Select
                  value={reviewForm.disposition}
                  onValueChange={v =>
                    setReviewForm(f => ({ ...f, disposition: v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DISPOSITION_OPTIONS.map(o => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {reviewForm.disposition === ROLL_STATUS.AVAILABLE && (
                <div>
                  <Label>Location *</Label>
                  <Select
                    value={reviewForm.location_id}
                    onValueChange={v =>
                      setReviewForm(f => ({ ...f, location_id: v }))
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
              )}

              <div>
                <Label>Review notes (optional)</Label>
                <Textarea
                  value={reviewForm.notes}
                  onChange={e =>
                    setReviewForm(f => ({ ...f, notes: e.target.value }))
                  }
                  rows={2}
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={closeReview}>
                  Cancel
                </Button>
                <Button
                  onClick={() => finalizeMutation.mutate()}
                  disabled={finalizeMutation.isPending}
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  <Check className="h-4 w-4 mr-2" />
                  Confirm
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
