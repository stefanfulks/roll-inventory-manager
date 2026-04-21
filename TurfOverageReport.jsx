import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { 
  Calendar,
  Download,
  TrendingUp,
  TrendingDown
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { toast } from 'sonner';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from 'recharts';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, parseISO } from 'date-fns';

export default function TurfOverageReport() {
  const [dateRange, setDateRange] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const { data: jobs = [], isLoading: loadingJobs } = useQuery({
    queryKey: ['jobs'],
    queryFn: () => base44.entities.Job.list(),
  });

  const { data: transactions = [], isLoading: loadingTx } = useQuery({
    queryKey: ['transactions'],
    queryFn: () => base44.entities.Transaction.list('-created_date', 2000),
  });

  const { data: allocations = [] } = useQuery({
    queryKey: ['allocations'],
    queryFn: () => base44.entities.Allocation.list(),
  });

  const isLoading = loadingJobs || loadingTx;

  // Filter jobs based on date range
  const filteredJobs = jobs.filter(job => {
    if (job.status !== 'Completed' && job.status !== 'AwaitingReturnInventory') return false;
    
    if (dateRange === 'all') return true;
    
    const jobDate = job.scheduled_date ? new Date(job.scheduled_date) : new Date(job.created_date);
    const today = new Date();
    
    if (dateRange === 'week') {
      const weekStart = startOfWeek(today, { weekStartsOn: 1 });
      const weekEnd = endOfWeek(today, { weekStartsOn: 1 });
      return jobDate >= weekStart && jobDate <= weekEnd;
    } else if (dateRange === 'month') {
      const monthStart = startOfMonth(today);
      const monthEnd = endOfMonth(today);
      return jobDate >= monthStart && jobDate <= monthEnd;
    } else if (dateRange === 'custom' && startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      return jobDate >= start && jobDate <= end;
    }
    
    return true;
  });

  // Calculate variance for each job
  const jobVariances = filteredJobs.map(job => {
    const jobAllocations = allocations.filter(a => a.job_id === job.id && a.item_type === 'roll');
    const totalAllocated = jobAllocations
      .filter(a => a.status === 'Dispatched')
      .reduce((sum, a) => sum + (a.requested_length_ft || 0), 0);
    
    const returnTx = transactions.filter(t => 
      t.job_id === job.id && t.transaction_type === 'ReturnFromJob'
    );
    const totalReturned = returnTx.reduce((sum, t) => sum + (t.length_change_ft || 0), 0);
    
    const totalUsed = totalAllocated - totalReturned;
    const requested = job.requested_total_turf_length_ft || 0;
    const variance = totalUsed - requested;
    
    return {
      ...job,
      requested,
      allocated: totalAllocated,
      returned: totalReturned,
      used: totalUsed,
      variance,
      variancePercent: requested > 0 ? ((variance / requested) * 100).toFixed(1) : 0,
      date: job.scheduled_date || job.created_date
    };
  }).filter(j => j.requested > 0);

  // Weekly chart data
  const weeklyData = {};
  jobVariances.forEach(job => {
    const weekStart = format(startOfWeek(new Date(job.date), { weekStartsOn: 1 }), 'MMM d');
    if (!weeklyData[weekStart]) {
      weeklyData[weekStart] = { week: weekStart, variance: 0, count: 0 };
    }
    weeklyData[weekStart].variance += job.variance;
    weeklyData[weekStart].count += 1;
  });

  const weeklyChartData = Object.values(weeklyData).map(w => ({
    ...w,
    avgVariance: Math.round(w.variance / w.count)
  }));

  const generatePDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text('Turf Overage Report', 14, 22);
    doc.setFontSize(11);
    doc.setTextColor(100);

    doc.autoTable({
      head: [['Job #', 'Customer', 'Date', 'Requested', 'Used', 'Variance', 'Var %']],
      body: jobVariances.map(j => [
        j.job_number,
        j.customer_name || '-',
        format(new Date(j.date), 'MM/dd/yyyy'),
        `${j.requested} ft`,
        `${j.used} ft`,
        `${j.variance} ft`,
        `${j.variancePercent}%`,
      ]),
      startY: 30,
      headStyles: { fillColor: [52, 73, 94] },
      styles: { fontSize: 8 },
    });

    doc.save(`turf_overage_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
    toast.success('Turf Overage PDF exported');
  };

  const exportCSV = () => {
    const headers = ['Job #', 'Customer', 'Date', 'Requested (ft)', 'Used (ft)', 'Variance (ft)', 'Variance (%)'];
    const rows = jobVariances.map(j => [
      j.job_number,
      j.customer_name || '',
      format(new Date(j.date), 'yyyy-MM-dd'),
      j.requested,
      j.used,
      j.variance,
      j.variancePercent + '%'
    ]);
    
    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `turf_overage_report_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    toast.success('Turf Overage CSV exported');
  };

  const totalVariance = jobVariances.reduce((sum, j) => sum + j.variance, 0);
  const avgVariance = jobVariances.length > 0 ? (totalVariance / jobVariances.length).toFixed(1) : 0;
  const overageJobs = jobVariances.filter(j => j.variance > 0).length;
  const underageJobs = jobVariances.filter(j => j.variance < 0).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-slate-800">Turf Overage Report</h1>
          <p className="text-slate-500 mt-1">Analyze turf usage vs. requested amounts</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCSV}>
            <Download className="h-4 w-4 mr-2" />
            CSV
          </Button>
          <Button className="bg-red-600 hover:bg-red-700" onClick={generatePDF}>
            <Download className="h-4 w-4 mr-2" />
            PDF
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="rounded-2xl border-slate-100 shadow-sm">
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-[200px]">
              <Label>Date Range</Label>
              <Select value={dateRange} onValueChange={setDateRange}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Time</SelectItem>
                  <SelectItem value="week">This Week</SelectItem>
                  <SelectItem value="month">This Month</SelectItem>
                  <SelectItem value="custom">Custom Range</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {dateRange === 'custom' && (
              <>
                <div className="flex-1 min-w-[150px]">
                  <Label>Start Date</Label>
                  <Input
                    type="date"
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div className="flex-1 min-w-[150px]">
                  <Label>End Date</Label>
                  <Input
                    type="date"
                    value={endDate}
                    onChange={e => setEndDate(e.target.value)}
                    className="mt-1"
                  />
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="rounded-2xl border-slate-100 shadow-sm">
          <CardContent className="pt-6">
            <p className="text-sm text-slate-500 mb-1">Total Jobs</p>
            <p className="text-2xl font-bold text-slate-800">{jobVariances.length}</p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-slate-100 shadow-sm">
          <CardContent className="pt-6">
            <p className="text-sm text-slate-500 mb-1">Avg Variance</p>
            <p className={`text-2xl font-bold ${avgVariance > 0 ? 'text-red-600' : avgVariance < 0 ? 'text-green-600' : 'text-slate-600'}`}>
              {avgVariance > 0 ? '+' : ''}{avgVariance} ft
            </p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-slate-100 shadow-sm">
          <CardContent className="pt-6 flex items-center gap-3">
            <TrendingUp className="h-8 w-8 text-red-500" />
            <div>
              <p className="text-sm text-slate-500">Overages</p>
              <p className="text-2xl font-bold text-red-600">{overageJobs}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-slate-100 shadow-sm">
          <CardContent className="pt-6 flex items-center gap-3">
            <TrendingDown className="h-8 w-8 text-green-500" />
            <div>
              <p className="text-sm text-slate-500">Underages</p>
              <p className="text-2xl font-bold text-green-600">{underageJobs}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Weekly Chart */}
      {weeklyChartData.length > 0 && (
        <Card className="rounded-2xl border-slate-100 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Weekly Average Variance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weeklyChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="week" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} label={{ value: 'Variance (ft)', angle: -90, position: 'insideLeft' }} />
                  <Tooltip 
                    formatter={(value) => `${value > 0 ? '+' : ''}${value} ft`}
                    labelFormatter={(label) => `Week of ${label}`}
                  />
                  <ReferenceLine y={0} stroke="#64748b" strokeWidth={2} />
                  <Bar dataKey="avgVariance" radius={[4, 4, 0, 0]}>
                    {weeklyChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.avgVariance > 0 ? '#ef4444' : '#10b981'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Jobs Table */}
      <Card className="rounded-2xl border-slate-100 shadow-sm overflow-hidden">
        <CardHeader>
          <CardTitle className="text-lg">Job Details</CardTitle>
        </CardHeader>
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
                  <TableHead className="font-semibold">Job #</TableHead>
                  <TableHead className="font-semibold">Customer</TableHead>
                  <TableHead className="font-semibold">Date</TableHead>
                  <TableHead className="font-semibold">Requested</TableHead>
                  <TableHead className="font-semibold">Used</TableHead>
                  <TableHead className="font-semibold">Variance</TableHead>
                  <TableHead className="font-semibold">Variance %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobVariances.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12 text-slate-500">
                      No completed jobs in selected date range
                    </TableCell>
                  </TableRow>
                ) : (
                  jobVariances.map((job) => (
                    <TableRow key={job.id} className="hover:bg-slate-50 transition-colors">
                      <TableCell className="font-medium">{job.job_number}</TableCell>
                      <TableCell>{job.customer_name || '-'}</TableCell>
                      <TableCell className="text-slate-600">
                        {format(new Date(job.date), 'MMM d, yyyy')}
                      </TableCell>
                      <TableCell>{job.requested} ft</TableCell>
                      <TableCell>{job.used} ft</TableCell>
                      <TableCell>
                        <span className={`font-medium ${job.variance > 0 ? 'text-red-600' : job.variance < 0 ? 'text-green-600' : 'text-slate-600'}`}>
                          {job.variance > 0 ? '+' : ''}{job.variance} ft
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className={`font-medium ${job.variance > 0 ? 'text-red-600' : job.variance < 0 ? 'text-green-600' : 'text-slate-600'}`}>
                          {job.variancePercent > 0 ? '+' : ''}{job.variancePercent}%
                        </span>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}