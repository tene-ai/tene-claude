#!/usr/bin/env node
/**
 * 문서 정합성 검사 — 01-plan/05-design-review.md §8
 *
 * 설계 문서 간 용어·식별자·스키마 키 불일치를 자동 검출한다.
 * 이번 검토에서 발견한 9건 중 7건이 이 방식으로 잡히는 패턴이었다.
 *
 * 검증 문서(05-design-review.md, 12-relation-to-tene-codex.md)는
 * 결함을 *설명하기 위해* 옛 표현을 인용하므로 제외한다.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// 실행 위치와 무관하게 저장소 루트 기준으로 동작한다
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DOC_DIRS = ['docs/00-prd', 'docs/01-plan', 'docs/02-design'].map((d) => join(REPO, d))
const EXCLUDE = ['05-design-review.md', '12-relation-to-tene-codex.md']

/** 폐기된 표현 → 대체 표현 */
const DEPRECATED = [
  { pattern: /\.tene-flow\b/, replacement: '.tene-claude', why: '상태 디렉토리 확정 (DEC-11)' },
  { pattern: /\btrust_level\b/, replacement: 'profile + auto_until', why: 'Trust Level 폐기' },
  { pattern: /Trust Level L[0-4]/, replacement: 'Profile', why: 'Trust Level 폐기' },
  { pattern: /\bmax_check_loops\b/, replacement: 'max_loop_checks', why: 'userConfig 키 통일' },
  { pattern: /\bnot_measured\b/, replacement: 'insufficient', why: 'verdict 용어 통일' },
  { pattern: /상한 5회|기본 5회/, replacement: '3회', why: 'loop-check 상한 확정 (D3)' },
  { pattern: /name: 'tene-(qa-sweep|conformance-audit|understand-sweep)'/, replacement: "name: '<name>' (tene- 접두사 없이)", why: '플러그인 네임스페이스가 접두사를 붙인다' },
  { pattern: /문서가 합쳐질/, replacement: '필수 섹션 수만 줄어든다', why: 'light profile 은 파일을 합치지 않는다 (GAP-3)' },
  { pattern: /\/tene:check\b/, replacement: '/tene:loop-check', why: 'phase 명칭 확정' },
]

/** 전 문서에서 값이 하나여야 하는 식별자 */
const SINGLETONS = [
  { name: 'bin 스크립트', pattern: /bin\/tene-([a-z-]+)/g,
    expected: new Set(['state', 'doc', 'scan', 'loop', 'qa', 'report', 'gate', 'guard', 'hook']) },
]

let errors = 0
let filesScanned = 0

function scan() {
  for (const dir of DOC_DIRS) {
    let files
    try {
      files = readdirSync(dir).filter((f) => f.endsWith('.md') && !EXCLUDE.includes(f))
    } catch {
      continue
    }
    for (const file of files) {
      const path = join(dir, file).replace(REPO + '/', '')
      const text = readFileSync(join(dir, file), 'utf8')
      filesScanned++

      text.split('\n').forEach((line, i) => {
        for (const rule of DEPRECATED) {
          if (rule.pattern.test(line)) {
            console.error(`✖ ${path}:${i + 1}`)
            console.error(`  발견: ${line.trim().slice(0, 90)}`)
            console.error(`  대체: ${rule.replacement}  (${rule.why})`)
            errors++
          }
        }
      })

      for (const s of SINGLETONS) {
        for (const m of text.matchAll(s.pattern)) {
          if (!s.expected.has(m[1])) {
            console.error(`✖ ${path}: 알 수 없는 ${s.name}: bin/tene-${m[1]}`)
            console.error(`  허용: ${[...s.expected].map((x) => `bin/tene-${x}`).join(', ')}`)
            errors++
          }
        }
      }
    }
  }
}

scan()

if (errors > 0) {
  console.error(`\n문서 정합성 검사 실패: ${errors}건 (문서 ${filesScanned}개 검사)`)
  process.exit(1)
}
console.log(`✔ 문서 정합성 확인 (문서 ${filesScanned}개, 규칙 ${DEPRECATED.length + SINGLETONS.length}종)`)
