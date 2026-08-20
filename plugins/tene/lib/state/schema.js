/**
 * 상태 스키마 — D03
 *
 * 순수 함수. 타입 정의와 검증·생성만 한다. I/O 는 store.js 가 맡는다.
 */
import { nowIso } from '../util/time.js'

export const SCHEMA_VERSION = 1

export const PHASES = ['draft', 'prd', 'plan', 'design', 'do', 'loop-check', 'qa', 'report', 'archived']
export const SPRINT_STATUS = ['planned', 'active', 'paused', 'archived']
export const PROFILES = ['strict', 'standard', 'light', 'off']
export const VERDICTS = ['pending', 'passed', 'failed', 'insufficient', 'not-applicable', 'stale']
export const PRIORITIES = ['blocking', 'non-blocking']
export const METHODS = ['UNIT', 'DATA', 'UX']

export const SPRINT_ID_RE = /^[a-z][a-z0-9-]{0,31}$/

/** D02 §1.1 전이표 — from → to → gate */
export const TRANSITIONS = [
  { from: 'draft', to: 'prd', name: 'START', gate: 'G0' },
  { from: 'prd', to: 'plan', name: 'PRD_DONE', gate: 'G1' },
  { from: 'plan', to: 'design', name: 'PLAN_DONE', gate: 'G2' },
  { from: 'design', to: 'do', name: 'DESIGN_DONE', gate: 'G3' },
  { from: 'do', to: 'loop-check', name: 'DO_DONE', gate: 'G4' },
  { from: 'loop-check', to: 'do', name: 'LOOP_RETRY', gate: null },
  { from: 'loop-check', to: 'qa', name: 'LOOP_DONE', gate: 'G5' },
  { from: 'qa', to: 'do', name: 'QA_FAIL_IMPL', gate: null },
  { from: 'qa', to: 'loop-check', name: 'QA_FAIL_TRACE', gate: null },
  { from: 'qa', to: 'design', name: 'QA_FAIL_DESIGN', gate: null },
  { from: 'qa', to: 'prd', name: 'QA_FAIL_SPEC', gate: null },
  { from: 'qa', to: 'report', name: 'QA_DONE', gate: 'G6' },
  { from: 'report', to: 'archived', name: 'REPORT_DONE', gate: 'G7' },
]

/** phase → 그 phase 를 벗어날 때 검사하는 게이트 */
export const GATE_BY_PHASE = {
  draft: 'G0', prd: 'G1', plan: 'G2', design: 'G3',
  do: 'G4', 'loop-check': 'G5', qa: 'G6', report: 'G7',
}

export function findTransition(from, to) {
  return TRANSITIONS.find((t) => t.from === from && t.to === to) ?? null
}

export function allowedFrom(phase) {
  return TRANSITIONS.filter((t) => t.from === phase).map((t) => t.to)
}

/** phase 순서 비교 — 'phase>=do' 같은 조건에 쓴다 */
export function phaseIndex(phase) {
  return PHASES.indexOf(phase)
}

export function phaseAtLeast(current, target) {
  return phaseIndex(current) >= phaseIndex(target)
}

/** D03 §4.1 — sprint init 직후의 current.json */
export function emptySummary(maxLoopChecks = 3) {
  return {
    gate: null,
    ac: { total: 0, passed: 0, failed: 0, insufficient: 0, stale: 0, pending: 0, blockingPending: 0, blockingFailed: 0, waived: 0 },
    coverage: null,
    loopChecks: { count: 0, max: maxLoopChecks },
    blocking: [],
  }
}

export function newSprint({ id, slug, title, profile = 'standard', startCommit = null, docsRoot, sprintDir }) {
  const at = nowIso()
  return {
    schemaVersion: SCHEMA_VERSION,
    rev: 0, // 첫 저장에서 1 이 된다 (rev = 저장 횟수)
    updatedAt: at,
    updatedBy: { kind: 'claude', sessionId: sessionId() },
    id,
    slug,
    title,
    status: 'active',
    phase: 'draft',
    profile,
    createdAt: at,
    startCommit,
    archivedAt: null,
    docsRoot,
    sprintDir,
    docs: { prd: null, plan: null, design: null, loopCheck: [], qa: null, report: null },
    gates: { G0: null, G1: null, G2: null, G3: null, G4: null, G5: null, G6: null, G7: null },
    intents: [],
    ac: [],
    layers: { required: [], resolution: {}, notApplicableReason: {} },
    coverage: { transitions: null },
    counters: { loopChecks: 0, maxLoopChecks: 3, qaRuns: 0, qaRetries: 0, maxQaRetries: 3 },
    gaps: [],
    waivers: [],
    carryOver: [],
    runs: [],
  }
}

export function newCurrent({ sprint, docsRoot, autoUntil = 'design' }) {
  return {
    schemaVersion: SCHEMA_VERSION,
    rev: 0, // 첫 저장에서 1 이 된다 (rev = 저장 횟수)
    updatedAt: nowIso(),
    updatedBy: { kind: 'claude', sessionId: sessionId() },
    activeSprint: sprint.id,
    phase: sprint.phase,
    status: sprint.status,
    profile: sprint.profile,
    autoUntil,
    summary: emptySummary(sprint.counters?.maxLoopChecks ?? 3),
    nextAction: nextActionFor(sprint),
    docsRoot,
    sprintDir: sprint.sprintDir,
  }
}

