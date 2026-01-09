import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { Search, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { useNavigate } from 'react-router-dom';

export default function GlobalSearch({ open, onOpenChange }) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState({ rolls: [], jobs: [], products: [] });
  const [isSearching, setIsSearching] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const searchData = async () => {
      if (search.length < 2) {
        setResults({ rolls: [], jobs: [], products: [] });
        return;
      }

      setIsSearching(true);
      try {
        const searchLower = search.toLowerCase();

        const [rolls, jobs, products] = await Promise.all([
          base44.entities.Roll.list('-created_date', 50),
          base44.entities.Job.list('-created_date', 50),
          base44.entities.Product.list()
        ]);

        const filteredRolls = rolls.filter(r => 
          r.tt_sku_tag_number?.toLowerCase().includes(searchLower) ||
          r.roll_tag?.toLowerCase().includes(searchLower) ||
          r.manufacturer_roll_number?.toLowerCase().includes(searchLower)
        ).slice(0, 5);

        const filteredJobs = jobs.filter(j => 
          j.job_number?.toLowerCase().includes(searchLower) ||
          j.customer_name?.toLowerCase().includes(searchLower)
        ).slice(0, 5);

        const filteredProducts = products.filter(p => 
          p.product_name?.toLowerCase().includes(searchLower)
        ).slice(0, 5);

        setResults({ rolls: filteredRolls, jobs: filteredJobs, products: filteredProducts });
      } catch (error) {
        console.error('Search error:', error);
      }
      setIsSearching(false);
    };

    const debounce = setTimeout(searchData, 300);
    return () => clearTimeout(debounce);
  }, [search]);

  const handleNavigate = (url) => {
    navigate(url);
    onOpenChange(false);
    setSearch('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl dark:bg-[#2d2d2d] dark:border-slate-700/50 p-0">
        <div className="p-4 border-b dark:border-slate-700/50">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
            <Input
              placeholder="Search rolls, jobs, products, customers..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-10 h-12 text-lg dark:bg-slate-800 dark:border-slate-700 dark:text-white"
              autoFocus
            />
            {isSearching && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 animate-spin text-slate-400" />
            )}
          </div>
        </div>

        <div className="max-h-96 overflow-y-auto p-4 space-y-4">
          {search.length < 2 ? (
            <p className="text-center text-slate-500 dark:text-slate-400 py-8">
              Type at least 2 characters to search
            </p>
          ) : results.rolls.length === 0 && results.jobs.length === 0 && results.products.length === 0 && !isSearching ? (
            <p className="text-center text-slate-500 dark:text-slate-400 py-8">
              No results found
            </p>
          ) : (
            <>
              {/* Rolls */}
              {results.rolls.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-2">Rolls</h3>
                  <div className="space-y-1">
                    {results.rolls.map(roll => (
                      <button
                        key={roll.id}
                        onClick={() => handleNavigate(createPageUrl(`RollDetail?id=${roll.id}`))}
                        className="w-full text-left p-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                      >
                        <p className="font-mono font-medium text-sm dark:text-white">
                          {roll.tt_sku_tag_number || roll.roll_tag}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {roll.product_name} • {roll.dye_lot} • {roll.width_ft}ft × {roll.current_length_ft}ft
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Jobs */}
              {results.jobs.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-2">Jobs</h3>
                  <div className="space-y-1">
                    {results.jobs.map(job => (
                      <button
                        key={job.id}
                        onClick={() => handleNavigate(createPageUrl(`JobDetail?id=${job.id}`))}
                        className="w-full text-left p-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                      >
                        <p className="font-medium text-sm dark:text-white">Job #{job.job_number}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {job.customer_name || 'No customer'} • {job.status}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Products */}
              {results.products.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-2">Products</h3>
                  <div className="space-y-1">
                    {results.products.map(product => (
                      <button
                        key={product.id}
                        onClick={() => handleNavigate(createPageUrl('Inventory'))}
                        className="w-full text-left p-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                      >
                        <p className="font-medium text-sm dark:text-white">{product.product_name}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {product.manufacturer_name}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}