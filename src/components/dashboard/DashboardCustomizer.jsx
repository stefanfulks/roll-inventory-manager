import React from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

const chartOptions = [
  { id: 'status_distribution', label: 'Inventory by Status' },
  { id: 'shipped_total', label: 'Total Shipped Out' },
  { id: 'top_turf', label: 'Top Turf by Jobs' },
  { id: 'length_distribution', label: 'Remaining Length Buckets' },
  { id: 'roll_type', label: 'Parent vs Child Rolls' },
  { id: 'full_vs_partial_count', label: 'Full vs Partial Rolls Count' },
  { id: 'full_vs_partial_sqft', label: 'Full vs Partial Sq Ft' }
];

export default function DashboardCustomizer({ open, onOpenChange, visibleCharts, onSave }) {
  const [selectedCharts, setSelectedCharts] = React.useState(visibleCharts);

  const handleToggle = (chartId) => {
    setSelectedCharts(prev => 
      prev.includes(chartId)
        ? prev.filter(id => id !== chartId)
        : [...prev, chartId]
    );
  };

  const handleSave = () => {
    onSave(selectedCharts);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Customize Dashboard</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-4">
          <p className="text-sm text-slate-600">Select which charts to display on your dashboard:</p>
          {chartOptions.map(chart => (
            <div key={chart.id} className="flex items-center space-x-2">
              <Checkbox
                id={chart.id}
                checked={selectedCharts.includes(chart.id)}
                onCheckedChange={() => handleToggle(chart.id)}
              />
              <label
                htmlFor={chart.id}
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
              >
                {chart.label}
              </label>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} className="bg-emerald-600 hover:bg-emerald-700">
            Save Preferences
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}