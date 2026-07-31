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
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import StatusBadge from '@/components/ui/StatusBadge';
import { describeError } from '@/lib/query-client';

// Sentinel for the manufacturer dropdown. Special-order suppliers (Realturf and
// similar) aren't in the Vendor list, so the form needs a free-text escape hatch.
const OTHER_MANUFACTURER = '__other__';

const WIDTH_CHOICES = [3.28, 6.56, 12, 13, 15, 16.4];

const EMPTY_FORM = {
  product_name: '',
  sku_code: '',
  manufacturer_name: '',
  width_options: [13, 15],
  standard_roll_length_ft: 100,
  cost_per_sqft: '',
  min_stock_level_ft: '',
  status: 'active',
  notes: '',
};

/** Numeric fields reject '' and NaN, so anything unusable must be dropped. */
function numOrOmit(value) {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : undefined;
}

const normalise = (s) => (s || '').trim().toLowerCase();

export default function Products() {
  const queryClient = useQueryClient();
  const [showDialog, setShowDialog] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [manufacturerMode, setManufacturerMode] = useState('list');

  const [formData, setFormData] = useState(EMPTY_FORM);

  // Distinct key from the active-only product queries elsewhere. Sharing one key
  // between a full list and a filtered one meant whichever page loaded first
  // decided what this table showed, which is how products appeared to go missing
  // and got re-added as duplicates.
  const { data: products = [], isLoading } = useQuery({
    queryKey: ['products', 'all'],
    queryFn: () => base44.entities.Product.list('-created_date', 500),
  });

  const { data: manufacturers = [] } = useQuery({
    queryKey: ['manufacturers'],
    queryFn: async () => {
      const vendors = await base44.entities.Vendor.list('-created_date', 200);
      // A Select.Item with an empty value throws in Radix and blanks the dialog.
      return vendors.filter(v => (v.vendor_name || '').trim());
    },
  });

  // Same product name under the same manufacturer means two records for one real
  // product; flag them so they can be merged rather than quietly compounding.
  const duplicateKeys = React.useMemo(() => {
    const seen = new Map();
    const dupes = new Set();
    for (const p of products) {
      const key = `${normalise(p.product_name)}|${normalise(p.manufacturer_name)}`;
      if (seen.has(key)) dupes.add(key);
      seen.set(key, true);
    }
    return dupes;
  }, [products]);

  const isDuplicate = (p) =>
    duplicateKeys.has(`${normalise(p.product_name)}|${normalise(p.manufacturer_name)}`);

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      const payload = {
        product_name: data.product_name.trim(),
        sku_code: (data.sku_code || '').trim(),
        manufacturer_name: (data.manufacturer_name || '').trim(),
        width_options: data.width_options,
        status: data.status || 'active',
        notes: (data.notes || '').trim(),
      };
      const standardLength = numOrOmit(data.standard_roll_length_ft);
      if (standardLength !== undefined) payload.standard_roll_length_ft = standardLength;
      const cost = numOrOmit(data.cost_per_sqft);
      if (cost !== undefined) payload.cost_per_sqft = cost;
      const minStock = numOrOmit(data.min_stock_level_ft);
      if (minStock !== undefined) payload.min_stock_level_ft = minStock;

      if (editingProduct) {
        return await base44.entities.Product.update(editingProduct.id, payload);
      }
      return await base44.entities.Product.create(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      handleCloseDialog();
      toast.success(editingProduct ? 'Product updated' : 'Product created');
    },
    onError: (error) => {
      toast.error(`Couldn't save the product: ${describeError(error)}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (productId) => {
      // A deleted product leaves its rolls pointing at nothing, which values them
      // at $0 and drops them out of the low-stock report.
      const rolls = await base44.entities.Roll.filter({ product_id: productId });
      if (rolls.length > 0) {
        throw new Error(
          `${rolls.length} roll(s) still reference this product. Set it to Inactive instead of deleting it.`,
        );
      }
      await base44.entities.Product.delete(productId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('Product deleted');
    },
    onError: (error) => {
      toast.error(describeError(error));
    },
  });

  const handleOpenDialog = (product = null) => {
    if (product) {
      setEditingProduct(product);
      setFormData({
        // Fallbacks matter: a legacy row missing either value would otherwise flip
        // the input from controlled to uncontrolled mid-session.
        product_name: product.product_name || '',
        sku_code: product.sku_code || '',
        manufacturer_name: product.manufacturer_name || '',
        width_options: product.width_options || [13, 15],
        standard_roll_length_ft: product.standard_roll_length_ft ?? 100,
        cost_per_sqft: product.cost_per_sqft ?? '',
        min_stock_level_ft: product.min_stock_level_ft ?? '',
        status: product.status || 'active',
        notes: product.notes || '',
      });
      const known = manufacturers.some(m => m.vendor_name === product.manufacturer_name);
      setManufacturerMode(known || !product.manufacturer_name ? 'list' : 'other');
    } else {
      setEditingProduct(null);
      setFormData(EMPTY_FORM);
      setManufacturerMode('list');
    }
    setShowDialog(true);
  };

  const handleCloseDialog = () => {
    setShowDialog(false);
    setEditingProduct(null);
    setManufacturerMode('list');
  };

  const handleSave = () => {
    const name = (formData.product_name || '').trim();
    const manufacturer = (formData.manufacturer_name || '').trim();

    if (!name) {
      toast.error('Enter a product name');
      return;
    }
    if (!manufacturer) {
      toast.error('Pick a manufacturer, or choose Other and type one in');
      return;
    }
    if (formData.width_options.length === 0) {
      toast.error('Pick at least one width');
      return;
    }

    const clash = products.find(
      p =>
        p.id !== editingProduct?.id &&
        normalise(p.product_name) === normalise(name) &&
        normalise(p.manufacturer_name) === normalise(manufacturer),
    );
    if (clash) {
      toast.error(
        `${name} already exists under ${manufacturer}. Edit that one instead of adding a second copy.`,
      );
      return;
    }

    saveMutation.mutate({ ...formData, product_name: name, manufacturer_name: manufacturer });
  };

  const toggleWidth = (width) => {
    setFormData(p => ({
      ...p,
      width_options: p.width_options.includes(width)
        ? p.width_options.filter(w => w !== width)
        : [...p.width_options, width].sort((a, b) => a - b),
    }));
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
                  value={
                    manufacturerMode === 'other' ? OTHER_MANUFACTURER : formData.manufacturer_name
                  }
                  onValueChange={v => {
                    if (v === OTHER_MANUFACTURER) {
                      setManufacturerMode('other');
                      setFormData(p => ({ ...p, manufacturer_name: '' }));
                    } else {
                      setManufacturerMode('list');
                      setFormData(p => ({ ...p, manufacturer_name: v }));
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select manufacturer" />
                  </SelectTrigger>
                  <SelectContent>
                    {manufacturers.map(m => (
                      <SelectItem key={m.id} value={m.vendor_name}>{m.vendor_name}</SelectItem>
                    ))}
                    <SelectItem value={OTHER_MANUFACTURER}>
                      Other / special order…
                    </SelectItem>
                  </SelectContent>
                </Select>
                {manufacturerMode === 'other' && (
                  <>
                    <Input
                      value={formData.manufacturer_name}
                      onChange={e =>
                        setFormData(p => ({ ...p, manufacturer_name: e.target.value }))
                      }
                      placeholder="Type the manufacturer, e.g. Realturf"
                      autoFocus
                    />
                    <p className="text-xs text-slate-500">
                      For one-off or special-order suppliers that aren't set up as vendors.
                    </p>
                  </>
                )}
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
                <Label>Widths available *</Label>
                <div className="flex flex-wrap gap-2">
                  {WIDTH_CHOICES.map(w => {
                    const on = formData.width_options.includes(w);
                    return (
                      <Button
                        key={w}
                        type="button"
                        variant={on ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => toggleWidth(w)}
                        className={on ? 'bg-emerald-600 hover:bg-emerald-700' : ''}
                      >
                        {w} ft
                      </Button>
                    );
                  })}
                </div>
                <p className="text-xs text-slate-500">
                  These are the widths offered when receiving a roll of this product.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Standard Roll Length (ft)</Label>
                <Input
                  type="number"
                  min="1"
                  step="0.01"
                  value={formData.standard_roll_length_ft}
                  onChange={e =>
                    setFormData(p => ({ ...p, standard_roll_length_ft: e.target.value }))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label>Cost per Square Foot ($)</Label>
                <Input 
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.cost_per_sqft}
                  onChange={e => setFormData(p => ({ ...p, cost_per_sqft: e.target.value }))}
                  placeholder="e.g. 0.19"
                />
                <p className="text-xs text-slate-500">
                  Used to calculate inventory value. Visible to admins only on the dashboard.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Minimum Stock Level (ft)</Label>
                <Input 
                  type="number"
                  min="0"
                  value={formData.min_stock_level_ft}
                  onChange={e => setFormData(p => ({ ...p, min_stock_level_ft: e.target.value }))}
                  placeholder="Leave blank to disable low-stock alerts"
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

      {duplicateKeys.size > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
          <p className="font-medium text-amber-900">
            {duplicateKeys.size} duplicate product{duplicateKeys.size === 1 ? '' : 's'} found
          </p>
          <p className="text-sm text-amber-800 mt-1">
            The rows flagged below share a product name and manufacturer, so the same turf
            exists twice. Rolls may be split across both copies. Set the copy you don't want
            to Inactive, or delete it once no rolls reference it.
          </p>
        </div>
      )}

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
                    <TableRow
                      key={product.id}
                      className={`transition-colors ${
                        isDuplicate(product)
                          ? 'bg-amber-50 hover:bg-amber-100'
                          : 'hover:bg-slate-50'
                      }`}
                    >
                      <TableCell className="font-medium">
                        {product.product_name}
                        {isDuplicate(product) && (
                          <span className="ml-2 text-xs font-normal text-amber-700">
                            duplicate
                          </span>
                        )}
                      </TableCell>
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