#!/usr/bin/env node
/** plugin.json ↔ package.json 버전 동기화 — D01 §6.2 */
import { readFileSync, writeFileSync } from 'node:fs'

const MANIFEST = 'plugins/tene/.claude-plugin/plugin.json'
const PKG = 'plugins/tene/package.json'
const check = process.argv.includes('--check')

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'))
const pkg = JSON.parse(readFileSync(PKG, 'utf8'))

if (manifest.version === pkg.version) {
  console.log(`✔ 버전 동기화 확인: ${manifest.version}`)
  process.exit(0)
}
if (check) {
  console.error(`버전 불일치: plugin.json=${manifest.version} package.json=${pkg.version}`)
  console.error('plugin.json 이 정본입니다. node scripts/sync-version.js 로 맞추세요.')
  process.exit(1)
}
pkg.version = manifest.version
writeFileSync(PKG, JSON.stringify(pkg, null, 2) + '\n')
console.log(`✔ package.json 버전을 ${manifest.version} 으로 맞췄습니다`)
