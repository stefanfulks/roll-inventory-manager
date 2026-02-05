import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar, Package } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function ForecastChart({ rolls, jobs }) {
  // Get rolls in Planned status
  const plannedRolls = rolls.filter(r => r.status === 'Planned' && r.allocated_job_id);

  // Group by job and get scheduled dates
  const forecastData = plannedRolls.map(roll => {
    const job = jobs.find(j => j.id === roll.allocated_job_id);
    return {
      roll,
      job,
      scheduledDate: job?.scheduled_date,
      sqft: roll.current_length_ft * roll.width_ft
    };
  }).filter(item => item.job && item.scheduledDate);

  // Sort by scheduled date
  forecastData.sort((a, b) => new Date(a.scheduledDate) - new Date(b.scheduledDate));

  // Group by date
  const groupedByDate = forecastData.reduce((acc, item) => {
    const dateKey = item.scheduledDate;
    if (!acc[dateKey]) {
      acc[dateKey] = [];
    }
    acc[dateKey].push(item);
    return acc;
  }, {});

  const totalPlannedSqFt = forecastData.reduce((sum, item) => sum + item.sqft, 0);

  if (forecastData.length === 0) {
    return (
      <Card className="rounded-2xl border-slate-100 shadow-sm dark:bg-[#2d2d2d] dark:border-slate-700/50">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2 dark:text-white">
            <Calendar className="h-5 w-5 text-purple-600" />
            Turf Forecast (Planned)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-slate-500 text-sm dark:text-slate-400">No planned rolls scheduled yet</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-2xl border-slate-100 shadow-sm dark:bg-[#2d2d2d] dark:border-slate-700/50">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2 dark:text-white">
          <Calendar className="h-5 w-5 text-purple-600" />
          Turf Forecast (Planned)
        </CardTitle>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          {forecastData.length} roll{forecastData.length !== 1 ? 's' : ''} • {totalPlannedSqFt.toLocaleString()} sq ft total
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {Object.entries(groupedByDate).map(([dateKey, items]) => (
          <div key={dateKey} className="border-l-4 border-purple-500 pl-4 py-2">
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="h-4 w-4 text-purple-600" />
              <span className="font-semibold text-slate-800 dark:text-white">
                {format(parseISO(dateKey), 'MMMM d, yyyy')}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                ({items.length} roll{items.length !== 1 ? 's' : ''})
              </span>
            </div>
            <div className="space-y-2">
              {items.map(({ roll, job, sqft }) => (
                <div key={roll.id} className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <Link 
                        to={createPageUrl(`RollDetail?id=${roll.id}`)}
                        className="font-mono text-sm font-semibold text-purple-700 dark:text-purple-400 hover:underline"
                      >
                        {roll.tt_sku_tag_number || roll.roll_tag}
                      </Link>
                      <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                        {roll.product_name} • {roll.width_ft}ft × {roll.current_length_ft}ft
                      </p>
                      <Link
                        to={createPageUrl(`JobDetail?id=${job.id}`)}
                        className="text-xs text-slate-500 dark:text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 mt-1 inline-block"
                      >
                        Job: {job.job_number} - {job.customer_name}
                      </Link>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-slate-800 dark:text-white">
                        {sqft.toLocaleString()} sq ft
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Dye Lot: {roll.dye_lot}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}