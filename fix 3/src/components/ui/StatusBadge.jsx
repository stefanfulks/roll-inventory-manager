import React from 'react';
import { cn } from "@/lib/utils";
import { STATUS_LABELS } from '@/lib/rollStatus';

const statusStyles = {
  // Roll statuses (canonical, per SOP)
  Available: "bg-emerald-100 text-emerald-700",
  Planned: "bg-purple-100 text-purple-700",
  Allocated: "bg-yellow-100 text-yellow-800",
  Staged: "bg-blue-100 text-blue-700",
  Dispatched: "bg-blue-500 text-white",    // label shown as "Fulfilled"
  Consumed: "bg-gray-800 text-white",
  Scrapped: "bg-red-100 text-red-700",
  ReturnedHold: "bg-orange-100 text-orange-700",
  AwaitingLocation: "bg-red-100 text-red-700",
  PendingAvailable: "bg-amber-100 text-amber-800 border border-amber-300",
  PendingScrap: "bg-rose-100 text-rose-800 border border-rose-300",

  // Job statuses
  Draft: "bg-slate-100 text-slate-600",
  Ready: "bg-emerald-100 text-emerald-700",
  Fulfilling: "bg-amber-100 text-amber-700",
  AwaitingReturnInventory: "bg-amber-100 text-amber-700",
  Completed: "bg-blue-100 text-blue-700",
  Archived: "bg-slate-200 text-slate-600",

  // Allocation-only statuses
  Requested: "bg-slate-100 text-slate-600",
  Cancelled: "bg-red-100 text-red-600",

  // Condition
  New: "bg-emerald-100 text-emerald-700",
  Good: "bg-blue-100 text-blue-700",
  Used: "bg-amber-100 text-amber-700",
  Damaged: "bg-orange-100 text-orange-700",
  Scrap: "bg-red-100 text-red-700",

  // Roll types
  Parent: "bg-slate-100 text-slate-700",
  Child: "bg-violet-100 text-violet-700",

  // Legacy/misc
  Roll: "bg-emerald-100 text-emerald-700",
  Item: "bg-blue-100 text-blue-700",
};

export default function StatusBadge({ status, size = "default" }) {
  const label = STATUS_LABELS[status] || status || '—';

  return (
    <span className={cn(
      "inline-flex items-center font-medium rounded-full",
      size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm",
      statusStyles[status] || "bg-slate-100 text-slate-600"
    )}>
      {label}
    </span>
  );
}
