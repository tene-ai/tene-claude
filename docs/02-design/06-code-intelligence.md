# D06 · 코드 인텔리전스 (CIA)

> 대응: FR-3.1~3.5, FR-4.3~4.4, W-31~W-3H
> 최대 위험 구간 (R-01). 이 문서의 정확도가 D07·D08·D10 산출물의 신뢰도를 좌우한다.

---

## 1. 3-Tier 어댑터

```
질의: "processPayment 는 어디서 호출되는가?"
   │
   ▼
┌──────────────────────────────────────────────────────────────┐
│ Tier 1 · LSP                                신뢰: high        │
│  Claude Code 의 code intelligence 플러그인이 설치된 경우.       │
│  스킬이 "정의로 이동 / 참조 찾기" 도구 사용을 지시한다.          │
│  bin/ 스크립트는 LSP 를 직접 호출할 수 없다 (모델이 호출).       │
└───────────────┬──────────────────────────────────────────────┘
                │ 없거나 실패
                ▼
┌──────────────────────────────────────────────────────────────┐
│ Tier 2 · 자체 인덱서  bin/tene-scan          신뢰: medium      │
│  순수 Node. 외부 설치 불필요.                                  │
│  파일 스캔 → 정규식 기반 심볼/import/참조 추출 → JSON 캐시      │
└───────────────┬──────────────────────────────────────────────┘
                │ 인덱스 미스 / 저신뢰
                ▼
┌──────────────────────────────────────────────────────────────┐
│ Tier 3 · 에이전트 조사                      신뢰: medium      │
│  tene-cartographer 가 Glob+Grep+Read 로 직접 조사.             │
│  느리지만 항상 가능. 결과를 인덱스에 피드백.                     │
└──────────────────────────────────────────────────────────────┘
```

**어느 Tier 가 답했는지 항상 문서에 표기한다.**

### 1.1 Tier 선택 로직

```javascript
// lib/scan/query.js
export function answer(question, target, opts) {
  // Tier 1 은 모델이 담당. bin 은 Tier 2 부터.
  const indexed = queryIndex(question, target)
  if (indexed.confidence !== 'low' && indexed.results.length) {
    return { ...indexed, source: 'indexed' }
  }
  return {
    results: [], source: 'needs-investigation',
    hint: `인덱스로 답할 수 없습니다. 에이전트 조사가 필요합니다.`,
    reason: indexed.reason,      // 'not_indexed' | 'ambiguous' | 'no_match'
  }
}
```

**`needs-investigation` 을 반환하는 것이 중요하다.** 억지로 낮은 신뢰 결과를 주면 그것이 문서에 확정처럼 들어간다.

---

## 2. Tier 2 인덱서

### 2.1 파일 워커

```javascript
// lib/scan/walk.js
const DEFAULT_EXCLUDES = [
  '.git', 'node_modules', 'dist', 'build', 'out', 'target', 'vendor',
  '.next', '.nuxt', '.svelte-kit', '__pycache__', '.venv', 'venv',
  '.tene', '.tene-claude', 'coverage', '.turbo', '.cache',
]
const MAX_FILE_BYTES = 2 * 1024 * 1024

export function* walk(root, opts) {
  const ignore = loadGitignore(root)          // 파싱 실패 시 DEFAULT_EXCLUDES 만
  for (const entry of walkDir(root)) {
    if (isExcluded(entry, DEFAULT_EXCLUDES, ignore)) continue
    const st = statSync(entry)
    if (st.size > MAX_FILE_BYTES) { yield { path: entry, skipped: 'too_large' }; continue }
    if (!isSupportedExt(entry, opts.langs)) { yield { path: entry, skipped: 'unsupported' }; continue }
    yield { path: entry, size: st.size, mtime: st.mtimeMs }
  }
}
```

**`.gitignore` 파싱**: 단순 glob 만 지원 (`!` 부정, `**`, `*`, 디렉토리 `/`). 복잡한 패턴은 무시하고 기본 제외에 의존한다.

### 2.2 언어 팩 인터페이스

