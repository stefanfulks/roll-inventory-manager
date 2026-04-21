# TexasTurf Inventory — SOP Smoke Test Plan

Simulations to verify the app behaves correctly end-to-end per the Roll Selection Guidelines SOP. These are designed to be runnable by Claude Cowork (or a human tester) on the **live app** at `https://texasturf-inventory-manager.base44.app/`.

## Setup

**Before running tests, make sure:**
- You have at least one test Product (e.g., `Saratoga 60` / `MightyGrass`) with 2+ parent rolls in `Available` status
- You have at least one test Job in `Draft` status
- You have both the AI Inventory Assistant and the live app open in the browser

**Safety rule:** Every scenario names test data explicitly. **Do not run these on real production jobs or real customer rolls** — create test records first.

---

## Scenario 1: The Core Bug Fix — Release Flow

**Goal:** Verify the main bug we fixed (roll status syncing when you release an allocation from a job).

**SOP reference:** Warehouse Change Protocol — "If a roll planned for this job is no longer available..."

**Steps:**
1. Navigate to **Inventory**. Pick a roll in `Available` status. Note its TT SKU tag number.
2. Go to **RollDetail** for that roll → click **Plan for Job** → pick your test Draft job → confirm.
3. **Verify:** roll status changed to `Planned` on the roll detail page.
4. Navigate to **JobDetail** for that job. **Verify:** the roll appears in the allocations table with status `Planned`.
5. Click the trash icon next to the allocation. Confirm deletion.
6. Navigate back to **Inventory**. **Verify:** the roll is back to `Available`.
7. Navigate back to **JobDetail**. **Verify:** the allocation is gone from the list.

**Pass criteria:** roll returns to Available in both UI and underlying data. **If this fails, the core bug regressed — stop and report.**

---

## Scenario 2: Status Consistency Across Pages

**Goal:** Verify status changes in one place propagate everywhere.

**Steps:**
1. Plan a roll for a job (see Scenario 1 step 2).
2. Open **three browser tabs**: Inventory list, RollDetail for the roll, JobDetail for the job.
3. On JobDetail, change the allocation's status via its dropdown from `Planned` → `Allocated`.
4. Refresh the other two tabs (Cmd+R).
5. **Verify:** Inventory list shows the roll as `Allocated`. RollDetail shows `Allocated`. All three tabs agree.
6. Change the allocation from `Allocated` → `Staged`. Refresh. **Verify:** consistent everywhere.
7. Change allocation to `Cancelled`. Refresh. **Verify:** all three places now show the roll as `Available` (since Cancelled releases the roll per our code).

**Pass criteria:** no tab ever shows a stale or contradictory status.

---

## Scenario 3: Dashboard Accuracy + Deep-Links

**Goal:** Verify dashboard counts are correct and clicking drills down properly.

**Steps:**
1. Navigate to **Dashboard**.
2. Note "Total Rolls" number.
3. Click the "Total Rolls" stat card. **Verify:** navigates to Inventory with no filter applied, and the row count matches the stat.
4. Go back to Dashboard. Click "Total Sq Ft in Stock". **Verify:** navigates to Inventory filtered to `status=Available`.
5. Click a bar in the "Inventory by Turf Type" chart. **Verify:** Inventory page opens filtered to that product + Available.
6. Click a slice in the "Parent vs Child Rolls" pie. **Verify:** Inventory opens filtered by that type.
7. Count the rolls shown in Inventory after each deep-link. **Verify:** count matches what the dashboard showed.

**Pass criteria:** every dashboard element is clickable and filters land on the correct subset.

---

## Scenario 4: SOP Priority Rules (AI Assistant)

**Goal:** Verify the AI assistant applies SOP priority correctly.

**Setup:** Make sure you have BOTH a child roll AND a parent roll of the same product, both in Available status. Note both TT SKU numbers.

**Steps:**
1. Open the Inventory Assistant (sparkle icon).
2. Ask: **"What rolls should I plan for 30 feet of [product name]?"**
3. **Verify in the reply:**
   - Child roll is suggested before the parent roll
   - Dye lot is mentioned
   - If multiple dye lots exist, they are grouped/noted
   - Warehouse location (row A/B/C) is mentioned
4. Ask: **"Are there any rolls under 20 feet we should protect?"**
5. **Verify:** if you have any, it warns about them per SOP short-child rule.

**Pass criteria:** suggestions follow the child-first ordering from the SOP.

---

## Scenario 5: AI Write Actions with Confirmation

**Goal:** Verify the AI asks before destructive actions and actually performs them.

