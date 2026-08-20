#!/usr/bin/env node
/**
 * 도달성 계측기 — sprint wiring-conformance, design §4 L1
 *
 * 진입점에서 각 **export** 까지 도달 경로가 있는가를 잰다.
 * tene 자신은 이 축을 보지 않는다 — 4계층(배치), Q1·Q2(존재), Q3·Q4(참조)만 본다.
 * 배선 누락은 그 셋이 전부 정상인데 도달만 안 되는 상태라서 통과한다.
 *
 * 분류 단위는 **파일이 아니라 export** 다 (`파일#심볼`).
 * 파일이 도달 가능해도 그 파일의 모든 export 가 쓰인다는 뜻은 아니지만,
 * 정적 import 그래프로는 모듈 단위까지가 한계다 — 그 사실을 결과에 명시한다.
 *
 * 플러그인 밖의 독립 스크립트다. `lib/` 에 넣으면 이 코드 자신이 배선을 필요로 하고,
 * 그건 이 스크립트가 조사하는 바로 그 실패다.
 *
 * 사용: node evals/reachability.mjs <플러그인 루트> [--json]
 */
import { readFileSync, readdirSync, existsSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, dirname, relative, resolve } from 'node:path'
import { tmpdir } from 'node:os'

// ── 공용 ───────────────────────────────────────────────────────────────
function walk(dir, out = []) {
  if (!existsSync(dir)) return out
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue
    const p = join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}

const isCode = (p) => p.endsWith('.js') || p.endsWith('.mjs') || /\/bin\/tene-[a-z-]+$/.test(p)

/** `.js` 를 떼어 정규화한 키. 확장자 유무를 흡수한다. */
function key(p) {
  const n = resolve(p)
  return n.endsWith('.js') ? n.slice(0, -3) : n
}

const STATIC_IMPORT = /(?:^|\n)\s*import\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g
/** `() => import('...')` — 동적 등록표. 정적 그래프에는 안 잡힌다. */
const DYNAMIC_IMPORT = /import\(\s*['"]([^'"]+)['"]\s*\)/g
/** 이름이 붙은 export — 분류의 단위 */
const EXPORT_DECL = /(?:^|\n)export\s+(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/g

function readOr(file, fallback = '') {
  try { return readFileSync(file, 'utf8') } catch { return fallback }
}

function exportsOf(file) {
  const text = readOr(file)
  const out = []
  EXPORT_DECL.lastIndex = 0
  let m
  while ((m = EXPORT_DECL.exec(text))) out.push(m[1])
  return [...new Set(out)]
}

/**
 * named import 로 실제로 가져다 쓰는 심볼 — 이것이 심볼 단위 도달의 근거다.
 * `import { a, b as c } from './m'` → m 의 a, b 가 쓰인다.
 * `import * as ns from './m'` 는 무엇을 쓰는지 알 수 없으므로 별도로 표시한다.
 */
const NAMED_IMPORT = /(?:^|\n)\s*import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g
const NS_IMPORT = /(?:^|\n)\s*import\s*\*\s*as\s+([A-Za-z_$][\w$]*)\s+from\s*['"]([^'"]+)['"]/g

function symbolUsesOf(file) {
  const text = readOr(file)
  const named = new Map()   // moduleKey → Set(심볼)
  const ns = new Map()      // moduleKey → Set(심볼)  (ns.foo 접근을 훑어 채운다)

  NAMED_IMPORT.lastIndex = 0
  let m
  while ((m = NAMED_IMPORT.exec(text))) {
    if (!m[2].startsWith('.')) continue
    const k = key(join(dirname(file), m[2]))
    if (!named.has(k)) named.set(k, new Set())
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/)[0].trim()
      if (name) named.get(k).add(name)
    }
  }

  NS_IMPORT.lastIndex = 0
  while ((m = NS_IMPORT.exec(text))) {
    if (!m[2].startsWith('.')) continue
    const k = key(join(dirname(file), m[2]))
    const alias = m[1]
    if (!ns.has(k)) ns.set(k, new Set())
    // `alias.foo` 를 전부 긁는다
    const acc = new RegExp(`\\b${alias}\\.([A-Za-z_$][\\w$]*)`, 'g')
    let a
    while ((a = acc.exec(text))) ns.get(k).add(a[1])
  }
  // 동적 import 를 하는 파일은 모듈 객체를 변수로 받아 `mod.run(...)` 처럼 부른다.
  // 어느 모듈의 어느 심볼인지 정적으로 못 가른다 — 그래서 **과대근사**한다.
  // 이 파일이 동적 import 하는 모든 모듈에 대해, 이 파일의 모든 멤버 접근을 후보로 넣는다.
  // 죽은 코드를 찾는 도구에서는 미탐(놓침)이 오탐(멀쩡한 걸 죽었다 함)보다 안전하다.
  const dynTargets = []
  DYNAMIC_IMPORT.lastIndex = 0
  while ((m = DYNAMIC_IMPORT.exec(text))) {
    if (m[1].startsWith('.')) dynTargets.push(key(join(dirname(file), m[1])))
  }
  const dynMembers = new Map()
  if (dynTargets.length) {
    const members = new Set()
    for (const a of text.matchAll(/\.([A-Za-z_$][\w$]*)\s*\(/g)) members.add(a[1])
    for (const k of dynTargets) dynMembers.set(k, members)
  }

  return { named, ns, dynMembers }
}

