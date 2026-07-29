import { QueryClient, MutationCache, QueryCache } from '@tanstack/react-query';
import { toast } from 'sonner';

/**
 * Turn whatever the Base44 SDK threw into something a warehouse user can read.
 * The SDK surfaces validation problems in a few different shapes depending on
 * whether the failure came from the network, the entity schema, or a function.
 */
export function describeError(error) {
  if (!error) return 'Unknown error';
  if (typeof error === 'string') return error;

  const fromBody =
    error?.response?.data?.detail ||
    error?.response?.data?.message ||
    error?.response?.data?.error ||
    error?.body?.detail ||
    error?.body?.message ||
    error?.detail;

  if (typeof fromBody === 'string' && fromBody.trim()) return fromBody;

  // Base44 sometimes returns an array of per-field validation errors.
  if (Array.isArray(fromBody)) {
    const parts = fromBody
      .map(e => {
        const field = Array.isArray(e?.loc) ? e.loc[e.loc.length - 1] : e?.field;
        const msg = e?.msg || e?.message;
        return field ? `${field}: ${msg}` : msg;
      })
      .filter(Boolean);
    if (parts.length) return parts.join('; ');
  }

  if (error?.message) return error.message;

  try {
    return JSON.stringify(error);
  } catch {
    return 'Unknown error';
  }
}

/**
 * Global safety net: a mutation that rejects must never look like a dead button.
 * Pages that define their own onError keep full control of the wording; this only
 * covers the ones that don't, so a rejected write always says something.
 */
const mutationCache = new MutationCache({
  onError: (error, _variables, _context, mutation) => {
    console.error('[mutation failed]', mutation?.options?.mutationKey || '', error);
    if (mutation?.options?.onError) return; // the caller is already reporting it
    toast.error(`Couldn't save that: ${describeError(error)}`);
  },
});

const queryCache = new QueryCache({
  onError: (error, query) => {
    // Queries failing means empty tables rather than a broken button, so log
    // loudly but don't spam a toast per query on a flaky connection.
    console.error('[query failed]', query?.queryKey, error);
  },
});

export const queryClientInstance = new QueryClient({
  mutationCache,
  queryCache,
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});
