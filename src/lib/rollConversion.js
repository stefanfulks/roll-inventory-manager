/**
 * rollConversion.js — Convert a mis-logged Parent roll into a Child of another
 * roll, preserving length, status, location, allocations, and audit history.
 *
 * What it does:
 *   1. Marks the roll as roll_type='Child' and links it to the chosen parent.
 *   2. Re-parents any children of the converted roll to the new parent so
 *      lineage stays consistent (no orphans).
 *   3. Writes an Adjustment transaction recording the conversion.
 *
 * What it does NOT do:
 *   - Touch length, width, dye lot, status, location, or allocations. Those
 *     stay exactly as they were — only the hierarchy changes.
 *   - Delete or create any roll records.
 *
 * Idempotent: if the roll is already a child of the target parent, it no-ops
 * (but still re-parents any stray children and writes the audit line).
 */

import { base44 } from '@/api/base44Client';

/**
 * Walk up the parent chain from `startRollId` looking for `ancestorId`.
 * Returns true if `ancestorId` is found in the chain (i.e. would form a cycle).
 */
async function isAncestorOf(startRollId, ancestorId) {
  let cursorId = startRollId;
  const seen = new Set();
  while (cursorId && !seen.has(cursorId)) {
    seen.add(cursorId);
    if (cursorId === ancestorId) return true;
    const [cur] = await base44.entities.Roll.filter({ id: cursorId });
    if (!cur) return false;
    cursorId = cur.parent_roll_id;
  }
  return false;
}

/**
 * Convert a roll from Parent to Child of `newParentId`.
 *
 * @param {object} args
 * @param {string} args.rollId          The mis-logged roll to convert.
 * @param {string} args.newParentId    The roll that should be its parent.
 * @param {string} [args.performedBy]   User name/email for the audit trail.
 * @param {string} [args.notes]         Optional extra notes.
 * @returns {Promise<{convertedRollId, newParentId, reParentedChildren}>}
 */
export async function convertParentToChild({ rollId, newParentId, performedBy, notes }) {
  if (!rollId || !newParentId) {
    throw new Error('Both a roll and a new parent are required.');
  }
  if (rollId === newParentId) {
    throw new Error("A roll can't be its own parent.");
  }

  const [rollArr, parentArr] = await Promise.all([
    base44.entities.Roll.filter({ id: rollId }),
    base44.entities.Roll.filter({ id: newParentId }),
  ]);
  const roll = rollArr && rollArr[0];
  const newParent = parentArr && parentArr[0];
  if (!roll) throw new Error('Roll not found. Refresh the page and try again.');
  if (!newParent) throw new Error('New parent roll not found. Refresh and try again.');

  // Cycle check: the new parent must not be a descendant of the roll being
  // converted — otherwise we'd create a loop in the parent chain.
  const newParentIsDescendant = await isAncestorOf(newParentId, rollId);
  if (newParentIsDescendant) {
    throw new Error('Cannot convert: the chosen parent is a descendant of this roll (would create a cycle).');
  }

  // Find children of the roll being converted — they get re-parented to the
  // new parent so no roll is left pointing at a child-typed parent.
  const children = await base44.entities.Roll.filter({ parent_roll_id: rollId });

  const parentTag = newParent.tt_sku_tag_number || newParent.roll_tag || '';

  // 1. Convert the roll to a child.
  await base44.entities.Roll.update(rollId, {
    roll_type: 'Child',
    parent_roll_id: newParentId,
    parent_tt_sku_tag_number: parentTag,
  });

  // 2. Re-parent its children to the new parent.
  if (children.length > 0) {
    await base44.entities.Roll.bulkUpdate(
      children.map(c => ({
        id: c.id,
        parent_roll_id: newParentId,
        parent_tt_sku_tag_number: parentTag,
      })),
    );
  }

  // 3. If the new parent was itself a child with no parent, promote it so the
  //    hierarchy has a proper root. Don't touch it if it already has a parent.
  if (newParent.roll_type !== 'Parent' && !newParent.parent_roll_id) {
    await base44.entities.Roll.update(newParentId, { roll_type: 'Parent' });
  }

  // 4. Audit transaction. 'Adjustment' is in the Transaction enum; the notes
  //    carry the full context of the conversion.
  await base44.entities.Transaction.create({
    transaction_type: 'Adjustment',
    roll_id: rollId,
    tt_sku_tag_number: roll.tt_sku_tag_number || roll.roll_tag,
    parent_roll_id: newParentId,
    product_name: roll.product_name,
    dye_lot: roll.dye_lot,
    width_ft: roll.width_ft,
    performed_by: performedBy || 'system',
    notes:
      `Converted parent → child: ${roll.tt_sku_tag_number || roll.roll_tag} ` +
      `is now a child of ${parentTag}. ` +
      `${children.length} descendant(s) re-parented to ${parentTag}. ` +
      (notes || '').trim(),
  });

  return {
    convertedRollId: rollId,
    newParentId,
    reParentedChildren: children.length,
  };
}