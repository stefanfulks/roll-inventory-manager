import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { 
  Eye,
  RotateCcw
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import StatusBadge from '@/components/ui/StatusBadge';
import OwnerBadge from '@/components/ui/OwnerBadge';
import { format } from 'date-fns';

export default function ArchivedJobs() {
  const queryClient = useQueryClient();

  const { data: archivedJobs = [], isLoading } = useQuery({
    queryKey: ['archived-jobs'],
    queryFn: () => base44.entities.Job.filter({ status: 'Archived' }, '-created_date', 500),
  });

  const unarchiveJobMutation = useMutation({
    mutationFn: (jobId) => base44.entities.Job.update(jobId, { status: 'Draft' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['archived-jobs'] });
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      toast.success('Job unarchived');
    }
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold text-slate-800 dark:text-white">Archived Jobs</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1">{archivedJobs.length} archived jobs</p>
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
                  <TableHead className="font-semibold dark:text-slate-300">Archived Date</TableHead>
                  <TableHead className="font-semibold dark:text-slate-300">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {archivedJobs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12 text-slate-500 dark:text-slate-400">
                      No archived jobs
                    </TableCell>
                  </TableRow>
                ) : (
                  archivedJobs.map((job) => (
                    <TableRow 
                      key={job.id} 
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors border-b dark:border-slate-700/30"
                    >
                      <TableCell className="font-medium dark:text-white">{job.job_number}</TableCell>
                      <TableCell>
                        <OwnerBadge owner={job.fulfillment_for} size="sm" />
                      </TableCell>
                      <TableCell className="text-slate-600 dark:text-slate-300">{job.customer_name || '-'}</TableCell>
                      <TableCell className="text-slate-500 dark:text-slate-400">
                        {format(new Date(job.updated_date), 'MMM d, yyyy')}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Link to={createPageUrl(`JobDetail?id=${job.id}`)}>
                            <Button variant="ghost" size="sm" className="dark:hover:bg-slate-700/50">
                              <Eye className="h-4 w-4 mr-1" />
                              View
                            </Button>
                          </Link>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => unarchiveJobMutation.mutate(job.id)}
                            disabled={unarchiveJobMutation.isPending}
                            className="dark:hover:bg-slate-700/50"
                          >
                            <RotateCcw className="h-4 w-4 mr-1" />
                            Unarchive
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