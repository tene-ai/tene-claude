import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  assertInProject, findProjectRoot, isConfigFile, isDocOrState,
  isStatePath, isTestFile, isVaultPath, toProjectRelative,
} from '../../lib/util/paths.js'
import { tmpProject } from '../helpers/tmp-project.js'

test('assertInProject — 루트 안 경로는 통과', () => {
  const p = tmpProject()
  try {
    assert.ok(assertInProject('a/b.json', p.root).startsWith(p.root))
  } finally {
    p.cleanup()
  }
})

test('assertInProject — 루트 밖 경로는 PATH_ESCAPE', () => {
  const p = tmpProject()
  try {
    assert.throws(() => assertInProject('../x', p.root), (e) => e.code === 'PATH_ESCAPE')
    assert.throws(() => assertInProject('/etc/passwd', p.root), (e) => e.code === 'PATH_ESCAPE')
  } finally {
    p.cleanup()
  }
})

test('isVaultPath — .tene/ 만 참, .tene-claude/ 는 거짓', () => {
  assert.equal(isVaultPath('.tene/vault.db'), true)
  assert.equal(isVaultPath('src/.tene/x'), true)
  assert.equal(isVaultPath('.tene-claude/state/current.json'), false)
  assert.equal(isVaultPath('.tenerc'), false)
})

test('isStatePath — 우리 상태 디렉토리를 인식한다', () => {
  assert.equal(isStatePath('.tene-claude/state/current.json'), true)
  assert.equal(isStatePath('src/app.ts'), false)
})

test('isDocOrState — 문서·상태를 인식한다', () => {
  assert.equal(isDocOrState('docs/sprints/x/00-prd/prd.md'), true)
  assert.equal(isDocOrState('README.md'), true)
  assert.equal(isDocOrState('src/app.ts'), false)
})

test('isConfigFile / isTestFile', () => {
  assert.equal(isConfigFile('package.json'), true)
  assert.equal(isConfigFile('tsconfig.json'), true)
  assert.equal(isConfigFile('src/app.ts'), false)
  assert.equal(isTestFile('src/app.test.ts'), true)
  assert.equal(isTestFile('tests/x.py'), true)
  assert.equal(isTestFile('pkg/foo_test.go'), true)
  assert.equal(isTestFile('src/app.ts'), false)
})

test('toProjectRelative — POSIX 상대 경로를 만든다', () => {
  const p = tmpProject()
  try {
    assert.equal(toProjectRelative(p.join('a/b.ts'), p.root), 'a/b.ts')
  } finally {
    p.cleanup()
  }
})

test('findProjectRoot — 마커가 있는 디렉토리를 찾는다', () => {
  const p = tmpProject({ 'package.json': '{}' })
  try {
    assert.equal(findProjectRoot(p.root), p.root)
  } finally {
    p.cleanup()
  }
})