function edgesOf(file) {
  const text = readOr(file)
  const grab = (re) => {
    const out = []
    re.lastIndex = 0
    let m
    while ((m = re.exec(text))) {
      if (!m[1].startsWith('.')) continue
      out.push(key(join(dirname(file), m[1])))
    }
    return out
  }
  return { statik: grab(STATIC_IMPORT), dynamic: grab(DYNAMIC_IMPORT) }
}

// ── 진입점 ─────────────────────────────────────────────────────────────
function entrypoints(root) {
  const found = new Map()
  const add = (abs, source) => {
    if (!existsSync(abs)) return
    const k = key(abs)
    if (!found.has(k)) found.set(k, [])
    found.get(k).push(source)
  }

  const hooks = join(root, 'hooks/hooks.json')
  if (existsSync(hooks)) {
    for (const m of readOr(hooks).matchAll(/bin\/(tene-[a-z-]+)/g)) add(join(root, 'bin', m[1]), 'hooks.json')
  }

  const skills = join(root, 'skills')
  if (existsSync(skills)) {
    for (const s of readdirSync(skills)) {
      const f = join(skills, s, 'SKILL.md')
      if (!existsSync(f)) continue
      for (const m of readOr(f).matchAll(/bin\/(tene-[a-z-]+)/g)) add(join(root, 'bin', m[1]), `skills/${s}`)
    }
  }

  const wf = join(root, 'workflows')
  if (existsSync(wf)) for (const w of readdirSync(wf)) if (w.endsWith('.js')) add(join(wf, w), 'workflow')

  const bin = join(root, 'bin')
  if (existsSync(bin)) for (const b of readdirSync(bin)) add(join(bin, b), 'bin (직접 실행 가능)')

  return found
}

function reach(startKeys, follow) {
  const seen = new Set()
  const path = new Map()
  const queue = []
  for (const k of startKeys) { seen.add(k); path.set(k, [k]); queue.push(k) }
  while (queue.length) {
    const cur = queue.shift()
    const file = existsSync(cur) ? cur : `${cur}.js`
    if (!existsSync(file)) continue
    const e = edgesOf(file)
    const next = follow === 'both' ? [...e.statik, ...e.dynamic] : e.statik
    for (const n of next) {
      if (seen.has(n)) continue
      seen.add(n); path.set(n, [...(path.get(cur) ?? [cur]), n]); queue.push(n)
    }
  }
  return { seen, path }
}

