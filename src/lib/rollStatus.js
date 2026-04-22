/**
 * rollStatus.js — Single source of truth for Roll & Allocation statuses.
 *
 * CORE RULE: A roll's status is derived from its active allocation's status.
 * If a roll has an allocation, its status mirrors the allocation's status.
 * If a roll has no allocation, its status is Available (or one of the terminal
 * non-job statuses: Consumed, Scrapped, AwaitingLocation, ReturnedHold).
 *
 * Use the exported helper functions to create/update/release allocations so
 * roll statuses stay in sync.
 */

import { base44 } from '@/api/base44Client';

// ---------- Canonical statuses ----------

// Roll statuses — these are the ONLY valid values for roll.status
export const ROLL_STATUS = Object.freeze({
  AVAILABLE: 'Available',
  PLANNED: 'Planned',        // Office-phase forecast; set by Office per SOP
  ALLOCATED: 'Allocated',       // firm commitment to a job
  STAGED: 'Staged',             // physically staged for dispatch
  DISPATCHED: 'Dispatched',     // shipped to job site
  CONSUMED: 'Consumed',         // fully used up
  RETURNED_HOLD: 'ReturnedHold',// returned damaged, legacy — prefer PendingScrap
  AWAITING_LOCATION: 'AwaitingLocation', // received but not yet shelved
  SCRAPPED: 'Scrapped',         // written off
  PENDING_AVAILABLE: 'PendingAvailable', // returned, pending review → will become Available
  PENDING_SCRAP: 'PendingScrap',         // returned, pending review → will become Scrapped
});

// Allocation statuses — lifecycle states of an allocation record
export const ALLOCATION_STATUS = Object.freeze({
  PLANNED: 'Planned',
  ALLOCATED: 'Allocated',
  STAGED: 'Staged',
  DISPATCHED: 'Dispatched',
  CANCELLED: 'Cancelled',       // allocation cancelled → roll returns to Available
  COMPLETED: 'Completed',       // allocation finished (post-return) → roll already in new state
});

// Ordered lists used by UI dropdowns
export const ROLL_STATUS_OPTIONS = [
  ROLL_STATUS.AVAILABLE,
  ROLL_STATUS.PLANNED,
  ROLL_STATUS.ALLOCATED,
  ROLL_STATUS.STAGED,
  ROLL_STATUS.DISPATCHED,
  ROLL_STATUS.AWAITING_LOCATION,
  ROLL_STATUS.PENDING_AVAILABLE,
  ROLL_STATUS.PENDING_SCRAP,
  ROLL_STATUS.RETURNED_HOLD,
  ROLL_STATUS.CONSUMED,
  ROLL_STATUS.SCRAPPED,
];

export const ALLOCATION_STATUS_OPTIONS = [
  ALLOCATION_STATUS.PLANNED,
  ALLOCATION_STATUS.ALLOCATED,
  ALLOCATION_STATUS.STAGED,
  ALLOCATION_STATUS.DISPATCHED,
  ALLOCATION_STATUS.CANCELLED,
];

// Friendly labels for UI (keys remain canonical string values)
export const STATUS_LABELS = Object.freeze({
  [ROLL_STATUS.AVAILABLE]: 'Available',
  [ROLL_STATUS.PLANNED]: 'Planned',
  [ROLL_STATUS.ALLOCATED]: 'Allocated',
  [ROLL_STATUS.STAGED]: 'Staged',
  [ROLL_STATUS.DISPATCHED]: 'Fulfilled',
  [ROLL_STATUS.CONSUMED]: 'Consumed',
  [ROLL_STATUS.RETURNED_HOLD]: 'Returned Hold',
  [ROLL_STATUS.AWAITING_LOCATION]: 'Awaiting Location',
  [ROLL_STATUS.SCRAPPED]: 'Scrapped',
  [ROLL_STATUS.PENDING_AVAILABLE]: 'Pending (→ Available)',
  [ROLL_STATUS.PENDING_SCRAP]: 'Pending (→ Scrap)',
  [ALLOCATION_STATUS.CANCELLED]: 'Cancelled',
  [ALLOCATION_STATUS.COMPLETED]: 'Completed',
});

// Statuses that indicate a roll is currently committed to a job (for dashboard filters)
export const ROLL_ACTIVE_JOB_STATUSES = [
  ROLL_STATUS.PLANNED,
  ROLL_STATUS.ALLOCATED,
  ROLL_STATUS.STAGED,
  ROLL_STATUS.DISPATCHED,
];

// Statuses that represent a return awaiting review.
export const ROLL_PENDING_STATUSES = [
  ROLL_STATUS.PENDING_AVAILABLE,
  ROLL_STATUS.PENDING_SCRAP,
];

// Statuses a user can pick freely from the RollDetail status dropdown.
// (Allocation-bound statuses are excluded — those flow from allocations.)
export const MANUAL_ROLL_STATUS_OPTIONS = [
  ROLL_STATUS.AVAILABLE,
  ROLL_STATUS.AWAITING_LOCATION,
  ROLL_STATUS.PENDING_AVAILABLE,
  ROLL_STATUS.PENDING_SCRAP,
  ROLL_STATUS.RETURNED_HOLD,
  ROLL_STATUS.CONSUMED,
  ROLL_STATUS.SCRAPPED,
];

// ---------- Status mapping ----------

/**
 * Map an allocation status to the roll status it implies.
 * Cancelled → Available (roll is released).
 * Completed → null (don't overwrite whatever the roll became via returns flow).
 */
