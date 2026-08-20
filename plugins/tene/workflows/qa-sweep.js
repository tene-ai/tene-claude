export const meta = {
  name: 'qa-sweep',
  description: 'Verify every acceptance criterion: collect evidence, judge independently, then refute passes',
  whenToUse: 'When a sprint has 8+ acceptance criteria, or the user asks for a thorough QA pass',
  phases: [
    { title: 'Collect', detail: 'gather evidence per criterion (no judgment)' },
    { title: 'Judge', detail: 'independent verdict from evidence only' },
    { title: 'Refute', detail: 'adversarial check on passed verdicts' },
  ],
}

// 수집 → 판정 → 반박. 각 단계가 다른 에이전트이고, 판정자는 수집자의 결론을 보지 못한다.
// 이 분리가 무너지면 "내가 해보니 되더라" 가 판정이 된다.

const criteria = args?.criteria ?? []
if (!criteria.length) {
  return { error: 'no criteria supplied', hint: 'args.criteria 에 AC 목록을 넘기세요' }
}

const LENSES = ['correctness', 'edge-case', 'evidence-sufficiency']

const results = await pipeline(
  criteria,

  // ① 수집 — 판정하지 않는다
  (ac) => agent(
    `charter 에 따라 ${ac.id} 를 검증하고 관찰 기록과 증거 파일을 남겨라.\n` +
    `기준: ${ac.statement}\n` +
    `필요 레이어: ${(ac.requiredLayers ?? []).join(', ')}\n` +
    `금지 조건: ${(ac.forbiddenOutcomes ?? []).join(' / ') || '없음'}\n\n` +
    `판정하지 마라. observed 에는 본 것만 적어라. ` +
    `실행하지 못한 레이어는 사유와 함께 적어라.`,
    { label: `collect:${ac.id}`, phase: 'Collect', agentType: 'tene:qa-runner' },
  ),

  // ② 판정 — 증거만 본다
  (collected, ac) => agent(
    `아래 증거만 보고 ${ac.id} 를 판정하라.\n` +
    `기준: ${ac.statement}\n` +
    `우선도: ${ac.priority} / 검증 방식: ${ac.method}\n` +
    `금지 조건: ${(ac.forbiddenOutcomes ?? []).join(' / ') || '없음'}\n\n` +
    `수집 기록:\n${collected ?? '(수집 실패)'}\n\n` +
    `증거가 부족하면 insufficient 를 내고 missingToDecide 를 적어라. ` +
    `${ac.method} 기준을 다른 종류의 증거로 판정하지 마라.`,
    {
      label: `judge:${ac.id}`,
      phase: 'Judge',
      agentType: 'tene:judge',
      schema: {
        type: 'object',
        required: ['ac', 'verdict', 'reason'],
        properties: {
          ac: { type: 'string' },
          verdict: { enum: ['passed', 'failed', 'insufficient', 'not-applicable'] },
          reason: { type: 'string' },
          citedEvidence: { type: 'array', items: { type: 'string' } },
          missingToDecide: { type: 'array', items: { type: 'string' } },
          confidence: { enum: ['low', 'medium', 'high'] },
        },
      },
    },
  ).then((v) => ({ ac, verdict: v, collected })),

  // ③ 반박 — passed 만. 렌즈별로 독립 판단한다.
  async (judged) => {
    if (!judged?.verdict || judged.verdict.verdict !== 'passed') return judged

    const votes = await parallel(LENSES.map((lens) => () => agent(
      `${judged.ac.id} 의 passed 판정을 ${lens} 렌즈로 반박하라.\n` +
      `기준: ${judged.ac.statement}\n` +
      `판정 근거: ${judged.verdict.reason}\n` +
      `인용된 증거: ${(judged.verdict.citedEvidence ?? []).join(', ')}\n\n` +
      `기본값은 refuted: true 다. 구체적 시나리오를 만들지 못하면 refuted: false 를 내라.`,
      {
        label: `refute:${judged.ac.id}:${lens}`,
        phase: 'Refute',
        agentType: 'tene:refuter',
        schema: {
          type: 'object',
          required: ['refuted', 'lens'],
          properties: {
            lens: { type: 'string' },
            refuted: { type: 'boolean' },
            scenario: { type: 'string' },
            wouldNeed: { type: 'string' },
            confidence: { enum: ['low', 'medium', 'high'] },
          },
        },
      },
    )))

    const valid = votes.filter(Boolean)
    const refutedCount = valid.filter((v) => v.refuted).length
    // 2/3 이상 반박 성공 → 강등
    const downgraded = refutedCount >= 2

    return {
      ...judged,
      refutation: { votes: valid, refutedCount, downgraded },
      final: downgraded ? 'failed' : judged.verdict.verdict,
    }
  },
)

const rows = results.filter(Boolean)
const summary = {
  total: rows.length,
  passed: rows.filter((r) => (r.final ?? r.verdict?.verdict) === 'passed').length,
  failed: rows.filter((r) => (r.final ?? r.verdict?.verdict) === 'failed').length,
  insufficient: rows.filter((r) => (r.final ?? r.verdict?.verdict) === 'insufficient').length,
  downgraded: rows.filter((r) => r.refutation?.downgraded).length,
  // 수집이나 판정이 실패한 항목을 조용히 빼지 않는다
  incomplete: criteria.length - rows.length,
}

log(`판정 완료: passed ${summary.passed} / failed ${summary.failed} / insufficient ${summary.insufficient}` +
    (summary.downgraded ? ` (반박으로 강등 ${summary.downgraded})` : ''))

return {
  summary,
  verdicts: rows.map((r) => ({
    ac: r.ac?.id,
    verdict: r.final ?? r.verdict?.verdict,
    reason: r.verdict?.reason,
    evidence: r.verdict?.citedEvidence ?? [],
    missingToDecide: r.verdict?.missingToDecide ?? [],
    downgradedBy: r.refutation?.downgraded
      ? r.refutation.votes.filter((v) => v.refuted).map((v) => v.lens)
      : [],
  })),
}
