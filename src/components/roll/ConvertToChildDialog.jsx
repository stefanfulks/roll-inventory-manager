import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { formatFeetInches } from '@/lib/dateHelpers';
import { convertParentToChild } from '@/lib/rollConversion';
import { describeError } from '@/lib/query-client';

/**
 * ConvertToChildDialog — converts a mis-logged Parent roll into a Child of
 * another roll. Preserves length, status, location, and allocations; only the
 * hierarchy changes. Writes an audit transaction and re-parents any children.
 */
export default function ConvertToChildDialog({ open, onOpenChange, roll }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedParentId, setSelectedParentId] = useState('');
  const [notes, setNotes] = useState('');

  // Load candidate parents (Parent rolls, excluding this roll and its descendants).
  const { data: allRolls = [], isLoading } = useQuery({
    queryKey: ['rolls', 'convert-parent-candidates'],
    queryFn: () => base44.entities.Roll.list('-created_date', 5000),
    enabled: open,
  });

  const candidates = useMemo(() => {
    if (!roll) return [];
    const term = search.trim().toLowerCase();
    return allRolls
      .filter(r => r.id !== roll.id)
      .filter(r => r.parent_roll_id !== roll.id) // exclude direct children
      .filter(r => {
        if (!term) return true;
        const tag = (r.tt_sku_tag_number || '').toLowerCase();
        const rtag = (r.roll_tag || '').toLowerCase();
        const mfr = (r.manufacturer_roll_number || '').toLowerCase();
        return tag.includes(term) || rtag.includes(term) || mfr.includes(term);
      })
      .slice(0, 12);
  }, [allRolls, roll, search]);

  const convertMutation = useMutation({
    mutationFn: async () => {
      if (!roll) throw new Error('No roll selected.');
      if (!selectedParentId) throw new Error('Pick a parent roll to convert into a child of.');
      const user = await base44.auth.me();
      return convertParentToChild({
        rollId: roll.id,
        newParentId: selectedParentId,
        performedBy: user.full_name || user.email,
        notes,
      });
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['rolls'] });
      queryClient.invalidateQueries({ queryKey: ['roll', roll?.id] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['childRolls', roll?.id] });
      const childNote = result.reParentedChildren > 0
        ? ` · ${result.reParentedChildren} descendant(s) re-parented`
        : '';
      toast.success(`Converted to child roll${childNote}.`);
      onOpenChange(false);
      setSelectedParentId('');
      setSearch('');
      setNotes('');
    },
    onError: (err) => toast.error(describeError(err)),
  });

  if (!roll) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Convert to Child Roll</DialogTitle>
          <DialogDescription>
            Use this when a roll was mis-logged as a Parent but is really a cut
            of another roll. Length, status, location, and job allocations are
            preserved — only the hierarchy changes. An audit entry is written.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-sm">
            <div className="flex items-center gap-2">
              <span className="font-mono font-medium">{roll.tt_sku_tag_number || roll.roll_tag}</span>
              <span className="text-slate-500">·</span>
              <span>{roll.product_name}</span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {formatFeetInches(roll.width_ft)} × {formatFeetInches(roll.current_length_ft)}
              {' · '}Status: {roll.status}
              {' · '}Currently: {roll.roll_type || 'Parent'}
            </p>
          </div>

          <div>
            <Label htmlFor="parent-search">Search parent roll</Label>
            <Input
              id="parent-search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setSelectedParentId('');
              }}
              placeholder="Tag, manufacturer roll #, or product…"
              className="mt-1"
            />
          </div>

          {candidates.length === 0 && !isLoading && (
            <p className="text-sm text-slate-500">
              {search ? 'No matching rolls.' : 'Start typing to search for the parent.'}
            </p>
          )}

          {candidates.length > 0 && (
            <div className="space-y-1 max-h-56 overflow-y-auto">
              {candidates.map(c => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedParentId(c.id)}
                  className={`w-full text-left p-2 rounded-lg transition-colors ${
                    selectedParentId === c.id
                      ? 'bg-emerald-50 border border-emerald-400'
                      : 'bg-slate-50 hover:bg-slate-100 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-medium">
                      {c.tt_sku_tag_number || c.roll_tag}
                    </span>
                    <span className="text-xs text-slate-500">{c.product_name}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {formatFeetInches(c.width_ft)} × {formatFeetInches(c.current_length_ft)}
                    {' · '}{c.roll_type || 'Parent'}
                    {c.manufacturer_roll_number ? ` · Mfr ${c.manufacturer_roll_number}` : ''}
                  </p>
                </button>
              ))}
            </div>
          )}

          <div>
            <Label htmlFor="convert-notes">Notes (optional)</Label>
            <Textarea
              id="convert-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Why is this being converted?"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => convertMutation.mutate()}
              disabled={!selectedParentId || convertMutation.isPending}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {convertMutation.isPending ? 'Converting…' : 'Convert to Child'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}