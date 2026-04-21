# TexasTurf Full System Audit

End-to-end audit to run after the batch-2 and batch-3 bugfixes are published. Three layers, runnable in sequence by Claude Cowork (or a human).

Target time: ~2 hours total.

## Prerequisites

- Batch-2 and batch-3 fixes uploaded and published in Base44
- Live app: `https://texasturf-inventory-manager.base44.app/`
- AI Inventory Assistant working (sparkle icon bottom-right)
- Create ONE test job for the session: Jobs → New Job → name it `SYSTEM_AUDIT_2026-04-21` (today's date) → status Draft → customer `SYSTEM_AUDIT_CUSTOMER`. Use this job for all write tests.

## Safety rules

- No writes against real production jobs or customer allocations. Ever.
- All assign/release actions use the SYSTEM_AUDIT job only.
- At end of audit, cancel any allocations on the audit job. Leave it in Draft so it can be deleted later.

---

# LAYER 1 — Smoke test re-verification (30 min)

Re-run the 9 scenarios from `SMOKE_TESTS.md` to verify the latest fixes landed and nothing regressed.

Specifically verify these were FIXED:

**1A. Dashboard charts (was Scenario 3 fail)**
- Navigate to Dashboard.
- Record: Total Rolls subtitle value (should read "X parent, Y child" with non-zero numbers).
- Record: Does "Inventory by Turf Type" chart show bars?
- Record: Does "Parent vs Child Rolls" pie show slices?
- Click a turf-type bar. Record: did it navigate to filtered Inventory?

**1B. Transactions stat cards (was Scenario 8 fail)**
- Navigate to Transactions.
- Record: values of Receives, Ships, Returns cards (should be non-zero if any historical activity).
- Compare to the table below — do the visible rows contain matching `ReceiveRoll`, `SendOutToJob`, `ReturnFromJob` transactions?

**1C. AI release confirmation (was Scenario 5 note)**
- Use the AI: "Plan roll [any available TT SKU] for job SYSTEM_AUDIT_2026-04-21." Confirm with "yes."
- Then: "Release that roll from the job."
- Record: did the AI ask for explicit confirmation BEFORE executing? It should respond with something like "Release roll X from job Y? (yes/no)" and wait.

**1D. Regression check on previously-passing scenarios**
- Re-run Scenarios 1, 2, 6, 7 exactly as written in `SMOKE_TESTS.md`.
- Record each as Pass / Fail / Regression.

**Layer 1 output:** a table of scenario/expected/actual/pass|fail.

---

# LAYER 2 — Data integrity audit (45 min)

Uses the AI assistant exclusively. All read-only. Asks structured questions and records responses. Goal: surface silent data inconsistencies.

Open the assistant and ask these prompts verbatim, one at a time. Record each answer:

**2A. Inventory snapshot**
- "Give me dashboard stats."
- Record: total rolls active, available, sq ft available, rolls-by-status breakdown, active allocations count.

**2B. Status distribution sanity check**
- "Search for all rolls with status Planned." (repeat for Allocated, Staged, Dispatched)
- For each status: record the count and whether all returned rolls have an `allocated_job_id` (this should be true for every Planned/Allocated/Staged/Dispatched roll).
- If any roll at these statuses has `null` or missing `allocated_job_id` → **orphan roll**, flag.

**2C. Legacy data detection**
- "Search for rolls with status Available and show me 20 results."
- Look at each result. Flag any rolls with:
  - Missing `product_id`
  - Missing `product_name`
  - Missing `roll_type`
  - Missing `date_received`
  - `current_length_ft` greater than a plausible original length (e.g., > 120 ft)
- Record counts: how many of 20 rolls have each missing field.

**2D. Product catalog vs. inventory reality**
- "Get dashboard stats." (just for the rolls_by_status counts)
- Navigate to Turf admin page. Count products listed.
- Ask AI: "How many different product names exist across all rolls?" (use dashboard_stats or search logic)
- If the roll-based product count > admin-page count → there are rolls pointing at deleted/renamed products, flag.

**2E. Allocation consistency**
- Ask AI: "List all active allocations." (any status other than Cancelled or Completed)
- For each: record job_id and allocated_roll_ids.
- Manually spot-check 3 allocations: for each, ask "What is the status of roll [id]?" and verify the roll's status matches the allocation's status.
- Any mismatch = sync bug, flag.

**2F. Completed-job allocations**
- Ask AI: "Find jobs with status Completed that have active allocations (not Cancelled or Completed)."
- These shouldn't exist. Completed jobs shouldn't have live allocations. If the AI finds any, flag.

**2G. SOP suggestion quality check**
- Ask AI: "Suggest rolls for 30 feet of [pick a product you have at least 3 of]."
- Verify the response:
  - Lists rolls ranked, with Child explicitly before Parent where applicable
  - Shows dye lot on each suggestion
  - Mentions warehouse location (A/B/C) if present in data
  - Groups by dye lot for consistency
  - Flags any short child rolls (<20 ft) with a warning per SOP

**Layer 2 output:** list of flagged data issues, counts of legacy-field rolls, any status sync mismatches, SOP compliance notes for AI suggestions.

---

# LAYER 3 — Workflow simulations (60 min)

Four real-world workflow tests. Each uses the SYSTEM_AUDIT job + a fresh test roll.

## 3A. Full SOP lifecycle (single roll)

Simulates a roll's entire journey per the SOP.

1. **Receive:** Navigate to Receive → Single Roll. Create a roll: TT SKU `AUDIT-1`, manufacturer AGL Grass (or whatever works), product Saratoga 40 (or similar), 13 ft wide, 100 ft long, dye lot `AUDIT-DL`, location bin 1 row A.
   - **Record:** Is the roll visible on Inventory? What's its status?
2. **Plan:** Open RollDetail for AUDIT-1 → Plan for Job → SYSTEM_AUDIT job.
   - **Record:** Roll status on Inventory; JobDetail shows allocation with Planned.
3. **Allocate:** On JobDetail, change allocation status Planned → Allocated.
   - **Record:** Roll status on Inventory; RollDetail; JobDetail Allocation Summary "Allocated (Sent Out)" value.
4. **Stage:** On JobDetail, change allocation to Staged.
   - **Record:** Roll status everywhere.
5. **Dispatch:** On JobDetail, change allocation to Dispatched. (This is what shows as "Fulfilled" in the UI.)
   - **Record:** Roll status; JobDetail overall state.
6. **Cleanup:** Do NOT process returns. Instead, note the final state and proceed.

**Pass criteria:** at every step, roll status on Inventory matches what JobDetail says. Four pages never disagree.

## 3B. Parent → Child cut

1. Find an existing parent roll with `current_length_ft >= 100` in Available status. Note its TT SKU.
2. Navigate to Cut Roll → search for that roll.
3. Create a 30 ft child. Assign the child to SYSTEM_AUDIT job.
4. **Record:**
   - Parent roll's new current_length_ft (should be original - 30)
   - Child roll has its own TT SKU, status Planned (or whatever the cut flow sets)
   - Child roll shows parent_roll_id pointing to the original
   - On the parent's RollDetail, child appears in the Child Rolls list
   - Transaction history on both rolls

## 3C. Multi-roll job + mid-stream release

1. On SYSTEM_AUDIT job (JobDetail → Add Products), add 4 different rolls (any available ones).
2. **Record:** total length allocated shown on the job.
3. Release one of the four allocations (trash icon).
4. **Record:**
   - Released roll is back to Available on Inventory
   - Job's total length updated (reduced by the released amount)
   - Other 3 rolls unaffected

## 3D. Dye lot consistency test (AI assistant)

1. On SYSTEM_AUDIT job, add 2 rolls from DIFFERENT dye lots of the same product.
2. Ask the AI: "Are all rolls on job SYSTEM_AUDIT_2026-04-21 dye-lot consistent?"
3. **Record:** does the AI notice the dye lot mismatch? Does it explain the SOP rule (different dye lots OK only with hardscape separation)?

**Layer 3 output:** per-workflow Pass/Fail with details.

---

# FINAL CLEANUP

At end of audit:
1. Open JobDetail for SYSTEM_AUDIT_2026-04-21.
2. For each allocation, delete it (trash icon). Verify each roll returns to Available.
3. Leave the job in Draft status.
4. Report to user: audit complete, SYSTEM_AUDIT job empty and safe to delete.

---

# REPORTING

For Cowork: at end, produce a single report with this exact structure:

```
SYSTEM AUDIT REPORT — 2026-04-21
================================

LAYER 1 — SMOKE TESTS
- 1A (Dashboard charts): PASS / FAIL + notes
- 1B (Transaction stats): PASS / FAIL + notes
- 1C (AI release confirm): PASS / FAIL + notes
- 1D (Regressions): list any previously-passing scenarios that now fail

LAYER 2 — DATA INTEGRITY
- 2A snapshot: [numbers]
- 2B orphans: [count of rolls at job-status without allocated_job_id]
- 2C legacy rolls: [counts per field]
- 2D product catalog drift: [yes/no + count]
- 2E allocation mismatches: [list]
- 2F completed-job orphans: [list]
- 2G AI SOP compliance: [observations]

LAYER 3 — WORKFLOWS
- 3A lifecycle: PASS/FAIL + which step
- 3B cut roll: PASS/FAIL + details
- 3C multi-roll: PASS/FAIL + details
- 3D dye-lot AI: PASS/FAIL + AI response summary

CRITICAL ISSUES
- [ordered list of things that need immediate attention]

NICE-TO-HAVES
- [cosmetic/polish items observed]

CLEANUP STATUS
- SYSTEM_AUDIT job allocations: cleared / remaining
```

---

# Cowork handoff prompt

Paste this:

> Run the full system audit from `SYSTEM_AUDIT.md` in the repo root (https://github.com/stefanfulks/roll-inventory-manager/blob/main/SYSTEM_AUDIT.md). Use the live app at https://texasturf-inventory-manager.base44.app/.
>
> **Critical:**
> - Create ONE test job named `SYSTEM_AUDIT_2026-04-21` and use only that job for writes
> - Do NOT modify real production jobs or customer allocations
> - Do NOT attempt to fix issues — only observe and report
> - If any step requires microphone or file downloads, skip it and note as skipped
> - Follow the cleanup steps at the end
>
> Produce a final report in the exact format specified in the "REPORTING" section.
