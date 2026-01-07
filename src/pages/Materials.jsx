import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';

export default function Materials() {
  const queryClient = useQueryClient();
  const [showDialog, setShowDialog] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState({
    item_name: '',
    sku: '',
    unit_of_measure: '',
    cost_per_unit: '',
    notes: ''
  });

  const { data: materials = [], isLoading } = useQuery({
    queryKey: ['materials'],
    queryFn: () => base44.entities.Material.list('-created_date', 500),
  });

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      if (editingItem) {
        return await base44.entities.Material.update(editingItem.id, data);
      } else {
        return await base44.entities.Material.create(data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['materials'] });
      handleCloseDialog();
      toast.success(editingItem ? 'Material updated' : 'Material created');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => await base44.entities.Material.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['materials'] });
      toast.success('Material deleted');
    }
  });

  const handleOpenDialog = (item = null) => {
    if (item) {
      setEditingItem(item);
      setFormData({
        item_name: item.item_name,
        sku: item.sku || '',
        unit_of_measure: item.unit_of_measure || '',
        cost_per_unit: item.cost_per_unit || '',
        notes: item.notes || ''
      });
    } else {
      setEditingItem(null);
      setFormData({ item_name: '', sku: '', unit_of_measure: '', cost_per_unit: '', notes: '' });
    }
    setShowDialog(true);
  };

  const handleCloseDialog = () => {
    setShowDialog(false);
    setEditingItem(null);
  };

  const handleSave = () => {
    if (!formData.item_name) {
      toast.error('Please enter an item name');
      return;
    }
    const data = { ...formData };
    if (data.cost_per_unit) data.cost_per_unit = parseFloat(data.cost_per_unit);
    saveMutation.mutate(data);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-slate-800">Materials</h1>
          <p className="text-slate-500 mt-1">Manage material items</p>
        </div>
        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogTrigger asChild>
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => handleOpenDialog()}>
              <Plus className="h-4 w-4 mr-2" />
              Add Material
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{editingItem ? 'Edit Material' : 'Add Material'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>Item Name *</Label>
                <Input value={formData.item_name} onChange={e => setFormData(p => ({ ...p, item_name: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>SKU</Label>
                <Input value={formData.sku} onChange={e => setFormData(p => ({ ...p, sku: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Unit of Measure</Label>
                <Input value={formData.unit_of_measure} onChange={e => setFormData(p => ({ ...p, unit_of_measure: e.target.value }))} placeholder="e.g., lb, gallon, bag" />
              </div>
              <div className="space-y-2">
                <Label>Cost Per Unit</Label>
                <Input type="number" step="0.01" value={formData.cost_per_unit} onChange={e => setFormData(p => ({ ...p, cost_per_unit: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea value={formData.notes} onChange={e => setFormData(p => ({ ...p, notes: e.target.value }))} rows={2} />
              </div>
              <Button onClick={handleSave} disabled={saveMutation.isPending} className="w-full bg-emerald-600 hover:bg-emerald-700">
                {saveMutation.isPending ? 'Saving...' : 'Save Material'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-4">
            {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="font-semibold">Item Name</TableHead>
                  <TableHead className="font-semibold">SKU</TableHead>
                  <TableHead className="font-semibold">Unit</TableHead>
                  <TableHead className="font-semibold">Cost/Unit</TableHead>
                  <TableHead className="font-semibold">Notes</TableHead>
                  <TableHead className="font-semibold">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {materials.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-slate-500">No materials yet</TableCell>
                  </TableRow>
                ) : (
                  materials.map((item) => (
                    <TableRow key={item.id} className="hover:bg-slate-50 transition-colors">
                      <TableCell className="font-medium">{item.item_name}</TableCell>
                      <TableCell className="font-mono text-sm">{item.sku || '-'}</TableCell>
                      <TableCell>{item.unit_of_measure || '-'}</TableCell>
                      <TableCell>{item.cost_per_unit ? `$${item.cost_per_unit}` : '-'}</TableCell>
                      <TableCell className="max-w-xs truncate text-slate-600">{item.notes || '-'}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button variant="ghost" size="sm" onClick={() => handleOpenDialog(item)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => { if (confirm('Delete?')) deleteMutation.mutate(item.id); }} className="text-red-500 hover:text-red-700">
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
        )}
      </div>
    </div>
  );
}