import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { 
  ArrowLeft, 
  Scissors, 
  Package, 
  MapPin, 
  Calendar,
  Hash,
  Ruler,
  FileText,
  Clock,
  Briefcase
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from '@/components/ui/label';
import StatusBadge from '@/components/ui/StatusBadge';
import OwnerBadge from '@/components/ui/OwnerBadge';
import { format } from 'date-fns';
import { toast } from 'sonner';

export default function RollDetail() {
  const queryClient = useQueryClient();
  const params = new URLSearchParams(window.location.search);
  const rollId = params.get('id');
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState('');

  const { data: roll, isLoading } = useQuery({
    queryKey: ['roll', rollId],
    queryFn: () => base44.entities.Roll.filter({ id: rollId }),
    enabled: !!rollId,
    select: (data) => data[0],
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ['transactions', rollId],
    queryFn: () => base44.entities.Transaction.filter({ roll_id: rollId }, '-created_date', 50),
    enabled: !!rollId,
  });

  const { data: childRolls = [] } = useQuery({
    queryKey: ['childRolls', rollId],
    queryFn: () => base44.entities.Roll.filter({ parent_roll_id: rollId }),
    enabled: !!rollId && roll?.roll_type === 'Parent',
  });

  const { data: parentRoll } = useQuery({
    queryKey: ['parentRoll', roll?.parent_roll_id],
    queryFn: () => base44.entities.Roll.filter({ id: roll.parent_roll_id }),
    enabled: !!roll?.parent_roll_id,
    select: (data) => data[0],
  });

  const { data: jobs = [] } = useQuery({
    queryKey: ['jobs'],
    queryFn: async () => {
      const allJobs = await base44.entities.Job.list();
      return allJobs.filter(j => j.status !== 'Archived');
    },
  });

  const assignToJobMutation = useMutation({
    mutationFn: async (jobId) => {
      const user = await base44.auth.me();
      const job = jobs.find(j => j.id === jobId);
      
      // Create allocation
      await base44.entities.Allocation.create({
        job_id: jobId,
        job_name: job.job_name || job.job_number,
        product_id: roll.product_id,
        product_name: roll.product_name,
        width_ft: roll.width_ft,
        dye_lot_preference: roll.dye_lot,
        requested_length_ft: roll.current_length_ft,
        allocated_roll_ids: [roll.id],
        item_type: 'roll',
        status: 'Planned'
      });

      // Update roll status
      await base44.entities.Roll.update(roll.id, { status: 'Allocated' });

      // Create transaction
      await base44.entities.Transaction.create({
        transaction_type: 'AssignToJob',
        fulfillment_for: job.fulfillment_for,
        roll_id: roll.id,
        tt_sku_tag_number: roll.tt_sku_tag_number || roll.roll_tag,
        job_id: jobId,
        job_number: job.job_number,
        product_name: roll.product_name,
        dye_lot: roll.dye_lot,
        width_ft: roll.width_ft,
        performed_by: user.full_name || user.email,
        notes: `Assigned to job ${job.job_number}`
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roll', rollId] });
      queryClient.invalidateQueries({ queryKey: ['rolls'] });
      setShowAssignDialog(false);
      setSelectedJobId('');
      toast.success('Roll assigned to job');
    }
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  if (!roll) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-500">Roll not found</p>
        <Link to={createPageUrl('Inventory')}>
          <Button variant="link" className="mt-2">Back to Inventory</Button>
        </Link>
      </div>
    );
  }

  const sqft = roll.current_length_ft * roll.width_ft;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link to={createPageUrl('Inventory')}>
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl lg:text-3xl font-bold text-slate-800 font-mono">
                {roll.tt_sku_tag_number || roll.roll_tag}
              </h1>
              <StatusBadge status={roll.roll_type} />
              <StatusBadge status={roll.status} />
            </div>
            <p className="text-slate-500 mt-1">{roll.product_name} • {roll.dye_lot}</p>
          </div>
        </div>
        <div className="flex gap-2">
          {roll.status === 'Available' && roll.current_length_ft > 0 && (
            <>
              <Button 
                onClick={() => setShowAssignDialog(true)}
                variant="outline"
                className="border-blue-600 text-blue-600 hover:bg-blue-50"
              >
                <Briefcase className="h-4 w-4 mr-2" />
                Assign to Job
              </Button>
              <Link to={createPageUrl(`CutRoll?roll_id=${roll.id}`)}>
                <Button className="bg-emerald-600 hover:bg-emerald-700">
                  <Scissors className="h-4 w-4 mr-2" />
                  Cut Roll
                </Button>
              </Link>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Info */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="rounded-2xl border-slate-100 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Roll Information</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-6">
              <div>
                <p className="text-sm text-slate-500 mb-1">Owner</p>
                <OwnerBadge owner={roll.inventory_owner} />
              </div>
              <div>
                <p className="text-sm text-slate-500 mb-1">Product</p>
                <p className="font-medium text-slate-800">{roll.product_name}</p>
              </div>
              <div>
                <p className="text-sm text-slate-500 mb-1">Dye Lot</p>
                <p className="font-medium text-slate-800">{roll.dye_lot}</p>
              </div>
              <div>
                <p className="text-sm text-slate-500 mb-1">Width</p>
                <p className="font-medium text-slate-800">{roll.width_ft} ft</p>
              </div>
              <div>
                <p className="text-sm text-slate-500 mb-1">Current Length</p>
                <p className="font-medium text-slate-800">{roll.current_length_ft} ft</p>
              </div>
              <div>
                <p className="text-sm text-slate-500 mb-1">Original Length</p>
                <p className="font-medium text-slate-800">{roll.original_length_ft} ft</p>
              </div>
              <div>
                <p className="text-sm text-slate-500 mb-1">Current Sq Ft</p>
                <p className="font-medium text-slate-800">{sqft.toLocaleString()} sq ft</p>
              </div>
              <div>
                <p className="text-sm text-slate-500 mb-1">Location</p>
                <p className="font-medium text-slate-800">{roll.location_name || '-'}</p>
              </div>
              <div>
                <p className="text-sm text-slate-500 mb-1">Condition</p>
                <StatusBadge status={roll.condition} size="sm" />
              </div>
              {roll.custom_roll_sku && (
                <div>
                  <p className="text-sm text-slate-500 mb-1">Custom SKU</p>
                  <p className="font-mono text-slate-800">{roll.custom_roll_sku}</p>
                </div>
              )}
              {roll.vendor && (
                <div>
                  <p className="text-sm text-slate-500 mb-1">Vendor</p>
                  <p className="font-medium text-slate-800">{roll.vendor}</p>
                </div>
              )}
              {roll.purchase_order && (
                <div>
                  <p className="text-sm text-slate-500 mb-1">PO#</p>
                  <p className="font-medium text-slate-800">{roll.purchase_order}</p>
                </div>
              )}
              {roll.date_received && (
                <div>
                  <p className="text-sm text-slate-500 mb-1">Date Received</p>
                  <p className="font-medium text-slate-800">
                    {format(new Date(roll.date_received), 'MMM d, yyyy')}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Parent Roll Info (for child rolls) */}
          {roll.roll_type === 'Child' && parentRoll && (
            <Card className="rounded-2xl border-slate-100 shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg">Parent Roll</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-slate-500 mb-1">TT SKU #</p>
                    <p className="font-mono font-medium text-slate-800">
                      {parentRoll.tt_sku_tag_number || parentRoll.roll_tag}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-500 mb-1">Manufacturer Roll #</p>
                    <p className="font-medium text-slate-800">{parentRoll.manufacturer_roll_number || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-500 mb-1">Product</p>
                    <p className="font-medium text-slate-800">{parentRoll.product_name}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-500 mb-1">Dye Lot</p>
                    <p className="font-medium text-slate-800">{parentRoll.dye_lot}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-500 mb-1">Current Length</p>
                    <p className="font-medium text-slate-800">{parentRoll.current_length_ft} ft</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-500 mb-1">Status</p>
                    <StatusBadge status={parentRoll.status} size="sm" />
                  </div>
                </div>
                <Link 
                  to={createPageUrl(`RollDetail?id=${roll.parent_roll_id}`)}
                  className="inline-block text-emerald-600 hover:text-emerald-700 font-medium text-sm"
                >
                  View Full Parent Details →
                </Link>
              </CardContent>
            </Card>
          )}

          {/* Child Rolls (for parent rolls) */}
          {roll.roll_type === 'Parent' && childRolls.length > 0 && (
            <Card className="rounded-2xl border-slate-100 shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg">Child Rolls ({childRolls.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {childRolls.map(child => (
                    <Link
                      key={child.id}
                      to={createPageUrl(`RollDetail?id=${child.id}`)}
                      className="block p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-mono text-sm font-medium">
                          {child.tt_sku_tag_number || child.roll_tag}
                        </span>
                        <StatusBadge status={child.status} size="sm" />
                      </div>
                      <div className="flex items-center gap-4 text-xs text-slate-600">
                        <span>{child.width_ft}ft × {child.current_length_ft}ft</span>
                        <span>•</span>
                        <span>Dye Lot: {child.dye_lot}</span>
                        {child.location_bin && child.location_row && (
                          <>
                            <span>•</span>
                            <span>Location: {child.location_bin}-{child.location_row}</span>
                          </>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Notes */}
          {roll.notes && (
            <Card className="rounded-2xl border-slate-100 shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg">Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-slate-600">{roll.notes}</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Transaction History */}
        <div className="lg:col-span-1">
          <Card className="rounded-2xl border-slate-100 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Transaction History</CardTitle>
            </CardHeader>
            <CardContent>
              {transactions.length === 0 ? (
                <p className="text-slate-500 text-sm">No transactions yet</p>
              ) : (
                <div className="space-y-4">
                  {transactions.map((tx) => (
                    <div key={tx.id} className="flex gap-3">
                      <div className="w-2 h-2 bg-emerald-500 rounded-full mt-2 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-slate-800">{tx.transaction_type}</p>
                        {tx.length_change_ft !== 0 && (
                          <p className="text-sm text-slate-500">
                            {tx.length_before_ft}ft → {tx.length_after_ft}ft
                            <span className={tx.length_change_ft < 0 ? 'text-red-500' : 'text-emerald-500'}>
                              {' '}({tx.length_change_ft > 0 ? '+' : ''}{tx.length_change_ft}ft)
                            </span>
                          </p>
                        )}
                        {tx.notes && (
                          <p className="text-xs text-slate-400 truncate">{tx.notes}</p>
                        )}
                        <p className="text-xs text-slate-400 mt-1">
                          {format(new Date(tx.created_date), 'MMM d, h:mm a')}
                          {tx.performed_by && ` • ${tx.performed_by}`}
                        </p>
                      </div>
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