/**
 * 성능 벤치 — D12 §6.2
 *
 * **훅 로직 시간**을 잰다. 프로세스 총 시간이 아니다 —
 * Node 기동만 200ms 대이므로 그것까지 재면 어떤 최적화도 의미가 없다.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const PLUGIN = join(dirname(fileURLToPath(import.meta.url)), '..')
const N = 20

function median(xs) {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

function timeIt(fn, n = N) {
  const t = []
  for (let i = 0; i < n; i++) {
    const a = process.hrtime.bigint()
    fn()
    t.push(Number(process.hrtime.bigint() - a) / 1e6)
  }
  return median(t)
}

// ① Node 빈 기동 — 기준선
const baseline = timeIt(() => {
  execFileSync(process.execPath, ['-e', ''], { stdio: 'ignore' })
}, 10)

// ② 프로젝트 준비
const root = mkdtempSync(join(tmpdir(), 'tene-bench-'))
mkdirSync(join(root, '.git'), { recursive: true })
for (let i = 0; i < 200; i++) {
  const dir = join(root, 'src', `mod${i % 20}`)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `f${i}.ts`), [
    `import { helper } from '../mod${(i + 1) % 20}/f${(i + 1) % 200}'`,
    `export function fn${i}(input: Input${i}): Result${i} {`,
    `  return helper(input)`,
    `}`,
    `export class Cls${i} { method${i}(x: number) { return x } }`,
  ].join('\n'))
}

const cli = (tool, args) => execFileSync(process.execPath, [join(PLUGIN, 'bin', tool), '--project', root, ...args], { stdio: 'pipe' })

console.log(`기준선 (node -e '')          : ${baseline.toFixed(0)}ms`)
console.log('')

// ③ 인덱스 빌드 (200 파일)
const buildFull = timeIt(() => cli('tene-scan', ['build', '--force']), 3)
const buildInc = timeIt(() => cli('tene-scan', ['build']), 5)
console.log(`인덱스 전체 빌드 (200 파일)   : ${buildFull.toFixed(0)}ms  (로직 ${(buildFull - baseline).toFixed(0)}ms)`)
console.log(`인덱스 증분 (변경 없음)       : ${buildInc.toFixed(0)}ms  (로직 ${(buildInc - baseline).toFixed(0)}ms)`)

// ④ 훅 — 실제 예산 대상
cli('tene-state', ['init', '--id', 'b', '--slug', 's', '--title', 'x'])
const hook = (event, input) => timeIt(() => {
  execFileSync(process.execPath, [join(PLUGIN, 'bin', 'tene-hook'), event], {
    cwd: root, input: JSON.stringify(input), stdio: 'pipe',
  })
})

const sessionStart = hook('session-start', {})
const postEdit = hook('post-edit', { tool_input: { file_path: join(root, 'src/mod0/f0.ts') } })
const userPrompt = hook('user-prompt', { prompt: '이거 QA 해줘' })

console.log('')
console.log(`SessionStart 훅               : ${sessionStart.toFixed(0)}ms  (로직 ${(sessionStart - baseline).toFixed(0)}ms)`)
console.log(`PostToolUse 훅                : ${postEdit.toFixed(0)}ms  (로직 ${(postEdit - baseline).toFixed(0)}ms)`)
console.log(`UserPromptSubmit 훅           : ${userPrompt.toFixed(0)}ms  (로직 ${(userPrompt - baseline).toFixed(0)}ms)`)

// ⑤ 가드 — fail-closed 이므로 느리면 전부 막힌다
const guard = timeIt(() => {
  execFileSync(process.execPath, [join(PLUGIN, 'bin', 'tene-guard'), '--event', 'pretooluse-bash'], {
    input: JSON.stringify({ tool_input: { command: 'npm test && node --test' } }), stdio: 'pipe',
  })
})
console.log(`시크릿 가드                   : ${guard.toFixed(0)}ms  (로직 ${(guard - baseline).toFixed(0)}ms)`)

rmSync(root, { recursive: true, force: true })

// 로직 예산 검사 — D12 §6.2
const BUDGET = { SessionStart: 150, PostToolUse: 150, UserPromptSubmit: 100, Guard: 300 }
const actual = {
  SessionStart: sessionStart - baseline,
  PostToolUse: postEdit - baseline,
  UserPromptSubmit: userPrompt - baseline,
  Guard: guard - baseline,
}
const over = Object.entries(BUDGET).filter(([k, v]) => actual[k] > v)

console.log('')
if (over.length) {
  console.error('✖ 로직 예산 초과:')
  for (const [k, v] of over) console.error(`   ${k}: ${actual[k].toFixed(0)}ms > ${v}ms`)
  process.exit(1)
}
console.log('✔ 모든 훅이 로직 예산 안에 있습니다')
