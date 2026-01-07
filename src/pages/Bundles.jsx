import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { 
  Package, 
  Plus, 
  Truck,
  Eye,
  ChevronDown
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import StatusBadge from '@/components/ui/StatusBadge';
import OwnerBadge from '@/components/ui/OwnerBadge';
import OwnerFilter from '@/components/inventory/OwnerFilter';
import { format } from 'date-fns';

function generateBundleTag() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = 'B-';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export default function Bundles() {
  const queryClient = useQueryClient();
  const [ownerFilter, setOwnerFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  
  const [newBundle, setNewBundle] = useState({
    inventory_owner: 'TexasTurf',
    job_id: '',
    job_name: '',
    customer_name: '',
    destination_address: '',
    notes: ''
  });

  const { data: bundles = [], isLoading } = useQuery({
    queryKey: ['bundles'],
    queryFn: () => base44.entities.Bundle.list('-created_date', 200),
  });

  const { data: jobs = [] } = useQuery({
    queryKey: ['jobs'],
    queryFn: () => base44.entities.Job.filter({ status: 'Draft' }),
  });

  const createBundleMutation = useMutation({
    mutationFn: async (data) => {
      return await base44.entities.Bundle.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bundles'] });
      setShowCreateDialog(false);
      setNewBundle({
        inventory_owner: 'TexasTurf',
        job_id: '',
        job_name: '',
        customer_name: '',
        destination_address: '',
        notes: ''
      });
      toast.success('Bundle created');
    }
  });

  const filteredBundles = bundles.filter(bundle => {
    if (ownerFilter !== 'all' && bundle.inventory_owner !== ownerFilter) return false;
    if (statusFilter !== 'all' && bundle.status !== statusFilter) return false;
    return true;
  });

  const handleCreateBundle = () => {
    const bundleTag = generateBundleTag();
    createBundleMutation.mutate({
      ...newBundle,
      bundle_tag: bundleTag,
      status: 'Draft'
    });
  };

  const handleJobSelect = (jobId) => {
    const job = jobs.find(j => j.id === jobId);
    if (job) {
      setNewBundle(prev => ({
        ...prev,
        job_id: jobId,
        job_name: job.job_name,
        customer_name: job.customer_name,
        destination_address: job.job_address,
        inventory_owner: job.inventory_owner || prev.inventory_owner
      }));
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-slate-800">Bundles</h1>
          <p className="text-slate-500 mt-1">Manage shipment bundles</p>
        </div>
        <div className="flex items-center gap-2">
          <OwnerFilter value={ownerFilter} onChange={setOwnerFilter} />
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button className="bg-emerald-600 hover:bg-emerald-700">
                <Plus className="h-4 w-4 mr-2" />
                New Bundle
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Create New Bundle</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label>Owner *</Label>
                  <Select 
                    value={newBundle.inventory_owner} 
                    onValueChange={v => setNewBundle(p => ({ ...p, inventory_owner: v }))}
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
                  <Label>Link to Job (optional)</Label>
                  <Select 
                    value={newBundle.job_id} 
                    onValueChange={handleJobSelect}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select job" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={null}>No job</SelectItem>
                      {jobs.map(j => (
                        <SelectItem key={j.id} value={j.id}>{j.job_name} - {j.customer_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Customer Name</Label>
                  <Input 
                    value={newBundle.customer_name}
                    onChange={e => setNewBundle(p => ({ ...p, customer_name: e.target.value }))}
                    placeholder="Customer name"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Destination Address</Label>
                  <Input 
                    value={newBundle.destination_address}
                    onChange={e => setNewBundle(p => ({ ...p, destination_address: e.target.value }))}
                    placeholder="Delivery address"
                  />
                </div>

                <Button 
                  onClick={handleCreateBundle} 
                  disabled={createBundleMutation.isPending}
                  className="w-full bg-emerald-600 hover:bg-emerald-700"
                >
                  Create Bundle
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="Draft">Draft</SelectItem>
            <SelectItem value="Picking">Picking</SelectItem>
            <SelectItem value="Ready">Ready</SelectItem>
            <SelectItem value="Shipped">Shipped</SelectItem>
            <SelectItem value="Delivered">Delivered</SelectItem>
            <SelectItem value="Closed">Closed</SelectItem>
          </SelectContent>
        </Select>
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
                  <TableHead className="font-semibold">Bundle Tag</TableHead>
                  <TableHead className="font-semibold">Owner</TableHead>
                  <TableHead className="font-semibold">Customer</TableHead>
                  <TableHead className="font-semibold">Job</TableHead>
                  <TableHead className="font-semibold">Status</TableHead>
                  <TableHead className="font-semibold">Sq Ft</TableHead>
                  <TableHead className="font-semibold">Created</TableHead>
                  <TableHead className="font-semibold">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredBundles.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12 text-slate-500">
                      No bundles found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredBundles.map((bundle) => (
                    <TableRow key={bundle.id} className="hover:bg-slate-50 transition-colors">
                      <TableCell className="font-mono font-medium">{bundle.bundle_tag}</TableCell>
                      <TableCell><OwnerBadge owner={bundle.inventory_owner} size="sm" /></TableCell>
                      <TableCell>{bundle.customer_name || '-'}</TableCell>
                      <TableCell>{bundle.job_name || '-'}</TableCell>
                      <TableCell><StatusBadge status={bundle.status} size="sm" /></TableCell>
                      <TableCell>{bundle.total_sqft?.toLocaleString() || 0} sq ft</TableCell>
                      <TableCell className="text-slate-500">
                        {format(new Date(bundle.created_date), 'MMM d')}
                      </TableCell>
                      <TableCell>
                        <Link to={createPageUrl(`BundleDetail?id=${bundle.id}`)}>
                          <Button variant="ghost" size="sm">
                            <Eye className="h-4 w-4 mr-1" />
                            View
                          </Button>
                        </Link>
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