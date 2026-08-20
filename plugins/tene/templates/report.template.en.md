---
tene:
  sprint: {{sprint}}
  doc: report
  phase: report
  status: draft
  created: {{today}}
  modified: {{today}}
  lang: en
---

# {{title}} — Sprint Report

## 0. Summary     <!-- tene:sec=summary -->

<!-- tene:auto:start block=summary -->
| Item | Value |
|---|---|
<!-- tene:auto:end -->

## R1. Connection to Previous Sprints     <!-- tene:sec=r1 -->

| Previous sprint | Artifact | Relation | Evidence |
|---|---|---|---|

### Broken connections
<Artifacts from previous sprints that these changes left unused. Write "not applicable" if none>

## R2. Files Created/Modified and How     <!-- tene:sec=r2 -->

<!-- tene:auto:start block=r2 -->
| File | Change | Layer | Symbols |
|---|---|---|---|
<!-- tene:auto:end -->

### Implementation notes
<How it was built>

## R3. Planning Intent Satisfied     <!-- tene:sec=r3 -->

| Implementation | AC satisfied | Planning intent |
|---|---|---|

### Built differently than intended
<With approval status if any. Write "not applicable" if none>

## R4. Work by Understanding Layer     <!-- tene:sec=r4 -->

<!-- tene:auto:start block=r4 -->
### Interface (Entry Point)
### Business Logic (Processing rules)
### Persistence (Data)
### Infrastructure (Runtime)
### Unclassified
<!-- tene:auto:end -->

### Layer balance
<Is the work skewed toward one layer. Is that justified>

## R5. The Six Questions     <!-- tene:sec=r5 -->

<!-- tene:auto:start block=r5 -->
<!-- tene:auto:end -->

### What these answers revealed
<Paths absent from the design, orphans, layer violations. Findings carry over to R6>

## R6. Pending Decisions and Carry-over     <!-- tene:sec=r6 -->

### Policy decisions needed
| # | To decide | Options | Impact | Why decide now |
|---|---|---|---|---|

### Carried over
| # | Item | Why not done this sprint | When it will be done |
|---|---|---|---|

### Waivers granted
| # | Target | Reason | Expires |
|---|---|---|---|

> Gate G7 blocks on any carry-over without a reason.

## +@ (free retrospective)
