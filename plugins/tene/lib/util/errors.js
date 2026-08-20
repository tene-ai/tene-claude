/**
 * 오류 모델 — D12 §1
 *
 * 모든 오류는 code / detail / hint / exitCode 를 갖는다.
 * hint 는 "사용자가 할 수 있는 행동"이며 비어 있으면 안 된다.
 */

/** D12 §1.2 종료 코드 */
export const EXIT = {
  OK: 0,
  GENERAL: 1,
  BLOCK: 2,
  PRECONDITION: 3,
  CONFLICT: 4,
  CAPABILITY: 5,
  SECURITY: 6,
  IO: 7,
  CHILD: 8,
  INTERNAL: 10,
}

/**
 * D12 §1.3 오류 코드 표
 * @type {Record<string, { exit: number, message: (d: object) => string, hint: (d: object) => string }>}
 */
export const CODES = {
  NO_ACTIVE_SPRINT: {
    exit: EXIT.PRECONDITION,
    message: () => '진행 중인 sprint 가 없습니다',
    hint: () => '/tene:sprint init <id> 로 시작하세요',
  },
  SPRINT_NOT_FOUND: {
    exit: EXIT.PRECONDITION,
    message: (d) => `sprint 를 찾을 수 없습니다: ${d.id}`,
    hint: () => '/tene:sprint list 로 목록을 확인하세요',
  },
  SPRINT_EXISTS: {
    exit: EXIT.PRECONDITION,
    message: (d) => `sprint 가 이미 존재합니다: ${d.id}`,
    hint: () => '다른 id 를 쓰거나 /tene:sprint status 로 확인하세요',
  },
  SPRINT_DIR_NOT_FOUND: {
    exit: EXIT.PRECONDITION,
    message: (d) => `${d.docsRoot}/ 아래에 ${d.id} 디렉토리가 없습니다`,
    hint: () => '문서가 정본입니다. 디렉토리 이름이 <id>-<slug> 형식인지 확인하세요',
  },
  INVALID_ID: {
    exit: EXIT.PRECONDITION,
    message: (d) => `sprint id 형식이 올바르지 않습니다: ${d.id}`,
    hint: () => '소문자로 시작하고 소문자·숫자·하이픈만 사용하세요 (최대 32자)',
  },
  PHASE_MISMATCH: {
    exit: EXIT.PRECONDITION,
    message: (d) => `현재 phase 는 ${d.actual} 인데 ${d.expected} 가 필요합니다`,
    hint: (d) => `/tene:${d.actual} 를 먼저 실행하세요`,
  },
  INVALID_TRANSITION: {
    exit: EXIT.BLOCK,
    message: (d) => `허용되지 않는 전이입니다: ${d.from} → ${d.to}`,
    hint: (d) => `허용된 전이: ${(d.allowed ?? []).join(', ') || '없음'}`,
  },
  GATE_BLOCKED: {
    exit: EXIT.PRECONDITION,
    message: (d) => `${d.gate} 게이트를 통과하지 못했습니다`,
    hint: (d) => d.remediation ?? '차단 원인을 해소한 뒤 다시 시도하세요',
  },
  DOC_MISSING: {
    exit: EXIT.PRECONDITION,
    message: (d) => `문서가 없습니다: ${d.path ?? d.doc}`,
    hint: (d) => `/tene:${d.doc ?? 'prd'} 로 문서를 만드세요`,
  },
  DOC_INVALID: {
    exit: EXIT.PRECONDITION,
    message: (d) => `문서 검증 실패: ${d.path}`,
    hint: (d) => `누락 항목: ${(d.failed ?? []).join(', ')}`,
  },
  AUTO_BLOCK_UNPAIRED: {
    exit: EXIT.IO,
    message: (d) => `자동 생성 블록의 start/end 쌍이 맞지 않습니다: ${d.block}`,
    hint: (d) => `${d.path ?? '문서'} 를 직접 열어 <!-- tene:auto:end --> 를 확인하세요`,
  },
  STALE_WRITE: {
    exit: EXIT.CONFLICT,
    message: () => '다른 세션이 이 상태를 먼저 변경했습니다',
    hint: () => '/tene:status 로 최신 상태를 확인한 뒤 다시 시도하세요',
  },
  LOCK_TIMEOUT: {
    exit: EXIT.CONFLICT,
    message: () => '상태 잠금을 얻지 못했습니다',
    hint: () => '/tene:doctor 로 lock 상태를 확인하세요',
  },
  STATE_CORRUPT: {
    exit: EXIT.IO,
    message: (d) => `상태 파일이 손상되었습니다: ${d.path}`,
    hint: (d) =>
      `${d.backup ? `원본은 ${d.backup} 에 보존했습니다. ` : ''}` +
      `/tene:status ${d.id ?? ''} --resync 로 문서에서 복구하세요`,
  },
  SCHEMA_TOO_NEW: {
    exit: EXIT.IO,
    message: (d) => `상태 스키마 버전이 너무 높습니다 (파일 ${d.found} > 지원 ${d.supported})`,
    hint: () => '/plugin update tene@agent-kay-it 로 플러그인을 업데이트하세요',
  },
  MIGRATION_FAILED: {
    exit: EXIT.IO,
    message: (d) => `스키마 마이그레이션 실패 (${d.from} → ${d.to})`,
    hint: (d) => `원본은 ${d.backup} 에 있습니다`,
  },
  INDEX_MISSING: {
    exit: EXIT.CAPABILITY,
    message: () => '코드 인덱스가 없습니다',
    hint: () => 'tene-scan build 로 인덱스를 생성하세요',
  },
  INDEX_STALE: {
    exit: EXIT.OK,
    message: (d) => `인덱스가 낡았습니다 (변경 파일 ${d.changed ?? '?'}개)`,
    hint: () => 'tene-scan build --incremental 로 갱신하세요',
  },
  LANG_UNSUPPORTED: {
    exit: EXIT.OK,
    message: (d) => `지원하지 않는 언어입니다: ${d.ext}`,
    hint: () => '이 파일은 에이전트 조사(Tier 3)로 처리됩니다',
  },
  NO_TEST_RUNNER: {
    exit: EXIT.CAPABILITY,
    message: () => '테스트 러너를 찾지 못했습니다',
    hint: () => 'UNIT 검증은 insufficient 로 보고됩니다',
  },
  NO_BROWSER: {
    exit: EXIT.CAPABILITY,
    message: () => '브라우저 드라이버를 찾지 못했습니다',
    hint: () => 'UX 검증은 insufficient 로 보고됩니다',
  },
  TENE_CLI_MISSING: {
    exit: EXIT.CAPABILITY,
    message: () => 'tene CLI 가 설치되어 있지 않습니다',
    hint: () => '시크릿 기능은 비활성화됩니다 (선택 사항)',
  },
  PATH_ESCAPE: {
    exit: EXIT.SECURITY,
    message: (d) => `프로젝트 루트 밖 경로입니다: ${d.path}`,
    hint: () => 'tene 는 프로젝트 루트 밖에 쓰지 않습니다',
  },
  GUARD_ERROR: {
    exit: EXIT.SECURITY,
    message: () => '시크릿 가드가 명령을 검사하지 못했습니다',
    hint: () => '안전을 위해 차단합니다. /tene:doctor 로 진단하세요',
  },
  WORKFLOW_UNAVAILABLE: {
    exit: EXIT.OK,
    message: () => 'Dynamic Workflow 를 사용할 수 없습니다',
    hint: () => '순차 실행으로 대체합니다',
  },
  WAIVER_NO_REASON: {
    exit: EXIT.PRECONDITION,
    message: (d) => `${d.ac} 의 예외 승인에 사유가 없습니다`,
    hint: () => '사유 없는 예외는 다음 sprint 에서 왜 넘겼는지 알 수 없습니다. --reason 을 쓰세요',
  },
  AC_NOT_FOUND: {
    exit: EXIT.PRECONDITION,
    message: (d) => `수용 기준을 찾을 수 없습니다: ${d.id}`,
    hint: () => '/tene:status 로 AC 목록을 확인하세요',
  },
  EVIDENCE_MISSING: {
    exit: EXIT.PRECONDITION,
    message: () => '증거 매니페스트가 없습니다',
    hint: () => '/tene:qa 로 검증을 실행하면 증거가 수집됩니다',
  },
  BAD_ARGS: {
    exit: EXIT.PRECONDITION,
    message: (d) => `인자가 올바르지 않습니다: ${d.need ?? ''}`.trim(),
    hint: (d) => (d.cause ? `원인: ${d.cause}` : '--help 로 사용법을 확인하세요'),
  },
  UNKNOWN_COMMAND: {
    exit: EXIT.PRECONDITION,
    message: (d) => `알 수 없는 명령입니다: ${d.command}`,
    hint: (d) => `사용 가능: ${(d.available ?? []).join(', ')}`,
  },
  PROJECT_NOT_FOUND: {
    exit: EXIT.PRECONDITION,
    message: () => '프로젝트 루트를 찾지 못했습니다',
    hint: () => 'git 저장소 안에서 실행하거나 --project 로 지정하세요',
  },
}

export class TeneError extends Error {
  /**
   * @param {string} code   CODES 의 키
   * @param {object} [detail]
   * @param {string} [hint] 기본 hint 를 덮어쓸 때
   */
  constructor(code, detail = {}, hint) {
    const spec = CODES[code]
    super(spec ? spec.message(detail) : code)
    this.name = 'TeneError'
    this.code = code
    this.detail = detail
    this.hint = hint ?? (spec ? spec.hint(detail) : undefined)
    this.exitCode = spec ? spec.exit : EXIT.GENERAL
  }

  toJSON() {
    return { code: this.code, message: this.message, detail: this.detail, hint: this.hint }
  }
}

/** 알 수 없는 예외를 TeneError 로 감싼다 */
export function wrapError(err) {
  if (err instanceof TeneError) return err
  const e = new TeneError('UNKNOWN_COMMAND', {}, undefined)
  e.code = 'INTERNAL'
  e.message = err?.message ?? String(err)
  e.detail = { stack: err?.stack }
  e.hint = 'TENE_DEBUG=1 로 다시 실행하면 상세 내용을 볼 수 있습니다'
  e.exitCode = EXIT.INTERNAL
  return e
}
