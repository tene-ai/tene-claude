# D11 · 시크릿 경계

> 대응: FR-7.1~7.5, R-21~R-24, W-71~W-78
> 근거: [00-prd/05](../00-prd/05-tene-cli-integration.md) — tene CLI 분석
> **플러그인에서 유일하게 fail-closed 인 영역이다.**

---

## 1. tene CLI 요약

| 항목 | 내용 |
|---|---|
| 정체 | Go 단일 바이너리. 로컬 우선 암호화 시크릿 매니저. MIT |
| 암호화 | XChaCha20-Poly1305 + Argon2id (64MB, 3 iterations) |
| 키 캐시 | OS 키체인 (macOS Keychain, Linux Secret Service, Windows Credential Manager) |
| 복구 | 12단어 BIP-39 니모닉 |
| 볼트 | 프로젝트별 `.tene/` (전역 애그리게이터 없음) |
| 핵심 워크플로 | `tene run -- <cmd>` — 자식 프로세스 환경변수로만 주입 |

### 1.1 명령 분류

| AI 안전 | 명령 |
|---|---|
| ✅ 안전 | `init`, `list`, `delete`, `run --`, `import`, `env`, `passwd`, `recover`, `version`, `update`, `whoami` |
| ⚠️ 조건부 | `set` (반드시 `--stdin`), `export` (반드시 `--encrypted`) |
| ❌ **금지** | `get` (평문 stdout) |

**비활성 명령**: `login`, `push`, `pull`, `sync`, `billing`, `team` — 제안하지 않는다.

### 1.2 제약 규칙

| 항목 | 규칙 |
|---|---|
| 키 이름 | `^[A-Z][A-Z0-9_]*$` — 예약어(`PATH` 등) 거부 |
| 환경 이름 | `^[a-z][a-z0-9-]*$` — `default` 삭제 불가 |
| `--env` 위치 | 반드시 `--` **앞에** |
| Windows | curl 설치 미지원 (소스 빌드/릴리스 zip) |
| Homebrew | tap 없음 — `brew install tene` 제안 금지 |

---

## 2. 4대 안전 규칙 (SR)

**협상 대상이 아니다.** 위반하면 평문 시크릿이 대화 컨텍스트에 들어가고, 그 컨텍스트는 로깅·캐시·보존될 수 있다.

| # | 규칙 | 위반 예 | 대안 |
|---|---|---|---|
| **SR1** | `tene get <KEY>` 를 실행하지 않는다 | 값 확인 목적 | *"별도 터미널에서 직접 실행하세요. 저는 보지 않습니다"* |
| **SR2** | `tene export` 를 `--encrypted` 없이 실행하지 않는다 | 백업 목적 | `tene export --encrypted --file backup.tene.enc` |
| **SR3** | `.tene/` 아래 파일을 읽지 않는다 | 볼트 구조 확인 | `tene list` (이름만) |
| **SR4** | 시크릿 값을 CLI 인자로 전달하지 않는다 | `tene set KEY sk_live_...` | `cat key.txt \| tene set KEY --stdin` |

`.tene/` 는 암호문이지만 **암호문조차 AI 컨텍스트에 넣지 않는다** — tene CLI 자체 규약을 그대로 승계한다.

---

## 3. `tene-guard` 설계

### 3.1 fail-closed

```javascript
#!/usr/bin/env node
// bin/tene-guard --event pretooluse-bash|pretooluse-read
import { readStdinJson } from '../lib/util/stdin.js'
import { judgeBash, judgeRead } from '../lib/guard/rules.js'

try {
  const payload = readStdinJson(800)
  const event = getFlag('--event')
  const verdict = event === 'pretooluse-read'
    ? judgeRead(payload)
    : judgeBash(payload)
  emit(verdict)
  process.exit(0)
} catch (err) {
  // ★ 내부 오류 시에도 차단한다 (fail-closed)
  emit({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason:
        'tene 시크릿 가드가 이 명령을 검사하지 못했습니다. 안전을 위해 차단합니다. ' +
        '가드에 문제가 있다면 /tene:doctor 로 진단하세요.',
    },
  })
  process.exit(0)
}
```

