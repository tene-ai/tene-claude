# tene plugin — tene CLI 선택적 연동 설계

> 대응 요구사항: FR-7, PP7, NFR-5(보안 게이트는 fail-closed)
> 대상 CLI: `github.com/tene-ai/tene` (Go, MIT, 로컬 우선 암호화 시크릿 매니저)

---

## 0. 연동의 성격 — 하드 의존이 아니다

| 상태 | 플러그인 동작 |
|---|---|
| tene CLI 설치됨 + 프로젝트에 `.tene/` 존재 | 시크릿 스킬 활성. 가드 훅 전면 동작 |
| tene CLI 설치됨 + `.tene/` 없음 | 도입 안내만. 가드 훅은 대기 |
| tene CLI 미설치 | **시크릿 스킬 조용히 비활성화.** `.env` 평문 경고만 유지 |

> 플러그인의 sprint 사이클은 tene CLI 유무와 **무관하게** 완전히 동작한다(FR-7.5, ADR-1).

---

## 1. tene CLI 분석 요약

### 1.1 제품 정체

- Go 단일 바이너리. 서버 없음. MIT 라이선스
- 시크릿을 **XChaCha20-Poly1305**로 암호화해 디스크에 저장하고, **`tene run -- <cmd>` 로 자식 프로세스 환경변수에만 주입**한다
- 마스터 키는 마스터 패스워드 → **Argon2id**(64MB, 3 iterations) → 256-bit, OS 키체인에 캐시
- 복구는 **12단어 BIP-39 니모닉** → Argon2id → 복구 키
- 프로젝트별 `.tene/` 디렉토리. 전역 애그리게이터 없음

### 1.2 존재 이유 — AI 안전성

> *"AI 에이전트(Claude Code, Cursor, Windsurf, Gemini, Codex, Copilot)가 평문 값을 절대 보지 못하게 한다."*

이 목적이 플러그인의 PP7(비밀정보는 절대 컨텍스트에 넣지 않는다)과 정확히 같다.

### 1.3 명령 표 (활성 명령만)

| 명령 | 용도 | 주요 플래그 | AI 안전 |
|---|---|---|---|
| `tene init [name]` | 볼트 + 마스터 패스워드 + 복구 문구 + 에디터 규칙 파일 생성 | `--claude` `--cursor` `--windsurf` `--gemini` `--codex` | ✅ |
| `tene set KEY [VALUE]` | 암호화 저장 | `--stdin` `--overwrite` `--env` | ✅ **(`--stdin` 경유)** |
| `tene get KEY` | 복호화 출력 | — | ❌ **AI가 실행 금지** |
| `tene list` | 키 이름만 (값 마스킹) | `--json` `--env` | ✅ |
| `tene delete KEY` | 삭제 | `--force` | ✅ |
| `tene run -- CMD` | 환경변수 주입 후 실행 | (전역 플래그는 `--` **앞에**) | ✅ **주 워크플로** |
| `tene import FILE` | `.env` / `.tene.enc` 대량 가져오기 | `--overwrite` `--encrypted` | ✅ |
| `tene export` | 내보내기 | `--file` `--encrypted` | ❌ **`--encrypted` 없이는 금지** |
| `tene env [subcmd]` | 환경 전환/생성/삭제 | — | ✅ |
| `tene passwd` | 마스터 패스워드 변경 (볼트 재암호화) | — | ✅ |
| `tene recover` | BIP-39 니모닉으로 복구 | — | ✅ |
| `tene whoami` | 볼트 상태 | — | ✅ |
| `tene version` / `tene update` | 버전 / 자체 업데이트 | `--json` / `--check` | ✅ |

> 클라우드 명령(`login`/`push`/`pull`/`sync`/`billing`/`team`)은 현재 CLI에서 비활성이다. **제안하지 않는다.**

### 1.4 제약 규칙

