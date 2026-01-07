import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Settings as SettingsIcon, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';

export default function Settings() {
  const queryClient = useQueryClient();

  const { data: settings = [], isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => base44.entities.Settings.list(),
  });

  const getSetting = (key) => {
    const setting = settings.find(s => s.setting_key === key);
    return setting?.setting_value || '';
  };

  const [lowInventoryThreshold, setLowInventoryThreshold] = useState(getSetting('low_inventory_threshold') || '5');
  const [longSittingDays, setLongSittingDays] = useState(getSetting('long_sitting_days') || '90');

  React.useEffect(() => {
    if (settings.length > 0) {
      setLowInventoryThreshold(getSetting('low_inventory_threshold') || '5');
      setLongSittingDays(getSetting('long_sitting_days') || '90');
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: async (settingsData) => {
      const promises = [];
      
      for (const setting of settingsData) {
        const existing = settings.find(s => s.setting_key === setting.setting_key);
        if (existing) {
          promises.push(base44.entities.Settings.update(existing.id, setting));
        } else {
          promises.push(base44.entities.Settings.create(setting));
        }
      }
      
      await Promise.all(promises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      toast.success('Settings saved successfully');
    }
  });

  const handleSave = () => {
    const settingsData = [
      {
        setting_key: 'low_inventory_threshold',
        setting_value: lowInventoryThreshold,
        description: 'Alert when roll count for a product drops below this number'
      },
      {
        setting_key: 'long_sitting_days',
        setting_value: longSittingDays,
        description: 'Flag products that have been sitting for more than this many days'
      }
    ];

    saveMutation.mutate(settingsData);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold text-slate-800">Settings</h1>
        <p className="text-slate-500 mt-1">Configure inventory alerts and thresholds</p>
      </div>

      <Card className="p-6 space-y-6">
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-800 mb-4">Inventory Alerts</h3>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="low-inventory">
                  Low Inventory Threshold (rolls)
                </Label>
                <Input
                  id="low-inventory"
                  type="number"
                  min="1"
                  value={lowInventoryThreshold}
                  onChange={(e) => setLowInventoryThreshold(e.target.value)}
                  className="max-w-xs"
                />
                <p className="text-sm text-slate-500">
                  Alert when the number of available rolls for a product drops below this number
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="long-sitting">
                  Long-Sitting Products (days)
                </Label>
                <Input
                  id="long-sitting"
                  type="number"
                  min="1"
                  value={longSittingDays}
                  onChange={(e) => setLongSittingDays(e.target.value)}
                  className="max-w-xs"
                />
                <p className="text-sm text-slate-500">
                  Flag products that haven't been used or moved in more than this many days
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="pt-4 border-t">
          <Button
            onClick={handleSave}
            disabled={saveMutation.isPending}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            <Save className="h-4 w-4 mr-2" />
            {saveMutation.isPending ? 'Saving...' : 'Save Settings'}
          </Button>
        </div>
      </Card>
    </div>
  );
}