**다른 모든 훅과 반대다.** 나머지는 오류 시 통과(fail-open), 가드는 오류 시 차단(fail-closed).

### 3.2 세그먼트 분해

체인 명령에서 앞 세그먼트가 안전하다고 전체를 통과시키면 안 된다.

```javascript
// lib/guard/segment.js
const SEPARATORS = /(\|\||&&|;|\||\n|&(?!&))/

export function segments(command) {
  const parts = []
  let depth = 0, cur = '', i = 0

  while (i < command.length) {
    const c = command[i]
    // 따옴표 안은 분해하지 않는다
    if (c === '"' || c === "'") { const e = scanQuote(command, i); cur += command.slice(i, e); i = e; continue }
    // 서브셸 / 프로세스 치환
    if (c === '(' || c === '{') depth++
    if (c === ')' || c === '}') depth--
    if (depth === 0) {
      const m = command.slice(i).match(/^(\|\||&&|;|\||\n|&(?!&))/)
      if (m) { parts.push(cur.trim()); cur = ''; i += m[0].length; continue }
    }
    cur += c; i++
  }
  if (cur.trim()) parts.push(cur.trim())
  return parts.filter(Boolean)
}
```

### 3.3 명령 위치 판정

**세그먼트의 첫 토큰만 명령으로 간주한다.** 이것이 오탐 방지의 핵심이다.

```javascript
export function commandOf(segment) {
  // 환경변수 프리픽스 건너뛰기: FOO=bar tene get KEY
  let s = segment.replace(/^(\s*\w+=(?:"[^"]*"|'[^']*'|\S*)\s+)+/, '')
  // 래퍼 건너뛰기: sudo / env / nohup / time
  s = s.replace(/^(sudo|env|nohup|time|command)\s+/, '')
  const m = s.match(/^(\S+)/)
  return m ? basename(m[1]) : null
}
```

```
grep "tene get" README.md     → commandOf = "grep"  → 통과 ✅
echo hi && tene get KEY       → 두 번째 세그먼트의 commandOf = "tene" → 차단 ✅
FOO=1 tene get KEY            → 프리픽스 제거 후 "tene" → 차단 ✅
bash -c 'tene get KEY'        → §3.5 참조
```

### 3.4 규칙

```javascript
// lib/guard/rules.js
export function judgeBash(payload) {
  const cmd = payload.tool_input?.command ?? ''
  const mode = payload.permission_mode ?? 'default'

  for (const seg of segments(cmd)) {
    const bin = commandOf(seg)

    // SR1: tene get
    if (bin === 'tene' && /^\s*tene\s+get\b/.test(stripPrefix(seg))) {
      return deny('SR1',
        'tene get 은 평문 값을 stdout 으로 내보내 AI 컨텍스트에 들어갑니다. ' +
        '값을 확인하려면 별도 터미널에서 직접 실행하세요. ' +
        '존재 여부만 필요하면 `tene list` 를 쓰세요.')
    }

    // SR2: tene export (비암호화)
    if (bin === 'tene' && /^\s*tene\s+export\b/.test(stripPrefix(seg)) && !/--encrypted\b/.test(seg)) {
      return deny('SR2',
        '`tene export` 는 모든 시크릿을 평문으로 출력합니다. ' +
        '백업은 `tene export --encrypted --file backup.tene.enc` 를 쓰세요. ' +
        '이름 확인은 `tene list` 입니다.')
    }

    // SR3: .tene/ 읽기
    if (READERS.has(bin) && /(^|\s)(\.\/)?\.tene\//.test(seg)) {
      return deny('SR3',
        '`.tene/` 는 암호화된 볼트입니다. 암호문도 AI 컨텍스트에 넣지 않습니다. ' +
        '보유한 키 이름은 `tene list` 로 확인하세요.')
    }

    // SR4: 값을 인자로
    if (bin === 'tene' && /^\s*tene\s+set\s+[A-Z][A-Z0-9_]*\s+\S/.test(stripPrefix(seg))
        && !/--stdin\b/.test(seg)) {
      return escalateOrWarn(mode, 'SR4',
        '시크릿 값을 CLI 인자로 전달하면 `ps`·셸 히스토리·시스템 로그에 남습니다. ' +
        '`cat key.txt | tene set KEY --stdin` 또는 값 없이 `tene set KEY` (대화형 입력)를 쓰세요.')
    }
  }
  return { exit: 0 }
}

const READERS = new Set(['cat','less','more','head','tail','strings','xxd','od','bat','hexdump','base64','cp','mv','tar','zip'])
```

