# D12 · 오류 · 동시성 · 마이그레이션

> 대응: NFR-5 (fail-open), NFR-6 (결정론), R-02~R-04, W-05
> 관련: [D03 상태 스키마 §8](./03-state-schema.md)

---

## 1. 오류 모델

### 1.1 `TeneError`

```javascript
// lib/util/errors.js
export class TeneError extends Error {
  /**
   * @param {string} code       오류 코드 (§1.3 표)
   * @param {Object} [detail]   구조화된 상세
   * @param {string} [hint]     사용자가 할 수 있는 행동
   */
  constructor(code, detail = {}, hint) {
    super(MESSAGES[code]?.(detail) ?? code)
    this.code = code
    this.detail = detail
    this.hint = hint ?? HINTS[code]?.(detail)
    this.exitCode = EXIT_CODES[code] ?? 1
  }
  toJSON() {
    return { code: this.code, message: this.message, detail: this.detail, hint: this.hint }
  }
}
```

### 1.2 종료 코드

| 코드 | 의미 | 훅에서 |
|---|---|---|
| `0` | 성공 | 통과 |
| `1` | 일반 오류 | **fail-open 이면 0 으로 변환** |
| `2` | 차단 | 훅이 액션을 막음 |
| `3` | 선행 조건 미충족 (상태·문서 없음) | 0 으로 변환 |
| `4` | 충돌 (lock, stale revision) | 0 으로 변환 + 경고 |
| `5` | 의존성·capability 없음 | 0 으로 변환 |
| `6` | 보안 정책 위반 | **가드에서만. deny** |
| `7` | I/O·손상·마이그레이션 실패 | 0 으로 변환 + 복구 안내 |
| `8` | 자식 도구·테스트 실패 | 스킬이 해석 |

### 1.3 오류 코드 표

| 코드 | 발생 | exit | hint |
|---|---|---|---|
| `NO_ACTIVE_SPRINT` | 활성 sprint 없음 | 3 | `/tene:sprint init <id>` |
| `SPRINT_NOT_FOUND` | 지정 sprint 없음 | 3 | `/tene:sprint list` |
| `PHASE_MISMATCH` | 스킬 phase ≠ 현재 | 3 | 현재 phase 의 스킬 안내 |
| `INVALID_TRANSITION` | 전이표에 없는 조합 | 2 | 허용 전이 목록 |
| `GATE_BLOCKED` | 게이트 미통과 | 3 | findings 의 remediation |
| `DOC_MISSING` | 필요 문서 없음 | 3 | 해당 스킬 안내 |
| `DOC_INVALID` | 필수 섹션 누락 | 3 | 누락 목록 |
| `AUTO_BLOCK_UNPAIRED` | start/end 쌍 불일치 | 7 | 수동 수정 필요 (파일:라인) |
| `STALE_WRITE` | 동시 편집 충돌 | 4 | 현재 상태 표시 후 재시도 |
| `LOCK_TIMEOUT` | 잠금 획득 실패 | 4 | `/tene:doctor` |
| `STATE_CORRUPT` | JSON 파싱 실패 | 7 | `.corrupt-<ts>` 보존 + `--resync` |
| `SCHEMA_TOO_NEW` | 상위 버전 스키마 | 7 | 플러그인 업데이트 |
| `MIGRATION_FAILED` | 마이그레이션 실패 | 7 | 백업 경로 + 수동 복구 |
| `INDEX_MISSING` | 인덱스 없음 | 5 | `tene-scan build` 자동 실행 |
| `INDEX_STALE` | 인덱스 낡음 | 0(경고) | `tene-scan build --incremental` |
| `LANG_UNSUPPORTED` | 언어 팩 없음 | 0(경고) | Tier 3 폴백 |
| `NO_TEST_RUNNER` | 러너 미감지 | 5 | UNIT `insufficient` |
| `NO_BROWSER` | 브라우저 미감지 | 5 | UX `insufficient` |
| `TENE_CLI_MISSING` | tene CLI 없음 | 5 | 시크릿 스킬 비활성 |
| `PATH_ESCAPE` | 프로젝트 밖 쓰기 시도 | 6 | (내부 버그) |
| `GUARD_ERROR` | 가드 내부 오류 | 6 | **deny (fail-closed)** |
| `WORKFLOW_UNAVAILABLE` | CC 버전 미달 | 0 | 순차 실행으로 degrade |

### 1.4 응답 봉투

