import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { 
  Plus, 
  Eye,
  Calendar,
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
import { Card } from '@/components/ui/card';
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
  
  const [newJob, setNewJob] = useState({
    job_number: '',
    fulfillment_for: 'TexasTurf',
    customer_name: '',
    job_address: '',
    scheduled_date: '',
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
        customer_name: '',
        job_address: '',
        scheduled_date: '',
        notes: ''
      });
      toast.success('Job created');
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-slate-800">Jobs</h1>
          <p className="text-slate-500 mt-1">Manage customer jobs and allocations</p>
        </div>
        <div className="flex items-center gap-2">
          <OwnerFilter value={ownerFilter} onChange={setOwnerFilter} />
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button className="bg-emerald-600 hover:bg-emerald-700">
                <Plus className="h-4 w-4 mr-2" />
                New Job
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Create New Job</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label>Job Number *</Label>
                  <Input 
                    value={newJob.job_number}
                    onChange={e => setNewJob(p => ({ ...p, job_number: e.target.value }))}
                    placeholder="Enter job number"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Fulfillment For *</Label>
                  <Select 
                    value={newJob.fulfillment_for} 
                    onValueChange={v => setNewJob(p => ({ ...p, fulfillment_for: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="TexasTurf">TexasTurf Install</SelectItem>
                      <SelectItem value="TurfCasa">TurfCasa Retail</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button 
                  onClick={handleCreateJob} 
                  disabled={createJobMutation.isPending}
                  className="w-full bg-emerald-600 hover:bg-emerald-700"
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
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
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
                  <TableHead className="font-semibold">Job Number</TableHead>
                  <TableHead className="font-semibold">Company</TableHead>
                  <TableHead className="font-semibold">Customer</TableHead>
                  <TableHead className="font-semibold">Status</TableHead>
                  <TableHead className="font-semibold">Created</TableHead>
                  <TableHead className="font-semibold">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredJobs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-slate-500">
                      No jobs found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredJobs.map((job) => (
                    <TableRow key={job.id} className="hover:bg-slate-50 transition-colors">
                      <TableCell className="font-medium">{job.job_number}</TableCell>
                      <TableCell>
                        <OwnerBadge owner={job.fulfillment_for} size="sm" />
                      </TableCell>
                      <TableCell className="text-slate-600">{job.customer_name || '-'}</TableCell>
                      <TableCell><StatusBadge status={job.status} size="sm" /></TableCell>
                      <TableCell className="text-slate-500">
                        {format(new Date(job.created_date), 'MMM d')}
                      </TableCell>
                      <TableCell>
                        <Link to={createPageUrl(`JobDetail?id=${job.id}`)}>
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