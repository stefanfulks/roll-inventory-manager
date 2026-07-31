import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { createPageUrl } from '@/utils';
import { Search, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useNavigate } from 'react-router-dom';

export default function GlobalSearch() {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState({ rolls: [], jobs: [] });
  const [isSearching, setIsSearching] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const navigate = useNavigate();

  const { data: products = [] } = useQuery({
    queryKey: ['products', 'all'],
    queryFn: () => base44.entities.Product.list('-created_date', 500),
  });

  const searchLower = search.trim().toLowerCase();

  const productMatches = searchLower.length < 2
    ? []
    : products
        .filter(p => p.product_name?.toLowerCase().includes(searchLower))
        .slice(0, 3);

  useEffect(() => {
    if (search.length < 2) {
      setResults({ rolls: [], jobs: [] });
      setIsExpanded(false);
      return;
    }

    // Clearing the timeout doesn't cancel a request that already went out, so an
    // earlier, slower response could paint over a newer one. This flag drops it.
    let cancelled = false;

    setIsExpanded(true);
    setIsSearching(true);

    const debounce = setTimeout(async () => {
      try {
        const term = search.toLowerCase();

        // Scanning the tag of a roll received months ago has to find it, so the
        // window covers the table rather than just the newest page.
        const [rolls, jobs] = await Promise.all([
          base44.entities.Roll.list('-created_date', 5000),
          base44.entities.Job.list('-created_date', 2000),
        ]);

        if (cancelled) return;

        const filteredRolls = rolls.filter(r =>
          r.tt_sku_tag_number?.toLowerCase().includes(term) ||
          r.roll_tag?.toLowerCase().includes(term) ||
          r.manufacturer_roll_number?.toLowerCase().includes(term)
        ).slice(0, 3);

        const filteredJobs = jobs.filter(j =>
          j.job_number?.toLowerCase().includes(term) ||
          j.customer_name?.toLowerCase().includes(term)
        ).slice(0, 3);

        setResults({ rolls: filteredRolls, jobs: filteredJobs });
      } catch (error) {
        if (!cancelled) console.error('Search error:', error);
      }
      if (!cancelled) setIsSearching(false);
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(debounce);
    };
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