/**
 * 가드 매트릭스 — D13 §3
 *
 * **회귀 기준: false-negative 0, false-positive 0.**
 *
 * false-negative(못 막음)는 시크릿 유출이고,
 * false-positive(오탐)는 사용자가 가드를 끄게 만든다. 둘 다 치명적이다.
 * 전 권한 모드 × 전 케이스를 돈다.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import { judgeBash, judgeRead } from '../lib/guard/rules.js'

const here = dirname(fileURLToPath(import.meta.url))
const MATRIX = JSON.parse(readFileSync(join(here, 'fixtures/commands/guard-matrix.json'), 'utf8'))

const BYPASS = new Set(['bypassPermissions', 'dontAsk'])

/** SR1~SR3 은 모든 모드에서 deny. SR4 만 모드에 따라 escalate/warn. */
function isBlocked(verdict, rule, mode) {
  const d = verdict.decision
  if (rule === 'SR4') {
    return BYPASS.has(mode) ? d === 'warn' : d === 'escalate'
  }
  return d === 'deny'
}

test('positive: 전 모드에서 위반을 막는다 (false-negative 0)', () => {
  const failures = []
  for (const mode of MATRIX.modes) {
    for (const c of MATRIX.positive) {
      const v = judgeBash({ tool_input: { command: c.cmd }, permission_mode: mode })
      if (!isBlocked(v, c.rule, mode)) {
        failures.push({ mode, cmd: c.cmd, rule: c.rule, got: v.decision, note: c.note })
      }
    }
  }
  assert.deepEqual(failures, [], `막지 못한 케이스:\n${JSON.stringify(failures, null, 2)}`)
})

test('negative: 정상 명령을 막지 않는다 (false-positive 0)', () => {
  const failures = []
  for (const mode of MATRIX.modes) {
    for (const c of MATRIX.negative) {
      const v = judgeBash({ tool_input: { command: c.cmd }, permission_mode: mode })
      if (v.decision === 'deny' || v.decision === 'escalate') {
        failures.push({ mode, cmd: c.cmd, got: v.decision, code: v.code, note: c.note })
      }
    }
  }
  assert.deepEqual(failures, [], `오탐:\n${JSON.stringify(failures, null, 2)}`)
})

test('Read: 볼트만 막고 나머지는 통과', () => {
  const failures = []
  for (const p of MATRIX.reads.deny) {
    const v = judgeRead({ tool_input: { file_path: p } })
    if (v.decision !== 'deny') failures.push({ kind: 'false-negative', path: p, got: v.decision })
  }
  for (const p of MATRIX.reads.allow) {
    const v = judgeRead({ tool_input: { file_path: p } })
    if (v.decision === 'deny') failures.push({ kind: 'false-positive', path: p })
  }
  assert.deepEqual(failures, [], JSON.stringify(failures, null, 2))
})

test('SR1~SR3 의 deny 는 bypass 모드에서도 유지된다', () => {
  const hard = MATRIX.positive.filter((c) => c.rule !== 'SR4')
  for (const mode of ['bypassPermissions', 'dontAsk']) {
    for (const c of hard) {
      const v = judgeBash({ tool_input: { command: c.cmd }, permission_mode: mode })
      assert.equal(v.decision, 'deny', `${mode} 에서 ${c.cmd} 가 통과됨`)
    }
  }
})

test('매트릭스 자체가 비어 있지 않다', () => {
  assert.ok(MATRIX.positive.length >= 20, '위반 케이스가 너무 적다')
  assert.ok(MATRIX.negative.length >= 25, '정상 케이스가 너무 적다 — 오탐을 못 잡는다')
  assert.ok(MATRIX.modes.length >= 5)
})
