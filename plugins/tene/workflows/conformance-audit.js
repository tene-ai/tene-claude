export const meta = {
  name: 'conformance-audit',
  description: 'Audit every documented requirement against the implementation, then verify each gap',
  whenToUse: 'When a sprint has 15+ requirement items across prd/plan/design',
  phases: [
    { title: 'Audit', detail: 'judge each requirement with evidence' },
    { title: 'Verify', detail: 'confirm each gap is real before reporting it' },
  ],
}

// 갭을 찾는 것보다 **틀린 갭을 걸러내는 것**이 어렵다.
// 없는 갭을 보고하면 사용자가 시간을 버리고, 다음부터 이 도구를 믿지 않는다.

const items = args?.requirements ?? []
if (!items.length) {
  return { error: 'no requirements supplied', hint: 'args.requirements 에 요구 항목을 넘기세요' }
}

const audited = await pipeline(
  items,

  (req) => agent(
    `요구 항목이 구현되었는지 감사하라. **코드를 고치지 마라.**\n` +
    `출처: ${req.source}\n` +
    `항목: ${req.statement}\n` +
    `우선도: ${req.priority}\n` +
    `기대 앵커: ${(req.expectedAnchors ?? []).join(', ') || '없음'}\n\n` +
    `implemented 는 file:line 근거가 있어야 한다. ` +
    `missing 은 "확인했으나 없음" 의 근거(질의 결과 0건 등)가 있어야 한다. ` +
    `어디를 볼지 모르면 missing 이 아니라 unverifiable 이다.`,
    {
      label: `audit:${req.id}`,
      phase: 'Audit',
      agentType: 'tene:gap-auditor',
      schema: {
        type: 'object',
        required: ['id', 'judgment', 'evidence'],
        properties: {
          id: { type: 'string' },
          judgment: { enum: ['implemented', 'partial', 'missing', 'unverifiable'] },
          evidence: { type: 'string' },
          missingPart: { type: 'string' },
          suggestedFix: { type: 'string' },
        },
      },
    },
  ).then((v) => ({ req, verdict: v })),

  // 갭만 검증한다. implemented 를 재확인하는 것은 비용 대비 얻는 것이 적다.
  async (a) => {
    if (!a?.verdict) return a
    if (a.verdict.judgment === 'implemented') return a

    const check = await agent(
      `아래 갭 판정이 맞는지 **반박을 시도하라.**\n` +
      `항목: ${a.req.statement}\n` +
      `판정: ${a.verdict.judgment}\n` +
      `근거: ${a.verdict.evidence}\n\n` +
      `동적 디스패치·DI·재export 로 구현되어 있을 가능성을 확인하라. ` +
      `실제로 구현되어 있으면 refuted: true 를 내라.`,
      {
        label: `verify:${a.req.id}`,
        phase: 'Verify',
        agentType: 'tene:gap-auditor',
        schema: {
          type: 'object',
          required: ['refuted'],
          properties: {
            refuted: { type: 'boolean' },
            foundAt: { type: 'string' },
            note: { type: 'string' },
          },
        },
      },
    )
    return { ...a, verification: check, confirmed: !check?.refuted }
  },
)

const rows = audited.filter(Boolean)
const gaps = rows.filter((r) => r.verdict?.judgment !== 'implemented' && r.confirmed !== false)
const falsePositives = rows.filter((r) => r.confirmed === false)

log(`감사 완료: 갭 ${gaps.length}건 확인 / 오탐 ${falsePositives.length}건 제거`)

return {
  summary: {
    total: rows.length,
    implemented: rows.filter((r) => r.verdict?.judgment === 'implemented').length,
    gaps: gaps.length,
    blockingGaps: gaps.filter((g) => g.req.priority === 'blocking').length,
    falsePositives: falsePositives.length,
    incomplete: items.length - rows.length,
  },
  gaps: gaps.map((g) => ({
    id: g.req.id,
    source: g.req.source,
    statement: g.req.statement,
    priority: g.req.priority,
    judgment: g.verdict.judgment,
    evidence: g.verdict.evidence,
    suggestedFix: g.verdict.suggestedFix ?? null,
  })),
  // 오탐도 낸다 — 감사기가 어디서 틀리는지 알아야 규칙을 고칠 수 있다
  falsePositives: falsePositives.map((f) => ({
    id: f.req.id,
    claimed: f.verdict.judgment,
    foundAt: f.verification?.foundAt,
  })),
}
