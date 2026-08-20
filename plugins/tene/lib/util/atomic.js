/**
 * 원자적 파일 쓰기 — D03 §8.1
 *
 * temp 파일 → fsync → rename. 같은 파일시스템 내 rename 은 원자적이다.
 * fsync 를 하는 이유: rename 은 원자적이지만 크래시 시 내용이 디스크에 없을 수 있다.
 */
import {
  appendFileSync, closeSync, copyFileSync, existsSync, fsyncSync,
  mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { assertInProject } from './paths.js'

let counter = 0

/**
 * @param {string} path  절대 경로
 * @param {string} content
 * @param {{ root?: string }} [opts]  root 를 주면 경로 이탈을 검사한다
 */
export function writeAtomic(path, content, opts = {}) {
  if (opts.root) assertInProject(path, opts.root)
  const dir = dirname(path)
  mkdirSync(dir, { recursive: true })
  const tmp = join(dir, `.tmp-${process.pid}-${Date.now()}-${counter++}`)
  try {
    writeFileSync(tmp, content, 'utf8')
    const fd = openSync(tmp, 'r')
    try {
      fsyncSync(fd)
    } finally {
      closeSync(fd)
    }
    renameSync(tmp, path)
  } catch (err) {
    try {
      if (existsSync(tmp)) unlinkSync(tmp)
    } catch {
      /* 정리 실패는 무시 */
    }
    throw err
  }
}

/** NDJSON append — 한 줄 = 한 이벤트. 부분 쓰기가 그 줄만 손상시킨다. */
export function appendLine(path, line, opts = {}) {
  if (opts.root) assertInProject(path, opts.root)
  mkdirSync(dirname(path), { recursive: true })
  appendFileSync(path, line.endsWith('\n') ? line : line + '\n', 'utf8')
}

export function readTextOrNull(path) {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return null
  }
}

/** 손상 파일을 .corrupt-<ts> 로 격리한다. 삭제하지 않는다. — D12 §4.1 */
export function quarantine(path) {
  const backup = `${path}.corrupt-${Date.now()}`
  try {
    renameSync(path, backup)
    return backup
  } catch {
    return null
  }
}

/** 마이그레이션 전 백업 — D12 §5.1 */
export function backupFile(path, tag) {
  const backup = `${path}.bak-${tag}-${Date.now()}`
  try {
    copyFileSync(path, backup)
    return backup
  } catch {
    return null
  }
}