```jsonc
// 성공
{ "ok": true, "tool": "tene-state", "schemaVersion": 1, "elapsedMs": 12,
  "data": { ... }, "warnings": [] }

// 실패
{ "ok": false, "tool": "tene-gate", "schemaVersion": 1,
  "error": { "code": "GATE_BLOCKED", "message": "G6 게이트 실패",
             "detail": { "gate": "G6", "findings": [...] },
             "hint": "/tene:loop-check 로 복귀하세요" },
  "warnings": [] }
```

**stdout 은 봉투 전용, 진단은 stderr.** `--json` 에서도 시크릿·원시 페이로드를 포함하지 않는다.

---

## 2. fail-open / fail-closed 경계

```
┌──────────────────────────────────────────────────────────┐
│ fail-closed  ← 단 하나                                     │
│   bin/tene-guard                                          │
│   내부 예외 발생 시에도 deny                                │
├──────────────────────────────────────────────────────────┤
│ fail-open  ← 나머지 전부                                   │
│   모든 훅, 모든 bin 스크립트                                │
│   내부 오류 시 exit 0, 사용자 작업을 막지 않음               │
└──────────────────────────────────────────────────────────┘
```

### 2.1 fail-open 구현

```javascript
// bin/tene-hook
try {
  const result = await handler.run(payload, event)
  emit(result)
  process.exit(result.exit ?? 0)
} catch (err) {
  // 진단은 디버그 로그에만
  if (process.env.TENE_DEBUG) process.stderr.write(String(err.stack))
  process.exit(0)                    // 사용자를 막지 않는다
}
```

### 2.2 예외: `TaskCompleted` 게이트

게이트 훅은 **의도적 차단(exit 2)** 과 **오류(exit 0)** 를 구분해야 한다.

```javascript
try {
  const gate = evaluateGate(sprint, gateId)
  if (gate.result === 'fail') {
    process.stderr.write(formatBlockMessage(gate))
    process.exit(2)                  // 의도적 차단
  }
  process.exit(0)
} catch (err) {
  // 게이트를 평가하지 못했으면 막지 않는다
  process.exit(0)
}
```

**게이트를 평가하지 못한 것과 게이트가 실패한 것은 다르다.** 전자는 통과시킨다.

---

## 3. 동시성

### 3.1 세 가지 충돌 시나리오

| 시나리오 | 발생 | 대응 |
|---|---|---|
| 두 세션이 같은 sprint 를 동시 편집 | 사용자가 두 터미널을 염 | 낙관적 잠금 |
| 훅과 스킬이 동시에 상태를 씀 | 편집 중 훅 발화 | advisory lock |
| 워크플로 에이전트 다수가 evidence 를 씀 | 팬아웃 | 파일명 분리 (충돌 없음) |

### 3.2 Advisory Lock

```javascript
// lib/util/lock.js
const LOCK = '.tene-claude/.lock'
const TIMEOUT_MS = 5000
const STALE_MS = 30000

export async function withLock(fn) {
  acquire()
  try { return await fn() }
  finally { release() }
}

function acquire() {
  const deadline = Date.now() + TIMEOUT_MS
  while (Date.now() < deadline) {
    try {
      const fd = openSync(LOCK, 'wx')                        // O_EXCL
      writeSync(fd, JSON.stringify({ pid: process.pid, host: hostname(), at: nowIso() }))
      closeSync(fd)
      return
    } catch (e) {
      if (e.code !== 'EEXIST') throw e
      if (isStale()) { try { unlinkSync(LOCK) } catch {}; continue }
      sleepSync(50)
    }
  }
  throw new TeneError('LOCK_TIMEOUT', {}, 'tene-state doctor 로 lock 상태를 확인하세요')
}

function isStale() {
  try {
    const info = JSON.parse(readFileSync(LOCK, 'utf8'))
    if (Date.now() - Date.parse(info.at) > STALE_MS) return true
    if (info.host === hostname() && !processAlive(info.pid)) return true
    return false
  } catch { return true }                                     // 파싱 실패 = stale
}
```

**30초 stale 기준**: 훅 로직은 최대 500ms(§6.2 — 프로세스 총 시간이 아니다), 스킬 작업도 30초를 넘지 않는다. 넘으면 프로세스가 죽은 것으로 본다.

**훅은 lock 을 잡지 않는다.** 200ms 예산 안에서 5초 대기는 불가능하다. 훅의 쓰기는 §3.4 참조.

### 3.3 낙관적 잠금 — `rev` 카운터

