/**
 * 문서별 필수 섹션 ID — D04 §1.2
 *
 * 검증기는 <!-- tene:sec=<id> --> 앵커만 본다. 제목 문자열은 보지 않는다.
 * 문서 언어가 사용자 언어를 따라도 검증이 깨지지 않게 하기 위함이다.
 */

export const DOC_TYPES = ['prd', 'plan', 'design', 'loop-check', 'qa', 'report', 'master-plan']

/** Profile=strict|standard 의 필수 섹션 */
export const SECTIONS = {
  prd: ['background', 'goals', 'nongoals', 'intents', 'uxflow', 'dataflow', 'ac', 'decisions'],
  plan: ['tasks', 'coverage', 'impact', 'order', 'risks', 'notdoing'],
  design: ['overview', 'layers', 'violations', 'logic', 'questions', 'contracts', 'transitions', 'anchors'],
  'loop-check': ['verdict', 'comparison', 'layercheck', 'unattributed', 'debt', 'fixes', 'notdone'],
  qa: ['gate', 'environment', 'charters', 'acverdicts', 'uxflow', 'dataflow', 'layers', 'insufficient', 'followup'],
  report: ['summary', 'r1', 'r2', 'r3', 'r4', 'r5', 'r6'],
  'master-plan': ['status', 'goal', 'sprints', 'dependencies', 'constraints', 'carry'],
}

/**
 * Profile 별 필수 섹션 — D02 §3.1
 *
 * light 도 파일은 분리한다. 필수 섹션 수만 줄어든다.
 * 4계층·6질문·R1~R6 은 어느 Profile 에서도 면제하지 않는다 — 제품 정체성이다.
 */
export const REQUIRED_BY_PROFILE = {
  strict: SECTIONS,
  standard: SECTIONS,
  light: {
    prd: ['nongoals', 'intents', 'ac'],
    plan: ['tasks', 'coverage'],
    design: ['layers', 'questions', 'anchors'],
    'loop-check': ['verdict', 'comparison'],
    qa: ['gate', 'acverdicts', 'insufficient'],
    report: ['r1', 'r2', 'r3', 'r4', 'r5', 'r6'],
    'master-plan': ['status', 'sprints'],
  },
  off: Object.fromEntries(DOC_TYPES.map((t) => [t, []])),
}

/** 기계가 생성하는 블록 (사람이 편집하지 않는 영역) — D04 §1.2 */
export const AUTO_BLOCKS = {
  prd: [],
  plan: ['coverage', 'impact'],
  design: ['layers', 'violations', 'questions'],
  'loop-check': ['verdict', 'comparison', 'layercheck', 'unattributed'],
  qa: ['gate', 'environment', 'acverdicts', 'uxflow', 'layers'],
  report: ['summary', 'r2', 'r4', 'r5'],
  'master-plan': ['status', 'carry'],
}

/** 문서가 속한 phase (게이트 연결) */
export const DOC_PHASE = {
  prd: 'prd',
  plan: 'plan',
  design: 'design',
  'loop-check': 'loop-check',
  qa: 'qa',
  report: 'report',
  'master-plan': null,
}

/** 문서 → 게이트 */
export const DOC_GATE = {
  prd: 'G1',
  plan: 'G2',
  design: 'G3',
  'loop-check': 'G5',
  qa: 'G6',
  report: 'G7',
  'master-plan': null,
}

/** sprint 디렉토리 안에서의 상대 경로 */
export const DOC_PATH = {
  prd: '00-prd/prd.md',
  plan: '01-plan/plan.md',
  design: '02-design/design.md',
  'loop-check': '03-analysis/loop-check-{n}.md',
  qa: '03-analysis/qa.md',
  report: '04-report/report.md',
}

export function requiredSections(docType, profile = 'standard') {
  const table = REQUIRED_BY_PROFILE[profile] ?? SECTIONS
  return table[docType] ?? SECTIONS[docType] ?? []
}

export function isAutoBlock(docType, sectionId) {
  return (AUTO_BLOCKS[docType] ?? []).includes(sectionId)
}
