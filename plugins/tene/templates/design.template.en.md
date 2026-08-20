---
tene:
  sprint: {{sprint}}
  doc: design
  phase: design
  status: draft
  created: {{today}}
  modified: {{today}}
  lang: en
  profile: {{profile}}
  cia: pending
---

# {{title}} — Design

## 1. Overview     <!-- tene:sec=overview -->

<What is being built and how, in one paragraph>

## 2. Understanding Layer Classification     <!-- tene:sec=layers -->

<!-- tene:auto:start block=layers -->
### Interface (Entry Point)
| Target | File | New/Modified | Source |
|---|---|---|---|

### Business Logic (Processing rules)
| Target | File | New/Modified | Source |
|---|---|---|---|

### Persistence (Data)
| Target | File | New/Modified | Source |
|---|---|---|---|

### Infrastructure (Runtime)
| Target | File | New/Modified | Source |
|---|---|---|---|

### Unclassified (no rule matched)
| Target | File | Reason |
|---|---|---|
<!-- tene:auto:end -->

> All four layers must be filled in, including an explicit "not applicable". Gate G3 blocks on an empty layer.

## 3. Layer Violations     <!-- tene:sec=violations -->

<!-- tene:auto:start block=violations -->
| Kind | Detail | Evidence |
|---|---|---|
<!-- tene:auto:end -->

## 4. Processing Logic     <!-- tene:sec=logic -->

### <logic name>
<input → processing → output. Branch conditions and the result of each branch. Failure handling and side effects>

## 5. The Six Questions     <!-- tene:sec=questions -->

<!-- tene:auto:start block=questions -->
### `<symbol>`
| Question | Answer | Source |
|---|---|---|
| Q1 Declared name | | |
| Q2 Defining file | | |
| Q3 Imported/referenced at | | |
| Q4 Called/used at | | |
| Q5 Input data shape | | |
| Q6 Returned/mutated data | | |
<!-- tene:auto:end -->

### What these answers revealed
<Reference or call paths absent from the design, orphan symbols, layer violations>

## 6. Data Contracts     <!-- tene:sec=contracts -->

| Target | Input schema | Output schema | Source |
|---|---|---|---|

## 7. Screen Transitions     <!-- tene:sec=transitions -->

| Edge | Trigger | Target AC |
|---|---|---|
| <A> → <B> | <action> | ac_1 |

> The edge count in this table is the denominator of QA transition coverage.

## 8. AC Anchors     <!-- tene:sec=anchors -->

| AC | Anchors |
|---|---|
| ac_1 | `<symbol>` |

## +@ (free perspective)