> ⚠️ **구현 중 정정** — `updatedAt` 비교로는 같은 초 안의 변경을 놓친다 (D03 §8.3 참조).
> 비교 대상은 단조 증가 카운터 `rev` 다.

```javascript
export function writeSprint(root, sprint, opts = {}) {
  if (opts.expectedRev !== undefined) {
    const onDisk = parseJsonSafe(readTextOrNull(sprintPath(root, sprint.id)) ?? '')
    if (onDisk && (onDisk.rev ?? 0) !== opts.expectedRev) {
      throw new TeneError('STALE_WRITE', {
        expectedRev: opts.expectedRev,
        actualRev: onDisk.rev ?? 0,
        updatedAt: onDisk.updatedAt,
        currentPhase: onDisk.phase,
      })
    }
  }
  writeAtomic(sprintPath(root, sprint.id), stableJson(stamp(sprint)))
}

/** rev 를 올리고 시각을 찍는다 — 모든 쓰기가 반드시 거친다 */
function stamp(obj) {
  obj.rev = (obj.rev ?? 0) + 1
  obj.updatedAt = nowIso()
  obj.updatedBy = { kind: 'claude', sessionId: sessionId() }
  return obj
}
```

**lock 과의 관계**: `withLock` 은 같은 머신의 동시 쓰기를 직렬화하고, `rev` 는 *읽은 뒤
사용자 상호작용을 거쳐 쓰는* 긴 구간의 충돌을 잡는다. 둘은 대체재가 아니다.

### 3.4 훅의 쓰기 (lock 없이)

`PostToolUse` 의 stale 마킹은 lock 을 잡지 않는다. 대신 **최소 변경 + 재시도 없음**.

```javascript
// lib/hooks/post-edit.js
function markStaleNoLock(acIds, cause) {
  try {
    const raw = readFileSync(path, 'utf8')
    const sprint = JSON.parse(raw)
    let changed = false
    for (const id of acIds) {
      const ac = sprint.ac?.find(a => a.id === id)
      if (ac?.verdict === 'passed') { ac.verdict = 'stale'; ac.staledBy = cause; changed = true }
    }
    if (!changed) return []
    sprint.updatedAt = nowIso()
    writeAtomic(path, stableJson(sprint))     // rename 은 원자적
    return acIds
  } catch {
    return []                                  // 실패해도 조용히 넘어감
  }
}
```

**손실 위험을 감수한다.** stale 마킹을 놓쳐도 다음 `loop-check`/`qa` 에서 재계산된다. 200ms 예산이 우선이다.

### 3.5 충돌 시 사용자 안내

```
[tene] 다른 세션이 이 sprint 를 변경했습니다.

  내가 읽은 시각 : 2026-08-20T04:10:00Z (phase: loop-check)
  현재 디스크    : 2026-08-20T04:25:00Z (phase: qa)

  → 최신 상태를 확인하려면: /tene:status
  → 내 변경을 반영하려면 다시 시도하세요

자동으로 병합하지 않습니다. 어느 쪽이 맞는지는 당신이 압니다.
```

**자동 병합하지 않는 이유**: 상태는 phase·게이트·판정을 담는다. 잘못 병합하면 통과하지 않은 게이트가 통과로 기록될 수 있다.

---

## 4. 손상 복구

### 4.1 감지와 격리

```javascript
// lib/state/store.js
export function loadSprint(id) {
  const path = sprintPath(id)
  if (!existsSync(path)) throw new TeneError('SPRINT_NOT_FOUND', { id })

  let raw
  try { raw = readFileSync(path, 'utf8') }
  catch (e) { throw new TeneError('STATE_CORRUPT', { id, cause: e.code }) }

  let parsed
  try { parsed = JSON.parse(raw) }
  catch (e) {
    const backup = `${path}.corrupt-${Date.now()}`
    try { renameSync(path, backup) } catch {}
    throw new TeneError('STATE_CORRUPT', { id, backup },
      `상태 파일이 손상되어 ${backup} 으로 보존했습니다. ` +
      `/tene:status ${id} --resync 로 문서에서 복구하세요.`)
  }
  return migrate(parsed, path)
}
```

### 4.2 복구 경로

```
STATE_CORRUPT
  ↓
.corrupt-<ts> 로 격리 (삭제하지 않는다)
  ↓
/tene:status <id> --resync
  ↓
docs/sprints/<dir>/ 의 문서를 읽어 상태 재구성 (D03 §10)
  ↓
추론된 phase 를 사용자에게 확인 요청
  ↓
확정 후 저장 + StateResynced 이벤트
```

