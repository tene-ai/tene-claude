---
tene:
  sprint: {{sprint}}
  doc: qa
  phase: qa
  status: draft
  created: {{today}}
  modified: {{today}}
  lang: en
---

# {{title}} — QA

## 1. Gate Verdict     <!-- tene:sec=gate -->

<!-- tene:auto:start block=gate -->
| Item | Value |
|---|---|
| Blocking AC | — |
| Non-blocking AC | — |
| Stale | — |
| **Gate G6** | — |
| Transition coverage | — |
<!-- tene:auto:end -->

> G6: every blocking AC `passed` + evidence valid + zero stale.
> `insufficient` does not halt the gate, but it must appear in report R6.

## 2. Verification Environment     <!-- tene:sec=environment -->

<!-- tene:auto:start block=environment -->
| Tool | Available | Note |
|---|---|---|
<!-- tene:auto:end -->

## 3. Test Charters     <!-- tene:sec=charters -->

| ID | AC | Actor | Variation | Layers needed | Risk |
|---|---|---|---|---|---|

## 4. Per-AC Verdicts     <!-- tene:sec=acverdicts -->

<!-- tene:auto:start block=acverdicts -->
| AC | Priority | Method | Verdict | Evidence | Refutation |
|---|---|---|---|---|---|
<!-- tene:auto:end -->

## 5. UX Flow Verification     <!-- tene:sec=uxflow -->

<!-- tene:auto:start block=uxflow -->
### Transition coverage
| Edge | Measured | Result | Evidence |
|---|---|---|---|

### Return paths
| Scenario | Result |
|---|---|
| State preserved after back | — |
| Recovery after refresh | — |
| Duplicate submit prevented | — |
| Retry after failure | — |
<!-- tene:auto:end -->

## 6. Data Flow Verification     <!-- tene:sec=dataflow -->

| Check | Static | Dynamic | Cross-verdict |
|---|---|---|---|

## 7. 7-Layer Handling     <!-- tene:sec=layers -->

<!-- tene:auto:start block=layers -->
| Layer | Handling | Reason |
|---|---|---|
| L1 Static | — | |
| L2 Unit/Contract | — | |
| L3 Integration/Data | — | |
| L4 System E2E | — | |
| L5 Intent/UX | — | |
| L6 Adversarial/Recovery | — | |
| L7 Regression/Drift | — | |
<!-- tene:auto:end -->

## 8. Unmeasured Items     <!-- tene:sec=insufficient -->

| Item | Reason | To measure it |
|---|---|---|

> ⚠️ Never record an unmeasured item as 0% or as passed.

## 9. Follow-ups     <!-- tene:sec=followup -->

| # | Action | Target | Priority |
|---|---|---|---|

## +@ (free perspective)