export function rollStatusFromAllocation(allocationStatus) {
  switch (allocationStatus) {
    case ALLOCATION_STATUS.PLANNED:  return ROLL_STATUS.PLANNED;
    case ALLOCATION_STATUS.ALLOCATED:  return ROLL_STATUS.ALLOCATED;
    case ALLOCATION_STATUS.STAGED:     return ROLL_STATUS.STAGED;
    case ALLOCATION_STATUS.DISPATCHED: return ROLL_STATUS.DISPATCHED;
    case ALLOCATION_STATUS.CANCELLED:  return ROLL_STATUS.AVAILABLE;
    case ALLOCATION_STATUS.COMPLETED:  return null;
    default:                           return null;
  }
}

/**
 * Given a list of all allocations, find the "active" one for a roll.
 * An active allocation is one NOT in a terminal state (Cancelled/Completed).
 * If multiple (shouldn't happen), return the most recent by created_date.
 */
export function findActiveAllocationForRoll(rollId, allAllocations) {
  const matches = allAllocations.filter(a =>
    (a.allocated_roll_ids || []).includes(rollId) &&
    a.status !== ALLOCATION_STATUS.CANCELLED &&
    a.status !== ALLOCATION_STATUS.COMPLETED
  );
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0];
  return matches.sort((a, b) =>
    new Date(b.created_date || 0) - new Date(a.created_date || 0)
  )[0];
}

// ---------- Sync helpers ----------
// All multi-step operations go through these so roll.status, allocation.status,
// and roll.allocated_job_id stay consistent.

/**
 * Release a roll: clear any job binding, set status back to Available.
 * Idempotent — safe to call even if roll is already Available.
 */
export async function releaseRoll(rollId) {
  if (!rollId) return;
  await base44.entities.Roll.update(rollId, {
    status: ROLL_STATUS.AVAILABLE,
    allocated_job_id: null,
  });
}

/**
 * Sync a single roll's status to match an allocation's status.
 * Used whenever an allocation is created or its status changes.
 */
export async function syncRollToAllocation(rollId, allocation) {
  if (!rollId || !allocation) return;
  const rollStatus = rollStatusFromAllocation(allocation.status);
  if (!rollStatus) return; // nothing to sync (e.g. Completed)
  await base44.entities.Roll.update(rollId, {
    status: rollStatus,
    allocated_job_id: allocation.job_id,
  });
}

/**
 * Create an allocation AND sync all referenced rolls' statuses.
 * This is what JobDetail should call when adding products to a job.
 */
export async function createAllocationWithSync(allocationData) {
  const allocation = await base44.entities.Allocation.create(allocationData);
  // Sync every roll this allocation references.
  if (allocation.item_type === 'roll') {
    const rollIds = allocation.allocated_roll_ids || [];
    await Promise.all(rollIds.map(rollId => syncRollToAllocation(rollId, allocation)));
  }
  return allocation;
}

/**
 * Update an allocation's status AND sync all referenced rolls.
 * If the new status is Cancelled, rolls are released back to Available.
 */
export async function updateAllocationStatusWithSync(allocationId, newStatus, allocation) {
  await base44.entities.Allocation.update(allocationId, { status: newStatus });

  if (allocation?.item_type === 'roll') {
    const rollIds = allocation.allocated_roll_ids || [];

    if (newStatus === ALLOCATION_STATUS.CANCELLED) {
      await Promise.all(rollIds.map(releaseRoll));
    } else {
      const updated = { ...allocation, status: newStatus };
      await Promise.all(rollIds.map(rollId => syncRollToAllocation(rollId, updated)));
    }
  }
}

/**
 * Delete an allocation AND release all rolls it was holding.
 * This fixes the "roll stays Allocated after I release it from the job" bug.
 */
export async function deleteAllocationWithSync(allocation) {
  if (!allocation) return;
  const rollIds = allocation.item_type === 'roll' ? (allocation.allocated_roll_ids || []) : [];
  await Promise.all(rollIds.map(releaseRoll));
  await base44.entities.Allocation.delete(allocation.id);
}

/**
 * Manually set a roll's status (from the RollDetail status editor).
 * Enforces guardrails: if the roll has an active allocation, the user
 * can't freely set it to Available — they must release the allocation first.
 *
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
export async function setRollStatusManually(roll, newStatus, allAllocations) {
  if (!roll) return { ok: false, error: 'No roll provided' };

  const activeAllocation = findActiveAllocationForRoll(roll.id, allAllocations);

  // Guardrail 1: if an active allocation exists, don't let a manual status change
  // desync it. Either the user releases via the job, or we cancel the allocation.
  if (activeAllocation && newStatus === ROLL_STATUS.AVAILABLE) {
    return {
      ok: false,
      error: 'This roll is allocated to a job. Release it from the job first, or cancel the allocation.',
    };
  }

  // Guardrail 2: if an active allocation exists and user is setting an allocation-bound
  // status (Planned, Allocated, Staged, Dispatched), route it through the allocation
  // instead of just stamping the roll.
  if (activeAllocation && ROLL_ACTIVE_JOB_STATUSES.includes(newStatus)) {
    // Map roll status back to allocation status (they share names).
    await updateAllocationStatusWithSync(activeAllocation.id, newStatus, activeAllocation);
    return { ok: true };
  }

  // Otherwise: straight update.
  await base44.entities.Roll.update(roll.id, {
    status: newStatus,
    // Clear job binding if moving to a non-job status.
    ...(!ROLL_ACTIVE_JOB_STATUSES.includes(newStatus) && { allocated_job_id: null }),
  });
  return { ok: true };
}
