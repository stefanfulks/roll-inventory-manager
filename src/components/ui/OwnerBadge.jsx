import React from 'react';
import { cn } from "@/lib/utils";

export default function OwnerBadge({ owner, size = "default" }) {
  const isTexasTurf = owner === 'TexasTurf';
  
  return (
    <span className={cn(
      "inline-flex items-center font-medium rounded-full",
      size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm",
      isTexasTurf 
        ? "bg-emerald-100 text-emerald-700" 
        : "bg-blue-100 text-blue-700"
    )}>
      {owner}
    </span>
  );
}