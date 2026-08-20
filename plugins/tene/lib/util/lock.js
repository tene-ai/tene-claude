/**
 * Advisory Lock — D12 §3.2
 *
 * O_EXCL 로 배타 생성. 30초 넘은 lock 은 죽은 프로세스로 보고 제거한다.
 * 훅은 이 lock 을 잡지 않는다 (200ms 예산 안에서 5초 대기는 불가능).
 */
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, unlinkSync, writeSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { hostname } from 'node:os'
import { TeneError } from './errors.js'
import { nowIso, olderThan } from './time.js'
import { STATE_DIR } from './paths.js'

const TIMEOUT_MS = 5000
const STALE_MS = 30000
const POLL_MS = 50

function sleepSync(ms) {
  const sab = new SharedArrayBuffer(4)
  Atomics.wait(new Int32Array(sab), 0, 0, ms)
}

export function lockPath(root) {
  return join(root, STATE_DIR, '.lock')
}

function processAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (e) {
    return e.code === 'EPERM'
  }
}

function isStale(path) {
  try {
    const info = JSON.parse(readFileSync(path, 'utf8'))
    if (olderThan(info.at, STALE_MS)) return true
    if (info.host === hostname() && !processAlive(info.pid)) return true
    return false
  } catch {
    return true // 파싱 실패 = stale
  }
}

function acquire(path) {
  const deadline = Date.now() + TIMEOUT_MS
  mkdirSync(dirname(path), { recursive: true })
  while (Date.now() < deadline) {
    try {
      const fd = openSync(path, 'wx')
      try {
        writeSync(fd, JSON.stringify({ pid: process.pid, host: hostname(), at: nowIso() }))
      } finally {
        closeSync(fd)
      }
      return
    } catch (e) {
      if (e.code !== 'EEXIST') throw e
      if (isStale(path)) {
        try {
          unlinkSync(path)
        } catch {
          /* 경쟁 상대가 이미 지웠을 수 있다 */
        }
        continue
      }
      sleepSync(POLL_MS)
    }
  }
  throw new TeneError('LOCK_TIMEOUT', { path })
}

function release(path) {
  try {
    if (existsSync(path)) unlinkSync(path)
  } catch {
    /* 무시 */
  }
}

/**
 * @template T
 * @param {string} root
 * @param {() => T | Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function withLock(root, fn) {
  const path = lockPath(root)
  acquire(path)
  try {
    return await fn()
  } finally {
    release(path)
  }
}

/** /tene:doctor 용 — lock 상태 조회 */
export function inspectLock(root) {
  const path = lockPath(root)
  if (!existsSync(path)) return { held: false }
  try {
    const info = JSON.parse(readFileSync(path, 'utf8'))
    return { held: true, ...info, stale: isStale(path) }
  } catch {
    return { held: true, stale: true, corrupt: true }
  }
}
