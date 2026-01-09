import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Edit, Trash2, Package, Search } from 'lucide-react';
import { toast } from 'sonner';

const CATEGORIES = [
  "Adhesives (Glue)",
  "Seaming (Tape / Seam Materials)",
  "Infill / Topdress",
  "Sand (Bulk)",
  "Base Materials (DG / Aggregate)",
  "Rock / Gravel (Bulk)",
  "Weed Barrier / Ground Cover",
  "Edging",
  "Fasteners",
  "Putting Green Accessories",
  "Tools",
  "Cleaning / Deodorizer"
];

export default function InventoryItems() {
  const queryClient = useQueryClient();
  const [showDialog, setShowDialog] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [formData, setFormData] = useState({
    item_name: '',
    sku: '',
    category: '',
    unit_of_measure: '',
    unit_size_definition: '',
    quantity_on_hand: 0,
    min_stock_level_units: 0,
    cost_per_unit: 0,
    notes: ''
  });

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['inventoryItems'],
    queryFn: () => base44.entities.InventoryItem.list()
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.InventoryItem.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventoryItems'] });
      resetForm();
      setShowDialog(false);
      toast.success('Item created successfully');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to create item');
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.InventoryItem.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventoryItems'] });
      resetForm();
      setShowDialog(false);
      toast.success('Item updated successfully');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to update item');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.InventoryItem.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventoryItems'] });
      toast.success('Item deleted successfully');
    }
  });

  const resetForm = () => {
    setFormData({
      item_name: '',
      sku: '',
      category: '',
      unit_of_measure: '',
      unit_size_definition: '',
      quantity_on_hand: 0,
      min_stock_level_units: 0,
      cost_per_unit: 0,
      notes: ''
    });
    setEditingItem(null);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleEdit = (item) => {
    setEditingItem(item);
    setFormData({
      item_name: item.item_name,
      sku: item.sku || '',
      category: item.category,
      unit_of_measure: item.unit_of_measure,
      unit_size_definition: item.unit_size_definition,
      quantity_on_hand: item.quantity_on_hand || 0,
      min_stock_level_units: item.min_stock_level_units || 0,
      cost_per_unit: item.cost_per_unit || 0,
      notes: item.notes || ''
    });
    setShowDialog(true);
  };

  const filteredItems = items.filter(item => {
    const matchesSearch = searchTerm === '' || 
      item.item_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.sku?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.category?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || item.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  // Calculate low stock items
  const lowStockItems = items.filter(item => 
    item.min_stock_level_units && item.quantity_on_hand < item.min_stock_level_units
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-slate-800 dark:text-white">Other Inventory</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            Manage accessories, materials, and supplies
          </p>
        </div>
        <Dialog open={showDialog} onOpenChange={(open) => {
          setShowDialog(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button className="bg-emerald-600 hover:bg-emerald-700">
              <Plus className="h-4 w-4 mr-2" />
              Add Item
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto dark:bg-[#2d2d2d] dark:border-slate-700/50">
            <DialogHeader>
              <DialogTitle className="dark:text-white">
                {editingItem ? 'Edit Item' : 'Add New Item'}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 mt-4">
              <div>
                <Label className="dark:text-slate-300">Item Name *</Label>
                <Input
                  value={formData.item_name}
                  onChange={(e) => setFormData({...formData, item_name: e.target.value})}
                  placeholder="e.g., U-Staples, Seaming Tape"
                  required
                  className="dark:bg-slate-800 dark:text-white dark:border-slate-700"
                />
              </div>

              <div>
                <Label className="dark:text-slate-300">SKU</Label>
                <Input
                  value={formData.sku}
                  onChange={(e) => setFormData({...formData, sku: e.target.value})}
                  placeholder="Stock Keeping Unit"
                  className="dark:bg-slate-800 dark:text-white dark:border-slate-700"
                />
              </div>

              <div>
                <Label className="dark:text-slate-300">Category *</Label>
                <Select
                  value={formData.category}
                  onValueChange={(value) => setFormData({...formData, category: value})}
                  required
                >
                  <SelectTrigger className="dark:bg-slate-800 dark:text-white dark:border-slate-700">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent className="dark:bg-[#2d2d2d] dark:border-slate-700">
                    {CATEGORIES.map(cat => (
                      <SelectItem key={cat} value={cat} className="dark:text-white">{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="dark:text-slate-300">Unit of Measurement (UOM) *</Label>
                <Input
                  value={formData.unit_of_measure}
                  onChange={(e) => setFormData({...formData, unit_of_measure: e.target.value})}
                  placeholder="e.g., box, piece, yard, gallon, lb"
                  required
                  className="dark:bg-slate-800 dark:text-white dark:border-slate-700"
                />
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  How you stock/count it: box, stick, unit, etc.
                </p>
              </div>

              <div>
                <Label className="dark:text-slate-300">Unit Size / Unit Definition *</Label>
                <Input
                  value={formData.unit_size_definition}
                  onChange={(e) => setFormData({...formData, unit_size_definition: e.target.value})}
                  placeholder="e.g., 100 sq ft, 50 lbs, 1 gallon"
                  required
                  className="dark:bg-slate-800 dark:text-white dark:border-slate-700"
                />
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  What 1 unit equals
                </p>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label className="dark:text-slate-300">Quantity on Hand</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.quantity_on_hand}
                    onChange={(e) => setFormData({...formData, quantity_on_hand: parseFloat(e.target.value) || 0})}
                    className="dark:bg-slate-800 dark:text-white dark:border-slate-700"
                  />
                </div>
                <div>
                  <Label className="dark:text-slate-300">Min Stock Level</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.min_stock_level_units}
                    onChange={(e) => setFormData({...formData, min_stock_level_units: parseFloat(e.target.value) || 0})}
                    className="dark:bg-slate-800 dark:text-white dark:border-slate-700"
                  />
                </div>
                <div>
                  <Label className="dark:text-slate-300">Cost per Unit</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.cost_per_unit}
                    onChange={(e) => setFormData({...formData, cost_per_unit: parseFloat(e.target.value) || 0})}
                    className="dark:bg-slate-800 dark:text-white dark:border-slate-700"
                  />
                </div>
              </div>

              <div>
                <Label className="dark:text-slate-300">Notes</Label>
                <Textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({...formData, notes: e.target.value})}
                  placeholder="Additional information"
                  className="dark:bg-slate-800 dark:text-white dark:border-slate-700"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button type="button" variant="outline" onClick={() => {
                  setShowDialog(false);
                  resetForm();
                }}>
                  Cancel
                </Button>
                <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700">
                  {editingItem ? 'Update Item' : 'Create Item'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="rounded-2xl border-slate-100 dark:border-slate-700/50 shadow-sm dark:bg-[#2d2d2d]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500 dark:text-slate-400">Total Items</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-slate-800 dark:text-white">{items.length}</p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-slate-100 dark:border-slate-700/50 shadow-sm dark:bg-[#2d2d2d]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500 dark:text-slate-400">Low Stock Alerts</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-amber-600 dark:text-amber-400">{lowStockItems.length}</p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-slate-100 dark:border-slate-700/50 shadow-sm dark:bg-[#2d2d2d]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500 dark:text-slate-400">Categories</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">
              {new Set(items.map(i => i.category)).size}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by name, SKU, or category..."
            className="pl-10 dark:bg-slate-800 dark:text-white dark:border-slate-700"
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-full sm:w-64 dark:bg-slate-800 dark:text-white dark:border-slate-700">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent className="dark:bg-[#2d2d2d] dark:border-slate-700">
            <SelectItem value="all" className="dark:text-white">All Categories</SelectItem>
            {CATEGORIES.map(cat => (
              <SelectItem key={cat} value={cat} className="dark:text-white">{cat}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Items Table */}
      <Card className="rounded-2xl border-slate-100 dark:border-slate-700/50 shadow-sm overflow-hidden dark:bg-[#2d2d2d]">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50 dark:bg-slate-800/50">
                <TableHead className="dark:text-slate-300">Item Name</TableHead>
                <TableHead className="dark:text-slate-300">SKU</TableHead>
                <TableHead className="dark:text-slate-300">Category</TableHead>
                <TableHead className="dark:text-slate-300">Unit</TableHead>
                <TableHead className="dark:text-slate-300">Unit Size</TableHead>
                <TableHead className="dark:text-slate-300">Qty on Hand</TableHead>
                <TableHead className="dark:text-slate-300">Min Stock</TableHead>
                <TableHead className="dark:text-slate-300">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-slate-500 dark:text-slate-400">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : filteredItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-slate-500 dark:text-slate-400">
                    No items found
                  </TableCell>
                </TableRow>
              ) : (
                filteredItems.map((item) => {
                  const isLowStock = item.min_stock_level_units && item.quantity_on_hand < item.min_stock_level_units;
                  return (
                    <TableRow key={item.id} className={isLowStock ? 'bg-amber-50 dark:bg-amber-900/10' : ''}>
                      <TableCell className="font-medium dark:text-white">{item.item_name}</TableCell>
                      <TableCell className="dark:text-slate-300">{item.sku || '-'}</TableCell>
                      <TableCell className="text-sm dark:text-slate-300">{item.category}</TableCell>
                      <TableCell className="dark:text-slate-300">{item.unit_of_measure}</TableCell>
                      <TableCell className="dark:text-slate-300">{item.unit_size_definition}</TableCell>
                      <TableCell className={isLowStock ? 'font-bold text-amber-700 dark:text-amber-400' : 'dark:text-white'}>
                        {item.quantity_on_hand || 0}
                      </TableCell>
                      <TableCell className="dark:text-slate-300">{item.min_stock_level_units || '-'}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(item)}
                            className="text-blue-600 hover:text-blue-700 dark:text-blue-400"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              if (confirm('Are you sure you want to delete this item?')) {
                                deleteMutation.mutate(item.id);
                              }
                            }}
                            className="text-red-600 hover:text-red-700 dark:text-red-400"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}