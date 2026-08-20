/** 스키마 마이그레이션 — D12 §5 */
import { backupFile } from '../util/atomic.js'
import { TeneError } from '../util/errors.js'
import { SCHEMA_VERSION } from './schema.js'

/** version → (state) => state. 각 단계는 순수 함수이고 한 버전씩만 올린다. */
const MIGRATIONS = {
  // 2: (s) => ({ ...s, newField: default }),
}

export function migrate(state, path) {
  const v = state?.schemaVersion ?? 0

  if (v === SCHEMA_VERSION) return state

  if (v > SCHEMA_VERSION) {
    // 상위 버전은 읽기 전용. 파일을 수정하지 않는다.
    throw new TeneError('SCHEMA_TOO_NEW', { found: v, supported: SCHEMA_VERSION })
  }

  const backup = backupFile(path, `v${v}`)
  let s = state
  try {
    for (let i = v + 1; i <= SCHEMA_VERSION; i++) {
      const fn = MIGRATIONS[i]
      if (!fn) {
        // v0 (schemaVersion 없음) → v1 은 필드 추가만이므로 통과시킨다
        if (i === 1) { s = { ...s, schemaVersion: 1 }; continue }
        throw new Error(`migration ${i - 1} → ${i} 없음`)
      }
      s = fn(s)
      s.schemaVersion = i
    }
  } catch (err) {
    throw new TeneError('MIGRATION_FAILED', { from: v, to: SCHEMA_VERSION, backup, cause: err.message })
  }
  return s
}
