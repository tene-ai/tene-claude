import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lineJson, parseJsonSafe, sortKeys, stableJson } from '../../lib/util/json.js'

test('sortKeys — 객체 키를 재귀 정렬한다', () => {
  const out = sortKeys({ b: 1, a: { d: 2, c: 3 } })
  assert.deepEqual(Object.keys(out), ['a', 'b'])
  assert.deepEqual(Object.keys(out.a), ['c', 'd'])
})

test('sortKeys — 배열 순서는 보존한다', () => {
  assert.deepEqual(sortKeys({ x: [3, 1, 2] }).x, [3, 1, 2])
})

test('stableJson — 키 순서가 달라도 같은 출력', () => {
  assert.equal(stableJson({ a: 1, b: 2 }), stableJson({ b: 2, a: 1 }))
})

test('stableJson — trailing newline 이 있다', () => {
  assert.ok(stableJson({ a: 1 }).endsWith('}\n'))
})

test('lineJson — 개행이 없다', () => {
  assert.ok(!lineJson({ a: { b: 1 } }).includes('\n'))
})

test('parseJsonSafe — 실패 시 null', () => {
  assert.equal(parseJsonSafe('{broken'), null)
  assert.deepEqual(parseJsonSafe('{"a":1}'), { a: 1 })
})
