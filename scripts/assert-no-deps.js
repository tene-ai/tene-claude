#!/usr/bin/env node
/** 외부 의존 0 원칙 강제 — DEC-02, D01 §6.1 */
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync('plugins/tene/package.json', 'utf8'))
const deps = { ...pkg.dependencies, ...pkg.devDependencies }
const names = Object.keys(deps)

if (names.length > 0) {
  console.error(`외부 의존이 감지되었습니다: ${names.join(', ')}`)
  console.error('tene 플러그인은 외부 의존 0 원칙을 따릅니다 (DEC-02).')
  process.exit(1)
}
console.log('✔ 외부 의존 0 확인')
