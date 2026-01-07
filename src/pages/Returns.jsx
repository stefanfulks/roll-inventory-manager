import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  RotateCcw, 
  Check,
  Search
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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { toast } from 'sonner';
import RollSearch from '@/components/inventory/RollSearch';
import StatusBadge from '@/components/ui/StatusBadge';
import OwnerBadge from '@/components/ui/OwnerBadge';

function generateRollTag() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = 'RT-';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export default function Returns() {
  const queryClient = useQueryClient();
  
  const [returnType, setReturnType] = useState('tagged'); // tagged or untagged
  const [selectedRoll, setSelectedRoll] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processedReturn, setProcessedReturn] = useState(null);
  
  // For tagged returns
  const [taggedForm, setTaggedForm] = useState({
    return_length: '',
    condition: 'Good',
    location_id: '',
    location_name: '',
    status: 'Available',
    notes: ''
  });

  // For untagged returns
  const [untaggedForm, setUntaggedForm] = useState({
    inventory_owner: 'TexasTurf',
    product_name: '',
    dye_lot: '',
    width_ft: '',
    length_ft: '',
    condition: 'Good',
    location_id: '',
    location_name: '',
    status: 'Available',
    notes: ''
  });

  const { data: rolls = [] } = useQuery({
    queryKey: ['shipped-rolls'],
    queryFn: () => base44.entities.Roll.filter({ status: 'Shipped' }, '-created_date', 500),
  });

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => base44.entities.Product.filter({ status: 'active' }),
  });

  const { data: locations = [] } = useQuery({
    queryKey: ['locations'],
    queryFn: () => base44.entities.Location.list(),
  });

  const { data: jobs = [] } = useQuery({
    queryKey: ['jobs'],
    queryFn: () => base44.entities.Job.list('-created_date', 100),
  });

  const handleSearchRoll = (searchTerm) => {
    // Search in shipped rolls first, then all rolls
    let found = rolls.find(r => 
      r.roll_tag?.toLowerCase() === searchTerm.toLowerCase() ||
      r.roll_tag?.toLowerCase().includes(searchTerm.toLowerCase())
    );
    
    if (found) {
      setSelectedRoll(found);
      setTaggedForm(prev => ({
        ...prev,
        return_length: found.current_length_ft?.toString() || ''
      }));
      setProcessedReturn(null);
    } else {
      toast.error('Roll not found in shipped inventory');
    }
  };

  const handleTaggedReturn = async () => {
    if (!selectedRoll) {
      toast.error('Please select a roll');
      return;
    }

    const returnLength = parseFloat(taggedForm.return_length);
    if (!returnLength || returnLength <= 0) {
      toast.error('Please enter a valid return length');
      return;
    }

    setIsProcessing(true);

    // Update roll
    await base44.entities.Roll.update(selectedRoll.id, {
      current_length_ft: returnLength,
      condition: taggedForm.condition,
      location_id: taggedForm.location_id || selectedRoll.location_id,
      location_name: taggedForm.location_name || selectedRoll.location_name,
      status: taggedForm.status
    });

    // Create transaction
    await base44.entities.Transaction.create({
      transaction_type: 'Return',
      inventory_owner: selectedRoll.inventory_owner,
      roll_id: selectedRoll.id,
      roll_tag: selectedRoll.roll_tag,
      length_change_ft: returnLength,
      length_before_ft: 0,
      length_after_ft: returnLength,
      product_name: selectedRoll.product_name,
      dye_lot: selectedRoll.dye_lot,
      width_ft: selectedRoll.width_ft,
      location_to: taggedForm.location_name,
      notes: taggedForm.notes || `Returned with condition: ${taggedForm.condition}`
    });

    queryClient.invalidateQueries({ queryKey: ['rolls'] });
    queryClient.invalidateQueries({ queryKey: ['shipped-rolls'] });
    queryClient.invalidateQueries({ queryKey: ['transactions'] });

    setProcessedReturn({
      ...selectedRoll,
      current_length_ft: returnLength,
      condition: taggedForm.condition,
      status: taggedForm.status
    });
    setSelectedRoll(null);
    setTaggedForm({
      return_length: '',
      condition: 'Good',
      location_id: '',
      location_name: '',
      status: 'Available',
      notes: ''
    });
    setIsProcessing(false);
    toast.success('Return processed successfully');
  };

  const handleUntaggedReturn = async () => {
    if (!untaggedForm.product_name || !untaggedForm.dye_lot || !untaggedForm.width_ft || !untaggedForm.length_ft) {
      toast.error('Please fill in all required fields');
      return;
    }

    setIsProcessing(true);

    const rollTag = generateRollTag();
    const rollData = {
      roll_tag: rollTag,
      inventory_owner: untaggedForm.inventory_owner,
      product_name: untaggedForm.product_name,
      dye_lot: untaggedForm.dye_lot,
      width_ft: parseFloat(untaggedForm.width_ft),
      original_length_ft: parseFloat(untaggedForm.length_ft),
      current_length_ft: parseFloat(untaggedForm.length_ft),
      roll_type: 'Child',
      condition: untaggedForm.condition,
      location_id: untaggedForm.location_id,
      location_name: untaggedForm.location_name,
      status: untaggedForm.status,
      date_received: new Date().toISOString().split('T')[0],
      notes: `Untagged return: ${untaggedForm.notes || 'No notes'}`
    };

    const roll = await base44.entities.Roll.create(rollData);

    // Create transaction
    await base44.entities.Transaction.create({
      transaction_type: 'Return',
      inventory_owner: untaggedForm.inventory_owner,
      roll_id: roll.id,
      roll_tag: rollTag,
      length_change_ft: parseFloat(untaggedForm.length_ft),
      length_before_ft: 0,
      length_after_ft: parseFloat(untaggedForm.length_ft),
      product_name: untaggedForm.product_name,
      dye_lot: untaggedForm.dye_lot,
      width_ft: parseFloat(untaggedForm.width_ft),
      location_to: untaggedForm.location_name,
      notes: `Untagged return: ${untaggedForm.notes || 'No notes'}`
    });

    queryClient.invalidateQueries({ queryKey: ['rolls'] });
    queryClient.invalidateQueries({ queryKey: ['transactions'] });

    setProcessedReturn({ ...rollData, id: roll.id });
    setUntaggedForm({
      inventory_owner: 'TexasTurf',
      product_name: '',
      dye_lot: '',
      width_ft: '',
      length_ft: '',
      condition: 'Good',
      location_id: '',
      location_name: '',
      status: 'Available',
      notes: ''
    });
    setIsProcessing(false);
    toast.success(`Return created with tag ${rollTag}`);
  };

  const handleLocationSelect = (locationId, formSetter) => {
    const location = locations.find(l => l.id === locationId);
    if (location) {
      formSetter(prev => ({
        ...prev,
        location_id: locationId,
        location_name: location.name
      }));
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold text-slate-800">Returns</h1>
        <p className="text-slate-500 mt-1">Process returned turf inventory</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Return Type Selection */}
        <Card className="rounded-2xl border-slate-100 shadow-sm lg:col-span-2">
          <CardContent className="pt-6">
            <div className="flex gap-4">
              <Button
                variant={returnType === 'tagged' ? 'default' : 'outline'}
                onClick={() => setReturnType('tagged')}
                className={returnType === 'tagged' ? 'bg-emerald-600 hover:bg-emerald-700' : ''}
              >
                <Search className="h-4 w-4 mr-2" />
                Tagged Roll Return
              </Button>
              <Button
                variant={returnType === 'untagged' ? 'default' : 'outline'}
                onClick={() => setReturnType('untagged')}
                className={returnType === 'untagged' ? 'bg-emerald-600 hover:bg-emerald-700' : ''}
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Untagged Return
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Tagged Return */}
        {returnType === 'tagged' && (
          <>
            <Card className="rounded-2xl border-slate-100 shadow-sm">
              <CardHeader>
                <CardTitle>Find Roll</CardTitle>
                <CardDescription>Scan or search for the returning roll</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <RollSearch 
                  onSearch={handleSearchRoll}
                  placeholder="Scan roll tag..."
                  autoFocus
                />

                {selectedRoll && (
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="font-mono font-bold text-lg">{selectedRoll.roll_tag}</p>
                        <p className="text-slate-600">{selectedRoll.product_name}</p>
                      </div>
                      <OwnerBadge owner={selectedRoll.inventory_owner} size="sm" />
                    </div>
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <p className="text-slate-500">Dye Lot</p>
                        <p className="font-medium">{selectedRoll.dye_lot}</p>
                      </div>
                      <div>
                        <p className="text-slate-500">Width</p>
                        <p className="font-medium">{selectedRoll.width_ft} ft</p>
                      </div>
                      <div>
                        <p className="text-slate-500">Type</p>
                        <StatusBadge status={selectedRoll.roll_type} size="sm" />
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-slate-100 shadow-sm">
              <CardHeader>
                <CardTitle>Return Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Return Length (ft) *</Label>
                  <Input
                    type="number"
                    value={taggedForm.return_length}
                    onChange={e => setTaggedForm(p => ({ ...p, return_length: e.target.value }))}
                    placeholder="Length being returned"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Condition</Label>
                    <Select 
                      value={taggedForm.condition} 
                      onValueChange={v => setTaggedForm(p => ({ ...p, condition: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="New">New</SelectItem>
                        <SelectItem value="Good">Good</SelectItem>
                        <SelectItem value="Used">Used</SelectItem>
                        <SelectItem value="Damaged">Damaged</SelectItem>
                        <SelectItem value="Scrap">Scrap</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select 
                      value={taggedForm.status} 
                      onValueChange={v => setTaggedForm(p => ({ ...p, status: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Available">Available</SelectItem>
                        <SelectItem value="ReturnedHold">Hold for Inspection</SelectItem>
                        <SelectItem value="Scrapped">Scrapped</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Location</Label>
                  <Select 
                    value={taggedForm.location_id} 
                    onValueChange={v => handleLocationSelect(v, setTaggedForm)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select location" />
                    </SelectTrigger>
                    <SelectContent>
                      {locations.map(l => (
                        <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea 
                    value={taggedForm.notes}
                    onChange={e => setTaggedForm(p => ({ ...p, notes: e.target.value }))}
                    placeholder="Return notes..."
                    rows={2}
                  />
                </div>

                <Button
                  onClick={handleTaggedReturn}
                  disabled={!selectedRoll || isProcessing}
                  className="w-full bg-emerald-600 hover:bg-emerald-700"
                >
                  {isProcessing ? 'Processing...' : 'Process Return'}
                </Button>
              </CardContent>
            </Card>
          </>
        )}

        {/* Untagged Return */}
        {returnType === 'untagged' && (
          <Card className="rounded-2xl border-slate-100 shadow-sm lg:col-span-2">
            <CardHeader>
              <CardTitle>Create Return Entry</CardTitle>
              <CardDescription>Create a new inventory record for untagged returned material</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Owner *</Label>
                  <Select 
                    value={untaggedForm.inventory_owner} 
                    onValueChange={v => setUntaggedForm(p => ({ ...p, inventory_owner: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="TexasTurf">TexasTurf</SelectItem>
                      <SelectItem value="TurfCasa">TurfCasa</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Product *</Label>
                  <Select 
                    value={untaggedForm.product_name} 
                    onValueChange={v => setUntaggedForm(p => ({ ...p, product_name: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select product" />
                    </SelectTrigger>
                    <SelectContent>
                      {products.map(p => (
                        <SelectItem key={p.id} value={p.product_name}>{p.product_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Dye Lot *</Label>
                  <Input 
                    value={untaggedForm.dye_lot}
                    onChange={e => setUntaggedForm(p => ({ ...p, dye_lot: e.target.value }))}
                    placeholder="Dye lot number"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Width (ft) *</Label>
                  <Select 
                    value={untaggedForm.width_ft} 
                    onValueChange={v => setUntaggedForm(p => ({ ...p, width_ft: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="13">13 ft</SelectItem>
                      <SelectItem value="15">15 ft</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Length (ft) *</Label>
                  <Input 
                    type="number"
                    value={untaggedForm.length_ft}
                    onChange={e => setUntaggedForm(p => ({ ...p, length_ft: e.target.value }))}
                    placeholder="Length being returned"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Condition</Label>
                  <Select 
                    value={untaggedForm.condition} 
                    onValueChange={v => setUntaggedForm(p => ({ ...p, condition: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="New">New</SelectItem>
                      <SelectItem value="Good">Good</SelectItem>
                      <SelectItem value="Used">Used</SelectItem>
                      <SelectItem value="Damaged">Damaged</SelectItem>
                      <SelectItem value="Scrap">Scrap</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select 
                    value={untaggedForm.status} 
                    onValueChange={v => setUntaggedForm(p => ({ ...p, status: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Available">Available</SelectItem>
                      <SelectItem value="ReturnedHold">Hold for Inspection</SelectItem>
                      <SelectItem value="Scrapped">Scrapped</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Location</Label>
                  <Select 
                    value={untaggedForm.location_id} 
                    onValueChange={v => handleLocationSelect(v, setUntaggedForm)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select location" />
                    </SelectTrigger>
                    <SelectContent>
                      {locations.map(l => (
                        <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label>Notes</Label>
                  <Textarea 
                    value={untaggedForm.notes}
                    onChange={e => setUntaggedForm(p => ({ ...p, notes: e.target.value }))}
                    placeholder="Return notes..."
                    rows={2}
                  />
                </div>

                <div className="md:col-span-2">
                  <Button
                    onClick={handleUntaggedReturn}
                    disabled={isProcessing}
                    className="w-full bg-emerald-600 hover:bg-emerald-700"
                  >
                    {isProcessing ? 'Processing...' : 'Create Return Entry'}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Processed Return */}
        {processedReturn && (
          <Card className="rounded-2xl border-emerald-200 bg-emerald-50 shadow-sm lg:col-span-2">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center">
                  <Check className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <p className="font-semibold text-emerald-800">Return Processed</p>
                  <p className="text-sm text-emerald-600">Roll is back in inventory</p>
                </div>
              </div>
              <div className="p-4 bg-white rounded-lg border border-emerald-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-mono font-bold text-lg">{processedReturn.roll_tag}</p>
                    <p className="text-sm text-slate-600">
                      {processedReturn.product_name} • {processedReturn.dye_lot} • 
                      {processedReturn.width_ft}ft × {processedReturn.current_length_ft}ft
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={processedReturn.condition} size="sm" />
                    <StatusBadge status={processedReturn.status} size="sm" />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}