import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Upload, 
  Plus, 
  Zap,
  FileSpreadsheet,
  Check,
  AlertCircle
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { toast } from 'sonner';

function generateRollTag() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = 'R-';
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

export default function Receive() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('single');
  
  // Single receive state
  const [singleForm, setSingleForm] = useState({
    inventory_owner: 'TexasTurf',
    product_id: '',
    product_name: '',
    dye_lot: '',
    width_ft: '',
    length_ft: '100',
    location_id: '',
    location_name: '',
    vendor: '',
    purchase_order: '',
    condition: 'New',
    notes: ''
  });

  // Rapid entry state
  const [rapidForm, setRapidForm] = useState({
    inventory_owner: 'TexasTurf',
    product_id: '',
    product_name: '',
    dye_lot: '',
    width_ft: '',
    length_ft: '100',
    location_id: '',
    location_name: '',
    vendor: '',
    purchase_order: '',
    quantity: 1
  });

  // CSV state
  const [csvFile, setCsvFile] = useState(null);
  const [csvData, setCsvData] = useState([]);
  const [csvErrors, setCsvErrors] = useState([]);

  const [createdRolls, setCreatedRolls] = useState([]);
  const [isCreating, setIsCreating] = useState(false);

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => base44.entities.Product.filter({ status: 'active' }),
  });

  const { data: locations = [] } = useQuery({
    queryKey: ['locations'],
    queryFn: () => base44.entities.Location.list(),
  });

  const createRollMutation = useMutation({
    mutationFn: async (rollData) => {
      const roll = await base44.entities.Roll.create(rollData);
      await base44.entities.Transaction.create({
        transaction_type: 'Receive',
        inventory_owner: rollData.inventory_owner,
        roll_id: roll.id,
        roll_tag: rollData.roll_tag,
        length_change_ft: rollData.current_length_ft,
        length_before_ft: 0,
        length_after_ft: rollData.current_length_ft,
        product_name: rollData.product_name,
        dye_lot: rollData.dye_lot,
        width_ft: rollData.width_ft,
        location_to: rollData.location_name,
        notes: `Received: ${rollData.vendor || 'Direct'} PO: ${rollData.purchase_order || 'N/A'}`
      });
      return roll;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rolls'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
    }
  });

  const handleSingleReceive = async () => {
    if (!singleForm.product_name || !singleForm.dye_lot || !singleForm.width_ft) {
      toast.error('Please fill in Product, Dye Lot, and Width');
      return;
    }

    setIsCreating(true);
    const rollTag = generateRollTag();
    const customSku = generateCustomSku(singleForm.inventory_owner, singleForm.product_name);

    const rollData = {
      roll_tag: rollTag,
      custom_roll_sku: customSku,
      inventory_owner: singleForm.inventory_owner,
      product_id: singleForm.product_id,
      product_name: singleForm.product_name,
      dye_lot: singleForm.dye_lot,
      width_ft: parseFloat(singleForm.width_ft),
      original_length_ft: parseFloat(singleForm.length_ft),
      current_length_ft: parseFloat(singleForm.length_ft),
      roll_type: 'Parent',
      condition: singleForm.condition,
      location_id: singleForm.location_id,
      location_name: singleForm.location_name,
      status: 'Available',
      date_received: new Date().toISOString().split('T')[0],
      vendor: singleForm.vendor,
      purchase_order: singleForm.purchase_order,
      notes: singleForm.notes
    };

    const roll = await createRollMutation.mutateAsync(rollData);
    setCreatedRolls([roll]);
    setIsCreating(false);
    toast.success(`Roll ${rollTag} received successfully!`);
    
    // Reset form but keep owner, location, vendor, PO
    setSingleForm(prev => ({
      ...prev,
      product_id: '',
      product_name: '',
      dye_lot: '',
      width_ft: '',
      notes: ''
    }));
  };

  const handleRapidReceive = async () => {
    if (!rapidForm.product_name || !rapidForm.dye_lot || !rapidForm.width_ft || !rapidForm.quantity) {
      toast.error('Please fill in all required fields');
      return;
    }

    setIsCreating(true);
    const rolls = [];
    
    for (let i = 0; i < rapidForm.quantity; i++) {
      const rollTag = generateRollTag();
      const customSku = generateCustomSku(rapidForm.inventory_owner, rapidForm.product_name);

      const rollData = {
        roll_tag: rollTag,
        custom_roll_sku: customSku,
        inventory_owner: rapidForm.inventory_owner,
        product_id: rapidForm.product_id,
        product_name: rapidForm.product_name,
        dye_lot: rapidForm.dye_lot,
        width_ft: parseFloat(rapidForm.width_ft),
        original_length_ft: parseFloat(rapidForm.length_ft),
        current_length_ft: parseFloat(rapidForm.length_ft),
        roll_type: 'Parent',
        condition: 'New',
        location_id: rapidForm.location_id,
        location_name: rapidForm.location_name,
        status: 'Available',
        date_received: new Date().toISOString().split('T')[0],
        vendor: rapidForm.vendor,
        purchase_order: rapidForm.purchase_order
      };

      const roll = await createRollMutation.mutateAsync(rollData);
      rolls.push(roll);
    }

    setCreatedRolls(rolls);
    setIsCreating(false);
    toast.success(`${rolls.length} rolls received successfully!`);
  };

  const handleCsvUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCsvFile(file);
    const text = await file.text();
    const lines = text.split('\n').filter(line => line.trim());
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    
    const data = [];
    const errors = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim());
      const row = {};
      headers.forEach((h, idx) => {
        row[h] = values[idx] || '';
      });

      // Validate
      if (!row.product_name && !row.product) {
        errors.push({ row: i, error: 'Missing product name' });
      }
      if (!row.dye_lot) {
        errors.push({ row: i, error: 'Missing dye lot' });
      }
      if (!row.width_ft && !row.width) {
        errors.push({ row: i, error: 'Missing width' });
      }

      row._rowNum = i;
      data.push(row);
    }

    setCsvData(data);
    setCsvErrors(errors);
  };

  const processCsvImport = async () => {
    if (csvErrors.length > 0) {
      toast.error('Please fix CSV errors before importing');
      return;
    }

    setIsCreating(true);
    const rolls = [];

    for (const row of csvData) {
      const qty = parseInt(row.quantity) || 1;
      const owner = row.inventory_owner || row.owner || 'TexasTurf';
      const productName = row.product_name || row.product;
      const width = parseFloat(row.width_ft || row.width);
      const length = parseFloat(row.length_ft || row.length) || 100;

      for (let i = 0; i < qty; i++) {
        const rollTag = generateRollTag();
        const customSku = generateCustomSku(owner, productName);

        const rollData = {
          roll_tag: rollTag,
          custom_roll_sku: customSku,
          inventory_owner: owner,
          product_name: productName,
          dye_lot: row.dye_lot,
          width_ft: width,
          original_length_ft: length,
          current_length_ft: length,
          roll_type: 'Parent',
          condition: 'New',
          location_name: row.location || '',
          status: 'Available',
          date_received: new Date().toISOString().split('T')[0],
          vendor: row.vendor || '',
          purchase_order: row.po || row.purchase_order || ''
        };

        const roll = await createRollMutation.mutateAsync(rollData);
        rolls.push(roll);
      }
    }

    setCreatedRolls(rolls);
    setIsCreating(false);
    setCsvFile(null);
    setCsvData([]);
    toast.success(`${rolls.length} rolls imported successfully!`);
  };

  const handleProductSelect = (productId, formSetter) => {
    const product = products.find(p => p.id === productId);
    if (product) {
      formSetter(prev => ({
        ...prev,
        product_id: productId,
        product_name: product.product_name,
        length_ft: product.standard_roll_length_ft?.toString() || '100'
      }));
    }
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
        <h1 className="text-2xl lg:text-3xl font-bold text-slate-800">Receive Inventory</h1>
        <p className="text-slate-500 mt-1">Add new rolls to inventory</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Form */}
        <div className="lg:col-span-2">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-3 mb-6">
              <TabsTrigger value="single" className="flex items-center gap-2">
                <Plus className="h-4 w-4" />
                Single
              </TabsTrigger>
              <TabsTrigger value="rapid" className="flex items-center gap-2">
                <Zap className="h-4 w-4" />
                Rapid Entry
              </TabsTrigger>
              <TabsTrigger value="csv" className="flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4" />
                CSV Upload
              </TabsTrigger>
            </TabsList>

            {/* Single Receive */}
            <TabsContent value="single">
              <Card className="rounded-2xl border-slate-100 shadow-sm">
                <CardHeader>
                  <CardTitle>Receive Single Roll</CardTitle>
                  <CardDescription>Add one roll to inventory</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Owner *</Label>
                      <Select 
                        value={singleForm.inventory_owner} 
                        onValueChange={v => setSingleForm(p => ({ ...p, inventory_owner: v }))}
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
                        value={singleForm.product_id} 
                        onValueChange={v => handleProductSelect(v, setSingleForm)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select product" />
                        </SelectTrigger>
                        <SelectContent>
                          {products.map(p => (
                            <SelectItem key={p.id} value={p.id}>{p.product_name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>Dye Lot *</Label>
                      <Input 
                        value={singleForm.dye_lot}
                        onChange={e => setSingleForm(p => ({ ...p, dye_lot: e.target.value }))}
                        placeholder="e.g., DL-2024-001"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Width (ft) *</Label>
                      <Select 
                        value={singleForm.width_ft} 
                        onValueChange={v => setSingleForm(p => ({ ...p, width_ft: v }))}
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
                      <Label>Length (ft)</Label>
                      <Input 
                        type="number"
                        value={singleForm.length_ft}
                        onChange={e => setSingleForm(p => ({ ...p, length_ft: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Location</Label>
                      <Select 
                        value={singleForm.location_id} 
                        onValueChange={v => handleLocationSelect(v, setSingleForm)}
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
                      <Label>Condition</Label>
                      <Select 
                        value={singleForm.condition} 
                        onValueChange={v => setSingleForm(p => ({ ...p, condition: v }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="New">New</SelectItem>
                          <SelectItem value="Good">Good</SelectItem>
                          <SelectItem value="Used">Used</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Vendor</Label>
                      <Input 
                        value={singleForm.vendor}
                        onChange={e => setSingleForm(p => ({ ...p, vendor: e.target.value }))}
                        placeholder="Supplier name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>PO #</Label>
                      <Input 
                        value={singleForm.purchase_order}
                        onChange={e => setSingleForm(p => ({ ...p, purchase_order: e.target.value }))}
                        placeholder="Purchase order"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Notes</Label>
                    <Textarea 
                      value={singleForm.notes}
                      onChange={e => setSingleForm(p => ({ ...p, notes: e.target.value }))}
                      placeholder="Optional notes..."
                      rows={2}
                    />
                  </div>

                  <Button 
                    onClick={handleSingleReceive} 
                    disabled={isCreating}
                    className="w-full bg-emerald-600 hover:bg-emerald-700"
                  >
                    {isCreating ? 'Creating...' : 'Receive Roll'}
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Rapid Entry */}
            <TabsContent value="rapid">
              <Card className="rounded-2xl border-slate-100 shadow-sm">
                <CardHeader>
                  <CardTitle>Rapid Entry Mode</CardTitle>
                  <CardDescription>Create multiple rolls with the same settings</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Owner *</Label>
                      <Select 
                        value={rapidForm.inventory_owner} 
                        onValueChange={v => setRapidForm(p => ({ ...p, inventory_owner: v }))}
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
                        value={rapidForm.product_id} 
                        onValueChange={v => handleProductSelect(v, setRapidForm)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select product" />
                        </SelectTrigger>
                        <SelectContent>
                          {products.map(p => (
                            <SelectItem key={p.id} value={p.id}>{p.product_name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-4">
                    <div className="space-y-2">
                      <Label>Dye Lot *</Label>
                      <Input 
                        value={rapidForm.dye_lot}
                        onChange={e => setRapidForm(p => ({ ...p, dye_lot: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Width (ft) *</Label>
                      <Select 
                        value={rapidForm.width_ft} 
                        onValueChange={v => setRapidForm(p => ({ ...p, width_ft: v }))}
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
                      <Label>Length (ft)</Label>
                      <Input 
                        type="number"
                        value={rapidForm.length_ft}
                        onChange={e => setRapidForm(p => ({ ...p, length_ft: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Quantity *</Label>
                      <Input 
                        type="number"
                        min="1"
                        value={rapidForm.quantity}
                        onChange={e => setRapidForm(p => ({ ...p, quantity: parseInt(e.target.value) || 1 }))}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>Location</Label>
                      <Select 
                        value={rapidForm.location_id} 
                        onValueChange={v => handleLocationSelect(v, setRapidForm)}
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
                      <Label>Vendor</Label>
                      <Input 
                        value={rapidForm.vendor}
                        onChange={e => setRapidForm(p => ({ ...p, vendor: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>PO #</Label>
                      <Input 
                        value={rapidForm.purchase_order}
                        onChange={e => setRapidForm(p => ({ ...p, purchase_order: e.target.value }))}
                      />
                    </div>
                  </div>

                  <Button 
                    onClick={handleRapidReceive} 
                    disabled={isCreating}
                    className="w-full bg-emerald-600 hover:bg-emerald-700"
                  >
                    {isCreating ? 'Creating...' : `Generate ${rapidForm.quantity} Rolls`}
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            {/* CSV Upload */}
            <TabsContent value="csv">
              <Card className="rounded-2xl border-slate-100 shadow-sm">
                <CardHeader>
                  <CardTitle>CSV Upload</CardTitle>
                  <CardDescription>
                    Upload a CSV with columns: inventory_owner, product_name, dye_lot, width_ft, length_ft, quantity, vendor, po, location
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center">
                    <Input
                      type="file"
                      accept=".csv"
                      onChange={handleCsvUpload}
                      className="hidden"
                      id="csv-upload"
                    />
                    <label htmlFor="csv-upload" className="cursor-pointer">
                      <Upload className="h-10 w-10 mx-auto text-slate-400 mb-3" />
                      <p className="text-slate-600 font-medium">
                        {csvFile ? csvFile.name : 'Click to upload CSV'}
                      </p>
                      <p className="text-sm text-slate-400 mt-1">or drag and drop</p>
                    </label>
                  </div>

                  {csvErrors.length > 0 && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                      <div className="flex items-center gap-2 text-red-700 font-medium mb-2">
                        <AlertCircle className="h-4 w-4" />
                        Validation Errors
                      </div>
                      {csvErrors.map((err, i) => (
                        <p key={i} className="text-sm text-red-600">Row {err.row}: {err.error}</p>
                      ))}
                    </div>
                  )}

                  {csvData.length > 0 && csvErrors.length === 0 && (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                      <div className="flex items-center gap-2 text-emerald-700 font-medium">
                        <Check className="h-4 w-4" />
                        {csvData.length} rows ready to import
                      </div>
                    </div>
                  )}

                  <Button 
                    onClick={processCsvImport} 
                    disabled={isCreating || csvData.length === 0 || csvErrors.length > 0}
                    className="w-full bg-emerald-600 hover:bg-emerald-700"
                  >
                    {isCreating ? 'Importing...' : 'Import CSV'}
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* Created Rolls */}
        <div>
          <Card className="rounded-2xl border-slate-100 shadow-sm">
            <CardHeader>
              <CardTitle>Recently Created</CardTitle>
            </CardHeader>
            <CardContent>
              {createdRolls.length === 0 ? (
                <p className="text-slate-400 text-sm text-center py-8">
                  No rolls created yet
                </p>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {createdRolls.map(roll => (
                    <div 
                      key={roll.id}
                      className="p-3 bg-emerald-50 rounded-lg border border-emerald-100"
                    >
                      <p className="font-mono font-medium text-emerald-800">{roll.roll_tag}</p>
                      <p className="text-sm text-emerald-600">
                        {roll.product_name} • {roll.width_ft}ft × {roll.current_length_ft}ft
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}