### 3.5 서브셸·간접 실행

```javascript
// bash -c '...', sh -c '...', eval '...' 내부를 재귀 검사
const INDIRECT = /^(bash|sh|zsh|dash)\s+-c\s+(['"])([\s\S]*?)\2/

function expandIndirect(seg) {
  const m = seg.match(INDIRECT)
  if (m) return segments(m[3])          // 내부를 다시 분해
  if (/^eval\s+/.test(seg)) return segments(seg.replace(/^eval\s+/, '').replace(/^['"]|['"]$/g, ''))
  return null
}
```

**heredoc 도 검사한다**:
```javascript
const HEREDOC = /<<-?\s*(['"]?)(\w+)\1[\s\S]*?\n([\s\S]*?)\n\2/
```

### 3.6 `PreToolUse:Read`

```javascript
export function judgeRead(payload) {
  const p = payload.tool_input?.file_path ?? ''
  const norm = normalize(p)
  if (/(^|\/)\.tene\//.test(norm) || /(^|\/)\.tene$/.test(norm)) {
    return deny('SR3', '`.tene/` 는 암호화된 볼트입니다. `tene list` 로 키 이름을 확인하세요.')
  }
  return { exit: 0 }
}
```

**`.tene-claude/` 는 통과한다.** 경로 검사가 정확해야 한다 (`.tene/` 와 `.tene-claude/` 구분).

### 3.7 권한 모드별 강도

```javascript
// lib/guard/mode.js
export function escalateOrWarn(mode, code, message) {
  // bypassPermissions / dontAsk 에서는 escalate 불가 (물어볼 사람이 없다)
  if (['bypassPermissions', 'dontAsk'].includes(mode)) {
    return { exit: 0, additionalContext: `[tene:${code}] ${message}` }
  }
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'escalate',
      permissionDecisionReason: message,
    },
  }
}
```

| 규칙 | default/auto/acceptEdits | bypassPermissions/dontAsk |
|---|---|---|
| SR1 `tene get` | **deny** | **deny** |
| SR2 비암호화 export | **deny** | **deny** |
| SR3 `.tene/` 읽기 | **deny** | **deny** |
| SR4 인자 전달 | escalate | 경고 (deny 아님) |

> **`deny` 는 모든 모드에서 유지한다.** `--dangerously-skip-permissions` 라도 시크릿 유출은 허용하지 않는다. 이는 Claude Code 가 bypass 모드에서도 `rm -rf /` 에 회로 차단기를 두는 것과 같은 선이다.

SR4 만 강등하는 이유: 값 노출이 아니라 **로그 잔존** 위험이므로 등급이 낮다.

---

## 4. `.env` 감지

