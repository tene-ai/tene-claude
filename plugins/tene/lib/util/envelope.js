/**
 * 응답 봉투 — D12 §1.4
 *
 * stdout 은 봉투 전용, 진단은 stderr.
 * --json 에서도 시크릿·원시 페이로드를 포함하지 않는다.
 */
import { lineJson } from './json.js'
import { wrapError, TeneError } from './errors.js'
import { elapsedMs } from './deadline.js'

export const SCHEMA_VERSION = 1

export function ok(tool, data, { warnings = [], t0 } = {}) {
  return {
    ok: true,
    tool,
    schemaVersion: SCHEMA_VERSION,
    ...(t0 !== undefined ? { elapsedMs: elapsedMs(t0) } : {}),
    data,
    warnings,
  }
}

export function fail(tool, err, { warnings = [], t0 } = {}) {
  const e = err instanceof TeneError ? err : wrapError(err)
  return {
    envelope: {
      ok: false,
      tool,
      schemaVersion: SCHEMA_VERSION,
      ...(t0 !== undefined ? { elapsedMs: elapsedMs(t0) } : {}),
      error: e.toJSON(),
      warnings,
    },
    exitCode: e.exitCode,
  }
}

/** 봉투를 stdout 으로 내보내고 종료 코드를 설정한다 */
export function emit(envelope, exitCode = 0) {
  process.stdout.write(lineJson(envelope) + '\n')
  process.exitCode = exitCode
}

/** bin 진입점 공통 러너 */
export async function run(tool, fn) {
  const t0 = performance.now()
  try {
    const data = await fn()
    emit(ok(tool, data, { t0 }), 0)
  } catch (err) {
    const { envelope, exitCode } = fail(tool, err, { t0 })
    emit(envelope, exitCode)
  }
}
