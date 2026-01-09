import React, { useState } from 'react';

const suggestedLocations = [
  { name: 'TurfCasa Warehouse', type: 'warehouse', notes: 'Main storage for TurfCasa inventory' },
  { name: 'Small Warehouse', type: 'warehouse', notes: 'Smaller secondary warehouse' },
  { name: 'Big Warehouse', type: 'warehouse', notes: 'Main large warehouse' },
  { name: 'Aggregate Bin A', type: 'staging', notes: 'Aggregate storage bin A' },
  { name: 'Aggregate Bin B', type: 'staging', notes: 'Aggregate storage bin B' },
  { name: 'Aggregate Bin C', type: 'staging', notes: 'Aggregate storage bin C' },
  { name: 'Aggregate Bin D', type: 'staging', notes: 'Aggregate storage bin D' },
  { name: 'Aggregate Bin E', type: 'staging', notes: 'Aggregate storage bin E' },
  { name: 'Aggregate Bin F', type: 'staging', notes: 'Aggregate storage bin F' },
];
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Plus, 
  Pencil,
  Trash2,
  MapPin
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

export default function Locations() {
  const queryClient = useQueryClient();
  const [showDialog, setShowDialog] = useState(false);
  const [editingLocation, setEditingLocation] = useState(null);
  
  const [formData, setFormData] = useState({
    name: '',
    type: 'warehouse',
    notes: ''
  });

  const { data: locations = [], isLoading } = useQuery({
    queryKey: ['locations'],
    queryFn: () => base44.entities.Location.list('-created_date', 200),
  });

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      if (editingLocation) {
        return await base44.entities.Location.update(editingLocation.id, data);
      } else {
        return await base44.entities.Location.create(data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['locations'] });
      handleCloseDialog();
      toast.success(editingLocation ? 'Location updated' : 'Location created');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (locationId) => {
      await base44.entities.Location.delete(locationId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['locations'] });
      toast.success('Location deleted');
    }
  });

  const handleOpenDialog = (location = null) => {
    if (location) {
      setEditingLocation(location);
      setFormData({
        name: location.name,
        type: location.type,
        notes: location.notes || ''
      });
    } else {
      setEditingLocation(null);
      setFormData({
        name: '',
        type: 'warehouse',
        notes: ''
      });
    }
    setShowDialog(true);
  };

  const handleCloseDialog = () => {
    setShowDialog(false);
    setEditingLocation(null);
  };

  const handleSave = () => {
    if (!formData.name) {
      toast.error('Please enter a location name');
      return;
    }
    saveMutation.mutate(formData);
  };

  const typeColors = {
    warehouse: 'bg-blue-100 text-blue-700',
    truck: 'bg-purple-100 text-purple-700',
    staging: 'bg-amber-100 text-amber-700',
    returns: 'bg-orange-100 text-orange-700'
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-slate-800">Locations</h1>
          <p className="text-slate-500 mt-1">Manage warehouse locations</p>
        </div>
        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogTrigger asChild>
            <Button 
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={() => handleOpenDialog()}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Location
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{editingLocation ? 'Edit Location' : 'Add Location'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>Location Name *</Label>
                <Input 
                  value={formData.name}
                  onChange={e => setFormData(p => ({ ...p, name: e.target.value }))}
                  placeholder="e.g., Rack A-1, Zone 3"
                />
              </div>

              <div className="space-y-2">
                <Label>Type</Label>
                <Select 
                  value={formData.type} 
                  onValueChange={v => setFormData(p => ({ ...p, type: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="warehouse">Warehouse</SelectItem>
                    <SelectItem value="truck">Truck</SelectItem>
                    <SelectItem value="staging">Staging</SelectItem>
                    <SelectItem value="returns">Returns</SelectItem>
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
                {saveMutation.isPending ? 'Saving...' : 'Save Location'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Suggested Locations */}
      <div className="bg-white dark:bg-[#2d2d2d] rounded-2xl border border-slate-100 dark:border-slate-700/50 shadow-sm p-6">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-white mb-4">Suggested Locations</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {suggestedLocations.map((sug, idx) => (
            <div key={idx} className="flex items-center justify-between p-3 border border-slate-200 dark:border-slate-700 rounded-lg">
              <div>
                <p className="font-medium text-slate-800 dark:text-white">{sug.name}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">{sug.type}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setEditingLocation(null);
                  setFormData(sug);
                  setShowDialog(true);
                }}
                className="dark:border-slate-600 dark:text-white dark:hover:bg-slate-700"
              >
                Add
              </Button>
            </div>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-[#2d2d2d] rounded-2xl border border-slate-100 dark:border-slate-700/50 shadow-sm overflow-hidden">
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
                  <TableHead className="font-semibold">Location Name</TableHead>
                  <TableHead className="font-semibold">Type</TableHead>
                  <TableHead className="font-semibold">Notes</TableHead>
                  <TableHead className="font-semibold">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {locations.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-12 text-slate-500">
                      No locations yet
                    </TableCell>
                  </TableRow>
                ) : (
                  locations.map((location) => (
                    <TableRow key={location.id} className="hover:bg-slate-50 transition-colors">
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-slate-400" />
                          <span className="font-medium">{location.name}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center px-3 py-1 text-sm font-medium rounded-full ${typeColors[location.type]}`}>
                          {location.type}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-xs truncate text-slate-600">
                        {location.notes || '-'}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => handleOpenDialog(location)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => {
                              if (confirm('Delete this location?')) {
                                deleteMutation.mutate(location.id);
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