// ── 분류 (재사용 가능 — 합성 검사가 같은 함수를 태운다) ────────────────
function classifyTree(root) {
  const rel = (p) => relative(root, p).split('\\').join('/')
  const eps = entrypoints(root)
  const epKeys = [...eps.keys()]
  const statik = reach(epKeys, 'statik')
  const both = reach(epKeys, 'both')

  const libFiles = walk(join(root, 'lib')).filter(isCode)
  const testFiles = walk(join(root, 'test')).filter(isCode)

  const testImporters = new Map()
  for (const t of testFiles) {
    for (const k of edgesOf(t).statik) {
      if (!testImporters.has(k)) testImporters.set(k, [])
      testImporters.get(k).push(rel(t))
    }
  }

  // 심볼 사용 집계 — 프로덕션(진입점에서 도달하는 파일)과 테스트를 분리한다
  const prodFiles = [...statik.seen, ...both.seen]
    .map((k) => (existsSync(k) ? k : `${k}.js`))
    .filter((p) => existsSync(p))
  const usedBy = new Map()   // `모듈키#심볼` → Set(사용처 rel)
  const noteUse = (modKey, sym, from) => {
    const id = `${modKey}#${sym}`
    if (!usedBy.has(id)) usedBy.set(id, new Set())
    usedBy.get(id).add(from)
  }
  const approx = new Set()   // 과대근사로 잡힌 (모듈#심볼)
  const named0 = new Set()   // named import / ns 접근으로 확실히 쓰이는 것
  for (const src of [...prodFiles, ...testFiles]) {
    const { named, ns, dynMembers } = symbolUsesOf(src)
    for (const [k, syms] of named) for (const s of syms) { noteUse(k, s, rel(src)); named0.add(`${k}#${s}`) }
    for (const [k, syms] of ns) for (const s of syms) { noteUse(k, s, rel(src)); named0.add(`${k}#${s}`) }
    for (const [k, syms] of dynMembers ?? []) {
      for (const s of syms) { noteUse(k, s, rel(src)); approx.add(`${k}#${s}`) }
    }
  }

  const byFile = {}
  for (const f of libFiles) {
    const k = key(f)
    let classification, path
    if (statik.seen.has(k)) {
      classification = 'reachable'
      path = (statik.path.get(k) ?? []).map((x) => rel(existsSync(x) ? x : `${x}.js`))
    } else if (both.seen.has(k)) {
      classification = 'dynamic'
      path = (both.path.get(k) ?? []).map((x) => rel(existsSync(x) ? x : `${x}.js`))
    } else if (testImporters.has(k)) {
      classification = 'test-only'
      path = testImporters.get(k)          // 어느 테스트에서 도달했는지가 경로다
    } else {
      classification = 'unreachable'
      path = []                            // 도달 경로가 없다는 것이 분류의 근거다
    }
    // 심볼 단위 분류 — 모듈이 도달 가능해도 그 심볼을 아무도 named import 하지 않으면 도달이 아니다
    const exps = exportsOf(f)
    const bySymbol = {}
    for (const s of exps) {
      const users = [...(usedBy.get(`${k}#${s}`) ?? [])]
      const prodUsers = users.filter((u) => !u.startsWith('test/'))
      const testUsers = users.filter((u) => u.startsWith('test/'))
      let symCls
      if (classification === 'unreachable') symCls = 'unreachable'
      else if (prodUsers.length) symCls = classification === 'dynamic' ? 'dynamic' : 'reachable'
      else if (testUsers.length) symCls = 'test-only'
      else symCls = 'unreachable'          // 모듈은 닿지만 이 심볼을 아무도 안 부른다
      bySymbol[s] = {
        classification: symCls, usedBy: users, prodUsers, testUsers,
        // 이 심볼의 사용 근거가 과대근사(동적 멤버 접근)뿐이면 그렇게 표시한다
        approximated: approx.has(`${k}#${s}`) && !named0.has(`${k}#${s}`),
      }
    }
    byFile[rel(f)] = { classification, exports: exps, path, bySymbol }
  }
  return { byFile, entrypoints: eps, rel, libFiles }
}

// ── 합성 음성 사례 — unreachable 분기를 실제로 태운다 ─────────────────
/**
 * `unreachable: 0` 이 "없다" 인지 "못 잡는다" 인지 구분하려면
 * 분류기가 그 분기를 실제로 내는 것을 봐야 한다. 알려진 정답만으로는 부족하다.
 */
