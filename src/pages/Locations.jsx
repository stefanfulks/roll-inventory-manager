import React, { useState } from 'react';
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
  const [selectedLocations, setSelectedLocations] = useState([]);
  
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
    mutationFn: async (locationIds) => {
      const ids = Array.isArray(locationIds) ? locationIds : [locationIds];
      for (const id of ids) {
        await base44.entities.Location.delete(id);
      }
    },
    onSuccess: (_, locationIds) => {
      queryClient.invalidateQueries({ queryKey: ['locations'] });
      const count = Array.isArray(locationIds) ? locationIds.length : 1;
      toast.success(`${count} location${count > 1 ? 's' : ''} deleted`);
      setSelectedLocations([]);
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
        <div className="flex gap-2">
          {selectedLocations.length > 0 && (
            <Button 
              variant="outline"
              className="border-red-600 text-red-600 hover:bg-red-50"
              onClick={() => {
                if (confirm(`Delete ${selectedLocations.length} selected location${selectedLocations.length > 1 ? 's' : ''}?`)) {
                  deleteMutation.mutate(selectedLocations);
                }
              }}
              disabled={deleteMutation.isPending}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Selected ({selectedLocations.length})
            </Button>
          )}
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

              {editingLocation && (
                <>
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
                </>
              )}

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
                  <TableHead className="w-12">
                    <input
                      type="checkbox"
                      checked={selectedLocations.length === locations.length && locations.length > 0}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedLocations(locations.map(l => l.id));
                        } else {
                          setSelectedLocations([]);
                        }
                      }}
                      className="cursor-pointer"
                    />
                  </TableHead>
                  <TableHead className="font-semibold">Location Name</TableHead>
                  <TableHead className="font-semibold">Type</TableHead>
                  <TableHead className="font-semibold">Notes</TableHead>
                  <TableHead className="font-semibold">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {locations.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12 text-slate-500">
                      No locations yet
                    </TableCell>
                  </TableRow>
                ) : (
                  locations.map((location) => (
                    <TableRow key={location.id} className="hover:bg-slate-50 transition-colors">
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={selectedLocations.includes(location.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedLocations(prev => [...prev, location.id]);
                            } else {
                              setSelectedLocations(prev => prev.filter(id => id !== location.id));
                            }
                          }}
                          className="cursor-pointer"
                        />
                      </TableCell>
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