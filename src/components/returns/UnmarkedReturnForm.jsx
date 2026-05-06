import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Check, ArrowLeft } from 'lucide-react';
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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { toast } from 'sonner';
import { ROLL_STATUS, STATUS_LABELS } from '@/lib/rollStatus';

const CONDITION_OPTIONS = ['Good', 'Used', 'Damaged', 'Scrap'];

/**
 * UnmarkedReturnForm — receive a return when the source job is unknown.
 *
 * Used in two places:
 *   1. Returns page → "Receive without a job" entry point
 *   2. JobDetail's receive-returns dialog → "this came back, but it's not from this job" fallback
 *
 * Each row creates a brand-new Roll record with no parent or job link.
 * User decides per row: condition, length, dimensions, location, send to Pending or direct.
 */
export default function UnmarkedReturnForm({ onCancel, onSuccess }) {
  const queryClient = useQueryClient();
  const [rows, setRows] = useState([newRow()]);

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => base44.entities.Product.list('-created_date', 200),
  });
  const { data: locations = [] } = useQuery({
    queryKey: ['locations'],
    queryFn: async () => {
      const locs = await base44.entities.Location.list();
      return locs.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    },
  });

  function newRow() {
    return {
      key: Math.random().toString(36).slice(2),
      tt_sku_tag_number: '',
      product_id: '',
      product_name: '',
      width_ft: '',
      length_ft: '',
      dye_lot: '',
      condition: 'Good',
      location_id: '',
      sendToPending: true,
      notes: '',
    };
  }

  const updateRow = (key, patch) => {
    setRows(prev => prev.map(r => (r.key === key ? { ...r, ...patch } : r)));
  };

  const addRow = () => setRows(prev => [...prev, newRow()]);
  const removeRow = key => setRows(prev => prev.filter(r => r.key !== key));

  const setProduct = (key, productId) => {
    const product = products.find(p => p.id === productId);
    updateRow(key, {
      product_id: productId,
      product_name: product?.product_name || '',
    });
  };

  const targetFor = (condition, sendToPending) => {
    const isBad = condition === 'Damaged' || condition === 'Scrap';
    if (sendToPending) return isBad ? ROLL_STATUS.PENDING_SCRAP : ROLL_STATUS.PENDING_AVAILABLE;
    return isBad ? ROLL_STATUS.SCRAPPED : ROLL_STATUS.AVAILABLE;
  };

  const submitMutation = useMutation({
    mutationFn: async () => {
      const user = await base44.auth.me();
      const created = [];

      for (const row of rows) {
        if (!row.tt_sku_tag_number?.trim()) throw new Error('Every row needs a TT SKU tag.');
        const lengthNum = parseFloat(row.length_ft);
        const widthNum = parseFloat(row.width_ft);
        if (!lengthNum || lengthNum <= 0) throw new Error(`Row "${row.tt_sku_tag_number}": length must be > 0`);
        if (!widthNum || widthNum <= 0) throw new Error(`Row "${row.tt_sku_tag_number}": width must be > 0`);
        if (!row.product_id) throw new Error(`Row "${row.tt_sku_tag_number}": pick a product`);

        const targetStatus = targetFor(row.condition, row.sendToPending);
        const loc = locations.find(l => l.id === row.location_id);

        const rollData = {
          tt_sku_tag_number: row.tt_sku_tag_number.trim(),
          parent_roll_id: null,
          parent_tt_sku_tag_number: null,
          product_id: row.product_id,
          product_name: row.product_name,
          dye_lot: row.dye_lot || '',
          width_ft: widthNum,
          original_length_ft: lengthNum,
          current_length_ft: lengthNum,
          roll_type: 'Parent',
          condition: row.condition,
          location_id: row.location_id || null,
          location_name: loc?.name || '',
          status: targetStatus,
          date_received: new Date().toISOString().split('T')[0],
          allocated_job_id: null,
          notes: `Unmarked return — source unknown. ${row.notes || ''}`.trim(),
        };

        const newRoll = await base44.entities.Roll.create(rollData);

        await base44.entities.Transaction.create({
          transaction_type: 'ReturnFromJob',
          roll_id: newRoll.id,
          tt_sku_tag_number: newRoll.tt_sku_tag_number,
          product_name: row.product_name,
          dye_lot: row.dye_lot || '',
          width_ft: widthNum,
          length_change_ft: lengthNum,
          length_before_ft: 0,
          length_after_ft: lengthNum,
          location_to: loc?.name || '',
          performed_by: user.full_name || user.email,
          notes: `Unmarked return — no source job. Condition ${row.condition}. ${row.notes || ''}`.trim(),
        });

        created.push({ roll: newRoll, targetStatus, location: loc?.name || '' });
      }

      return created;
    },
    onSuccess: results => {
      queryClient.invalidateQueries({ queryKey: ['rolls'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['pending-rolls'] });
      toast.success(`Logged ${results.length} unmarked return${results.length === 1 ? '' : 's'}.`);
      if (typeof onSuccess === 'function') onSuccess(results);
    },
    onError: err => {
      console.error('UnmarkedReturn submit failed:', err);
      toast.error(err?.message || 'Could not save the return.');
    },
  });

  return (
    <Card className="rounded-2xl border-slate-100 shadow-sm">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Receive without a job</CardTitle>
            <CardDescription>
              For rolls coming back where the source job is unknown. Each row creates a fresh
              roll record with no job/parent link — you can investigate later.
            </CardDescription>
          </div>
          {onCancel && (
            <Button variant="ghost" onClick={onCancel}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {rows.map((row, idx) => (
          <div key={row.key} className="rounded-lg border border-slate-200 p-4 space-y-3">
            <div className="flex items-start justify-between">
              <div className="text-sm font-medium text-slate-700">Row {idx + 1}</div>
              {rows.length > 1 && (
                <Button variant="ghost" size="sm" onClick={() => removeRow(row.key)} className="text-red-600">
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">TT SKU tag number *</Label>
                <Input
                  value={row.tt_sku_tag_number}
                  onChange={e => updateRow(row.key, { tt_sku_tag_number: e.target.value })}
                  placeholder="Scan or enter"
                  className="font-mono"
                />
              </div>
              <div>
                <Label className="text-xs">Condition *</Label>
                <Select value={row.condition} onValueChange={v => updateRow(row.key, { condition: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CONDITION_OPTIONS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Product *</Label>
                <Select value={row.product_id} onValueChange={v => setProduct(row.key, v)}>
                  <SelectTrigger><SelectValue placeholder="Pick product" /></SelectTrigger>
                  <SelectContent>
                    {products.map(p => <SelectItem key={p.id} value={p.id}>{p.product_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Dye lot</Label>
                <Input value={row.dye_lot} onChange={e => updateRow(row.key, { dye_lot: e.target.value })} placeholder="If known" />
              </div>
              <div>
                <Label className="text-xs">Width (ft) *</Label>
                <Input type="number" step="0.1" value={row.width_ft} onChange={e => updateRow(row.key, { width_ft: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Length (ft) *</Label>
                <Input type="number" step="0.1" value={row.length_ft} onChange={e => updateRow(row.key, { length_ft: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Location</Label>
                <Select value={row.location_id} onValueChange={v => updateRow(row.key, { location_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Pick location" /></SelectTrigger>
                  <SelectContent>
                    {locations.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-md">
                <div className="text-sm">
                  <div className="font-medium">Send to Pending Review</div>
                  <div className="text-xs text-slate-500">
                    Will land as {STATUS_LABELS[targetFor(row.condition, row.sendToPending)]}
                  </div>
                </div>
                <Switch checked={row.sendToPending} onCheckedChange={v => updateRow(row.key, { sendToPending: v })} />
              </div>
            </div>

            <div>
              <Label className="text-xs">Notes</Label>
              <Textarea
                value={row.notes}
                onChange={e => updateRow(row.key, { notes: e.target.value })}
                rows={2}
                placeholder="Anything worth logging — where it was found, suspected job, etc."
              />
            </div>
          </div>
        ))}

        <div className="flex items-center justify-between pt-2">
          <Button variant="outline" onClick={addRow}>
            <Plus className="h-4 w-4 mr-2" /> Add another roll
          </Button>
          <Button onClick={() => submitMutation.mutate()} disabled={submitMutation.isPending} className="bg-emerald-600 hover:bg-emerald-700">
            <Check className="h-4 w-4 mr-2" />
            Save unmarked returns
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
