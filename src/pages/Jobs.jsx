import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import {
  Plus,
  Eye,
  Edit,
  ChevronDown,
  Trash2,
  Archive,
  Search,
  ArrowUpDown,
  X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
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
import { parseLocalDate } from '@/lib/dateHelpers';
import { describeError, } from '@/lib/query-client';
import {
  ALLOCATION_STATUS,
  deleteAllocationWithSync,
} from '@/lib/rollStatus';

const EMPTY_JOB = {
  job_number: '',
  fulfillment_for: 'TexasTurf',
  requested_total_turf_length_ft: '',
  customer_name: '',
  job_address: '',
  scheduled_date: '',
  notes: '',
};

/**
 * Build a Job payload the API will accept. Empty strings from blank inputs are
 * rejected outright by numeric and date fields, so they must be dropped rather
 * than sent through.
 */
function toJobPayload(form) {
  const payload = {
    job_number: (form.job_number || '').trim(),
    fulfillment_for: form.fulfillment_for,
    customer_name: (form.customer_name || '').trim(),
    job_address: (form.job_address || '').trim(),
    notes: (form.notes || '').trim(),
  };

  const requested = parseFloat(form.requested_total_turf_length_ft);
  if (Number.isFinite(requested)) {
    payload.requested_total_turf_length_ft = requested;
  }
  if (form.scheduled_date) {
    payload.scheduled_date = form.scheduled_date;
  }
  if (form.status) {
    payload.status = form.status;
  }
  return payload;
}

export default function Jobs() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [ownerFilter, setOwnerFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingJob, setEditingJob] = useState(null);
  const [selectedJobs, setSelectedJobs] = useState([]);
  const [sortColumn, setSortColumn] = useState('created_date');
  const [sortDirection, setSortDirection] = useState('desc');
  
  const [newJob, setNewJob] = useState(EMPTY_JOB);
  // Turf the job needs, chosen at create time. Each line becomes a Planned
  // allocation with no roll attached yet, which the warehouse fills later.
  const [turfLines, setTurfLines] = useState([]);

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

  const { data: jobs = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['jobs', sortColumn, sortDirection],
    queryFn: () => {
      const sortParam = sortDirection === 'desc' ? `-${sortColumn}` : sortColumn;
      return base44.entities.Job.list(sortParam, 500);
    },
  });

  const { data: products = [] } = useQuery({
    queryKey: ['products', 'active'],
    queryFn: () => base44.entities.Product.filter({ status: 'active' }),
  });

  const createJobMutation = useMutation({
    mutationFn: async ({ form, lines }) => {
      const job = await base44.entities.Job.create({
        ...toJobPayload(form),
        status: 'Draft',
      });

      for (const line of lines) {
        const product = products.find(p => p.id === line.product_id);
        await base44.entities.Allocation.create({
          job_id: job.id,
          job_name: job.job_name || job.job_number,
          product_id: line.product_id,
          product_name: product?.product_name || '',
          width_ft: parseFloat(line.width_ft) || undefined,
          requested_length_ft: parseFloat(line.length_ft) || 0,
          item_type: 'roll',
          allocated_roll_ids: [],
          status: ALLOCATION_STATUS.PLANNED,
        });
      }

      return job;
    },
    onSuccess: (job) => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      queryClient.invalidateQueries({ queryKey: ['allocations'] });
      setShowCreateDialog(false);
      setNewJob(EMPTY_JOB);
      setTurfLines([]);
      toast.success(`Job ${job.job_number} created`);
      // Go straight to the new job: the list is filtered and capped, so a fresh
      // Draft can easily fall outside the current view and look uncreated.
      navigate(createPageUrl(`JobDetail?id=${job.id}`));
    },
    onError: (error) => {
      toast.error(`Couldn't create the job: ${describeError(error)}`);
    },
  });

  const updateJobMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Job.update(id, toJobPayload(data)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      setShowEditDialog(false);
      setEditingJob(null);
      toast.success('Job updated');
    },
    onError: (error) => {
      toast.error(`Couldn't save the job: ${describeError(error)}`);
    },
  });

  const deleteJobsMutation = useMutation({
    mutationFn: async (jobIds) => {
      // Release each job's allocations first. Deleting the job alone leaves its
      // rolls stamped with a dead allocated_job_id, and because the orphan
      // allocation still looks active nothing can return them to Available.
      for (const id of jobIds) {
        const allocations = await base44.entities.Allocation.filter({ job_id: id });
        for (const allocation of allocations) {
          await deleteAllocationWithSync(allocation);
        }
        await base44.entities.Job.delete(id);
      }
    },
    onSuccess: (_data, jobIds) => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      queryClient.invalidateQueries({ queryKey: ['allocations'] });
      queryClient.invalidateQueries({ queryKey: ['rolls'] });
      setSelectedJobs([]);
      toast.success(
        `${jobIds.length} job${jobIds.length === 1 ? '' : 's'} deleted and their rolls released`,
      );
    },
    onError: (error) => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      queryClient.invalidateQueries({ queryKey: ['allocations'] });
      queryClient.invalidateQueries({ queryKey: ['rolls'] });
      toast.error(
        `Delete stopped part-way: ${describeError(error)}. Check the remaining jobs before retrying.`,
      );
    },
  });

  const archiveJobsMutation = useMutation({
    mutationFn: async (jobIds) => {
      for (const id of jobIds) {
        await base44.entities.Job.update(id, { status: 'Archived' });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      queryClient.invalidateQueries({ queryKey: ['archived-jobs'] });
      setSelectedJobs([]);
      toast.success('Jobs archived');
    },
    onError: (error) => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      toast.error(`Archive stopped part-way: ${describeError(error)}`);
    },
  });

  const filteredJobs = jobs.filter(job => {
    if (ownerFilter !== 'all' && job.fulfillment_for !== ownerFilter) return false;
    if (statusFilter === 'all' && job.status === 'Archived') return false;
    if (statusFilter !== 'all' && job.status !== statusFilter) return false;
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      return (
        job.job_number?.toLowerCase().includes(search) ||
        job.customer_name?.toLowerCase().includes(search) ||
        job.job_address?.toLowerCase().includes(search)
      );
    }
    return true;
  });

  // Selection must be intersected with what's on screen: filters change without
  // pruning selectedJobs, so a bulk action could otherwise hit rows the user
  // can no longer see.
  const visibleSelectedJobs = selectedJobs.filter(id =>
    filteredJobs.some(j => j.id === id),
  );

  const handleCreateJob = () => {
    const jobNumber = (newJob.job_number || '').trim();
    if (!jobNumber) {
      toast.error('Enter a job number');
      return;
    }
    if (jobs.some(j => (j.job_number || '').trim() === jobNumber)) {
      toast.error(`Job ${jobNumber} already exists.`);
      return;
    }
    const badLine = turfLines.find(
      l => !l.product_id || !(parseFloat(l.length_ft) > 0),
    );
    if (badLine) {
      toast.error('Each turf line needs a product and a length greater than zero.');
      return;
    }
    createJobMutation.mutate({ form: { ...newJob, job_number: jobNumber }, lines: turfLines });
  };

  const addTurfLine = () => {
    setTurfLines(prev => [
      ...prev,
      { key: `${Date.now()}-${prev.length}`, product_id: '', width_ft: '', length_ft: '' },
    ]);
  };

  const updateTurfLine = (key, patch) => {
    setTurfLines(prev => prev.map(l => (l.key === key ? { ...l, ...patch } : l)));
  };

  const removeTurfLine = (key) => {
    setTurfLines(prev => prev.filter(l => l.key !== key));
  };

  const turfLinesTotal = turfLines.reduce(
    (sum, l) => sum + (parseFloat(l.length_ft) || 0),
    0,
  );

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
    const jobNumber = (editJob.job_number || '').trim();
    if (!jobNumber) {
      toast.error('Enter a job number');
      return;
    }
    if (jobs.some(j => j.id !== editingJob.id && (j.job_number || '').trim() === jobNumber)) {
      toast.error(`Job ${jobNumber} already exists.`);
      return;
    }
    updateJobMutation.mutate({
      id: editingJob.id,
      data: { ...editJob, job_number: jobNumber },
    });
  };

  const handleSelectAll = (checked) => {
    if (checked) {
      setSelectedJobs(filteredJobs.map(j => j.id));
    } else {
      setSelectedJobs([]);
    }
  };

  const handleSelectJob = (jobId, checked) => {
    if (checked) {
      setSelectedJobs(prev => [...prev, jobId]);
    } else {
      setSelectedJobs(prev => prev.filter(id => id !== jobId));
    }
  };

  const handleBulkDelete = () => {
    const names = filteredJobs
      .filter(j => visibleSelectedJobs.includes(j.id))
      .map(j => j.job_number)
      .join(', ');
    if (
      !confirm(
        `Delete ${visibleSelectedJobs.length} job(s)?\n\n${names}\n\n` +
          'Any rolls still allocated to them will be released back to Available. This cannot be undone.',
      )
    ) {
      return;
    }
    deleteJobsMutation.mutate(visibleSelectedJobs);
  };

  const handleBulkArchive = () => {
    if (!confirm(`Archive ${visibleSelectedJobs.length} job(s)?`)) return;
    archiveJobsMutation.mutate(visibleSelectedJobs);
  };

  const handleSort = (column) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
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
          {visibleSelectedJobs.length > 0 && (
            <>
              <Button
                variant="outline"
                onClick={handleBulkArchive}
                disabled={archiveJobsMutation.isPending}
              >
                <Archive className="h-4 w-4 mr-2" />
                Archive ({visibleSelectedJobs.length})
              </Button>
              <Button
                variant="destructive"
                onClick={handleBulkDelete}
                disabled={deleteJobsMutation.isPending}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete ({visibleSelectedJobs.length})
              </Button>
            </>
          )}
          <Dialog
            open={showCreateDialog}
            onOpenChange={(open) => {
              setShowCreateDialog(open);
              if (!open) {
                setNewJob(EMPTY_JOB);
                setTurfLines([]);
              }
            }}
          >
            <DialogTrigger asChild>
              <Button className="bg-[#87c71a] hover:bg-[#6fa615] text-black font-medium">
                <Plus className="h-4 w-4 mr-2" />
                New Job
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto dark:bg-[#2d2d2d] dark:border-slate-700/50">
              <DialogHeader>
                <DialogTitle className="dark:text-white">Create New Job</DialogTitle>
              </DialogHeader>
              {/* A real form so Enter submits — the click-only version gave warehouse
                  staff no response to Enter, which read as "it won't let me create it". */}
              <form
                className="space-y-4 pt-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  handleCreateJob();
                }}
              >
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

                {/* Turf the job needs. Each line is saved as a Planned allocation with
                    no roll attached, so the office can specify the turf type before
                    the warehouse has picked physical rolls. */}
                <div className="space-y-2 rounded-lg border border-slate-200 dark:border-slate-700 p-3">
                  <div className="flex items-center justify-between">
                    <Label className="dark:text-slate-300">Turf needed</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addTurfLine}
                      disabled={products.length === 0}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Add turf
                    </Button>
                  </div>

                  {products.length === 0 && (
                    <p className="text-xs text-amber-600">
                      No active turf products yet — add them under Admin → Turf.
                    </p>
                  )}

                  {turfLines.length === 0 ? (
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Optional. Add a line per turf type so the warehouse knows what to pull.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {turfLines.map(line => {
                        const product = products.find(p => p.id === line.product_id);
                        const widthOptions = product?.width_options || [];
                        return (
                          <div key={line.key} className="flex gap-2 items-end">
                            <div className="flex-1 min-w-0">
                              <Label className="text-xs dark:text-slate-400">Turf type</Label>
                              <Select
                                value={line.product_id}
                                onValueChange={v =>
                                  updateTurfLine(line.key, { product_id: v, width_ft: '' })
                                }
                              >
                                <SelectTrigger className="dark:bg-slate-800 dark:border-slate-700 dark:text-white">
                                  <SelectValue placeholder="Select turf" />
                                </SelectTrigger>
                                <SelectContent className="dark:bg-[#2d2d2d] dark:border-slate-700">
                                  {products.map(p => (
                                    <SelectItem key={p.id} value={p.id}>
                                      {p.product_name}
                                      {p.manufacturer_name ? ` — ${p.manufacturer_name}` : ''}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="w-24">
                              <Label className="text-xs dark:text-slate-400">Width</Label>
                              {widthOptions.length > 0 ? (
                                <Select
                                  value={line.width_ft ? String(line.width_ft) : ''}
                                  onValueChange={v => updateTurfLine(line.key, { width_ft: v })}
                                >
                                  <SelectTrigger className="dark:bg-slate-800 dark:border-slate-700 dark:text-white">
                                    <SelectValue placeholder="ft" />
                                  </SelectTrigger>
                                  <SelectContent className="dark:bg-[#2d2d2d] dark:border-slate-700">
                                    {widthOptions.map(w => (
                                      <SelectItem key={w} value={String(w)}>
                                        {w} ft
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              ) : (
                                <Input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={line.width_ft}
                                  onChange={e =>
                                    updateTurfLine(line.key, { width_ft: e.target.value })
                                  }
                                  placeholder="ft"
                                  className="dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                                />
                              )}
                            </div>
                            <div className="w-24">
                              <Label className="text-xs dark:text-slate-400">Length (LF)</Label>
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={line.length_ft}
                                onChange={e =>
                                  updateTurfLine(line.key, { length_ft: e.target.value })
                                }
                                placeholder="0"
                                className="dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                              />
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => removeTurfLine(line.key)}
                              className="text-red-500 hover:text-red-700 mb-0.5"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label className="dark:text-slate-300">Total Requested (LF)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={newJob.requested_total_turf_length_ft}
                    onChange={e => setNewJob(p => ({ ...p, requested_total_turf_length_ft: e.target.value }))}
                    placeholder="From Jobber form"
                    className="dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                  />
                  {turfLinesTotal > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        setNewJob(p => ({
                          ...p,
                          requested_total_turf_length_ft: String(turfLinesTotal),
                        }))
                      }
                      className="text-xs text-blue-600 hover:underline"
                    >
                      Use {turfLinesTotal} ft from the turf lines above
                    </button>
                  )}
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
                  type="submit"
                  disabled={createJobMutation.isPending}
                  className="w-full bg-[#87c71a] hover:bg-[#6fa615] text-black font-medium"
                >
                  {createJobMutation.isPending ? 'Creating…' : 'Create Job'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search job number, customer, address..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="pl-9 dark:bg-[#2d2d2d] dark:border-slate-700 dark:text-white"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px] dark:bg-[#2d2d2d] dark:border-slate-700 dark:text-white">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent className="dark:bg-[#2d2d2d] dark:border-slate-700">
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="Draft">Draft</SelectItem>
            <SelectItem value="Ready">Ready</SelectItem>
            <SelectItem value="Dispatched">Fulfilled</SelectItem>
            <SelectItem value="AwaitingReturnInventory">Awaiting Return</SelectItem>
            <SelectItem value="Completed">Completed</SelectItem>
            <SelectItem value="Archived">Archived</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-[#2d2d2d]/50 dark:backdrop-blur-lg rounded-2xl border border-slate-100 dark:border-slate-700/50 shadow-sm overflow-hidden">
        {isError ? (
          <div className="p-8 text-center space-y-3">
            <p className="text-red-600 font-medium">Couldn't load jobs.</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              This is a connection problem, not an empty list.
            </p>
            <Button variant="outline" onClick={() => refetch()}>Try again</Button>
          </div>
        ) : isLoading ? (
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
                  <TableHead className="w-12">
                    <Checkbox
                      checked={
                        filteredJobs.length > 0 &&
                        filteredJobs.every(j => selectedJobs.includes(j.id))
                      }
                      onCheckedChange={handleSelectAll}
                    />
                  </TableHead>
                  <TableHead className="font-semibold dark:text-slate-300 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700" onClick={() => handleSort('job_number')}>
                    <div className="flex items-center gap-1">
                      Job Number <ArrowUpDown className="h-3 w-3" />
                    </div>
                  </TableHead>
                  <TableHead className="font-semibold dark:text-slate-300">Company</TableHead>
                  <TableHead className="font-semibold dark:text-slate-300 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700" onClick={() => handleSort('customer_name')}>
                    <div className="flex items-center gap-1">
                      Customer <ArrowUpDown className="h-3 w-3" />
                    </div>
                  </TableHead>
                  <TableHead className="font-semibold dark:text-slate-300 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700" onClick={() => handleSort('status')}>
                    <div className="flex items-center gap-1">
                      Status <ArrowUpDown className="h-3 w-3" />
                    </div>
                  </TableHead>
                  <TableHead className="font-semibold dark:text-slate-300 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700" onClick={() => handleSort('scheduled_date')}>
                    <div className="flex items-center gap-1">
                      Scheduled Date <ArrowUpDown className="h-3 w-3" />
                    </div>
                  </TableHead>
                  <TableHead className="font-semibold dark:text-slate-300">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredJobs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12 text-slate-500 dark:text-slate-400">
                      No jobs found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredJobs.map((job) => (
                    <TableRow 
                      key={job.id} 
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors border-b dark:border-slate-700/30 cursor-pointer"
                      onClick={() => navigate(createPageUrl(`JobDetail?id=${job.id}`))}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox 
                          checked={selectedJobs.includes(job.id)}
                          onCheckedChange={(checked) => handleSelectJob(job.id, checked)}
                        />
                      </TableCell>
                      <TableCell className="font-medium dark:text-white">{job.job_number}</TableCell>
                      <TableCell>
                        <OwnerBadge owner={job.fulfillment_for} size="sm" />
                      </TableCell>
                      <TableCell className="text-slate-600 dark:text-slate-300">{job.customer_name || '-'}</TableCell>
                      <TableCell><StatusBadge status={job.status} size="sm" /></TableCell>
                      <TableCell className="text-slate-500 dark:text-slate-400">
                        {(() => {
                          const d = parseLocalDate(job.scheduled_date);
                          return d ? format(d, 'MMM d, yyyy') : '-';
                        })()}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
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
                  <SelectValue placeholder="Select a status" />
                </SelectTrigger>
                <SelectContent className="dark:bg-[#2d2d2d] dark:border-slate-700">
                  <SelectItem value="Draft">Draft</SelectItem>
                  <SelectItem value="Ready">Ready</SelectItem>
                  <SelectItem value="Dispatched">Fulfilled</SelectItem>
                  <SelectItem value="AwaitingReturnInventory">Awaiting Return Inventory</SelectItem>
                  <SelectItem value="Completed">Completed</SelectItem>
                  {/* Without this an archived job opens the dialog with a blank status
                      and any other pick silently unarchives it. */}
                  <SelectItem value="Archived">Archived</SelectItem>
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