function syntheticCheck() {
  const dir = mkdtempSync(join(tmpdir(), 'reach-'))
  mkdirSync(join(dir, 'bin'), { recursive: true })
  mkdirSync(join(dir, 'lib'), { recursive: true })
  mkdirSync(join(dir, 'test'), { recursive: true })
  mkdirSync(join(dir, 'hooks'), { recursive: true })
  writeFileSync(join(dir, 'bin', 'tene-x'), "import { a } from '../lib/wired.js'\na()\n")
  writeFileSync(join(dir, 'lib', 'wired.js'), 'export function a(){}\n')
  writeFileSync(join(dir, 'lib', 'orphan.js'), 'export function b(){}\n')
  writeFileSync(join(dir, 'lib', 'testonly.js'), 'export function c(){}\n')
  writeFileSync(join(dir, 'lib', 'dyn.js'), 'export function d(){}\n')
  writeFileSync(join(dir, 'bin', 'tene-y'), "const H={ x: () => import('../lib/dyn.js') }\nexport default H\n")
  writeFileSync(join(dir, 'test', 't.test.js'), "import { c } from '../lib/testonly.js'\nc()\n")

  const { byFile } = classifyTree(dir)
  const want = {
    'lib/wired.js': 'reachable',
    'lib/orphan.js': 'unreachable',
    'lib/testonly.js': 'test-only',
    'lib/dyn.js': 'dynamic',
  }
  const rows = Object.entries(want).map(([f, w]) => ({ file: f, want: w, got: byFile[f]?.classification ?? 'not-found' }))
  const bad = rows.filter((r) => r.want !== r.got)
  return {
    kind: 'synthetic',
    detail: '임시 디렉토리에 배선·미배선·테스트전용·동적 모듈을 만들어 분류기를 태웠다',
    rows,
    ok: bad.length === 0,
    tmpDir: dir,
  }
}

// ── 실행 ───────────────────────────────────────────────────────────────
const root = resolve(process.argv[2] ?? '.')
const asJson = process.argv.includes('--json')

const { byFile, entrypoints: eps, rel } = classifyTree(root)

const classified = { reachable: [], dynamic: [], 'test-only': [], unreachable: [] }
const paths = {}
for (const [file, info] of Object.entries(byFile)) {
  if (!info.exports.length) {
    const id = `${file}#(no named export)`
    classified[info.classification].push(id)
    paths[id] = { module: info.path, symbolUsers: [] }
    continue
  }
  for (const e of info.exports) {
    const s = info.bySymbol[e]
    const id = `${file}#${e}`
    classified[s.classification].push(id)
    // 경로는 두 겹이다 — 모듈까지 어떻게 갔는가, 그 심볼을 누가 부르는가
    paths[id] = { module: info.path, symbolUsers: s.usedBy }
  }
}

// 알려진 정답 (실물 트리) + 합성 음성 사례
const EXPECT = {
  'lib/plan/aggregate.js': 'test-only',
  'lib/hooks/session-start.js': 'dynamic',
  'lib/state/store.js': 'reachable',
}
const knownChecks = Object.entries(EXPECT).map(([file, want]) => ({
  kind: 'known', file, want, got: byFile[file]?.classification ?? 'not-found',
  ok: (byFile[file]?.classification ?? null) === want,
}))
const synthetic = syntheticCheck()

// 심볼 단위 자체 검사 — 파일 단위 검사만으로는 이번 회차의 로직을 태우지 못한다
const SYMBOL_EXPECT = {
  'lib/state/store.js#advance': 'reachable',            // 네임스페이스 접근으로 쓰임
  'lib/plan/aggregate.js#promote': 'test-only',         // 테스트만 부름
  'lib/hooks/session-start.js#run': 'dynamic',          // HANDLERS 로 디스패치
  'lib/doc/sections.js#isAutoBlock': 'unreachable',     // 아무도 안 부름 (grep 확인)
  'lib/doc/sections.js#DOC_PATH': 'reachable',          // bin/tene-doc:16 named import
}
const symbolChecks = Object.entries(SYMBOL_EXPECT).map(([id, want]) => {
  const [f, s] = id.split('#')
  const got = byFile[f]?.bySymbol?.[s]?.classification ?? 'not-found'
  return { kind: 'symbol', id, want, got, ok: got === want }
})
const trustworthy = knownChecks.every((c) => c.ok) && synthetic.ok && symbolChecks.every((c) => c.ok)