### 4.3 이벤트 로그 손상

```javascript
// lib/state/events.js
export function readEvents(limit) {
  const lines = readFileSync(EVENTS, 'utf8').split('\n').filter(Boolean)
  const out = [], bad = []
  for (const line of lines.slice(-limit)) {
    try { out.push(JSON.parse(line)) } catch { bad.push(line.slice(0, 80)) }
  }
  if (bad.length) warn(`이벤트 로그에 손상된 줄 ${bad.length}개를 건너뛰었습니다`)
  return out
}
```

**한 줄 손상이 전체를 막지 않는다.** NDJSON 의 이점.

### 4.4 인덱스 손상

인덱스는 **파생 데이터**이므로 손상 시 그냥 재생성한다.

```javascript
export function readIndex() {
  try { return JSON.parse(readFileSync(INDEX, 'utf8')) }
  catch {
    try { unlinkSync(INDEX) } catch {}
    return null                          // 호출자가 build 를 트리거
  }
}
```

---

## 5. 마이그레이션

### 5.1 구조

```javascript
// lib/state/migrate.js
const CURRENT = 1

const MIGRATIONS = {
  // 예시 (v2 가 생기면)
  // 2: (s) => ({ ...s, ac: s.ac.map(a => ({ ...a, priority: a.priority ?? 'blocking' })) }),
}

export function migrate(state, path) {
  const v = state.schemaVersion ?? 0

  if (v === CURRENT) return state

  if (v > CURRENT) {
    throw new TeneError('SCHEMA_TOO_NEW', { found: v, supported: CURRENT },
      '이 상태 파일은 더 새로운 플러그인이 만들었습니다. ' +
      '/plugin update tene@agent-kay-it 로 업데이트하세요. ' +
      '(파일을 수정하지 않았습니다)')
  }

  // 백업
  const backup = `${path}.bak-v${v}-${Date.now()}`
  copyFileSync(path, backup)

  let s = state
  try {
    for (let i = v + 1; i <= CURRENT; i++) {
      const fn = MIGRATIONS[i]
      if (!fn) throw new TeneError('MIGRATION_MISSING', { from: i - 1, to: i })
      s = fn(s)
      s.schemaVersion = i
    }
  } catch (e) {
    throw new TeneError('MIGRATION_FAILED', { from: v, to: CURRENT, backup },
      `마이그레이션 실패. 원본은 ${backup} 에 있습니다.`)
  }

  writeAtomic(path, stableJson(s))
  return s
}
```

### 5.2 규칙

| 규칙 | 이유 |
|---|---|
| 마이그레이션 전 **반드시 백업** | 되돌릴 수 없다 |
| 상위 버전은 **읽기 전용** (수정 금지) | 다운그레이드가 데이터를 파괴한다 |
| 마이그레이션 함수는 **순수 함수** | 테스트 가능 |
| 각 단계는 **한 버전씩** | 1→3 을 직접 하지 않는다 |
| 실패 시 **원본 유지** | 부분 마이그레이션 금지 |

### 5.3 인덱스 스키마 변경

인덱스는 재생성 가능하므로 마이그레이션하지 않는다.

```javascript
export function readIndexOrRebuild() {
  const idx = readIndex()
  if (!idx || idx.schemaVersion !== INDEX_SCHEMA_VERSION) {
    return null                          // 호출자가 build
  }
  return idx
}
```

### 5.4 문서 스키마 변경

문서는 **사람이 편집한 것**이므로 자동 변환하지 않는다.

```
문서 frontmatter 의 schemaVersion 이 낮으면:
  → 검증 시 경고만 표시
  → "이 문서는 이전 양식입니다. 새 섹션이 필요할 수 있습니다: <목록>"
  → tene-doc scaffold --merge 로 누락 섹션만 추가 제안
```

---

## 6. 성능 예산 강제

### 6.1 데드라인 가드

```javascript
// lib/util/deadline.js
export function withDeadline(ms, fn) {
  const t0 = performance.now()
  const check = () => {
    if (performance.now() - t0 > ms) throw new DeadlineExceeded(ms)
  }
  return fn(check)
}
```

```javascript
// 사용
export function run(payload) {
  try {
    return withDeadline(150, (check) => {
      const anchors = readAnchorIndex(); check()
      const acs = lookup(anchors, path); check()
      return markStale(acs, path)
    })
  } catch (e) {
    if (e instanceof DeadlineExceeded) return { exit: 0 }    // 조용히 포기
    throw e
  }
}
```