```javascript
// lib/scan/langs/index.js
/**
 * @typedef {Object} LangPack
 * @property {string} name
 * @property {string[]} extensions
 * @property {(src: string) => string} stripNonCode          주석·문자열 제거
 * @property {(src: string) => Definition[]} extractDefinitions
 * @property {(src: string) => ImportRef[]} extractImports
 * @property {(src: string) => Reference[]} extractReferences
 */

/**
 * @typedef {Object} Definition
 * @property {string} name
 * @property {'function'|'class'|'const'|'type'|'interface'|'method'|'component'} kind
 * @property {number} line
 * @property {boolean} exported
 * @property {string} signatureText      원본 선언 라인 (Q5/Q6 용)
 * @property {'high'|'medium'|'low'} confidence
 */
```

### 2.3 `stripNonCode` — 오탐 방지의 핵심

주석과 문자열 안의 가짜 정의를 제거한다. **이것이 인덱서 정확도의 절반이다.**

```javascript
// lib/scan/langs/typescript.js
export function stripNonCode(src) {
  let out = '', i = 0, n = src.length
  while (i < n) {
    const c = src[i]
    // 라인 주석
    if (c === '/' && src[i+1] === '/') { const e = src.indexOf('\n', i); i = e < 0 ? n : e; continue }
    // 블록 주석
    if (c === '/' && src[i+1] === '*') { const e = src.indexOf('*/', i+2); i = e < 0 ? n : e+2; out += ' '; continue }
    // 문자열 (', ", `)
    if (c === '"' || c === "'" || c === '`') {
      const end = scanString(src, i, c)      // 이스케이프·템플릿 보간 처리
      out += ' '.repeat(end - i); i = end; continue
    }
    out += c; i++
  }
  return out
}
```

**길이를 보존한다** (제거 대신 공백 치환). 라인 번호가 원본과 일치해야 하기 때문이다.

### 2.4 TypeScript/JavaScript 팩

```javascript
const DEF_PATTERNS = [
  // export function foo(...) / async function
  { re: /^(export\s+)?(default\s+)?(async\s+)?function\s+(\w+)\s*(\([^)]*\))?/gm,
    name: 4, kind: 'function', exported: 1, sig: 0 },
  // export const foo = (...) => / export const foo: Type =
  { re: /^(export\s+)?const\s+(\w+)\s*(:\s*[^=]+)?=\s*(async\s*)?\(/gm,
    name: 2, kind: 'const', exported: 1, sig: 0 },
  // export class Foo
  { re: /^(export\s+)?(abstract\s+)?class\s+(\w+)/gm, name: 3, kind: 'class', exported: 1, sig: 0 },
  // export interface / type
  { re: /^(export\s+)?interface\s+(\w+)/gm, name: 2, kind: 'interface', exported: 1, sig: 0 },
  { re: /^(export\s+)?type\s+(\w+)\s*=/gm, name: 2, kind: 'type', exported: 1, sig: 0 },
  // React 컴포넌트 (대문자 const + JSX 반환 추정)
  { re: /^(export\s+)?(default\s+)?function\s+([A-Z]\w*)\s*\(/gm,
    name: 3, kind: 'component', exported: 1, sig: 0 },
  // 클래스 메서드 (들여쓰기 + 이름 + 괄호)
  { re: /^\s{2,}(async\s+)?(\w+)\s*\([^)]*\)\s*[:{]/gm, name: 2, kind: 'method', confidence: 'medium' },
]

const IMPORT_PATTERNS = [
  { re: /^import\s+(?:type\s+)?\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/gm, names: 1, from: 2 },
  { re: /^import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/gm, names: 1, from: 2, default: true },
  { re: /^import\s+\*\s+as\s+(\w+)\s+from\s+['"]([^'"]+)['"]/gm, names: 1, from: 2, namespace: true },
  { re: /(?:const|let|var)\s+\{([^}]+)\}\s*=\s*require\(['"]([^'"]+)['"]\)/gm, names: 1, from: 2 },
]

