import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { Search, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useNavigate } from 'react-router-dom';

export default function GlobalSearch() {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState({ rolls: [], jobs: [], products: [] });
  const [isSearching, setIsSearching] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const searchData = async () => {
      if (search.length < 2) {
        setResults({ rolls: [], jobs: [], products: [] });
        setIsExpanded(false);
        return;
      }

      setIsExpanded(true);
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
        ).slice(0, 3);

        const filteredJobs = jobs.filter(j => 
          j.job_number?.toLowerCase().includes(searchLower) ||
          j.customer_name?.toLowerCase().includes(searchLower)
        ).slice(0, 3);

        const filteredProducts = products.filter(p => 
          p.product_name?.toLowerCase().includes(searchLower)
        ).slice(0, 3);

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
    setSearch('');
    setIsExpanded(false);
  };

  const hasResults = results.rolls.length > 0 || results.jobs.length > 0 || results.products.length > 0;

  return (
    <div className="mb-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500" />
        <Input
          placeholder="Search everything..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9 dark:bg-slate-800 dark:border-slate-700 dark:text-white dark:placeholder:text-slate-500"
        />
        {isSearching && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-slate-400" />
        )}
      </div>

      {isExpanded && (
        <div className="mt-2 max-h-96 overflow-y-auto bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-lg">
          {!hasResults && !isSearching ? (
            <p className="text-center text-slate-500 dark:text-slate-400 py-4 text-xs">
              No results found
            </p>
          ) : (
            <div className="p-2 space-y-3">
              {/* Rolls */}
              {results.rolls.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-1 px-2">Rolls</h3>
                  <div className="space-y-0.5">
                    {results.rolls.map(roll => (
                      <button
                        key={roll.id}
                        onClick={() => handleNavigate(createPageUrl(`RollDetail?id=${roll.id}`))}
                        className="w-full text-left p-2 rounded-md hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                      >
                        <p className="font-mono font-medium text-xs dark:text-white">
                          {roll.tt_sku_tag_number || roll.roll_tag}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          {roll.product_name} • {roll.dye_lot}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Jobs */}
              {results.jobs.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-1 px-2">Jobs</h3>
                  <div className="space-y-0.5">
                    {results.jobs.map(job => (
                      <button
                        key={job.id}
                        onClick={() => handleNavigate(createPageUrl(`JobDetail?id=${job.id}`))}
                        className="w-full text-left p-2 rounded-md hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                      >
                        <p className="font-medium text-xs dark:text-white">Job #{job.job_number}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          {job.customer_name || 'No customer'}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Products */}
              {results.products.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-1 px-2">Products</h3>
                  <div className="space-y-0.5">
                    {results.products.map(product => (
                      <button
                        key={product.id}
                        onClick={() => handleNavigate(createPageUrl('Inventory'))}
                        className="w-full text-left p-2 rounded-md hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                      >
                        <p className="font-medium text-xs dark:text-white">{product.product_name}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          {product.manufacturer_name}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}