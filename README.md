# tene

**Spec-driven vibe coding for Claude Code.**
tene catches your intent while you talk, writes it down, anchors it to code, and then proves — with evidence — that what got built is what you meant.

[한국어 README](README-KR.md)

---

## The problem

Vibe coding doesn't break at the speed of writing code. It breaks at **verification**.

When the decisions live scattered across a conversation, nobody — you or the model — can say what "done" was supposed to mean. So the check becomes "it looks right," and that is not a check at all.

tene puts a document between the conversation and the code, and makes both ends answer to it.

---

## Install

```bash
/plugin marketplace add tene-ai/tene-claude
/plugin install tene@tene-ai
```

Requires **Node.js 20+**. Zero external dependencies — CI enforces it.

### Trying it from a local clone

This repository is the **marketplace**; the plugin lives inside it. `--plugin-dir` points at a single plugin, so give it the subpath:

```bash
claude --plugin-dir plugins/tene
```

`--plugin-dir .` will not work — the repo root has `marketplace.json`, not `plugin.json`.

Run `/tene:doctor` to confirm it loaded and to see what it can and cannot do in your project.

---

## One cycle

```
prd → plan → design → do → loop-check → qa → report → archive
```

Between every step sits a gate (G0–G7). Gates are **deterministic**: same input, same result. You cannot talk one into passing.

```bash
/tene:sprint init checkout-retry   # start a sprint
/tene:prd                          # interview for intent → acceptance criteria
/tene:plan                         # break into tasks, check AC coverage
/tene:design                       # logic, 4 layers, 6 questions, code anchors
# ... you implement ...
/tene:loop-check                   # docs ↔ implementation reconciliation
/tene:qa                           # 7-layer verification
/tene:report                       # R1–R6 retrospective
/tene:archive                      # close out, carry unfinished items forward
```

You don't have to use slash commands. Saying "can you QA this" or "check whether it matches the spec" picks up the right skill.

---

## What makes it different

### It refuses to count "100%" as a percentage

```
progress 67% (2 / 3)
verdict: pass | blocking gaps 0
```

A percentage can be gamed two ways: shrink the denominator, or let nine trivial passes average away one fatal failure. So gates ask exactly one question — **did every blocking item pass with evidence?** The percentage is a progress indicator, never a verdict.

### It never launders "unmeasured" into "passed"

| Verdict | Meaning |
|---|---|
| `passed` | Evidence **proves** the criterion is met |
| `failed` | Evidence **proves** it is violated |
| `insufficient` | **We don't know** — no evidence, or not enough |
| `not-applicable` | Doesn't apply here (reason required) |

If there's no test runner, the result is `insufficient` — not `passed`, not `not-applicable`. It won't block the gate, but it *will* appear in section R6 of the report, because what you couldn't measure is an input to the next sprint.

### It looks for code that no document asked for

Checking that the spec got built is only half the job. The other half is checking that **nothing else** got built — that's how scope quietly grows.

Any code change that doesn't map to an anchor must be resolved one of three ways before the gate passes:

- it was a missing anchor → add the anchor
- a requirement absent from the PRD got implemented → **scope expansion**, needs your confirmation
- refactor or typo → record the reason

### It separates judging from collecting — physically

The `tene-judge` and `tene-refuter` agents have **only the Read tool**. They cannot execute anything.

If the judge runs the code itself, "it worked when I tried it" becomes the verdict, and evidence turns into paperwork. So the collector's conclusions are stripped from the judge's input, and every `passed` verdict has to survive adversarial challenge from three separate lenses.

### Secrets never enter the context

`tene-guard` is the one **fail-closed** component in the plugin. If it couldn't inspect a command, it blocks it.

```
tene get KEY                  → deny   (plaintext would hit stdout)
bash -c 'tene get KEY'        → deny   (indirect execution is unwrapped too)
/usr/local/bin/tene get KEY   → deny   (absolute paths as well)
grep "tene get" README.md     → allow  (mentioning ≠ executing)
```