export function newMasterPlan({ title = '', goal = '' } = {}) {
  return {
    schemaVersion: SCHEMA_VERSION,
    rev: 0, // 첫 저장에서 1 이 된다 (rev = 저장 횟수)
    updatedAt: nowIso(),
    title,
    goal,
    sprints: [],
    carryOver: [],
    constraints: [],
  }
}

export function sessionId() {
  const raw = process.env.CLAUDE_CODE_SESSION_ID ?? process.env.CLAUDE_SESSION_ID ?? ''
  return raw ? raw.slice(0, 8) : 'unknown'
}

/** AC 배열에서 summary.ac 를 재계산한다 (파생 데이터의 진실은 항상 여기서 나온다) */
export function computeAcSummary(ac = []) {
  const s = {
    total: ac.length, passed: 0, failed: 0, insufficient: 0, stale: 0,
    // pending 은 "아직 판정하지 않은 것" 이다. 세지 않으면 total 4 / passed 0 이
    // "4건 중 0건 통과" 로 읽히고, 한 건도 재보지 않은 sprint 가 다 끝난 것처럼 보인다.
    pending: 0, blockingPending: 0, blockingFailed: 0, waived: 0,
  }
  for (const a of ac) {
    if (a.verdict === 'passed') s.passed++
    else if (a.verdict === 'failed') s.failed++
    else if (a.verdict === 'insufficient') s.insufficient++
    else if (a.verdict === 'stale') s.stale++
    else if (a.verdict === 'pending' || a.verdict == null) s.pending++
    // waiver 는 사유와 함께 승인된 예외다. 차단에서 빼되 waived 로 따로 센다 —
    // 빼기만 하면 무엇을 포기했는지가 숫자에서 사라진다.
    if (a.waived) { s.waived++; continue }
    if (a.priority !== 'blocking') continue
    if (a.verdict === 'failed' || a.verdict === 'stale') s.blockingFailed++
    else if (a.verdict === 'pending' || a.verdict == null) s.blockingPending++
  }
  return s
}

/** 다음에 할 일 — SessionStart 주입과 Stop 훅 안내에 쓴다 */
export function nextActionFor(sprint) {
  const gate = sprint.gates?.[GATE_BY_PHASE[sprint.phase]]
  const acSummary = computeAcSummary(sprint.ac)

  switch (sprint.phase) {
    case 'draft':
      return { skill: 'prd', reason: '기획 의도를 인터뷰로 추출하세요', alternatives: [] }
    case 'prd':
      return { skill: 'plan', reason: '수용 기준을 작업으로 나누세요', alternatives: ['prd (보완)'] }
    case 'plan':
      return { skill: 'design', reason: '처리 로직과 4계층을 설계하세요', alternatives: [] }
    case 'design':
      return { skill: null, reason: '구현을 시작하세요', alternatives: ['loop-check (구현 후)'] }
    case 'do':
      return { skill: 'loop-check', reason: '문서 대비 구현을 검증하세요', alternatives: [] }
    case 'loop-check':
      return sprint.gaps?.some((g) => g.severity === 'blocker' && g.status === 'open')
        ? { skill: null, reason: 'blocking 갭을 해소한 뒤 loop-check 를 다시 실행하세요', alternatives: ['sprint waiver'] }
        : { skill: 'qa', reason: '수용 기준을 검증하세요', alternatives: [] }
    case 'qa':
      if (acSummary.blockingFailed > 0) {
        return {
          skill: 'loop-check',
          reason: `blocking AC ${acSummary.blockingFailed}건이 미충족입니다`,
          alternatives: ['qa --only DATA', 'sprint waiver'],
        }
      }
      // 미판정이 남았는데 report 로 보내면 "재보지 않은 것" 이 "통과한 것" 으로 넘어간다.
      // blockingFailed 가 0 인 이유가 "다 통과해서" 인지 "아직 안 봐서" 인지 구분해야 한다.
      if (acSummary.blockingPending > 0) {
        return {
          skill: 'qa',
          reason: `blocking AC ${acSummary.blockingPending}건이 아직 판정되지 않았습니다`,
          alternatives: [],
        }
      }
      return { skill: 'report', reason: '회고 문서를 작성하세요', alternatives: [] }
    case 'report':
      return { skill: 'archive', reason: 'sprint 를 아카이브하세요', alternatives: [] }
    case 'archived':
      return { skill: 'master-plan', reason: '다음 sprint 를 확인하세요', alternatives: [] }
    default:
      return { skill: 'status', reason: '상태를 확인하세요', alternatives: [] }
  }
}

/** 최소 구조 검증 — 손상 판별용. 완전한 스키마 검증이 아니다. */
export function validateSprintShape(s) {
  const errors = []
  if (!s || typeof s !== 'object') return ['not an object']
  if (typeof s.id !== 'string' || !SPRINT_ID_RE.test(s.id)) errors.push('id')
  if (!PHASES.includes(s.phase)) errors.push('phase')
  if (!SPRINT_STATUS.includes(s.status)) errors.push('status')
  if (!Array.isArray(s.ac)) errors.push('ac')
  if (!s.gates || typeof s.gates !== 'object') errors.push('gates')
  return errors
}
