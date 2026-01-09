import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Plus, 
  Pencil,
  Trash2
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
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import StatusBadge from '@/components/ui/StatusBadge';

export default function Products() {
  const queryClient = useQueryClient();
  const [showDialog, setShowDialog] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  
  const [formData, setFormData] = useState({
    product_name: '',
    sku_code: '',
    manufacturer_name: '',
    width_options: [13, 15],
    standard_roll_length_ft: 100,
    status: 'active',
    notes: ''
  });

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['products'],
    queryFn: () => base44.entities.Product.list('-created_date', 200),
  });

  const { data: manufacturers = [] } = useQuery({
    queryKey: ['manufacturers'],
    queryFn: () => base44.entities.Vendor.list(),
  });

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      if (editingProduct) {
        return await base44.entities.Product.update(editingProduct.id, data);
      } else {
        return await base44.entities.Product.create(data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      handleCloseDialog();
      toast.success(editingProduct ? 'Product updated' : 'Product created');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (productId) => {
      await base44.entities.Product.delete(productId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('Product deleted');
    }
  });

  const handleOpenDialog = (product = null) => {
    if (product) {
      setEditingProduct(product);
      setFormData({
        product_name: product.product_name,
        sku_code: product.sku_code || '',
        manufacturer_name: product.manufacturer_name || '',
        width_options: product.width_options || [13, 15],
        standard_roll_length_ft: product.standard_roll_length_ft || 100,
        status: product.status,
        notes: product.notes || ''
      });
    } else {
      setEditingProduct(null);
      setFormData({
        product_name: '',
        sku_code: '',
        manufacturer_name: '',
        width_options: [13, 15],
        standard_roll_length_ft: 100,
        status: 'active',
        notes: ''
      });
    }
    setShowDialog(true);
  };

  const handleCloseDialog = () => {
    setShowDialog(false);
    setEditingProduct(null);
  };

  const handleSave = () => {
    if (!formData.product_name) {
      toast.error('Please enter a product name');
      return;
    }
    saveMutation.mutate(formData);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-slate-800">Products</h1>
          <p className="text-slate-500 mt-1">Manage turf products and SKUs</p>
        </div>
        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogTrigger asChild>
            <Button 
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={() => handleOpenDialog()}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Product
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{editingProduct ? 'Edit Product' : 'Add Product'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>Product Name *</Label>
                <Input 
                  value={formData.product_name}
                  onChange={e => setFormData(p => ({ ...p, product_name: e.target.value }))}
                  placeholder="e.g., TexasLush"
                />
              </div>

              <div className="space-y-2">
                <Label>Manufacturer *</Label>
                <Select 
                  value={formData.manufacturer_name} 
                  onValueChange={v => setFormData(p => ({ ...p, manufacturer_name: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select manufacturer" />
                  </SelectTrigger>
                  <SelectContent>
                    {manufacturers.map(m => (
                      <SelectItem key={m.id} value={m.vendor_name}>{m.vendor_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>SKU Code</Label>
                <Input 
                  value={formData.sku_code}
                  onChange={e => setFormData(p => ({ ...p, sku_code: e.target.value }))}
                  placeholder="Optional SKU"
                />
              </div>

              <div className="space-y-2">
                <Label>Standard Roll Length (ft)</Label>
                <Input 
                  type="number"
                  min="1"
                  value={formData.standard_roll_length_ft}
                  onChange={e => setFormData(p => ({ ...p, standard_roll_length_ft: parseInt(e.target.value) }))}
                />
              </div>

              <div className="space-y-2">
                <Label>Status</Label>
                <Select 
                  value={formData.status} 
                  onValueChange={v => setFormData(p => ({ ...p, status: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea 
                  value={formData.notes}
                  onChange={e => setFormData(p => ({ ...p, notes: e.target.value }))}
                  placeholder="Optional notes..."
                  rows={2}
                />
              </div>

              <Button 
                onClick={handleSave} 
                disabled={saveMutation.isPending}
                className="w-full bg-emerald-600 hover:bg-emerald-700"
              >
                {saveMutation.isPending ? 'Saving...' : 'Save Product'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-4">
            {[1, 2, 3, 4, 5].map(i => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="font-semibold">Product Name</TableHead>
                  <TableHead className="font-semibold">Manufacturer</TableHead>
                  <TableHead className="font-semibold">SKU Code</TableHead>
                  <TableHead className="font-semibold">Standard Length</TableHead>
                  <TableHead className="font-semibold">Width Options</TableHead>
                  <TableHead className="font-semibold">Status</TableHead>
                  <TableHead className="font-semibold">Notes</TableHead>
                  <TableHead className="font-semibold">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12 text-slate-500">
                      No products yet
                    </TableCell>
                  </TableRow>
                ) : (
                  products.map((product) => (
                    <TableRow key={product.id} className="hover:bg-slate-50 transition-colors">
                      <TableCell className="font-medium">{product.product_name}</TableCell>
                      <TableCell>{product.manufacturer_name || '-'}</TableCell>
                      <TableCell className="font-mono text-sm">{product.sku_code || '-'}</TableCell>
                      <TableCell>{product.standard_roll_length_ft || 100} ft</TableCell>
                      <TableCell>
                        {product.width_options?.join(', ') || '13, 15'} ft
                      </TableCell>
                      <TableCell>
                        <StatusBadge 
                          status={product.status === 'active' ? 'Available' : 'Scrapped'} 
                          size="sm" 
                        />
                      </TableCell>
                      <TableCell className="max-w-xs truncate text-slate-600">
                        {product.notes || '-'}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => handleOpenDialog(product)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => {
                              if (confirm('Delete this product?')) {
                                deleteMutation.mutate(product.id);
                              }
                            }}
                            disabled={deleteMutation.isPending}
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
        )}
      </div>
    </div>
  );
}