import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { 
  Plus, 
  Eye,
  Edit,
  ChevronDown
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
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import StatusBadge from '@/components/ui/StatusBadge';
import OwnerBadge from '@/components/ui/OwnerBadge';
import OwnerFilter from '@/components/inventory/OwnerFilter';
import { format } from 'date-fns';

export default function Jobs() {
  const queryClient = useQueryClient();
  const [ownerFilter, setOwnerFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingJob, setEditingJob] = useState(null);
  
  const [newJob, setNewJob] = useState({
    job_number: '',
    fulfillment_for: 'TexasTurf',
    requested_total_turf_length_ft: '',
    customer_name: '',
    job_address: '',
    scheduled_date: '',
    notes: ''
  });

  const [editJob, setEditJob] = useState({
    job_number: '',
    fulfillment_for: 'TexasTurf',
    requested_total_turf_length_ft: '',
    customer_name: '',
    job_address: '',
    scheduled_date: '',
    status: '',
    notes: ''
  });

  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ['jobs'],
    queryFn: () => base44.entities.Job.list('-created_date', 200),
  });

  const createJobMutation = useMutation({
    mutationFn: async (data) => {
      return await base44.entities.Job.create({
        ...data,
        status: 'Draft'
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      setShowCreateDialog(false);
      setNewJob({
        job_number: '',
        fulfillment_for: 'TexasTurf',
        requested_total_turf_length_ft: '',
        customer_name: '',
        job_address: '',
        scheduled_date: '',
        notes: ''
      });
      toast.success('Job created');
    }
  });

  const updateJobMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Job.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      setShowEditDialog(false);
      setEditingJob(null);
      toast.success('Job updated');
    }
  });

  const filteredJobs = jobs.filter(job => {
    if (ownerFilter !== 'all' && job.fulfillment_for !== ownerFilter) return false;
    if (statusFilter !== 'all' && job.status !== statusFilter) return false;
    return true;
  });

  const handleCreateJob = () => {
    if (!newJob.job_number) {
      toast.error('Please enter a job number');
      return;
    }
    createJobMutation.mutate(newJob);
  };

  const handleEditJob = (job) => {
    setEditingJob(job);
    setEditJob({
      job_number: job.job_number || '',
      fulfillment_for: job.fulfillment_for || 'TexasTurf',
      requested_total_turf_length_ft: job.requested_total_turf_length_ft || '',
      customer_name: job.customer_name || '',
      job_address: job.job_address || '',
      scheduled_date: job.scheduled_date || '',
      status: job.status || '',
      notes: job.notes || ''
    });
    setShowEditDialog(true);
  };

  const handleSaveEdit = () => {
    if (!editJob.job_number) {
      toast.error('Please enter a job number');
      return;
    }
    updateJobMutation.mutate({ id: editingJob.id, data: editJob });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-slate-800 dark:text-white">Jobs</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Manage customer jobs and allocations</p>
        </div>
        <div className="flex items-center gap-2">
          <OwnerFilter value={ownerFilter} onChange={setOwnerFilter} />
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button className="bg-[#87c71a] hover:bg-[#6fa615] text-black font-medium">
                <Plus className="h-4 w-4 mr-2" />
                New Job
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md dark:bg-[#2d2d2d] dark:border-slate-700/50">
              <DialogHeader>
                <DialogTitle className="dark:text-white">Create New Job</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label className="dark:text-slate-300">Job Number (Jobber) *</Label>
                  <Input 
                    value={newJob.job_number}
                    onChange={e => setNewJob(p => ({ ...p, job_number: e.target.value }))}
                    placeholder="Enter job number from Jobber"
                    className="dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="dark:text-slate-300">Fulfillment For *</Label>
                  <Select 
                    value={newJob.fulfillment_for} 
                    onValueChange={v => setNewJob(p => ({ ...p, fulfillment_for: v }))}
                  >
                    <SelectTrigger className="dark:bg-slate-800 dark:border-slate-700 dark:text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="dark:bg-[#2d2d2d] dark:border-slate-700">
                      <SelectItem value="TexasTurf">TexasTurf Install</SelectItem>
                      <SelectItem value="TurfCasa">TurfCasa Retail</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="dark:text-slate-300">Total Requested Turf (ft)</Label>
                  <Input 
                    type="number"
                    value={newJob.requested_total_turf_length_ft}
                    onChange={e => setNewJob(p => ({ ...p, requested_total_turf_length_ft: e.target.value }))}
                    placeholder="From Jobber form"
                    className="dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="dark:text-slate-300">Customer Name</Label>
                  <Input 
                    value={newJob.customer_name}
                    onChange={e => setNewJob(p => ({ ...p, customer_name: e.target.value }))}
                    placeholder="Optional"
                    className="dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="dark:text-slate-300">Job Address</Label>
                  <Input 
                    value={newJob.job_address}
                    onChange={e => setNewJob(p => ({ ...p, job_address: e.target.value }))}
                    placeholder="Optional"
                    className="dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="dark:text-slate-300">Scheduled Date</Label>
                  <Input 
                    type="date"
                    value={newJob.scheduled_date}
                    onChange={e => setNewJob(p => ({ ...p, scheduled_date: e.target.value }))}
                    className="dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="dark:text-slate-300">Notes</Label>
                  <Textarea
                    value={newJob.notes}
                    onChange={e => setNewJob(p => ({ ...p, notes: e.target.value }))}
                    placeholder="Optional"
                    rows={3}
                    className="dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                  />
                </div>

                <Button 
                  onClick={handleCreateJob} 
                  disabled={createJobMutation.isPending}
                  className="w-full bg-[#87c71a] hover:bg-[#6fa615] text-black font-medium"
                >
                  Create Job
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px] dark:bg-[#2d2d2d] dark:border-slate-700 dark:text-white">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent className="dark:bg-[#2d2d2d] dark:border-slate-700">
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="Draft">Draft</SelectItem>
            <SelectItem value="Fulfilling">Fulfilling</SelectItem>
            <SelectItem value="SentOut">Sent Out</SelectItem>
            <SelectItem value="AwaitingReturnInventory">Awaiting Return</SelectItem>
            <SelectItem value="Completed">Completed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-[#2d2d2d]/50 dark:backdrop-blur-lg rounded-2xl border border-slate-100 dark:border-slate-700/50 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-4">
            {[1, 2, 3, 4, 5].map(i => (
              <Skeleton key={i} className="h-12 w-full dark:bg-slate-700" />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50 dark:bg-slate-800/50 border-b dark:border-slate-700/50">
                  <TableHead className="font-semibold dark:text-slate-300">Job Number</TableHead>
                  <TableHead className="font-semibold dark:text-slate-300">Company</TableHead>
                  <TableHead className="font-semibold dark:text-slate-300">Customer</TableHead>
                  <TableHead className="font-semibold dark:text-slate-300">Status</TableHead>
                  <TableHead className="font-semibold dark:text-slate-300">Created</TableHead>
                  <TableHead className="font-semibold dark:text-slate-300">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredJobs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-slate-500 dark:text-slate-400">
                      No jobs found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredJobs.map((job) => (
                    <TableRow 
                      key={job.id} 
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors border-b dark:border-slate-700/30"
                    >
                      <TableCell className="font-medium dark:text-white">{job.job_number}</TableCell>
                      <TableCell>
                        <OwnerBadge owner={job.fulfillment_for} size="sm" />
                      </TableCell>
                      <TableCell className="text-slate-600 dark:text-slate-300">{job.customer_name || '-'}</TableCell>
                      <TableCell><StatusBadge status={job.status} size="sm" /></TableCell>
                      <TableCell className="text-slate-500 dark:text-slate-400">
                        {format(new Date(job.created_date), 'MMM d')}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="dark:hover:bg-slate-700/50">
                              <ChevronDown className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="dark:bg-[#2d2d2d] dark:border-slate-700">
                            <DropdownMenuItem asChild>
                              <Link to={createPageUrl(`JobDetail?id=${job.id}`)}>
                                <Eye className="h-4 w-4 mr-2" />
                                View Details
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleEditJob(job)}>
                              <Edit className="h-4 w-4 mr-2" />
                              Edit Job
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Edit Job Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="sm:max-w-md dark:bg-[#2d2d2d] dark:border-slate-700/50">
          <DialogHeader>
            <DialogTitle className="dark:text-white">Edit Job</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="dark:text-slate-300">Job Number *</Label>
              <Input 
                value={editJob.job_number}
                onChange={e => setEditJob(p => ({ ...p, job_number: e.target.value }))}
                className="dark:bg-slate-800 dark:border-slate-700 dark:text-white"
              />
            </div>

            <div className="space-y-2">
              <Label className="dark:text-slate-300">Fulfillment For *</Label>
              <Select value={editJob.fulfillment_for} onValueChange={v => setEditJob(p => ({ ...p, fulfillment_for: v }))}>
                <SelectTrigger className="dark:bg-slate-800 dark:border-slate-700 dark:text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="dark:bg-[#2d2d2d] dark:border-slate-700">
                  <SelectItem value="TexasTurf">TexasTurf</SelectItem>
                  <SelectItem value="TurfCasa">TurfCasa</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="dark:text-slate-300">Requested Turf Length (ft)</Label>
              <Input 
                type="number"
                value={editJob.requested_total_turf_length_ft}
                onChange={e => setEditJob(p => ({ ...p, requested_total_turf_length_ft: e.target.value }))}
                className="dark:bg-slate-800 dark:border-slate-700 dark:text-white"
              />
            </div>

            <div className="space-y-2">
              <Label className="dark:text-slate-300">Customer Name</Label>
              <Input 
                value={editJob.customer_name}
                onChange={e => setEditJob(p => ({ ...p, customer_name: e.target.value }))}
                className="dark:bg-slate-800 dark:border-slate-700 dark:text-white"
              />
            </div>

            <div className="space-y-2">
              <Label className="dark:text-slate-300">Job Address</Label>
              <Input 
                value={editJob.job_address}
                onChange={e => setEditJob(p => ({ ...p, job_address: e.target.value }))}
                className="dark:bg-slate-800 dark:border-slate-700 dark:text-white"
              />
            </div>

            <div className="space-y-2">
              <Label className="dark:text-slate-300">Scheduled Date</Label>
              <Input 
                type="date"
                value={editJob.scheduled_date}
                onChange={e => setEditJob(p => ({ ...p, scheduled_date: e.target.value }))}
                className="dark:bg-slate-800 dark:border-slate-700 dark:text-white"
              />
            </div>

            <div className="space-y-2">
              <Label className="dark:text-slate-300">Status</Label>
              <Select value={editJob.status} onValueChange={v => setEditJob(p => ({ ...p, status: v }))}>
                <SelectTrigger className="dark:bg-slate-800 dark:border-slate-700 dark:text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="dark:bg-[#2d2d2d] dark:border-slate-700">
                  <SelectItem value="Draft">Draft</SelectItem>
                  <SelectItem value="Fulfilling">Fulfilling</SelectItem>
                  <SelectItem value="SentOut">Sent Out</SelectItem>
                  <SelectItem value="AwaitingReturnInventory">Awaiting Return Inventory</SelectItem>
                  <SelectItem value="Completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="dark:text-slate-300">Notes</Label>
              <Textarea 
                value={editJob.notes}
                onChange={e => setEditJob(p => ({ ...p, notes: e.target.value }))}
                rows={3}
                className="dark:bg-slate-800 dark:border-slate-700 dark:text-white"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)} className="dark:border-slate-700 dark:text-slate-300">
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} className="bg-[#87c71a] hover:bg-[#6fa615] text-black font-medium">
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}