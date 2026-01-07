import React from 'react';
import { Button } from '@/components/ui/button';
import { cn } from "@/lib/utils";

export default function OwnerFilter({ value, onChange }) {
  const options = [
    { label: 'All', value: 'all' },
    { label: 'TexasTurf', value: 'TexasTurf' },
    { label: 'TurfCasa', value: 'TurfCasa' },
  ];

  return (
    <div className="inline-flex items-center bg-slate-100 rounded-lg p-1">
      {options.map((option) => (
        <Button
          key={option.value}
          variant="ghost"
          size="sm"
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-md px-4 h-8 text-sm font-medium transition-all",
            value === option.value
              ? "bg-white text-slate-800 shadow-sm"
              : "text-slate-600 hover:text-slate-800"
          )}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}