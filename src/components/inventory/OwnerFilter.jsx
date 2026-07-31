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
    <>
      {options.map((option) => (
        <Button
          key={option.value}
          type="button"
          variant="ghost"
          size="sm"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-md px-4 h-8 text-sm font-medium transition-all",
            value === option.value
              ? "bg-white text-slate-800 shadow-sm dark:bg-slate-700 dark:text-white"
              : "text-slate-600 hover:text-slate-800 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-700/50"
          )}
        >
          {option.label}
        </Button>
      ))}
    </>
  );
}