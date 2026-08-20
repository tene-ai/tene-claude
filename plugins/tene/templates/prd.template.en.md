---
tene:
  sprint: {{sprint}}
  doc: prd
  phase: prd
  status: draft
  created: {{today}}
  modified: {{today}}
  lang: en
  profile: {{profile}}
---

# {{title}} — PRD

## 1. Background and Problem     <!-- tene:sec=background -->

<What hurts today. What happens if we leave it alone>

## 2. Goals     <!-- tene:sec=goals -->

<What this sprint achieves. How we confirm success>

## 3. Non-goals     <!-- tene:sec=nongoals -->

> ⚠️ Required. Gate G1 blocks if empty. Write "none" explicitly if there is nothing.

<What we are not doing this time, and why>

## 4. Intent     <!-- tene:sec=intents -->

| ID | Intent | Rationale | Actors | Source |
|---|---|---|---|---|
| intent_1 | <what we want to achieve> | <why> | <who> | conversation |

## 5. UX Flow     <!-- tene:sec=uxflow -->

### Happy path
<start → progress → end>

### Failure path
<where it fails and where the user lands>

### Return path
<back button / refresh / duplicate submit / retry>

## 6. Data Flow     <!-- tene:sec=dataflow -->

<Where input originates and where it comes to rest. Does data survive a failure or not>

## 7. Acceptance Criteria     <!-- tene:sec=ac -->

| ID | Criterion (EARS) | Priority | Method | Anchors | Status |
|---|---|---|---|---|---|
| ac_1 | **When** <trigger>, the system shall <response> | blocking | UX | (set in design) | pending |
| ac_2 | **If** <condition>, **then** the system shall <response> | blocking | DATA | | pending |

> Rules: EARS 5 patterns only · one AC = one verdict · **at least one If-then** · no unjudgeable adjectives
> Priority: blocking (halts the gate) / non-blocking (recorded, does not halt)
> Method: UNIT (tests) / DATA (data flow) / UX (screen transitions)

## 8. Open Decisions     <!-- tene:sec=decisions -->

| # | To decide | Options | Default proposal | Decider |
|---|---|---|---|---|

## +@ (free perspective)