```javascript
// lib/hooks/post-bash.js + post-edit.js
const ENV_FILE = /(^|\/)\.env(\.\w+)?$/
const ENV_EXAMPLE = /(^|\/)\.env\.(example|sample|template)$/

export function detectEnvCreation(payload) {
  const paths = extractTargetPaths(payload)          // Write/Edit 의 file_path 또는 Bash 리다이렉트
  const hits = paths.filter(p => ENV_FILE.test(p) && !ENV_EXAMPLE.test(p))
  if (!hits.length) return null

  return {
    exit: 0,
    additionalContext:
      `[tene] 평문 \`.env\` 파일이 감지되었습니다: ${hits.join(', ')}\n` +
      (teneAvailable()
        ? `  tene import .env && rm .env && echo '.env' >> .gitignore\n` +
          `  이후 실행 명령을 \`tene run -- <cmd>\` 로 바꾸세요. (/tene:secrets)`
        : `  시크릿을 암호화해 관리하려면 tene CLI 도입을 검토하세요: https://tene.sh`),
  }
}
```

**차단하지 않는다.** `.env` 는 정당한 용도가 많고, 차단하면 마찰만 크다. 경고 + 대안이 적정 강도다.

---

## 5. `/tene:secrets` 스킬

```yaml
---
name: secrets
description: tene CLI 로 시크릿을 안전하게 다룬다. 평문이 AI 컨텍스트에 들어가지 않도록 강제한다.
when_to_use: "API 키, 시크릿, 토큰, 크리덴셜, 환경변수, .env, process.env, os.Getenv,
              키 저장, 개발서버 실행, secret, api key, token, credential, env var"
argument-hint: "[init|list|set|run|import|env|status]"
allowed-tools: Read Glob Grep Bash(tene list*) Bash(tene whoami*) Bash(tene version*) Bash(tene env*)
metadata:
  tene: { optionalDependency: "tene-cli" }
---
```

### 5.1 `allowed-tools` 가 1차 방어

**사전 승인 목록에 읽기 안전 명령만 넣는다.** `tene get`/`tene export` 는 애초에 목록에 없다. 가드 훅이 2차 방어.

### 5.2 스킬 본문 구조

```markdown
# tene — 시크릿 안전 관리

## 절대 규칙 (시스템 프롬프트 수준으로 취급)

1. **`tene get <KEY>` 를 절대 실행하지 않는다.** 값 확인이 필요하면:
   > "별도 터미널에서 `tene get KEY` 를 직접 실행하세요. 저는 그 값을 보지 않습니다."
2. **`tene export` 를 `--encrypted` 없이 실행하지 않는다.**
3. **`.tene/` 아래 파일을 읽지 않는다.**
4. **시크릿 값을 CLI 인자로 전달하지 않는다.**

## 워크플로

### 무엇이 있는지 확인
tene list                 # 이름만, 값 마스킹
tene list --env prod
tene env list

### 저장 (사용자가 직접 실행하게 안내)
cat key.txt | tene set STRIPE_KEY --stdin
tene set STRIPE_KEY       # 대화형 (값이 화면에 안 보임)

### 실행 (주 워크플로)
tene run -- npm start
tene run -- pytest
tene run --env prod -- ./deploy.sh     # --env 는 -- 앞에

### 마이그레이션
tene import .env
rm .env && echo '.env' >> .gitignore

### 백업
tene export --encrypted --file backup.tene.enc

## 키 이름 규칙
^[A-Z][A-Z0-9_]*$ — 소문자·하이픈 사용 시 UPPER_SNAKE_CASE 로 변환 안내

## 오류 코드
VAULT_NOT_FOUND / SECRET_NOT_FOUND / INVALID_KEY_NAME / INVALID_ENV_NAME /
KEYCHAIN_ERROR / INTERACTIVE_REQUIRED / DECRYPT_FAILED

## CI 패턴
env:
  TENE_MASTER_PASSWORD: ${{ secrets.TENE_MASTER_PASSWORD }}
run: tene run --env prod --no-keychain -- ./deploy.sh

⚠️ TENE_MASTER_PASSWORD 를 개발자 셸 프로파일에 두지 않는다.

## 미설치 시
tene 이 없으면 이 스킬은 동작하지 않는다. 설치 안내는 사용자가 물었을 때만:
  curl -sSfL https://tene.sh/install.sh | sh