| 항목 | 규칙 |
|---|---|
| 키 이름 | `^[A-Z][A-Z0-9_]*$` — 대문자·숫자·언더스코어. 숫자 시작 불가. 예약어(`PATH` 등) 거부 |
| 환경 이름 | `^[a-z][a-z0-9-]*$` — `default`는 삭제 불가 |
| `--env` 위치 | 반드시 `--` **앞에**. 뒤에 오면 자식 명령의 플래그가 된다 |
| Windows | curl 설치 스크립트 미지원. 소스 빌드 또는 릴리스 zip |
| Homebrew | tap 미제공 — `brew install tene` 제안 금지 |

### 1.5 CI 패턴

```yaml
env:
  TENE_MASTER_PASSWORD: ${{ secrets.TENE_MASTER_PASSWORD }}
steps:
  - run: curl -sSfL https://tene.sh/install.sh | sh
  - run: tene run --env prod --no-keychain -- ./deploy.sh
```

> `TENE_MASTER_PASSWORD` 를 **개발자 머신의 셸 프로파일에 두지 않는다.** 키체인 보호를 무력화한다.

---

## 2. 4대 안전 규칙 (플러그인이 강제하는 것)

이 네 가지는 **협상 대상이 아니다.** 위반하면 평문 시크릿이 대화 컨텍스트에 들어가고, 그 컨텍스트는 로깅·캐시·보존될 수 있다.

| # | 규칙 | 위반 예 | 대안 |
|---|---|---|---|
| **SR1** | `tene get <KEY>` 를 **실행하지 않는다** | 값을 확인하려고 실행 | *"별도 터미널에서 직접 실행하세요. 저는 보지 않습니다"* |
| **SR2** | `tene export` 를 `--encrypted` 없이 실행하지 않는다 | 백업하려고 평문 덤프 | `tene export --encrypted --file backup.tene.enc` |
| **SR3** | `.tene/` 아래 파일을 **읽지 않는다** (`cat`/`Read`/에디터) | 볼트 구조 확인 | `tene list` (이름만) |
| **SR4** | 시크릿 값을 **CLI 인자로 전달하지 않는다** | `tene set KEY sk_live_...` | `cat key.txt \| tene set KEY --stdin` 또는 대화형 입력 |

`.tene/` 는 암호문이지만, **암호문조차 AI 컨텍스트에 넣지 않는다**는 것이 tene CLI 자체 규약이다. 플러그인은 이를 그대로 승계한다.

---

## 3. 구현 설계

### 3.1 스킬 — `/tene:secrets`

기존 `tene-cli` 스킬 자산을 플러그인 스킬로 이식한다. 원본은 완성도가 높으므로 **재작성이 아니라 이식 + 사이클 연계 추가**다.

```yaml
---
name: secrets
description: tene CLI 로 시크릿을 안전하게 다룬다. 평문이 컨텍스트에 들어가지 않도록 강제한다.
when_to_use: "API 키, 시크릿, 토큰, 크리덴셜, .env, 환경변수, process.env, os.Getenv, 키 저장, 개발서버 실행,
              secret, api key, token, credential, env var"
argument-hint: "[init|list|set|run|import|env|status]"
allowed-tools: Read Glob Grep Bash(tene list*) Bash(tene whoami*) Bash(tene version*) Bash(tene env*)
disallowed-tools: ""
metadata:
  tene: { optional_dependency: "tene-cli", phase: null }
---
```

**`allowed-tools` 설계가 핵심이다.** 사전 승인 목록에 **읽기 안전한 명령만** 넣는다. `tene get`/`tene export` 는 애초에 목록에 없고, 추가로 훅이 차단한다(이중 방어).

**스킬이 담는 내용** (요약 — 상세는 원본 자산 이식)
1. 4대 안전 규칙 (SR1~SR4) — 시스템 프롬프트 수준으로 취급
2. 워크플로 10종: init / list / set / run / import / export(암호화) / passwd / recover / env / 진단
3. 키·환경 이름 규칙, `--env` 위치 규칙
4. 오류 코드 표 (`VAULT_NOT_FOUND`, `SECRET_NOT_FOUND`, `INVALID_KEY_NAME`, `KEYCHAIN_ERROR` …)
5. CI 패턴
6. 아키텍처 요약 (Argon2id / XChaCha20-Poly1305 / 키체인 / BIP-39) — "이거 안전한가요?" 질문 대응

