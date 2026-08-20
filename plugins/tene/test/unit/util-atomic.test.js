import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { appendLine, quarantine, readTextOrNull, writeAtomic } from '../../lib/util/atomic.js'
import { tmpProject } from '../helpers/tmp-project.js'

test('writeAtomic — 파일을 쓰고 임시 파일을 남기지 않는다', () => {
  const p = tmpProject()
  try {
    writeAtomic(p.join('a.json'), '{"x":1}')
    assert.equal(readFileSync(p.join('a.json'), 'utf8'), '{"x":1}')
    assert.equal(readdirSync(p.root).filter((f) => f.startsWith('.tmp-')).length, 0)
  } finally {
    p.cleanup()
  }
})

test('writeAtomic — 없는 디렉토리를 생성한다', () => {
  const p = tmpProject()
  try {
    writeAtomic(p.join('deep/nested/a.json'), '{}')
    assert.ok(existsSync(p.join('deep/nested/a.json')))
  } finally {
    p.cleanup()
  }
})

test('writeAtomic — 프로젝트 밖 경로를 거부한다', () => {
  const p = tmpProject()
  try {
    assert.throws(
      () => writeAtomic(p.join('../escape.json'), '{}', { root: p.root }),
      (e) => e.code === 'PATH_ESCAPE',
    )
  } finally {
    p.cleanup()
  }
})

test('appendLine — 개행을 보장한다', () => {
  const p = tmpProject()
  try {
    appendLine(p.join('e.ndjson'), '{"a":1}')
    appendLine(p.join('e.ndjson'), '{"b":2}\n')
    const lines = readFileSync(p.join('e.ndjson'), 'utf8').split('\n').filter(Boolean)
    assert.equal(lines.length, 2)
  } finally {
    p.cleanup()
  }
})

test('quarantine — 손상 파일을 .corrupt- 로 옮기고 원본을 지우지 않는다', () => {
  const p = tmpProject({ 'bad.json': '{broken' })
  try {
    const backup = quarantine(p.join('bad.json'))
    assert.ok(backup?.includes('.corrupt-'))
    assert.ok(existsSync(backup))
    assert.equal(existsSync(p.join('bad.json')), false)
  } finally {
    p.cleanup()
  }
})

test('readTextOrNull — 없는 파일은 null', () => {
  assert.equal(readTextOrNull('/nonexistent/x'), null)
})