const REF_PATTERN = /\b(\w+)\s*\(/g          // 호출 후보
const JSX_PATTERN = /<([A-Z]\w*)[\s/>]/g     // 컴포넌트 사용
```

**정확도 한계를 인정한다**:
- 동적 디스패치(`obj[key]()`) 추적 불가 → `unresolved` 에 기록
- 고차 함수로 전달된 참조 → `confidence: low`
- 재export(`export * from`) 체인 → 1단계만

### 2.5 Python 팩

```javascript
const DEF_PATTERNS = [
  { re: /^(async\s+)?def\s+(\w+)\s*\(/gm, name: 2, kind: 'function' },
  { re: /^class\s+(\w+)/gm, name: 1, kind: 'class' },
  { re: /^\s{4,}(async\s+)?def\s+(\w+)\s*\(/gm, name: 2, kind: 'method', confidence: 'medium' },
]
const IMPORT_PATTERNS = [
  { re: /^from\s+([\w.]+)\s+import\s+(.+)$/gm, from: 1, names: 2 },
  { re: /^import\s+([\w.]+)(?:\s+as\s+(\w+))?/gm, from: 1, alias: 2 },
]
```

**들여쓰기 기반 스코프**를 쓰지 않는다. 메서드는 들여쓰기 깊이로만 판별하고 `confidence: medium`.

`stripNonCode`: `#` 주석, `'''`/`"""` docstring, `'`/`"` 문자열.

### 2.6 Go 팩

```javascript
const DEF_PATTERNS = [
  { re: /^func\s+(\w+)\s*\(/gm, name: 1, kind: 'function', exported: /^[A-Z]/ },
  { re: /^func\s*\(\s*\w+\s+\*?(\w+)\s*\)\s*(\w+)\s*\(/gm, name: 2, recv: 1, kind: 'method' },
  { re: /^type\s+(\w+)\s+(struct|interface)/gm, name: 1, kind: 2 },
]
```

Go 는 대문자 = export 라는 규칙이 명확해 `exported` 판정이 정확하다.

### 2.7 Java 팩

```javascript
const DEF_PATTERNS = [
  { re: /^\s*(public|private|protected)?\s*(static\s+)?(?:final\s+)?class\s+(\w+)/gm,
    name: 3, kind: 'class' },
  { re: /^\s*(public|private|protected)\s+(static\s+)?[\w<>\[\],\s]+\s+(\w+)\s*\([^)]*\)\s*\{/gm,
    name: 3, kind: 'method' },
]
```

### 2.8 인덱스 스키마

```jsonc
// .tene-claude/index/symbols.json
{
  "schemaVersion": 1,
  "builtAt": "2026-08-20T04:00:00Z",
  "engine": "node-regex",
  "root": "/abs/path (검증용)",
  "stats": { "files": 412, "indexed": 389, "skipped": 23, "symbols": 1840, "refs": 5211 },
  "unsupported": [{ "ext": ".kt", "files": 23 }],

  "files": {
    "src/payments/processPayment.ts": { "mtime": 1755..., "size": 4821, "lang": "typescript" }
  },

  "symbols": {
    "processPayment": [{
      "kind": "function", "file": "src/payments/processPayment.ts", "line": 42,
      "exported": true, "confidence": "high",
      "signatureText": "export async function processPayment(input: PaymentInput): Promise<PaymentResult>"
    }]
  },

  "imports": {
    "src/api/routes/payments.ts": [
      { "from": "../../payments/processPayment", "names": ["processPayment"], "line": 3,
        "resolved": "src/payments/processPayment.ts" }
    ]
  },

  "refs": {
    "processPayment": [
      { "file": "src/api/routes/payments.ts", "line": 18, "kind": "call", "confidence": "high" },
      { "file": "src/jobs/retry.ts", "line": 7, "kind": "call", "confidence": "medium" }
    ]
  },

  "unresolved": [
    { "file": "src/handlers/index.ts", "line": 22, "reason": "dynamic_dispatch",
      "detail": "handlers[key]()" }
  ]
}
```

### 2.9 증분 빌드

```javascript
// lib/scan/index-builder.js
export function build(root, opts) {
  const prev = readIndex()                       // 없으면 전체 빌드
  const current = new Map()
  const changed = [], removed = []

  for (const f of walk(root, opts)) {
    if (f.skipped) continue
    current.set(f.path, f)
    const old = prev?.files?.[f.path]
    if (!old || old.mtime !== f.mtime || old.size !== f.size) changed.push(f)
  }
  for (const path of Object.keys(prev?.files ?? {})) {
    if (!current.has(path)) removed.push(path)
  }

  if (!prev || changed.length > current.size * 0.5) return buildFull(root, opts)
  return buildIncremental(prev, changed, removed, opts)
}
```

**50% 이상 변경 시 전체 재빌드**한다. 증분 병합 비용이 전체보다 커지는 지점.

**증분의 어려운 부분**: `refs` 는 전역이므로, 파일 하나가 바뀌면 그 파일이 만든 refs 만 제거하고 다시 넣어야 한다. `refs` 항목에 `file` 이 있으므로 필터링 가능하다.

---

## 3. Understanding Layer 판정

### 3.1 규칙 파일

```yaml
# docs/sprints/_meta/layers.yml
version: 1
layers:
  interface:
    paths: ["src/pages/**", "src/app/**", "src/components/**", "src/routes/**",
            "src/controllers/**", "src/api/**", "cmd/**"]
    imports: ["express", "fastify", "next", "react", "vue", "svelte",
              "gin", "fastapi", "flask", "spring-web"]
  business-logic:
    paths: ["src/services/**", "src/usecases/**", "src/domain/**",
            "src/core/**", "src/reducers/**", "src/lib/**"]
    imports: []
  persistence:
    paths: ["src/repositories/**", "src/models/**", "src/db/**",
            "src/dao/**", "prisma/**", "migrations/**"]
    imports: ["prisma", "@prisma/client", "typeorm", "sequelize", "mongoose",
              "knex", "drizzle-orm", "sqlalchemy", "gorm", "redis", "ioredis", "kafkajs"]
  infrastructure:
    paths: ["src/config/**", "src/infra/**", "deploy/**", ".github/workflows/**",
            "Dockerfile*", "terraform/**", "k8s/**", "src/middleware/**", "src/auth/**"]
    imports: ["dotenv", "aws-sdk", "@aws-sdk/*", "googleapis", "passport", "jsonwebtoken"]

precedence: [interface, persistence, infrastructure, business-logic]
unmatched: unclassified
```

### 3.1.1 4계층 모델의 한계 — 공통 유틸

> ⚠️ **dogfooding 에서 드러남** — tene 를 tene 로 검사하다 발견했다.

4계층에는 **횡단 관심사(공통 유틸)의 자리가 없다.**

`errors.js`, `time.js`, `json.js` 같은 모듈은 모든 계층이 쓴다. 이것을
`infrastructure` 로 분류하면 `business-logic → infrastructure` 참조가 전부
`infra-leak` 경고로 잡힌다 — 실제로 이 저장소에서 **29건**이 그렇게 나왔다.

| 선택 | 결과 |
|---|---|
| infrastructure 로 분류 | infra-leak 오탐 폭증. 사용자가 위반 검사를 무시하게 된다 |
| 계층에서 제외 (`exclude`) | 통계에서 빠지지만 오탐이 없다 ✅ |
| 5번째 계층 추가 | Understanding Layer 의 정의를 바꾸는 일 — 하지 않는다 |

**`exclude` 를 택한다.** 공통 유틸이 계층 통계에 몇 개인지는 중요한 정보가 아니고,
오탐 29건은 검사 전체의 신뢰를 무너뜨린다.

이 판단은 프로젝트마다 다를 수 있으므로 규칙 파일에 맡긴다. 기본 프리셋은
`src/utils/**` 를 아예 분류하지 않으므로(미분류) 같은 문제가 덜하다.

### 3.2 판정 알고리즘

```javascript
// lib/scan/layer.js
export function judgeLayer(filePath, index, rules) {
  // 1. 프로젝트 규칙
  for (const layer of rules.precedence) {
    if (matchAnyGlob(filePath, rules.layers[layer]?.paths ?? [])) {
      return { layer, source: 'rules-project', confidence: 'high',
               matchedRule: matchedPattern }
    }
  }
  // 2. 기본 프리셋
  for (const layer of DEFAULT_RULES.precedence) {
    if (matchAnyGlob(filePath, DEFAULT_RULES.layers[layer].paths)) {
      return { layer, source: 'rules-default', confidence: 'medium' }
    }
  }
  // 3. import 시그널
  const imports = index.imports?.[filePath] ?? []
  const hits = []
  for (const layer of rules.precedence) {
    const pats = rules.layers[layer]?.imports ?? []
    if (imports.some(i => pats.some(p => matchModule(i.from, p)))) hits.push(layer)
  }
  if (hits.length === 1) return { layer: hits[0], source: 'imports', confidence: 'low' }
  if (hits.length > 1) {
    const chosen = rules.precedence.find(l => hits.includes(l))
    return { layer: chosen, source: 'imports', confidence: 'low', ambiguous: hits }
  }
  // 4. 미분류
  return { layer: null, source: 'unclassified',
           reason: 'no rule matched',
           suggestion: suggestRule(filePath) }
}
```

### 3.3 precedence 근거

한 파일이 여러 계층에 걸치면 **가장 바깥 계층으로 본다**.

```
interface > persistence > infrastructure > business-logic
```

컨트롤러가 DB 를 직접 만지면 그건 **interface 파일에서 일어난 계층 위반**이지, persistence 파일이 아니다.

### 3.4 미분류를 채우지 않는 이유

```javascript
// ❌ 하지 않는 것
if (!layer) return { layer: 'business-logic', confidence: 'low' }   // 추측으로 채움

// ✅ 하는 것
if (!layer) return { layer: null, source: 'unclassified',
                     suggestion: 'src/utils/** 를 layers.yml 에 추가 검토' }
```

`src/utils/` 를 business-logic 으로 자동 배정하면 **이후 모든 계층 통계가 왜곡된다.** 미분류 목록이 곧 "규칙을 다듬을 지점"이다.

### 3.5 `/tene:layers scan` — 규칙 제안

```javascript
export function proposeRules(root) {
  const dirs = collectSourceDirs(root)             // 소스 파일 1개 이상인 디렉토리
  const proposals = { interface: [], 'business-logic': [], persistence: [],
                      infrastructure: [], unmatched: [] }

  for (const dir of dirs) {
    const byPath = matchDefaultPreset(dir.path)
    const byImport = analyzeImportSignals(dir)
    if (byPath) proposals[byPath].push({ ...dir, basis: 'path' })
    else if (byImport.confident) proposals[byImport.layer].push({ ...dir, basis: 'imports' })
    else proposals.unmatched.push(dir)
  }
  return proposals
}
```

**출력**

```
[tene:layers] 프로젝트 구조 스캔 결과

interface      ← src/app/**, src/components/**          (87 files)
business-logic ← src/services/**, src/lib/**            (34 files)
persistence    ← src/db/**, prisma/**                   (12 files)
infrastructure ← src/config/**, .github/workflows/**    (8 files)

확인 필요 (규칙 미매칭):
  src/utils/**   (28 files)  — 유틸리티. business-logic? 미분류 유지?
  src/types/**   (13 files)  — 타입 정의. 미분류 유지 권장
  src/hooks/**   (9 files)   — React 훅. interface? business-logic?

이 규칙을 docs/sprints/_meta/layers.yml 로 저장할까요?
미분류 디렉토리는 그대로 두어도 됩니다 (억지 배정보다 낫습니다).
```

### 3.6 계층 위반 탐지

```javascript
export function detectViolations(index, rules) {
  const violations = []
  for (const [symbol, refs] of Object.entries(index.refs)) {
    const defs = index.symbols[symbol] ?? []
    if (defs.length !== 1) continue                 // 동명 다수는 판정 안 함
    const toLayer = judgeLayer(defs[0].file, index, rules)
    if (!toLayer.layer) continue                    // 미분류가 끼면 판정 안 함

    for (const ref of refs) {
      const fromLayer = judgeLayer(ref.file, index, rules)
      if (!fromLayer.layer) continue

      const kind = classifyViolation(fromLayer.layer, toLayer.layer)
      if (!kind) continue
      violations.push({
        kind, from: fromLayer.layer, to: toLayer.layer,
        detail: `${ref.file}:${ref.line} → ${symbol} (${defs[0].file})`,
        confidence: minConfidence(fromLayer, toLayer, ref),
      })
    }
  }
  return violations
}

function classifyViolation(from, to) {
  if (from === 'interface' && to === 'persistence') return 'layer-skip'
  if (from === 'persistence' && (to === 'interface' || to === 'business-logic')) return 'reverse'
  if (from === 'business-logic' && to === 'infrastructure') return 'infra-leak'   // 경고 수준
  return null
}
```

**미분류가 끼면 위반 판정을 하지 않는다.** 계층을 모르는 채 위반을 주장하면 신뢰를 잃는다.

---

## 4. 6가지 질문 조립

### 4.1 응답 스키마

```javascript
// bin/tene-scan questions processPayment
{ "ok": true, "data": {
  "symbol": "processPayment",
  "tier": "indexed",
  "q1_name": { "value": "processPayment", "kind": "function",
               "source": "indexed", "confidence": "high" },
  "q2_defined": { "value": "src/payments/processPayment.ts:42",
                  "source": "indexed", "confidence": "high" },
  "q3_referenced": { "value": [
      { "file": "src/api/routes/payments.ts", "line": 3, "kind": "import" },
      { "file": "src/jobs/retry.ts", "line": 2, "kind": "import" }
    ], "source": "indexed", "confidence": "high" },
  "q4_called": { "value": [
      { "file": "src/api/routes/payments.ts", "line": 18, "kind": "call",
        "callerLayer": "interface" },
      { "file": "src/jobs/retry.ts", "line": 7, "kind": "call",
        "callerLayer": "unclassified" }
    ], "source": "indexed", "confidence": "medium",
    "note": "동적 디스패치는 탐지되지 않습니다" },
  "q5_input": { "value": "{ amount: number; cardToken: string; idempotencyKey?: string }",
                "raw": "export async function processPayment(input: PaymentInput): Promise<PaymentResult>",
                "source": "indexed", "confidence": "medium",
                "note": "타입 별칭은 해석하지 않았습니다. PaymentInput 정의를 확인하세요" },
  "q6_output": {
    "returns": "Promise<PaymentResult>",
    "mutations": [
      { "target": "payments", "kind": "db-write", "via": "paymentsRepo.insert",
        "file": "src/payments/processPayment.ts:71", "confidence": "medium" }
    ],
    "source": "indexed+heuristic", "confidence": "medium" },
  "unresolved": []
}}
```

### 4.2 Q5 입력 형태 추출

```javascript
export function extractInput(signatureText, lang) {
  const params = parseParams(signatureText, lang)     // 언어별 괄호 파싱
  if (!params.length) return { value: '(없음)', confidence: 'high' }

  // 타입 별칭이면 해석 시도 (1단계만)
  const resolved = params.map(p => {
    if (p.type && index.symbols[p.type]) {
      const def = index.symbols[p.type][0]
      return { ...p, expandedFrom: `${def.file}:${def.line}` }
    }
    return p
  })
  return { value: formatParams(resolved), confidence: allResolved ? 'high' : 'medium' }
}
```

**타입 별칭 해석은 1단계만.** 재귀 해석은 비용 대비 가치가 낮고 순환 위험이 있다.

### 4.3 Q6 변경(mutation) 휴리스틱

```javascript
const WRITE_METHODS = /\b(insert|update|delete|save|create|upsert|remove|destroy|exec|execute|query|set|put|push|write|commit)\b/i

export function detectMutations(symbolDef, index, rules) {
  const body = readFunctionBody(symbolDef)           // 중괄호 매칭으로 본문 추출
  const stripped = stripNonCode(body)
  const mutations = []

  // 1. persistence 계층 심볼 호출
  for (const call of extractCalls(stripped)) {
    const defs = index.symbols[call.name] ?? []
    for (const d of defs) {
      const layer = judgeLayer(d.file, index, rules)
      if (layer.layer === 'persistence') {
        mutations.push({ target: inferTarget(call), kind: 'db-write',
                         via: call.name, file: `${symbolDef.file}:${call.line}`,
                         confidence: 'medium' })
      }
    }
  }
  // 2. 알려진 ORM/드라이버 메서드명
  for (const call of extractCalls(stripped)) {
    if (WRITE_METHODS.test(call.name)) {
      mutations.push({ target: call.receiver ?? '?', kind: 'write-method',
                       via: call.name, confidence: 'low' })
    }
  }
  // 3. 모듈 스코프 변수 대입
  // 4. 파라미터 객체 프로퍼티 대입
  return dedupe(mutations)
}
```

**전부 `confidence: medium` 이하.** 확정은 Tier 3 조사나 사람 확인.

### 4.4 "답이 없음" 의 구분

| 상황 | 표기 | 의미 |
|---|---|---|
| 인덱스에 심볼 없음 (언어 미지원) | `not_indexed` | 도구가 못 본 것 |
| 인덱스에 있으나 참조 0건 | `orphan` | **실제로 아무도 안 씀** |
| 동명 심볼 다수 | `ambiguous` + 전체 나열 | 특정 불가 |
| 동적 디스패치 감지 | `unresolved` | 추적 불가 |

**`orphan` 과 `not_indexed` 를 구분하는 것이 중요하다.** 전자는 삭제 후보, 후자는 조사 필요.

---

## 5. AC 앵커링

### 5.1 3단계

```
Stage 1 · design 시점 — 예상 앵커
  입력: AC 문장 + plan 작업 항목
  1. AC 문장에서 후보 추출
     · 백틱 감싼 식별자        → symbol 후보
     · 대문자 시작 명사(페이지) → screen 후보
     · HTTP 메서드+경로 패턴    → endpoint 후보
     · 테이블/엔티티 명칭       → persistence 대상
  2. plan 의 작업 항목이 이 AC 를 커버한다고 선언했으면 그 대상 심볼 추가
  3. tene-scan defs 로 실제 심볼 해석
  4. 해석 실패 → "미해결 앵커" 로 사용자 확인 요청
  → confidence: medium

Stage 2 · do 이후 — 실측 교정
  1. git diff --name-only <startCommit>..HEAD
  2. 각 변경 파일의 심볼을 Stage 1 앵커와 대조
  3. 예상에 없던 변경 파일 → 어느 AC 인지 판단
     · 판단 가능 → 앵커 추가
     · 불가       → 미귀속 변경으로 loop-check 에 보고
  4. 예상했으나 변경 안 된 앵커 → 해당 AC 미구현 가능성 → loop-check 에 보고
  → confidence: high

Stage 3 · 수동 교정
  사용자가 design.md 앵커 표를 직접 편집 → 최우선
  → source: human, 자동 갱신 대상에서 제외
```

### 5.2 후보 추출

```javascript
// lib/scan/anchors.js
const CANDIDATE_PATTERNS = [
  { re: /`([A-Za-z_$][\w$.]*)`/g, kind: 'symbol', confidence: 'high' },
  { re: /\b(GET|POST|PUT|PATCH|DELETE)\s+(\/[\w/:{}.-]*)/g, kind: 'endpoint', confidence: 'high' },
  { re: /\b([A-Z][a-zA-Z]*(?:Page|Screen|View|Modal|Dialog|Form))\b/g, kind: 'screen', confidence: 'medium' },
  { re: /\b([a-z_]+)\s*(?:테이블|table)\b/gi, kind: 'table', confidence: 'medium' },
]

export function extractCandidates(acStatement) {
  const out = []
  for (const p of CANDIDATE_PATTERNS) {
    for (const m of acStatement.matchAll(p.re)) {
      out.push({ value: m[1] ?? m[0], kind: p.kind, confidence: p.confidence })
    }
  }
  return dedupe(out)
}
```

### 5.3 역인덱스

```jsonc
// .tene-claude/index/anchors.json
{
  "schemaVersion": 1,
  "generatedAt": "2026-08-20T04:15:00Z",
  "byPath": {
    "src/payments/processPayment.ts": ["checkout-retry:ac_2"],
    "src/db/payments.ts":             ["checkout-retry:ac_2"],
    "src/pages/CheckoutPage.tsx":     ["checkout-retry:ac_1", "checkout-retry:ac_3"]
  },
  "bySymbol": {
    "processPayment": ["checkout-retry:ac_2"],
    "CheckoutPage":   ["checkout-retry:ac_1", "checkout-retry:ac_3"]
  },
  "byAc": {
    "checkout-retry:ac_2": {
      "anchors": [
        { "kind": "symbol", "value": "processPayment", "file": "src/payments/processPayment.ts",
          "source": "indexed", "confidence": "high", "stage": 2 }
      ]
    }
  }
}
```

**`byPath` 가 훅의 O(1) 조회 대상**이다. 파일 경로 하나로 영향 AC 를 즉시 얻는다.

### 5.4 stale 마킹

```javascript
export function markStale(acIds, causeFile) {
  const sprint = loadActiveSprint()
  const staled = []
  for (const acId of acIds) {
    const ac = sprint.ac.find(a => a.id === localId(acId))
    if (!ac) continue
    if (ac.verdict !== 'passed') continue      // failed/insufficient 는 그대로
    ac.verdict = 'stale'
    ac.staledBy = causeFile
    ac.staledAt = nowIso()
    staled.push(ac.id)
  }
  if (staled.length) { saveSprint(sprint); appendEvent({ type: 'AcStaled', ... }) }
  return staled
}
```

**`passed` 만 `stale` 로 바꾼다.** 이미 `failed` 인 것을 `stale` 로 바꾸면 실패 사실이 가려진다.

---

## 6. `tene-scan` CLI

```bash
tene-scan build     [--incremental] [--since <ref>] [--langs ts,py,go,java]
tene-scan defs      <symbol> [--limit 20]
tene-scan refs      <symbol> [--kind import|call|any]
tene-scan callers   <symbol>
tene-scan imports   <file>
tene-scan layer     <file|symbol>
tene-scan questions <symbol>
tene-scan touched   <file>...
tene-scan anchors   --sprint <id> --rebuild
tene-scan violations
tene-scan status
```

### 6.1 `status`

```jsonc
{ "ok": true, "data": {
  "exists": true, "builtAt": "2026-08-20T04:00:00Z", "ageSeconds": 1200,
  "engine": "node-regex", "stale": false,
  "stats": { "files": 412, "symbols": 1840, "refs": 5211 },
  "unsupported": [{ "ext": ".kt", "files": 23 }],
  "coverage": { "indexedRatio": 0.944 }
}}
```

**`stale` 판정**: 인덱스 빌드 후 변경된 파일이 10개 이상이면 `stale: true`. 스킬이 이를 보고 재빌드를 결정한다.

---

## 7. `tene-cartographer` 에이전트 (Tier 3)

```yaml
---
name: tene-cartographer
description: Understanding Layer 4계층 분류와 6가지 질문 답변을 수집한다.
tools: Read, Glob, Grep, Bash
model: inherit
---
```

**시스템 프롬프트 골자**

```
당신은 코드 구조를 조사해 사실만 보고하는 조사원이다. 코드를 고치지 않는다.

절차:
1. LSP 도구가 있으면 그것을 먼저 쓴다 (정의로 이동 / 참조 찾기)
2. 없으면 `tene-scan questions <symbol>` 을 쓴다
3. 인덱서가 needs-investigation 을 반환한 것만 Glob/Grep/Read 로 직접 조사한다
4. 각 답변에 source (lsp | indexed | investigated) 와 confidence 를 붙인다

금지:
· 규칙에 매칭되지 않는 파일의 계층을 추론으로 채우지 마라. unclassified 로 남겨라
· 동명 심볼이 여럿이면 하나를 고르지 말고 전부 나열하라
· 읽은 파일 내용을 반환하지 마라. 표와 요약만 반환하라
· "아마 …일 것" 이라고 쓰지 마라. 확인했거나 확인 못 했거나 둘 중 하나다

반환 (JSON):
{ "layers": {...}, "unclassified": [...], "violations": [...],
  "questions": { "<symbol>": { q1..q6 } }, "unresolved": [...],
  "tier": "lsp|indexed|investigated" }
```

**컨텍스트 격리 효과**: 수십 파일을 읽어도 그 내용이 메인 컨텍스트에 들어오지 않는다. 요약된 표만 돌아온다.

---

## 8. 정확도 목표와 측정

### 8.1 목표

| 지표 | 목표 | 픽스처 |
|---|---|---|
| 계층 판정 정확도 | ≥ 90% | ts-express-app (수동 라벨 대비) |
| 정의 추출 재현율 | ≥ 95% | 언어별 픽스처 |
| 정의 추출 정밀도 | ≥ 98% | 주석·문자열 오탐 0 |
| 참조 추출 재현율 | ≥ 80% | 정적 호출 기준 |
| 미분류 억지 배정 | **0건** | flat-app |

### 8.2 측정 방법

```
evals/fixtures/<name>/.expected/
├── layers.json       # 파일 → 정답 계층 (수동 라벨)
├── symbols.json      # 정답 심볼 목록
└── refs.json         # 정답 참조 목록

node evals/accuracy.js --fixture ts-express-app
→ precision / recall / F1 출력
```

### 8.3 목표 미달 시 (R-01 완화)

| 상황 | 대응 |
|---|---|
| 계층 정확도 < 90% | 규칙 프리셋 보강 → 재측정 |
| 계층 정확도 < 70% | **자동 판정 포기.** `/tene:layers edit` 수동 확정만 제공 |
| 정의 재현율 < 95% | 해당 언어 팩 패턴 보강 |
| 특정 언어 전면 실패 | 그 언어를 Tier 3 전용으로 선언 (`not_indexed` 반환) |
| 오탐(정밀도) 문제 | `stripNonCode` 보강 — 오탐이 재현율보다 치명적이다 |

**오탐이 더 치명적인 이유**: 없는 참조를 있다고 하면 사용자가 그것을 확인하러 가서 시간을 낭비하고, 도구를 믿지 않게 된다. 놓치는 것은 "Tier 3 로 조사하면 된다".