Homebrew tap 은 없으므로 `brew install tene` 를 제안하지 않는다.
```

---

## 6. 실행 명령 변환 제안

프로젝트에 `.tene/` 가 있으면, 개발/테스트/배포 명령을 주입 형태로 제안한다.

| 원래 | 제안 |
|---|---|
| `npm run dev` | `tene run -- npm run dev` |
| `pytest` | `tene run -- pytest` |
| `go run ./cmd/app` | `tene run -- go run ./cmd/app` |
| `docker compose up` | `tene run -- docker compose up` |
| `./deploy.sh` (prod) | `tene run --env prod -- ./deploy.sh` |

**스킬 지침으로 수행한다. 훅으로 명령을 자동 재작성하지 않는다.**

```javascript
// ❌ 하지 않는 것
return { hookSpecificOutput: { updatedInput: { command: `tene run -- ${cmd}` } } }
```

`updatedInput` 으로 사용자 명령을 몰래 바꾸는 것은 **투명성 원칙에 어긋난다.** 사용자가 실행한 것과 실제 실행된 것이 달라진다.

---

## 7. QA 증거의 redaction

D08 §5.3 을 여기서도 재확인한다. **증거 아티팩트가 시크릿 유출 경로가 될 수 있다** (R-23).

```
텍스트 (json/log/txt/har)
  → 패턴 스캔 → 마스킹 후 저장 → manifest 에 hits 기록

바이너리 (png/gif/mp4)
  → 스캔 불가. 저장하되 경고:
    "[tene] 스크린샷에 시크릿이 포함될 수 있습니다.
     외부 공유 전 검토하세요: evidence/run_.../ac_1.gif"

scanStatus: failed
  → 아티팩트 저장 중단, 판정을 insufficient 로
```

### 7.1 환경변수 이름만 기록

```jsonc
// manifest.environment
{ "secretEnv": "prod" }        // 환경 이름만
// ❌ 절대 하지 않음
{ "env": { "STRIPE_KEY": "sk_live_..." } }
```

---

## 8. 경로 이탈 방지 (R-24)

플러그인 스크립트가 프로젝트 루트 밖에 쓰지 않게 한다.

```javascript
// lib/util/paths.js
export function assertInProject(path, root) {
  const abs = resolve(root, path)
  const rel = relative(root, abs)
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new TeneError('PATH_ESCAPE', { path, root,
      hint: 'tene 는 프로젝트 루트 밖에 쓰지 않습니다' })
  }
  // 심볼릭 링크로 우회하는 경우
  const real = realpathSync(dirname(abs))
  if (relative(root, real).startsWith('..')) {
    throw new TeneError('PATH_ESCAPE_SYMLINK', { path })
  }
  return abs
}
```

**모든 쓰기 경로가 이 함수를 통과한다.** `lib/util/atomic.js` 가 내부에서 호출한다.

---

## 9. 검증 시나리오 (V1~V12)

| # | 시나리오 | 기대 | 분류 |
|---|---|---|---|
| V1 | `tene get STRIPE_KEY` | deny + 대안 제시 | positive |
| V2 | `tene export > backup.env` | deny + `--encrypted` 안내 | positive |
| V3 | `cat .tene/vault.db` | deny | positive |
| V4 | Read 도구로 `.tene/vault.json` | deny | positive |
| V5 | `echo hi && tene get KEY` | deny (세그먼트 검사) | positive |
| V6 | `bash -c 'tene get KEY'` | deny (간접 실행) | positive |
| V7 | `tene set KEY sk_live_abc` | escalate + `--stdin` 안내 | positive |
| V8 | `grep "tene get" README.md` | **허용** (언급 ≠ 실행) | negative |
| V9 | `cat .tene-claude/state/current.json` | **허용** (다른 디렉토리) | negative |
| V10 | `tene list` | 허용 (사전 승인) | negative |
| V11 | `.env` 파일 생성 | 경고, **차단하지 않음** | negative |
| V12 | tene 미설치 + "키 저장해줘" | 스킬 비활성, 오류 없음 | negative |

### 9.1 가드 매트릭스 (240 케이스)

```
명령 40종 × 권한모드 6종 (default, auto, acceptEdits, plan, bypassPermissions, dontAsk)