### 6.2 예산이 재는 것 — 프로세스 시간이 아니라 **훅 로직 시간**

> ⚠️ **구현 중 정정** — 실측으로 드러난 사실이다.
>
> | 항목 | 실측 (Node 26, macOS, 30회 중앙값) |
> |---|---|
> | `node -e ''` 빈 기동 | **227ms** |
> | `tene-hook session-start` 전체 | **266ms** |
> | 그중 tene 로직 | **39ms** |
>
> 인터프리터 기동만으로 227ms 다. **Node 로 만든 훅은 어떤 최적화를 해도
> 프로세스 총 시간 200ms 를 지킬 수 없다.** 따라서 아래 예산 표는
> `withDeadline()` 이 재는 구간 — 즉 **프로세스가 뜬 뒤 우리 코드가 쓰는 시간** — 에만 적용된다.
>
> 프로세스 총 시간은 `hooks.json` 의 `timeout` (초 단위, 5~15초)이 통제한다.
> 두 숫자는 대상이 다르므로 서로 비교하면 안 된다.
>
> **설계에 미치는 영향**: 훅 하나를 더 붙이는 비용은 "로직 몇 ms" 가 아니라
> "Node 기동 227ms" 다. 그래서 `bin/tene-hook` 하나가 첫 인자로 분기한다 (D05 §8).
> 이벤트마다 스크립트를 두면 세션 시작에만 수백 ms 가 더 붙는다.

| 경로 | 로직 예산 | 초과 시 |
|---|---|---|
| `PostToolUse` | 150ms (여유 50ms) | 조용히 포기 |
| `SessionStart` | 150ms | 요약 없이 통과 |
| `PreToolUse` 가드 | 300ms | **deny** (fail-closed) |
| `TaskCompleted` | 500ms | exit 0 (차단 안 함) |
| `SessionEnd` | **500ms** (1.5s 공유) | 크기 확인만 |
| `Stop` | 300ms | 안내 없이 통과 |

### 6.3 벤치마크

```bash
node plugins/tene/test/hook-latency.js
```

```
[hook-latency] 100 iterations each

  session-start    p50: 18ms  p95: 31ms  p99: 44ms   ✅ (<150)
  post-edit        p50: 12ms  p95: 22ms  p99: 38ms   ✅ (<150)
  pre-edit         p50:  8ms  p95: 14ms  p99: 19ms   ✅ (<150)
  guard-bash       p50:  6ms  p95: 11ms  p99: 15ms   ✅ (<300)
  task-completed   p50: 41ms  p95: 78ms  p99: 112ms  ✅ (<500)

  인덱스 크기: 8.4MB (심볼 1,840 / 참조 5,211)
  결과: PASS
```

**인덱스가 커지면 p99 가 오른다.** 20MB 초과 시 경고하고 `--prune` 을 제안한다.

---

## 7. 결정론 보장 (NFR-6)

### 7.1 비결정 요소 제거

| 요소 | 처리 |
|---|---|
| 시간 | 모든 시간을 인자로 주입. `lib/util/time.js` 의 `nowIso()` 만 실제 시계 접근 |
| 파일 순회 순서 | 항상 정렬 (`sort()`) |
| 객체 키 순서 | `stableJson()` 이 재귀 정렬 |
| Map/Set 순회 | 정렬 후 순회 |
| 정규식 `lastIndex` | 매 사용 전 `re.lastIndex = 0` 또는 `matchAll` |
| 병렬 결과 순서 | 인덱스 보존 후 정렬 |

### 7.2 테스트

```javascript
// test/determinism.test.js
test('같은 입력에 같은 출력', async () => {
  const a = await buildIndex(FIXTURE)
  const b = await buildIndex(FIXTURE)
  assert.equal(stableJson(stripTimestamps(a)), stableJson(stripTimestamps(b)))
})

test('파일 순회 순서가 결과에 영향을 주지 않는다', async () => {
  const a = await buildIndex(FIXTURE, { shuffle: false })
  const b = await buildIndex(FIXTURE, { shuffle: true })
  assert.deepEqual(stripTimestamps(a).symbols, stripTimestamps(b).symbols)
})
```

---

## 8. 디버깅

### 8.0 Claude Code 버전 감지 (구현 중 발견)

`claude --version` 은 **실측 2.5초**다. Node 기동(227ms)의 10배이고 훅 로직 예산을 완전히 깨므로 훅에서 호출하면 안 된다.

**3단 폴백** (`lib/doctor.js` `detectClaudeVersion`)

