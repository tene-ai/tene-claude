/**
 * 훅 stdin 리더 — D05 §8.1
 *
 * EOF 를 기다리지 않는다. 호스트가 stdin 쓰기 끝을 열어두면 무한 대기하기 때문이다.
 * 완전한 JSON 이 되는 즉시 반환한다.
 */
import { readSync } from 'node:fs'

function sleepSync(ms) {
  const sab = new SharedArrayBuffer(4)
  Atomics.wait(new Int32Array(sab), 0, 0, ms)
}

/**
 * @param {number} [timeoutMs]
 * @param {{ strict?: boolean }} [opts]
 *   strict 면 **파싱 실패 시 예외를 던진다.** 시크릿 가드처럼 fail-closed 인 곳이 쓴다 —
 *   못 읽은 입력을 빈 객체로 바꾸면 "검사할 것이 없다" 로 읽혀 통과해버린다.
 *   입력 자체가 비어 있는 것(호출자가 페이로드를 안 준 것)은 예외가 아니다.
 * @returns {object} 파싱 실패 시 {} (strict 가 아니면)
 */
export function readStdinJson(timeoutMs = 1000, opts = {}) {
  const deadline = Date.now() + timeoutMs
  const buf = Buffer.alloc(65536)
  let text = ''

  while (Date.now() < deadline) {
    let n = 0
    try {
      n = readSync(0, buf, 0, buf.length, null)
    } catch (err) {
      if (err.code === 'EAGAIN') {
        sleepSync(5)
        continue
      }
      if (err.code === 'EOF') break
      break
    }
    if (n === 0) break
    text += buf.subarray(0, n).toString('utf8')
    try {
      return JSON.parse(text)
    } catch {
      /* 아직 불완전 — 계속 읽는다 */
    }
  }
  if (!text.trim()) return {} // 입력이 없는 것은 오류가 아니다
  try {
    return JSON.parse(text)
  } catch (err) {
    if (opts.strict) {
      const e = new Error(`stdin 이 올바른 JSON 이 아닙니다: ${err.message}`)
      e.code = 'STDIN_PARSE_FAILED'
      throw e
    }
    return {}
  }
}