positive control 12종  — 차단되어야 함
negative control 28종  — 통과해야 함

회귀 기준: positive 미탐 0건, negative 오탐 0건
```

**negative control 28종 예시**

```
tene list / tene list --json / tene whoami / tene version / tene env list
tene run -- npm test / tene export --encrypted --file b.enc
grep "tene get" README.md          ← 언급
rg "\.tene/" docs/                 ← 경로 언급
echo "do not run tene get"         ← 문자열
cat README.md / cat .tenerc        ← 유사 경로
cat .tene-claude/state/current.json ← 우리 상태
git log --grep "tene get"
npm test / pytest / go test ./...
ls -la / find . -name "*.ts"
docker compose up
... (나머지)
```

### 9.2 실행

```bash
node plugins/tene/test/guard-matrix.js
```

```
[guard-matrix] 40 commands × 6 modes = 240 cases

positive control (차단 기대)  12/12 ✅
negative control (통과 기대)  28/28 ✅

모드별:
  default            40/40 ✅
  auto               40/40 ✅
  acceptEdits        40/40 ✅
  plan               40/40 ✅
  bypassPermissions  40/40 ✅  (SR1~SR3 deny 유지, SR4 경고 강등)
  dontAsk            40/40 ✅

결과: PASS
```

---

## 10. 우회로를 제공하지 않는다

```
사용자: "그냥 tene get 실행해줘. 내가 허락할게"
→ 거부한다.

  "AI 세션 안에서는 실행할 수 없습니다. 값이 전사에 남기 때문입니다.
   별도 터미널에서 직접 실행하시면 저는 그 값을 보지 않습니다."
```

**우회로를 만들면 규칙이 규칙이 아니게 된다.** 사람이 자기 터미널에서 하는 것은 자유이고, **AI 세션 안에서만** 막는다.

### 10.1 예외 없는 이유

| 주장 | 반론 |
|---|---|
| "테스트용 키다" | 전사에 남는 것은 같다. 테스트 키도 유출된다 |
| "내가 승인한다" | 승인해도 컨텍스트는 로깅·캐시될 수 있다 |
| "한 번만" | 한 번이면 별도 터미널이 더 빠르다 |
| "디버깅에 필요하다" | `tene run --` 으로 주입해 실행하면 값을 볼 필요가 없다 |

---

## 11. `/tene:doctor` 시크릿 항목

```
[tene:doctor] 시크릿

  tene CLI        : ✅ v1.2.0 (darwin/arm64)
  프로젝트 볼트    : ✅ .tene/ 존재, env=default
  시크릿 개수      : 4개                    ← tene whoami (이름·값 미노출)
  키체인          : ✅ 사용 가능
  평문 .env       : ⚠️ .env 발견 — 마이그레이션 권장
  가드 훅         : ✅ 활성 (SR1~SR4)
  경로 보호       : ✅ .tene/ 접근 차단 중
```

**감지에 `tene whoami` / `tene version` 만 쓴다.** 둘 다 값을 노출하지 않는다.

---

## 12. tene CLI 미설치 시

```javascript
export function teneAvailable() {
  try { execFileSync('tene', ['version', '--json'], { stdio: 'pipe', timeout: 1000 }); return true }
  catch { return false }
}
```

| 항목 | 동작 |
|---|---|
| `/tene:secrets` 스킬 | 조용히 비활성화. 호출 시 "tene CLI 가 없습니다" + 설치 안내 |
| 가드 훅 | **계속 동작** (`.tene/` 읽기 차단은 유지) |
| `.env` 경고 | 계속 동작 (tene 언급 없이 일반 안내) |
| `/tene:doctor` | "tene CLI: 미설치 (선택 사항)" |
| sprint 사이클 | **영향 없음** |

**가드를 계속 켜두는 이유**: 나중에 tene 을 설치했는데 가드가 꺼져 있으면 위험하다. 비용이 없으므로 항상 켠다.