| 단계 | 방법 | 비용 |
|---|---|---|
| 1 | `CLAUDE_CODE_EXECPATH` 경로에서 버전 추출 (`.../versions/2.1.235`) | **0ms** |
| 2 | `.tene-claude/index/env-cache.json` (7일 TTL) | ~1ms |
| 3 | `claude --version` → 캐시 저장 | 2.5초 |

**훅 컨텍스트에서는 `allowExec: false` 로 3단계를 막는다.** 버전을 못 얻으면 `null` 을 반환하고, 호출자는 기능을 보수적으로 비활성화한다.

### 8.1 `TENE_DEBUG`

```bash
TENE_DEBUG=1 claude
```

- 훅 예외의 스택을 stderr 로 출력 (Claude Code 디버그 로그에 남음)
- `bin/` 스크립트가 `warnings` 에 내부 상태를 포함
- 성능 측정을 `elapsedMs` 에 상세 기록

### 8.2 `/tene:doctor` 진단

```
[tene:doctor]

환경
  Claude Code      : v2.1.234 ✅
  Node.js          : v22.3.0 ✅ (요구: 20+)
  Dynamic Workflow : ✅ 사용 가능
  Task Management  : ✅ 사용 가능

상태
  프로젝트 루트     : /Users/kay/my-app
  상태 디렉토리     : .tene-claude/ ✅
  활성 sprint       : checkout-retry (qa)
  lock             : 없음 ✅
  스키마 버전       : 1 (현재)

인덱스
  심볼 인덱스       : ✅ 1,840 심볼 / 5,211 참조 (20분 전)
  앵커 인덱스       : ✅ 3 AC
  계층 규칙         : ✅ docs/sprints/_meta/layers.yml
  미지원 언어       : .kt (23 파일) — Tier 3 폴백

QA capability
  테스트 러너       : ✅ vitest
  타입체크          : ✅ tsc --noEmit
  브라우저          : ⚠️ Chrome MCP 미연결, Playwright 감지됨
  DB 관찰           : ⛔ 없음 — L3 일부 insufficient 예상

시크릿
  tene CLI         : ✅ v1.2.0
  볼트             : ✅ .tene/ (4개 시크릿)
  가드 훅           : ✅ 활성

문서
  sprint 3개, 문서 14개
  ⚠️ 고아 문서 1건: docs/sprints/old-feature-x/ (상태 없음)
     → /tene:status old-feature --resync 또는 아카이브

권장 조치
  1. Chrome MCP 를 연결하면 UX 검증 정확도가 올라갑니다
  2. 고아 문서를 정리하세요
```

### 8.3 `--json` 출력

```
/tene:doctor --json
```

CI 나 이슈 리포트에 첨부할 수 있는 형태. **경로는 프로젝트 상대, 시크릿 값 없음.**

---

## 9. 로깅 정책

| 원칙 | 내용 |
|---|---|
| 상태 변경은 `events.ndjson` 에 | 감사 추적 |
| 진단은 stderr | Claude Code 디버그 로그로 |
| **시크릿 값은 어디에도 기록하지 않는다** | 키 이름조차 최소화 |
| 사용자 데이터를 외부로 보내지 않는다 | 텔레메트리 없음 |
| 경로는 프로젝트 상대 | 홈 디렉토리 노출 방지 |

```javascript
// lib/util/log.js
const REDACT = [/\/Users\/[^/]+/g, /\/home\/[^/]+/g, /C:\\Users\\[^\\]+/g]

export function safePath(p) {
  let s = String(p)
  for (const re of REDACT) s = s.replace(re, '~')
  return s
}
```

---

## 10. 복구 절차 요약 (사용자용)

| 증상 | 조치 |
|---|---|
| "상태 파일이 손상되었습니다" | `/tene:status <id> --resync` |
| "다른 세션이 변경했습니다" | `/tene:status` 로 확인 후 재시도 |
| "lock 획득 실패" | `/tene:doctor` → stale lock 정리 |
| 인덱스가 이상함 | `/tene:clear --index` → 자동 재생성 |
| 게이트가 부당하게 막음 | `/tene:sprint waiver` 또는 `--force` (이벤트 기록됨) |
| 훅이 느림 | `TENE_DEBUG=1` 로 측정, `/tene:clear --index` |
| 문서와 상태 불일치 | **문서가 정본.** `--resync` |
| 플러그인을 지우고 싶음 | `/plugin uninstall` — `docs/sprints/` 는 남는다 |