### 3.2 가드 훅 — `bin/tene-guard`

시크릿 가드는 플러그인에서 **유일하게 fail-closed** 인 컴포넌트다. 내부 오류 시에도 안전한 쪽(차단)으로 넘어진다.

```
PreToolUse:Bash
  ├─ 명령 세그먼트 분해 (; && || | 로 분리 — 체인 명령이 서로의 토큰을 빌리지 못하게)
  ├─ 각 세그먼트 검사
  │   ├─ `tene get`                          → deny
  │   ├─ `tene export` (--encrypted 없음)     → deny
  │   ├─ `cat|less|head|tail|strings .tene/`  → deny
  │   └─ `tene set KEY <값>` (--stdin 없음)   → escalate + --stdin 안내
  └─ 통과

PreToolUse:Read
  └─ file_path 가 `.tene/` 하위 → deny
```

**거부 메시지 설계** — 거부만 하고 끝내면 사용자가 막힌다. **실제로 가능한 대안만** 제시한다.

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "tene get 은 평문 값을 stdout 으로 내보내 AI 컨텍스트에 들어갑니다. 값을 확인하려면 별도 터미널에서 직접 실행하세요. 존재 여부만 필요하면 `tene list` 를 쓰세요."
  }
}
```

**세그먼트 단위 검사가 중요한 이유**: `echo hi && tene get KEY` 같은 체인에서 앞 세그먼트가 안전하다고 전체를 통과시키면 안 된다. 반대로 `grep "tene get" README.md` 처럼 **문자열을 언급만 하는 명령을 실행으로 오판해도 안 된다** — 명령 위치(세그먼트의 첫 토큰)를 기준으로 판정한다.

### 3.3 `.env` 감지 — `PostToolUse`

```
PostToolUse:Write|Edit  →  file_path 가 .env* 이고 .env.example 이 아님
PostToolUse:Bash        →  `echo ... > .env`, `cp .env.example .env` 등

→ additionalContext (차단하지 않음):
   "[tene] .env 평문 파일이 감지되었습니다.
    tene import .env && rm .env && echo '.env' >> .gitignore
    로 마이그레이션할 수 있습니다. (/tene:secrets)"