**Steps:**
1. Open the assistant.
2. Say: **"Assign roll [pick an available TT SKU] to job [pick a Draft job number]."**
3. **Verify:** assistant confirms the roll and job before acting (does NOT act on first message).
4. Reply: **"yes"**.
5. **Verify:**
   - Success message from AI includes roll tag and job number
   - Green checkmark audit trail appears below the reply
   - Open Inventory in another tab — the roll now shows `Planned`
   - Open JobDetail for that job — the allocation is listed
6. In the AI, say: **"Release that roll from the job."**
7. Confirm. **Verify:** roll is back to Available in Inventory.

**Pass criteria:** no destructive action happens without explicit "yes". Post-action state matches reality.

---

## Scenario 6: Guardrails on Manual Status Change

**Goal:** Verify RollDetail's Edit Status dialog blocks unsafe transitions.

**Steps:**
1. Plan a roll for a job (from Scenario 1).
2. On RollDetail for that roll, click **Edit Status**.
3. **Verify:** an amber warning appears saying the roll is allocated.
4. Open the status dropdown.
5. **Verify:** `Available`, `AwaitingLocation`, `ReturnedHold`, `Consumed`, `Scrapped` are either disabled or show "(release from job first)".
6. **Verify:** `Planned`, `Allocated`, `Staged`, `Dispatched` ARE selectable.
7. Close the dialog without changing. Release the roll via JobDetail.
8. Re-open Edit Status on RollDetail.
9. **Verify:** all options are now available (no active allocation).

**Pass criteria:** user cannot break the status invariant via manual edit.

---

## Scenario 7: Receive Page Data Consistency

**Goal:** Verify the Receive page doesn't silently hide products (the bug you just caught).

**Steps:**
1. Navigate to **Receive** → Single Roll tab.
2. Select every manufacturer in the dropdown, one by one.
3. For each, open the Product dropdown.
4. **Verify:** either real products appear OR the empty-state message "No products linked to this manufacturer" shows.
5. Repeat on the Rapid Entry tab.
6. Pick Mighty Grass (our test case). **Verify:** TexasPlay, TexasLush, TexasHaven appear.

**Pass criteria:** no silent blank dropdowns. Either products or a clear explanation.

---

## Scenario 8: Transactions & Reports

**Goal:** Verify the stat cards on Transactions and TurfOverageReport show real numbers.

**Steps:**
1. Navigate to **Transactions**.
2. **Verify:** "Receives", "Ships", and "Returns" stat cards all show non-zero numbers (assuming you have historical activity). If they're all zero, the bug has regressed.
3. Navigate to **TurfOverageReport**.
4. Pick a completed job with known allocated footage.
5. **Verify:** "Total Allocated" for that job is non-zero.

**Pass criteria:** stats reflect actual data, not always zero.

---

## Scenario 9: AI Assistant Voice I/O

**Goal:** Verify Web Speech API voice features work in Chrome.

**Steps:**
1. Open the assistant on Chrome.
2. Click the mic button. Grant mic permission if prompted.
3. Say: "How many rolls do we have?"
4. **Verify:** text appears in the input field as you speak, then auto-sends.
5. **Verify:** a real answer comes back.
6. Click the speaker icon in the header (should turn green).
7. Ask another question.
8. **Verify:** the reply is read aloud.

**Pass criteria:** voice in and voice out both work. (Skip on Firefox — limited Web Speech support.)

---

## Running with Cowork

Tell Cowork:

> Run the TexasTurf smoke test plan. The test scenarios are in `/README_PATCH.md` or the separate `SMOKE_TESTS.md` in the repo root. Start with Scenario 1 (core bug fix — release flow). Do NOT run writes on production jobs — create a test job named "SMOKE_TEST_<today's date>" first and use that throughout.
>
> Run scenarios 1-8 in order. For each: record Pass or Fail with a one-line note. Do NOT attempt to fix anything that fails — just report. Voice (Scenario 9) requires mic permission, skip if the agent can't use the microphone.

---

## Common failure modes to watch for

- Inventory and RollDetail showing different statuses → the sync helpers were bypassed somewhere
- Allocation deleted but roll still shows `Planned` → core bug regressed, critical
- Dashboard stat card shows fewer rolls than Inventory → filter mismatch
- AI assistant performs a write without confirming first → system prompt not followed, investigate
- "(no reply)" from assistant → backend returned empty, check Base44 logs
- Product dropdown stays blank with no message → `Receive.jsx` empty-state code missing

Any of those = stop, screenshot, report.
