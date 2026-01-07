import React, { useState, useRef, useEffect } from 'react';
import { Search, Scan, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from "@/lib/utils";

export default function RollSearch({ 
  onSearch, 
  onScan,
  placeholder = "Scan or search roll tag...",
  autoFocus = false,
  className
}) {
  const [value, setValue] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (value.trim()) {
      onSearch(value.trim());
    }
  };

  const handleKeyDown = (e) => {
    // Barcode scanners typically send Enter after scanning
    if (e.key === 'Enter' && value.trim()) {
      onSearch(value.trim());
    }
  };

  const handleClear = () => {
    setValue('');
    inputRef.current?.focus();
  };

  return (
    <form onSubmit={handleSubmit} className={cn("relative", className)}>
      <div className="relative flex items-center">
        <Search className="absolute left-4 h-5 w-5 text-slate-400 pointer-events-none" />
        <Input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="pl-12 pr-20 h-12 text-base rounded-xl border-slate-200 focus:border-emerald-500 focus:ring-emerald-500"
        />
        {value && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleClear}
            className="absolute right-12 h-8 w-8"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
        <Button
          type="submit"
          size="icon"
          className="absolute right-2 h-8 w-8 bg-emerald-600 hover:bg-emerald-700"
        >
          <Scan className="h-4 w-4" />
        </Button>
      </div>
    </form>
  );
}