The deny holds even under `--dangerously-skip-permissions`.

---

## Understanding Layers and the 6 Questions

This is the part that actually holds off technical debt.

**Four layers** — seeing the forest

| Layer | What lives there |
|---|---|
| Interface | Entry points — where the outside world comes in |
| Business Logic | The rules — what this system actually does |
| Persistence | Data — where state lives |
| Infrastructure | Runtime — what it needs to run at all |

Files that match no rule are **not guessed into a layer**. They stay `unclassified`, and that list is precisely where your rules need work.

**Six questions** — seeing the tree

declared name / defining file / where it's imported / where it's called / input shape / **what it returns *and changes***

That last one is the one people answer badly. The answer isn't just the return value — DB writes, global mutations, and file writes are part of it too.

Filling in the table isn't the point. **What surfaces while you fill it in** is the point: orphans, ambiguous definitions, layer violations.

---

## Code intelligence

No external indexer to install. Three tiers, with fallback:

```
LSP (via the model's tools) → built-in indexer (pure Node) → agent investigation
```

**It always tells you which tier answered.** If the index can't answer, you get `needs-investigation` rather than a low-confidence guess — because a guess, once written into a document, reads as settled fact.

Supported: TypeScript/JavaScript · Python · Go · Java

Limits get reported too. Dynamic dispatch, reflection, and DI can't be traced statically, and tene doesn't pretend otherwise.

---

## Document layout

```
docs/sprints/<id>-<slug>/
├── 00-prd/prd.md            intent, acceptance criteria (EARS)
├── 01-plan/plan.md          tasks, AC coverage
├── 02-design/design.md      logic, 4 layers, 6 questions, anchors
├── 03-analysis/
│   ├── loop-check-<n>.md    per-round reconciliation
│   ├── qa.md                7-layer verdicts
│   └── evidence/            evidence + hash manifest
└── 04-report/report.md      R1–R6
```

Korean and English templates ship together. Sections are located by language-neutral anchors (`<!-- tene:sec=... -->`), so verification keeps working even if you switch the document language.

Add as many free-form sections as you like with `## +@ <title>` — they don't affect verification.

---

## State and recovery

State is written atomically to `.tene-claude/`, so a dropped session picks up where it left off.

**The documents are the source of truth.** If state is corrupted or lost, the documents rebuild it:

```bash
/tene:status <sprint-id> --resync
```

The reverse is not true. That's why tene never deletes a document — archiving only moves them.

---

## Configuration

Adjust these in `/plugin`.

| Option | Default | Meaning |
|---|---|---|
| `docs_root` | `docs/sprints` | where documents go |
| `profile` | `standard` | verification strictness (strict / standard / light / off) |
| `max_loop_checks` | 3 | loop-check iteration ceiling |
| `auto_trigger` | true | natural-language skill suggestions |
| `doc_language` | `auto` | document language (auto / ko / en) |

---

## Development

```bash
node --test plugins/tene/test/unit/*.test.js          # unit
node --test plugins/tene/test/guard-matrix.test.js    # guard matrix
node --test plugins/tene/test/integration/*.test.js   # full-cycle integration
node plugins/tene/test/bench.js                       # hook logic budgets
claude plugin validate . --strict                     # manifests
node scripts/check-docs-consistency.js                # doc consistency
node scripts/assert-no-deps.js                        # zero external deps
```

---

## Documentation

- [Requirements & architecture](docs/00-prd/) — what and why
- [Implementation plan](docs/01-plan/) — milestones and breakdown
- [Detailed design](docs/02-design/) — logic (D00–D13)
- [Progress](docs/01-plan/06-progress.md) — completed work and corrections found during implementation
- [Skill evals](docs/03-analysis/skill-evals-01.md) — measured behavior against a no-skill baseline

---

## License

Apache-2.0 — see [LICENSE](LICENSE).
