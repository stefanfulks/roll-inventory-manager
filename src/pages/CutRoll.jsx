import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { 
  ArrowLeft, 
  Scissors, 
  Package, 
  AlertTriangle,
  Check,
  Plus
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import RollSearch from '@/components/inventory/RollSearch';
import StatusBadge from '@/components/ui/StatusBadge';
import OwnerBadge from '@/components/ui/OwnerBadge';

function generateRollTag() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = 'C-';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function generateCustomSku(owner, productName) {
  const prefix = owner === 'TexasTurf' ? 'TT' : 'TC';
  const prodCode = productName?.substring(0, 3).toUpperCase() || 'XXX';
  const num = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `${prefix}-${prodCode}-${num}`;
}

export default function CutRoll() {
  const queryClient = useQueryClient();
  const params = new URLSearchParams(window.location.search);
  const preselectedRollId = params.get('roll_id');
  
  const [selectedRoll, setSelectedRoll] = useState(null);
  const [cutLength, setCutLength] = useState('');
  const [destination, setDestination] = useState('inventory');
  const [selectedBundleId, setSelectedBundleId] = useState('');
  const [isCutting, setIsCutting] = useState(false);
  const [createdChild, setCreatedChild] = useState(null);

  const { data: rolls = [], isLoading: loadingRolls } = useQuery({
    queryKey: ['rolls'],
    queryFn: () => base44.entities.Roll.filter(
      { status: 'Available', roll_type: 'Parent' },
      '-created_date',
      500
    ),
  });

  const { data: bundles = [] } = useQuery({
    queryKey: ['bundles-draft'],
    queryFn: () => base44.entities.Bundle.filter(
      { status: 'Draft' },
      '-created_date',
      50
    ),
  });

  // Load preselected roll
  useEffect(() => {
    if (preselectedRollId && rolls.length > 0) {
      const roll = rolls.find(r => r.id === preselectedRollId);
      if (roll) setSelectedRoll(roll);
    }
  }, [preselectedRollId, rolls]);

  const handleSearch = (searchTerm) => {
    const found = rolls.find(r => 
      r.tt_sku_tag_number?.toLowerCase() === searchTerm.toLowerCase() ||
      r.roll_tag?.toLowerCase() === searchTerm.toLowerCase()
    );
    if (found) {
      setSelectedRoll(found);
      setCreatedChild(null);
    } else {
      toast.error('Roll not found, not available, or not a parent roll');
    }
  };

  const handleCut = async () => {
    if (!selectedRoll) {
      toast.error('Please select a roll');
      return;
    }

    const cutLengthNum = parseFloat(cutLength);
    if (!cutLengthNum || cutLengthNum <= 0) {
      toast.error('Please enter a valid cut length');
      return;
    }

    if (cutLengthNum > selectedRoll.current_length_ft) {
      toast.error('Cut length cannot exceed remaining length');
      return;
    }

    setIsCutting(true);

    const childTag = generateRollTag();
    const childSku = generateCustomSku(selectedRoll.inventory_owner, selectedRoll.product_name);
    const newParentLength = selectedRoll.current_length_ft - cutLengthNum;

    // Create child roll
    const childData = {
      roll_tag: childTag,
      custom_roll_sku: childSku,
      inventory_owner: selectedRoll.inventory_owner,
      product_id: selectedRoll.product_id,
      product_name: selectedRoll.product_name,
      dye_lot: selectedRoll.dye_lot,
      width_ft: selectedRoll.width_ft,
      original_length_ft: cutLengthNum,
      current_length_ft: cutLengthNum,
      roll_type: 'Child',
      parent_roll_id: selectedRoll.id,
      condition: selectedRoll.condition,
      location_id: selectedRoll.location_id,
      location_name: selectedRoll.location_name,
      status: destination === 'bundle' && selectedBundleId ? 'Bundled' : 'Available',
      date_received: new Date().toISOString().split('T')[0],
    };

    const childRoll = await base44.entities.Roll.create(childData);

    // Update parent roll
    const parentStatus = newParentLength <= 0 ? 'Consumed' : 'Available';
    await base44.entities.Roll.update(selectedRoll.id, {
      current_length_ft: newParentLength,
      status: parentStatus
    });

    // Create transaction
    await base44.entities.Transaction.create({
      transaction_type: 'CutCreateChild',
      inventory_owner: selectedRoll.inventory_owner,
      roll_id: selectedRoll.id,
      roll_tag: selectedRoll.roll_tag,
      parent_roll_id: selectedRoll.id,
      child_roll_id: childRoll.id,
      length_change_ft: -cutLengthNum,
      length_before_ft: selectedRoll.current_length_ft,
      length_after_ft: newParentLength,
      product_name: selectedRoll.product_name,
      dye_lot: selectedRoll.dye_lot,
      width_ft: selectedRoll.width_ft,
      notes: `Cut ${cutLengthNum}ft from ${selectedRoll.roll_tag} to create ${childTag}`
    });

    // If adding to bundle
    if (destination === 'bundle' && selectedBundleId) {
      await base44.entities.BundleItem.create({
        bundle_id: selectedBundleId,
        roll_id: childRoll.id,
        roll_tag: childTag,
        product_name: childRoll.product_name,
        dye_lot: childRoll.dye_lot,
        width_ft: childRoll.width_ft,
        length_ft_included: cutLengthNum
      });

      await base44.entities.Transaction.create({
        transaction_type: 'BundleAdd',
        inventory_owner: selectedRoll.inventory_owner,
        roll_id: childRoll.id,
        roll_tag: childTag,
        bundle_id: selectedBundleId,
        length_change_ft: 0,
        length_before_ft: cutLengthNum,
        length_after_ft: cutLengthNum,
        notes: `Added to bundle after cut`
      });
    }

    queryClient.invalidateQueries({ queryKey: ['rolls'] });
    queryClient.invalidateQueries({ queryKey: ['transactions'] });
    queryClient.invalidateQueries({ queryKey: ['bundle-items'] });

    setCreatedChild({ ...childData, id: childRoll.id });
    setSelectedRoll({ ...selectedRoll, current_length_ft: newParentLength, status: parentStatus });
    setCutLength('');
    setIsCutting(false);
    toast.success(`Created child roll ${childTag}`);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to={createPageUrl('Inventory')}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-slate-800">Cut Roll</h1>
          <p className="text-slate-500 mt-1">Create a child roll from a parent roll</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Search & Select */}
        <Card className="rounded-2xl border-slate-100 shadow-sm">
          <CardHeader>
            <CardTitle>1. Search Parent Roll</CardTitle>
            <CardDescription>Search for an available roll by TT SKU #</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <RollSearch 
              onSearch={handleSearch}
              placeholder="Search TT SKU #..."
              autoFocus
            />

            {selectedRoll && (
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-mono font-bold text-lg">{selectedRoll.tt_sku_tag_number || selectedRoll.roll_tag}</p>
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
                    <p className="text-slate-500">Remaining</p>
                    <p className="font-medium text-emerald-600">{selectedRoll.current_length_ft} ft</p>
                  </div>
                </div>
                {selectedRoll.location_name && (
                  <p className="text-sm text-slate-500 mt-2">
                    Location: {selectedRoll.location_name}
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Cut Form */}
        <Card className="rounded-2xl border-slate-100 shadow-sm">
          <CardHeader>
            <CardTitle>2. Cut Details</CardTitle>
            <CardDescription>Specify cut length and destination</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Cut Length (ft) *</Label>
              <Input
                type="number"
                min="1"
                max={selectedRoll?.current_length_ft || 100}
                value={cutLength}
                onChange={(e) => setCutLength(e.target.value)}
                placeholder="Enter length to cut"
                className="text-lg h-12"
              />
              {selectedRoll && parseFloat(cutLength) > selectedRoll.current_length_ft && (
                <p className="text-sm text-red-500 flex items-center gap-1">
                  <AlertTriangle className="h-4 w-4" />
                  Cannot exceed {selectedRoll.current_length_ft}ft
                </p>
              )}
              {selectedRoll && cutLength && parseFloat(cutLength) <= selectedRoll.current_length_ft && (
                <p className="text-sm text-slate-500">
                  Parent will have {selectedRoll.current_length_ft - parseFloat(cutLength)}ft remaining
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Destination</Label>
              <Select value={destination} onValueChange={setDestination}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="inventory">Save to Inventory</SelectItem>
                  <SelectItem value="bundle">Add to Bundle</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {destination === 'bundle' && (
              <div className="space-y-2">
                <Label>Select Bundle</Label>
                <Select value={selectedBundleId} onValueChange={setSelectedBundleId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a draft bundle" />
                  </SelectTrigger>
                  <SelectContent>
                    {bundles.map(b => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.bundle_tag} - {b.customer_name || 'No customer'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <Button
              onClick={handleCut}
              disabled={!selectedRoll || !cutLength || isCutting || parseFloat(cutLength) > selectedRoll?.current_length_ft}
              className="w-full h-12 bg-emerald-600 hover:bg-emerald-700"
            >
              <Scissors className="h-5 w-5 mr-2" />
              {isCutting ? 'Cutting...' : 'Cut Roll'}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Created Child */}
      {createdChild && (
        <Card className="rounded-2xl border-emerald-200 bg-emerald-50 shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center">
                <Check className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="font-semibold text-emerald-800">Child Roll Created</p>
                <p className="text-sm text-emerald-600">{createdChild.current_length_ft}ft cut from parent</p>
              </div>
            </div>
            <div className="p-4 bg-white rounded-lg border border-emerald-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-mono font-bold text-lg">{createdChild.roll_tag}</p>
                  <p className="text-sm text-slate-600">
                    {createdChild.product_name} • {createdChild.dye_lot} • {createdChild.width_ft}ft × {createdChild.current_length_ft}ft
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status="Child" size="sm" />
                  <StatusBadge status={createdChild.status} size="sm" />
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <Link to={createPageUrl(`RollDetail?id=${createdChild.id}`)} className="flex-1">
                <Button variant="outline" className="w-full">View Child Roll</Button>
              </Link>
              <Button 
                onClick={() => {
                  setCreatedChild(null);
                  setCutLength('');
                }}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700"
              >
                <Plus className="h-4 w-4 mr-2" />
                Cut Another
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}