```

**차단하지 않는 이유**: `.env` 는 정당한 용도가 많고(예: `.env.example`, 비민감 설정), 차단하면 마찰만 크다. 경고 + 대안 제시가 적정 강도다.

### 3.4 실행 명령 제안 (FR-7.3)

프로젝트에 `.tene/` 가 있으면, 개발/테스트/배포 명령을 제안할 때 주입 형태로 바꾼다.

| 원래 | 제안 |
|---|---|
| `npm run dev` | `tene run -- npm run dev` |
| `pytest` | `tene run -- pytest` |
| `go run ./cmd/app` | `tene run -- go run ./cmd/app` |
| `docker compose up` | `tene run -- docker compose up` |
| `./deploy.sh` (prod) | `tene run --env prod -- ./deploy.sh` |

이 변환은 **스킬 지침으로** 수행한다. 훅으로 명령을 자동 재작성하지 않는다 — `updatedInput` 으로 사용자 명령을 몰래 바꾸는 것은 투명성 원칙에 어긋난다.

### 3.5 감지 로직 — `/tene:doctor` 항목

```
tene CLI       : ✅ v1.2.0 (darwin/arm64)      ← `tene version --json`
프로젝트 볼트   : ✅ .tene/ 존재, env=default   ← `tene whoami`
시크릿 개수     : 4개                          ← `tene whoami` (이름·값 미노출)
키체인         : ✅ 사용 가능
평문 .env      : ⚠️ .env 발견 — 마이그레이션 권장
가드 훅        : ✅ 활성
```

감지는 **`tene whoami` / `tene version` 만** 사용한다. 둘 다 값을 노출하지 않는다.

---

## 4. sprint 사이클과의 접점

시크릿은 사이클의 특정 단계에 종속되지 않지만, 세 지점에서 사이클과 만난다.

| 지점 | 동작 |
|---|---|
| **PRD 인터뷰** | 외부 서비스 연동이 언급되면 *"어떤 시크릿이 필요한가"* 를 질문하고, PRD의 "열린 결정 사항"에 기록 (값이 아니라 **필요한 키의 이름과 용도**만) |
| **QA 실행** | UNIT/UX 검증 명령을 `tene run --` 으로 감싼다. 볼트가 없으면 평문 `.env` 를 요구하지 않고 `insufficient` 로 보고 |
| **Report R6** | 미설정 시크릿이 검증을 막았다면 "사용자 결정 대기" 항목으로 승격 |

> **PRD 문서에 시크릿 값을 적지 않는다.** 문서는 git 에 커밋된다. 키 이름과 용도만 기록한다.

---

## 5. 실패 모드와 대응

| 실패 | 증상 | 대응 |
|---|---|---|
| tene 미설치 | `tene: command not found` | 스킬 비활성. 설치 안내는 사용자가 물었을 때만 |
| 볼트 없음 | `VAULT_NOT_FOUND` | `tene init` 안내 |
| 키체인 사용 불가 | `KEYCHAIN_ERROR` | `--no-keychain` 또는 `TENE_KEYCHAIN_FALLBACK=file` 안내 |
| TTY 없음 (CI) | `INTERACTIVE_REQUIRED` | `TENE_MASTER_PASSWORD` + `--no-keychain` 패턴 안내 |
| 가드 훅 자체 오류 | 판정 불가 | **차단(fail-closed).** 사유에 "가드 검사 실패"를 명시 |
| 사용자가 의도적으로 `tene get` 필요 | 차단으로 막힘 | *"별도 터미널에서 실행"* 안내. 플러그인은 우회로를 제공하지 않는다 |

**마지막 항목이 설계 의도다.** 우회로를 만들면 규칙이 규칙이 아니게 된다. 사람이 자기 터미널에서 하는 것은 자유이고, **AI 세션 안에서만** 막는다.

---

## 6. 검증 시나리오 (수용 테스트)

| # | 시나리오 | 기대 |
|---|---|---|
| V1 | `tene get STRIPE_KEY` 실행 시도 | deny + 대안 제시 |
| V2 | `tene export > backup.env` 실행 시도 | deny + `--encrypted` 안내 |
| V3 | `cat .tene/vault.db` 실행 시도 | deny |
| V4 | `Read` 도구로 `.tene/vault.json` 열기 | deny |
| V5 | `echo hi && tene get KEY` | deny (세그먼트 검사) |
| V6 | `grep "tene get" README.md` | **허용** (언급이지 실행이 아님) |
| V7 | `tene set KEY sk_live_abc` | escalate + `--stdin` 안내 |
| V8 | `tene list` | 허용 (사전 승인) |
| V9 | tene 미설치 상태에서 "키 저장해줘" | 스킬 비활성, 오류 없이 일반 안내 |
| V10 | `.env` 파일 생성 | 경고 표시, **차단하지 않음** |
| V11 | 볼트 존재 시 "개발서버 띄워줘" | `tene run -- npm run dev` 제안 |
| V12 | 세션 전사에 평문 시크릿 존재 | **0건** (성공 지표) |

---

## 7. 라이선스와 배포

- tene CLI 는 MIT. 플러그인은 CLI **바이너리를 번들하지 않는다** — 설치 스크립트만 안내한다
- 이식하는 스킬 문서는 원저작물 기준을 따르고, 출처를 스킬 내에 명시한다
- 플러그인이 CLI 버전을 강제하지 않는다. `tene version` 으로 감지하고, 명령 표에 없는 하위 버전이면 해당 기능만 비활성화한다
