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

function generateTTSKUTagNumber() {
  const chars = '0123456789';
  let result = '';
  for (let i = 0; i < 10; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export default function Receive() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('single');
  
  // Single receive state
  const [singleForm, setSingleForm] = useState({
    tt_sku_tag_number: '',
    product_id: '',
    product_name: '',
    manufacturer_id: '',
    manufacturer_name: '',
    manufacturer_roll_number: '',
    dye_lot: '',
    width_ft: '',
    length_ft: '100',
    location: '',
    purchase_order: '',
    notes: ''
  });

  // Rapid entry state
  const [rapidForm, setRapidForm] = useState({
    product_id: '',
    product_name: '',
    manufacturer_id: '',
    manufacturer_name: '',
    dye_lot: '',
    width_ft: '',
    length_ft: '100',
    purchase_order: '',
    quantity: 0
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

  const { data: manufacturers = [] } = useQuery({
    queryKey: ['manufacturers'],
    queryFn: () => base44.entities.Vendor.list(),
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

  const createRollMutation = useMutation({
    mutationFn: async (rollData) => {
      const roll = await base44.entities.Roll.create(rollData);
      await base44.entities.Transaction.create({
        transaction_type: 'ReceiveRoll',
        fulfillment_for: 'TexasTurf',
        roll_id: roll.id,
        tt_sku_tag_number: rollData.tt_sku_tag_number,
        manufacturer_roll_number: rollData.manufacturer_roll_number,
        length_change_ft: rollData.current_length_ft,
        length_before_ft: 0,
        length_after_ft: rollData.current_length_ft,
        product_name: rollData.product_name,
        dye_lot: rollData.dye_lot,
        width_ft: rollData.width_ft,
        location_to: rollData.location_name,
        notes: `Received from: ${rollData.vendor_name} PO: ${rollData.purchase_order}`
      });
      return roll;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rolls'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    }
  });

  const handleSingleReceive = async () => {
    const requiredFields = ['tt_sku_tag_number', 'manufacturer_id', 'manufacturer_roll_number', 'product_id', 'dye_lot', 'width_ft', 'length_ft', 'location', 'purchase_order'];
    for (const field of requiredFields) {
      if (!singleForm[field]) {
        toast.error(`Please fill in all required fields`);
        return;
      }
    }

    setIsCreating(true);
    
    const location = locations.find(l => l.id === singleForm.location);

    const rollData = {
      tt_sku_tag_number: singleForm.tt_sku_tag_number,
      manufacturer_roll_number: singleForm.manufacturer_roll_number,
      vendor_id: singleForm.manufacturer_id,
      vendor_name: singleForm.manufacturer_name,
      product_id: singleForm.product_id,
      product_name: singleForm.product_name,
      dye_lot: singleForm.dye_lot,
      width_ft: parseFloat(singleForm.width_ft),
      original_length_ft: parseFloat(singleForm.length_ft),
      current_length_ft: parseFloat(singleForm.length_ft),
      roll_type: 'Parent',
      condition: 'New',
      location_id: singleForm.location,
      location_name: location?.name || '',
      status: 'Available',
      date_received: new Date().toISOString().split('T')[0],
      purchase_order: singleForm.purchase_order,
      notes: singleForm.notes
    };

    const roll = await createRollMutation.mutateAsync(rollData);
    setCreatedRolls([roll]);
    setIsCreating(false);
    toast.success(`Roll ${singleForm.tt_sku_tag_number} received successfully!`);
    
    // Reset form but keep manufacturer
    setSingleForm(prev => ({
      ...prev,
      tt_sku_tag_number: '',
      product_id: '',
      product_name: '',
      manufacturer_roll_number: '',
      dye_lot: '',
      length_ft: '100',
      location: '',
      purchase_order: '',
      notes: ''
    }));
  };

  const handleRapidReceive = async () => {
    const requiredFields = ['manufacturer_id', 'product_id', 'dye_lot', 'width_ft', 'length_ft', 'purchase_order', 'quantity'];
    for (const field of requiredFields) {
      if (!rapidForm[field]) {
        toast.error(`Please fill in all required fields`);
        return;
      }
    }

    setIsCreating(true);
    const rollsToCreate = [];
    for (let i = 0; i < rapidForm.quantity; i++) {
      rollsToCreate.push({
        tt_sku_tag_number: generateTTSKUTagNumber(),
        vendor_id: rapidForm.manufacturer_id,
        vendor_name: rapidForm.manufacturer_name,
        product_id: rapidForm.product_id,
        product_name: rapidForm.product_name,
        dye_lot: rapidForm.dye_lot,
        width_ft: parseFloat(rapidForm.width_ft),
        original_length_ft: parseFloat(rapidForm.length_ft),
        current_length_ft: parseFloat(rapidForm.length_ft),
        roll_type: 'Parent',
        condition: 'New',
        status: 'AwaitingLocation',
        date_received: new Date().toISOString().split('T')[0],
        purchase_order: rapidForm.purchase_order,
      });
    }

    const created = [];
    for (const rollData of rollsToCreate) {
      const roll = await createRollMutation.mutateAsync(rollData);
      created.push(roll);
    }

    setCreatedRolls(created);
    setIsCreating(false);
    toast.success(`${created.length} rolls added successfully! Add location & mfr roll # to complete.`, { duration: 5000 });

    setRapidForm(prev => ({
      ...prev,
      dye_lot: '',
      length_ft: '100',
      quantity: 0,
      purchase_order: '',
    }));
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
      if (!row.manufacturer_name && !row.manufacturer) {
        errors.push({ row: i, error: 'Missing manufacturer name' });
      }
      if (!row.product_name && !row.product) {
        errors.push({ row: i, error: 'Missing product name' });
      }
      if (!row.dye_lot) {
        errors.push({ row: i, error: 'Missing dye lot' });
      }
      if (!row.width_ft && !row.width) {
        errors.push({ row: i, error: 'Missing width' });
      }
      if (!row.length_ft && !row.length) {
        errors.push({ row: i, error: 'Missing length' });
      }
      if (!row.location_bin && !row.bin) {
        errors.push({ row: i, error: 'Missing location bin' });
      }
      if (!row.location_row && !row.row) {
        errors.push({ row: i, error: 'Missing location row' });
      }
      if (!row.purchase_order && !row.po) {
        errors.push({ row: i, error: 'Missing purchase order' });
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
      const manufacturerName = row.manufacturer_name || row.manufacturer;
      const productName = row.product_name || row.product;
      const dyeLot = row.dye_lot;
      const width = parseFloat(row.width_ft || row.width);
      const length = parseFloat(row.length_ft || row.length);
      const locationBin = row.location_bin || row.bin;
      const locationRow = row.location_row || row.row;
      const purchaseOrder = row.po || row.purchase_order;

      // Whitespace- and case-tolerant lookup (matches the same logic as the dropdowns)
      const normalize = (s) => (s || '').replace(/\s+/g, '').toLowerCase();
      const manufacturer = manufacturers.find(m => normalize(m.vendor_name) === normalize(manufacturerName));
      if (!manufacturer) {
        toast.error(`Row ${row._rowNum}: Manufacturer '${manufacturerName}' not found.`);
        continue;
      }
      const product = products.find(p => normalize(p.product_name) === normalize(productName));
      if (!product) {
        toast.error(`Row ${row._rowNum}: Product '${productName}' not found.`);
        continue;
      }

      for (let i = 0; i < qty; i++) {
        const tt_sku_tag_number = generateTTSKUTagNumber();

        const rollData = {
          tt_sku_tag_number: tt_sku_tag_number,
          manufacturer_roll_number: row.manufacturer_roll_number || tt_sku_tag_number,
          vendor_id: manufacturer.id,
          vendor_name: manufacturer.vendor_name,
          product_id: product.id,
          product_name: product.product_name,
          dye_lot: dyeLot,
          width_ft: width,
          original_length_ft: length,
          current_length_ft: length,
          roll_type: 'Parent',
          condition: 'New',
          location_bin: locationBin,
          location_row: locationRow,
          status: 'Available',
          date_received: new Date().toISOString().split('T')[0],
          purchase_order: purchaseOrder
        };

        try {
          const roll = await createRollMutation.mutateAsync(rollData);
          rolls.push(roll);
        } catch (error) {
          toast.error(`Row ${row._rowNum}: Failed to create roll. ${error.message}`);
        }
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

  const handleManufacturerSelect = (manufacturerId, formSetter) => {
    const manufacturer = manufacturers.find(m => m.id === manufacturerId);
    if (manufacturer) {
      formSetter(prev => ({
        ...prev,
        manufacturer_id: manufacturerId,
        manufacturer_name: manufacturer.vendor_name,
        width_ft: '',
        product_id: '',
        product_name: ''
      }));
    }
  };

  // Filter products for a given manufacturer. Matches by ID when possible, falls
  // back to case-insensitive name match. Ignores all whitespace so "MightyGrass"
  // matches "Mighty Grass". Does NOT filter by width.
  const productsForManufacturer = (manufacturerId, manufacturerName) => {
    if (!manufacturerId && !manufacturerName) return [];
    const normalize = (s) => (s || '').replace(/\s+/g, '').toLowerCase();
    const wantedName = normalize(manufacturerName);
    return products.filter(p => {
      if (p.manufacturer_id && manufacturerId && p.manufacturer_id === manufacturerId) return true;
      if (wantedName && normalize(p.manufacturer_name) === wantedName) return true;
      // Some legacy products may use vendor_name instead.
      if (wantedName && normalize(p.vendor_name) === wantedName) return true;
      return false;
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold text-slate-800">Receive Inventory</h1>
        <p className="text-slate-500 mt-1">Add new rolls to TexasTurf warehouse inventory</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Form */}
        <div className="lg:col-span-2 overflow-visible">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-3 mb-6">
              <TabsTrigger value="single" className="flex items-center gap-2">
                <Plus className="h-4 w-4" />
                Single Roll
              </TabsTrigger>
              <TabsTrigger value="rapid" className="flex items-center gap-2">
                <Zap className="h-4 w-4" />
                Rapid Entry
              </TabsTrigger>
              <TabsTrigger value="csv" className="flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4" />
                CSV Import
              </TabsTrigger>
            </TabsList>

            {/* Single Receive */}
            <TabsContent value="single">
              <Card className="rounded-2xl border-slate-100 shadow-sm overflow-visible">
                <CardHeader>
                  <CardTitle>Receive Single Roll</CardTitle>
                  <CardDescription>Add one roll to inventory</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 overflow-visible">
                  <div className="space-y-2">
                    <Label>TT SKU Tag Number *</Label>
                    <Input 
                      value={singleForm.tt_sku_tag_number}
                      onChange={e => setSingleForm(p => ({ ...p, tt_sku_tag_number: e.target.value }))}
                      placeholder="Enter pre-printed SKU tag number"
                      className="font-mono"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Manufacturer *</Label>
                    <Select 
                      value={singleForm.manufacturer_id}
                      onValueChange={v => handleManufacturerSelect(v, setSingleForm)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select manufacturer" />
                      </SelectTrigger>
                      <SelectContent>
                        {manufacturers.map(m => (
                          <SelectItem key={m.id} value={m.id}>{m.vendor_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Product *</Label>
                    <Select 
                      value={singleForm.product_id} 
                      onValueChange={v => handleProductSelect(v, setSingleForm)}
                      disabled={!singleForm.manufacturer_id}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={singleForm.manufacturer_id ? "Select product" : "Select manufacturer first"} />
                      </SelectTrigger>
                      <SelectContent>
                        {(() => {
                          const filtered = productsForManufacturer(singleForm.manufacturer_id, singleForm.manufacturer_name);
                          if (filtered.length === 0) {
                            return (
                              <div className="px-3 py-6 text-sm text-slate-500 text-center">
                                No products linked to this manufacturer.
                                <br />
                                Add products in the Turf admin page and set their manufacturer to{' '}
                                <span className="font-medium">{singleForm.manufacturer_name || '—'}</span>.
                              </div>
                            );
                          }
                          return filtered.map(p => (
                            <SelectItem key={p.id} value={p.id}>{p.product_name}</SelectItem>
                          ));
                        })()}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Manufacturer Roll Number *</Label>
                    <Input 
                      value={singleForm.manufacturer_roll_number}
                      onChange={e => setSingleForm(p => ({ ...p, manufacturer_roll_number: e.target.value }))}
                      placeholder="From manufacturer's roll tag"
                    />
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
                      <Input 
                        type="number"
                        value={singleForm.width_ft === 0 || singleForm.width_ft === '' ? '' : singleForm.width_ft}
                        onChange={e => setSingleForm(p => ({ ...p, width_ft: e.target.value === '' ? '' : e.target.value }))}
                        placeholder="Enter width"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Length (ft) *</Label>
                      <Input 
                        type="number"
                        value={singleForm.length_ft === 0 || singleForm.length_ft === '' ? '' : singleForm.length_ft}
                        onChange={e => setSingleForm(p => ({ ...p, length_ft: e.target.value === '' ? '' : e.target.value }))}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Location *</Label>
                    <Select
                      value={singleForm.location}
                      onValueChange={v => setSingleForm(p => ({ ...p, location: v }))}
                    >
                      <SelectTrigger><SelectValue placeholder="Select location" /></SelectTrigger>
                      <SelectContent>
                        {locations.map(loc => (
                          <SelectItem key={loc.id} value={loc.id}>
                            {loc.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>PO # (on manufacturer order form) *</Label>
                    <Input 
                      value={singleForm.purchase_order}
                      onChange={e => setSingleForm(p => ({ ...p, purchase_order: e.target.value }))}
                      placeholder="Purchase order number"
                    />
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
              <Card className="rounded-2xl border-slate-100 shadow-sm overflow-visible">
                <CardHeader>
                  <CardTitle>Rapid Entry Mode</CardTitle>
                  <CardDescription>Create multiple rolls with the same settings</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 overflow-visible">
                  <div className="space-y-2">
                    <Label>Manufacturer *</Label>
                    <Select 
                      value={rapidForm.manufacturer_id}
                      onValueChange={v => handleManufacturerSelect(v, setRapidForm)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select manufacturer" />
                      </SelectTrigger>
                      <SelectContent>
                        {manufacturers.map(m => (
                          <SelectItem key={m.id} value={m.id}>{m.vendor_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Product *</Label>
                    <Select 
                      value={rapidForm.product_id} 
                      onValueChange={v => handleProductSelect(v, setRapidForm)}
                      disabled={!rapidForm.manufacturer_id}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={rapidForm.manufacturer_id ? "Select product" : "Select manufacturer first"} />
                      </SelectTrigger>
                      <SelectContent>
                        {(() => {
                          const filtered = productsForManufacturer(rapidForm.manufacturer_id, rapidForm.manufacturer_name);
                          if (filtered.length === 0) {
                            return (
                              <div className="px-3 py-6 text-sm text-slate-500 text-center">
                                No products linked to this manufacturer.
                                <br />
                                Add products in the Turf admin page and set their manufacturer to{' '}
                                <span className="font-medium">{rapidForm.manufacturer_name || '—'}</span>.
                              </div>
                            );
                          }
                          return filtered.map(p => (
                            <SelectItem key={p.id} value={p.id}>{p.product_name}</SelectItem>
                          ));
                        })()}
                      </SelectContent>
                    </Select>
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
                      <Input 
                        type="number"
                        value={rapidForm.width_ft === 0 || rapidForm.width_ft === '' ? '' : rapidForm.width_ft}
                        onChange={e => setRapidForm(p => ({ ...p, width_ft: e.target.value === '' ? '' : e.target.value }))}
                        placeholder="Enter width"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Length (ft) *</Label>
                      <Input 
                        type="number"
                        value={rapidForm.length_ft === 0 || rapidForm.length_ft === '' ? '' : rapidForm.length_ft}
                        onChange={e => setRapidForm(p => ({ ...p, length_ft: e.target.value === '' ? '' : e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Quantity *</Label>
                      <Input 
                        type="number"
                        min="1"
                        value={rapidForm.quantity === 0 ? '' : rapidForm.quantity}
                        onChange={e => setRapidForm(p => ({ ...p, quantity: e.target.value === '' ? '' : parseInt(e.target.value) }))}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>PO # *</Label>
                    <Input 
                      value={rapidForm.purchase_order}
                      onChange={e => setRapidForm(p => ({ ...p, purchase_order: e.target.value }))}
                      placeholder="Purchase order number"
                    />
                  </div>
                  
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
                    <p className="font-medium mb-1">⚠️ Location & Manufacturer Roll # Required After Creation</p>
                    <p>Rolls created via rapid entry will need location (bin/row) and manufacturer roll number added individually after creation.</p>
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
                    Upload a CSV with columns: manufacturer_name, product_name, dye_lot, width_ft, length_ft, quantity, po, location_bin, location_row, manufacturer_roll_number
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
                      <p className="font-mono font-medium text-emerald-800">{roll.tt_sku_tag_number}</p>
                      <p className="text-sm text-emerald-600">
                        {roll.product_name} • {roll.width_ft}ft × {roll.current_length_ft}ft
                      </p>
                      {roll.location_bin && roll.location_row ? (
                        <p className="text-xs text-emerald-500 mt-1">Location: {roll.location_bin}{roll.location_row}</p>
                      ) : (
                        <p className="text-xs text-red-600 mt-1 font-medium">⚠️ Location needed</p>
                      )}
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