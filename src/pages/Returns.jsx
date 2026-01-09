import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  RotateCcw, 
  Search,
  Check
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

export default function Returns() {
  const queryClient = useQueryClient();
  const [returnType, setReturnType] = useState('existing');
  const [selectedRoll, setSelectedRoll] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const [returnForm, setReturnForm] = useState({
    job_id: '',
    condition: 'Good',
    location_id: '',
    location_name: '',
    notes: '',
    final_status: 'Available'
  });

  // For new roll returns
  const [newRollForm, setNewRollForm] = useState({
    inventory_owner: 'TexasTurf',
    product_name: '',
    dye_lot: '',
    width_ft: '',
    length_ft: '',
    condition: 'Used',
    location_id: '',
    location_name: '',
    job_id: '',
    notes: ''
  });

  const { data: jobs = [] } = useQuery({
    queryKey: ['jobs-for-returns'],
    queryFn: () => base44.entities.Job.filter({ 
      status: { $in: ['SentOut', 'AwaitingReturnInventory', 'Completed'] }
    }, '-created_date', 100),
  });

  const { data: locations = [] } = useQuery({
    queryKey: ['locations'],
    queryFn: async () => {
      const locs = await base44.entities.Location.list();
      return locs
        .filter(l => l.designated_for === 'all' || l.designated_for === 'turf_only')
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    },
  });

  const { data: shippedRolls = [] } = useQuery({
    queryKey: ['shipped-rolls'],
    queryFn: () => base44.entities.Roll.filter({ status: 'Shipped' }, '-created_date', 500),
  });

  const handleSearchRoll = async (searchTerm) => {
    const search = searchTerm.toLowerCase();
    const results = await base44.entities.Roll.filter({
      status: 'SentOut'
    });
    
    const found = results.find(r => 
      r.roll_tag?.toLowerCase().includes(search) ||
      r.tt_sku_tag_number?.toLowerCase().includes(search) ||
      r.manufacturer_roll_number?.toLowerCase().includes(search)
    );
    
    if (found) {
      setSelectedRoll(found);
    } else {
      toast.error('Roll not found or not sent out');
    }
  };

  const handleReturnExisting = async () => {
    if (!selectedRoll) {
      toast.error('Please select a roll');
      return;
    }

    setIsProcessing(true);

    // Update roll status and location
    await base44.entities.Roll.update(selectedRoll.id, {
      status: returnForm.final_status,
      condition: returnForm.condition,
      location_id: returnForm.location_id,
      location_name: returnForm.location_name
    });

    // Create return transaction
    await base44.entities.Transaction.create({
      transaction_type: 'Return',
      inventory_owner: selectedRoll.inventory_owner,
      roll_id: selectedRoll.id,
      roll_tag: selectedRoll.roll_tag,
      job_id: returnForm.job_id,
      length_change_ft: selectedRoll.current_length_ft,
      length_before_ft: 0,
      length_after_ft: selectedRoll.current_length_ft,
      product_name: selectedRoll.product_name,
      dye_lot: selectedRoll.dye_lot,
      width_ft: selectedRoll.width_ft,
      location_to: returnForm.location_name,
      notes: `Returned - ${returnForm.condition} condition. ${returnForm.notes}`
    });

    queryClient.invalidateQueries({ queryKey: ['rolls'] });
    queryClient.invalidateQueries({ queryKey: ['shipped-rolls'] });
    queryClient.invalidateQueries({ queryKey: ['transactions'] });

    setIsProcessing(false);
    toast.success(`Roll ${selectedRoll.roll_tag} returned successfully`);
    
    setSelectedRoll(null);
    setReturnForm({
      job_id: '',
      condition: 'Good',
      location_id: '',
      location_name: '',
      notes: '',
      final_status: 'Available'
    });
  };

  const handleCreateNewReturn = async () => {
    if (!newRollForm.product_name || !newRollForm.dye_lot || !newRollForm.width_ft || !newRollForm.length_ft) {
      toast.error('Please fill in all required fields');
      return;
    }

    setIsProcessing(true);

    const rollTag = `R-RET-${Date.now().toString().slice(-6)}`;
    const customSku = `${newRollForm.inventory_owner === 'TexasTurf' ? 'TT' : 'TC'}-RET-${Date.now().toString().slice(-4)}`;

    const rollData = {
      roll_tag: rollTag,
      custom_roll_sku: customSku,
      inventory_owner: newRollForm.inventory_owner,
      product_name: newRollForm.product_name,
      dye_lot: newRollForm.dye_lot,
      width_ft: parseFloat(newRollForm.width_ft),
      original_length_ft: parseFloat(newRollForm.length_ft),
      current_length_ft: parseFloat(newRollForm.length_ft),
      roll_type: 'Child',
      condition: newRollForm.condition,
      location_id: newRollForm.location_id,
      location_name: newRollForm.location_name,
      status: newRollForm.condition === 'Damaged' || newRollForm.condition === 'Scrap' ? 'ReturnedHold' : 'Available',
      date_received: new Date().toISOString().split('T')[0],
      notes: `Untagged return - ${newRollForm.notes}`
    };

    const roll = await base44.entities.Roll.create(rollData);

    await base44.entities.Transaction.create({
      transaction_type: 'Return',
      inventory_owner: newRollForm.inventory_owner,
      roll_id: roll.id,
      roll_tag: rollTag,
      job_id: newRollForm.job_id,
      length_change_ft: parseFloat(newRollForm.length_ft),
      length_before_ft: 0,
      length_after_ft: parseFloat(newRollForm.length_ft),
      product_name: newRollForm.product_name,
      dye_lot: newRollForm.dye_lot,
      width_ft: parseFloat(newRollForm.width_ft),
      location_to: newRollForm.location_name,
      notes: `Untagged return created - ${newRollForm.notes}`
    });

    queryClient.invalidateQueries({ queryKey: ['rolls'] });
    queryClient.invalidateQueries({ queryKey: ['transactions'] });

    setIsProcessing(false);
    toast.success(`Return created with tag ${rollTag}`);
    
    setNewRollForm({
      inventory_owner: 'TexasTurf',
      product_name: '',
      dye_lot: '',
      width_ft: '',
      length_ft: '',
      condition: 'Used',
      location_id: '',
      location_name: '',
      job_id: '',
      notes: ''
    });
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
        <p className="text-slate-500 mt-1">Process returned turf rolls</p>
      </div>

      {/* Return Type Selector */}
      <div className="flex gap-2">
        <Button
          variant={returnType === 'existing' ? 'default' : 'outline'}
          onClick={() => setReturnType('existing')}
          className={returnType === 'existing' ? 'bg-emerald-600 hover:bg-emerald-700' : ''}
        >
          Return Tagged Roll
        </Button>
        <Button
          variant={returnType === 'new' ? 'default' : 'outline'}
          onClick={() => setReturnType('new')}
          className={returnType === 'new' ? 'bg-emerald-600 hover:bg-emerald-700' : ''}
        >
          Return Untagged Roll
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {returnType === 'existing' ? (
          <>
            {/* Search Roll */}
            <Card className="rounded-2xl border-slate-100 shadow-sm">
              <CardHeader>
                <CardTitle>1. Find Shipped Roll</CardTitle>
                <CardDescription>Scan the roll tag to return</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <RollSearch 
                  onSearch={handleSearchRoll}
                  placeholder="Search by TT SKU #, roll tag, or manufacturer roll #..."
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
                        <p className="text-slate-500">Length</p>
                        <p className="font-medium">{selectedRoll.current_length_ft} ft</p>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Return Details */}
            <Card className="rounded-2xl border-slate-100 shadow-sm">
              <CardHeader>
                <CardTitle>2. Return Details</CardTitle>
                <CardDescription>Inspect and process the return</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Job (optional)</Label>
                  <Select 
                    value={returnForm.job_id} 
                    onValueChange={v => setReturnForm(p => ({ ...p, job_id: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Link to job" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={null}>No job</SelectItem>
                      {jobs.map(j => (
                        <SelectItem key={j.id} value={j.id}>
                          {j.job_number} - {j.customer_name || 'No name'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Condition *</Label>
                  <Select 
                    value={returnForm.condition} 
                    onValueChange={v => {
                      setReturnForm(p => ({ 
                        ...p, 
                        condition: v,
                        final_status: ['Damaged', 'Scrap'].includes(v) ? 'ReturnedHold' : 'Available'
                      }));
                    }}
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
                  <Label>Final Status</Label>
                  <Select 
                    value={returnForm.final_status} 
                    onValueChange={v => setReturnForm(p => ({ ...p, final_status: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Available">Available</SelectItem>
                      <SelectItem value="ReturnedHold">Returned (Hold for Inspection)</SelectItem>
                      <SelectItem value="Scrapped">Scrap</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Location</Label>
                  <Select 
                    value={returnForm.location_id} 
                    onValueChange={v => handleLocationSelect(v, setReturnForm)}
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
                    value={returnForm.notes}
                    onChange={e => setReturnForm(p => ({ ...p, notes: e.target.value }))}
                    placeholder="Reason for return, damage notes, etc."
                    rows={3}
                  />
                </div>

                <Button 
                  onClick={handleReturnExisting} 
                  disabled={!selectedRoll || isProcessing}
                  className="w-full h-12 bg-emerald-600 hover:bg-emerald-700"
                >
                  <RotateCcw className="h-5 w-5 mr-2" />
                  {isProcessing ? 'Processing...' : 'Process Return'}
                </Button>
              </CardContent>
            </Card>
          </>
        ) : (
          <>
            {/* New Return Form */}
            <Card className="rounded-2xl border-slate-100 shadow-sm lg:col-span-2">
              <CardHeader>
                <CardTitle>Create Return for Untagged Roll</CardTitle>
                <CardDescription>For rolls without tags or lost tags</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Owner *</Label>
                    <Select 
                      value={newRollForm.inventory_owner} 
                      onValueChange={v => setNewRollForm(p => ({ ...p, inventory_owner: v }))}
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
                    <Label>Job (optional)</Label>
                    <Select 
                      value={newRollForm.job_id} 
                      onValueChange={v => setNewRollForm(p => ({ ...p, job_id: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Link to job" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={null}>No job</SelectItem>
                        {jobs.map(j => (
                          <SelectItem key={j.id} value={j.id}>
                            {j.job_number} - {j.customer_name || 'No name'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Product Name *</Label>
                    <Input 
                      value={newRollForm.product_name}
                      onChange={e => setNewRollForm(p => ({ ...p, product_name: e.target.value }))}
                      placeholder="e.g., Majestic 70"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Dye Lot *</Label>
                    <Input 
                      value={newRollForm.dye_lot}
                      onChange={e => setNewRollForm(p => ({ ...p, dye_lot: e.target.value }))}
                      placeholder="Dye lot number"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Width (ft) *</Label>
                    <Select 
                      value={newRollForm.width_ft} 
                      onValueChange={v => setNewRollForm(p => ({ ...p, width_ft: v }))}
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
                      min="1"
                      value={newRollForm.length_ft}
                      onChange={e => setNewRollForm(p => ({ ...p, length_ft: e.target.value }))}
                      placeholder="Measured length"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Condition *</Label>
                    <Select 
                      value={newRollForm.condition} 
                      onValueChange={v => setNewRollForm(p => ({ ...p, condition: v }))}
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
                </div>

                <div className="space-y-2">
                  <Label>Location</Label>
                  <Select 
                    value={newRollForm.location_id} 
                    onValueChange={v => handleLocationSelect(v, setNewRollForm)}
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
                    value={newRollForm.notes}
                    onChange={e => setNewRollForm(p => ({ ...p, notes: e.target.value }))}
                    placeholder="Details about the return..."
                    rows={2}
                  />
                </div>

                <Button 
                  onClick={handleCreateNewReturn} 
                  disabled={isProcessing}
                  className="w-full h-12 bg-emerald-600 hover:bg-emerald-700"
                >
                  {isProcessing ? 'Creating...' : 'Create Return'}
                </Button>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}