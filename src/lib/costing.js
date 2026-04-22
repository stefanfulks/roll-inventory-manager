/**
 * costing.js — Helpers for roll/inventory value and aging buckets.
 *
 * Cost is tracked as cost_per_sqft on each Product.
 * A roll's value = width_ft * current_length_ft * product.cost_per_sqft.
 *
 * Aging buckets: 30, 60, 90, 180, 180+ days since date_received.
 */

import { differenceInDays } from 'date-fns';

// Ordered oldest-to-newest as labels; bucket membership is "at least N days".
export const AGING_BUCKETS = [
  { id: 'over180', label: '180+ days', minDays: 180, color: 'bg-red-100 text-red-700 border-red-200' },
  { id: 'over90', label: '90–179 days', minDays: 90, maxDays: 179, color: 'bg-orange-100 text-orange-700 border-orange-200' },
  { id: 'over60', label: '60–89 days', minDays: 60, maxDays: 89, color: 'bg-amber-100 text-amber-700 border-amber-200' },
  { id: 'over30', label: '30–59 days', minDays: 30, maxDays: 59, color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  { id: 'under30', label: 'Under 30 days', minDays: 0, maxDays: 29, color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
];

// Default threshold for "needs to move" flag. Can be overridden by app setting.
export const DEFAULT_LONG_SITTING_DAYS = 90;

/**
 * Days since a roll was received. Uses date_received first, falls back to created_date.
 */
export function daysSinceReceived(roll, now = new Date()) {
  const start = roll?.date_received || roll?.created_date;
  if (!start) return null;
  const date = new Date(start);
  if (Number.isNaN(date.getTime())) return null;
  return differenceInDays(now, date);
}

/**
 * Return the aging bucket id for a roll, or null if no date.
 */
export function agingBucketFor(roll, now = new Date()) {
  const days = daysSinceReceived(roll, now);
  if (days == null) return null;
  if (days >= 180) return 'over180';
  if (days >= 90) return 'over90';
  if (days >= 60) return 'over60';
  if (days >= 30) return 'over30';
  return 'under30';
}

/**
 * Find cost_per_sqft for a roll. Matches by product_id first, falls back to product_name.
 */
export function costPerSqftForRoll(roll, products) {
  if (!roll || !products) return 0;
  const byId = roll.product_id
    ? products.find(p => p.id === roll.product_id)
    : null;
  const byName = !byId && roll.product_name
    ? products.find(p => p.product_name === roll.product_name)
    : null;
  const product = byId || byName;
  const cost = parseFloat(product?.cost_per_sqft);
  return Number.isFinite(cost) ? cost : 0;
}

/**
 * Roll value in dollars. Returns 0 if no cost data available.
 */
export function rollValue(roll, products) {
  const cost = costPerSqftForRoll(roll, products);
  const width = parseFloat(roll?.width_ft) || 0;
  const length = parseFloat(roll?.current_length_ft) || 0;
  return cost * width * length;
}

/**
 * Total dollar value of a set of rolls.
 */
export function inventoryValue(rolls, products) {
  if (!Array.isArray(rolls) || !Array.isArray(products)) return 0;
  return rolls.reduce((sum, r) => sum + rollValue(r, products), 0);
}

/**
 * Split rolls into aging buckets. Returns:
 * { over180: [...rolls], over90: [...], over60: [...], over30: [...], under30: [...] }
 */
export function groupByAging(rolls, now = new Date()) {
  const buckets = { over180: [], over90: [], over60: [], over30: [], under30: [] };
  for (const r of rolls || []) {
    const b = agingBucketFor(r, now);
    if (b && buckets[b]) buckets[b].push(r);
  }
  return buckets;
}

/**
 * Rolls that have been sitting longer than a threshold.
 * Default threshold is 90 days — matches the "long_sitting_days" app setting.
 */
export function longSittingRolls(rolls, thresholdDays = DEFAULT_LONG_SITTING_DAYS, now = new Date()) {
  if (!Array.isArray(rolls)) return [];
  return rolls
    .map(r => ({ roll: r, days: daysSinceReceived(r, now) }))
    .filter(x => x.days != null && x.days >= thresholdDays)
    .sort((a, b) => b.days - a.days)
    .map(x => ({ ...x.roll, __daysSitting: x.days }));
}

/**
 * Format a dollar amount for display.
 */
export function formatCurrency(value) {
  const n = parseFloat(value) || 0;
  if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`;
  if (n >= 10000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