const result = {
  unit: 'export — `파일#심볼`. 파일 단위가 아니다.',
  method: '두 단계다. (1) 진입점에서 모듈까지 import 그래프 BFS. (2) 각 export 를 named import / 네임스페이스 접근(ns.foo)으로 실제 사용하는 곳을 찾는다. 모듈이 도달 가능해도 그 심볼을 아무도 안 부르면 unreachable 이다.',
  limitation: '동적 접근(obj[name])·재-export·기본 export 는 추적하지 못한다. 그 경우 unreachable 오탐이 날 수 있으므로 결과를 미배선 확정이 아니라 후보로 읽어야 한다.',
  root,
  entrypoints: [...eps.entries()].map(([k, s]) => ({ file: rel(existsSync(k) ? k : `${k}.js`), sources: [...new Set(s)] })),
  totals: {
    libFiles: Object.keys(byFile).length,
    exports: Object.values(classified).reduce((n, v) => n + v.length, 0),
    reachable: classified.reachable.length,
    dynamic: classified.dynamic.length,
    'test-only': classified['test-only'].length,
    unreachable: classified.unreachable.length,
  },
  classified,
  byFile,
  paths,
  selfCheck: { known: knownChecks, synthetic, symbol: symbolChecks },
  approximationNote: 'dynamic 으로 분류된 심볼 중 approximated:true 인 것은 동적 멤버 접근으로만 근거가 있다. 정확한 사용처를 특정하지 못한 과대근사이며, 죽은 코드 오탐을 피하려 의도적으로 넓게 잡았다.',
  trustworthy,
  note: trustworthy
    ? '알려진 정답 3건 + 합성 4분기 검사 통과. 네 분류가 전부 실제로 산출됨을 확인했다.'
    : '자체 검사 불일치. 계측기를 신뢰하지 않는다 — 결과를 insufficient 로 다뤄야 한다.',
}

if (asJson) console.log(JSON.stringify(result, null, 2))
else {
  const t = result.totals
  console.log(`진입점 ${result.entrypoints.length}개 · lib 파일 ${t.libFiles}개 · export ${t.exports}개\n`)
  console.log(`  reachable    ${t.reachable}`)
  console.log(`  dynamic      ${t.dynamic}`)
  console.log(`  test-only    ${t['test-only']}   ← 배선 누락`)
  console.log(`  unreachable  ${t.unreachable}`)
  const show = (id) => (paths[id]?.symbolUsers ?? []).join(', ') || '(사용처 없음)'
  console.log('\n  test-only (테스트만 부름):')
  for (const id of classified['test-only'].slice(0, 8)) console.log(`    ${id}\n       ← ${show(id)}`)
  if (classified['test-only'].length > 8) console.log(`    … 외 ${classified['test-only'].length - 8}건`)
  console.log('\n  unreachable 후보 (아무도 named import 하지 않음):')
  for (const id of classified.unreachable.slice(0, 10)) console.log(`    ${id}`)
  if (classified.unreachable.length > 10) console.log(`    … 외 ${classified.unreachable.length - 10}건`)
  console.log(`\n자체 검사 — 알려진 정답:`)
  for (const c of knownChecks) console.log(`  ${c.ok ? 'OK ' : 'XX '} ${c.file}  기대=${c.want} 실제=${c.got}`)
  console.log(`자체 검사 — 합성 4분기:`)
  for (const r of synthetic.rows) console.log(`  ${r.want === r.got ? 'OK ' : 'XX '} ${r.file}  기대=${r.want} 실제=${r.got}`)
  console.log(`자체 검사 — 심볼 단위 4분기:`)
  for (const c of symbolChecks) console.log(`  ${c.ok ? 'OK ' : 'XX '} ${c.id}  기대=${c.want} 실제=${c.got}`)
  console.log(`\n${result.note}`)
}
