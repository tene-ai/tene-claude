# D01 · 패키징과 매니페스트

> 대응: FR-8.1~8.6, W-01~W-04, W-07
> 근거: [00-rnd/01](../00-rnd/01-plugin-development-and-marketplace.md) — 배포 함정 11건

---

## 1. 저장소 레이아웃

```
tene-claude/                                    ← 마켓플레이스 겸 플러그인 저장소
├── .claude-plugin/
│   └── marketplace.json                        ← 마켓플레이스 매니페스트
├── plugins/
│   └── tene/                                   ← 플러그인 루트
│       ├── .claude-plugin/
│       │   └── plugin.json                     ← ⚠️ 여기에만 plugin.json
│       ├── skills/                             ← ⚠️ .claude-plugin/ 밖
│       ├── agents/
│       ├── workflows/
│       ├── hooks/hooks.json
│       ├── bin/
│       ├── lib/
│       ├── templates/
│       ├── test/
│       ├── settings.json
│       ├── package.json
│       ├── README.md                           ← 사용자용
│       ├── LICENSE
│       └── CHANGELOG.md
├── evals/
│   ├── fixtures/{ts-express-app,py-fastapi-app,flat-app,no-tools-app}/
│   ├── cases/
│   └── runner.js
├── scripts/
│   ├── assert-no-deps.js
│   └── sync-version.js
├── docs/{00-rnd,00-prd,01-plan,02-design,sprints}/
├── .github/workflows/validate.yml
├── LICENSE                                     ← Apache-2.0
├── NOTICE
└── README.md                                   ← 개발자용
```

### 1.1 함정 방어 3원칙

| # | 원칙 | 위반 시 |
|---|---|---|
| 1 | `.claude-plugin/` 안에는 **`plugin.json` 만** | `commands/`·`agents/`·`skills/`·`hooks/` 를 넣으면 로드 실패 |
| 2 | `plugin.json` 이 **반드시 존재** | 없으면 캐시 시 버전 문자열 이름으로 인라인 로드 → 네임스페이스 중복·병합 (이슈 #76234) |
| 3 | `version` 은 **`plugin.json` 에만** | 두 곳에 있으면 marketplace 값이 조용히 무시됨 |

---

## 2. `plugin.json`

```json
{
  "$schema": "https://json.schemastore.org/claude-code-plugin-manifest.json",
  "name": "tene",
  "displayName": "Tene",
  "version": "0.1.0",
  "description": "Spec-driven sprint workflow with intent-aware QA. Captures product intent in conversation, anchors it to code, and verifies UX and data flows against it.",
  "author": {
    "name": "agent-kay-it",
    "email": "kay@agentkay.it",
    "url": "https://github.com/agent-kay-it"
  },
  "homepage": "https://github.com/agent-kay-it/tene-claude",
  "repository": "https://github.com/agent-kay-it/tene-claude",
  "license": "Apache-2.0",
  "keywords": ["spec-driven", "sprint", "qa", "context-engineering", "workflow", "intent"],
  "defaultEnabled": true,

  "skills": "./skills/",
  "agents": "./agents/",
  "workflows": "./workflows/",
  "hooks": "./hooks/hooks.json",

  "userConfig": {
    "docs_root": {
      "type": "string", "title": "문서 루트",
      "description": "sprint 문서가 생성될 경로", "default": "docs/sprints"
    },
    "profile": {
      "type": "string", "title": "기본 Profile",
      "description": "strict | standard | light | off", "default": "standard"
    },
    "auto_until": {
      "type": "string", "title": "자동 진행 상한",
      "description": "사용자 확인 없이 진행할 마지막 phase", "default": "design"
    },
    "max_loop_checks": {
      "type": "number", "title": "loop-check 반복 상한",
      "description": "이 횟수를 넘으면 정지하고 waiver 를 안내", "default": 3, "min": 1, "max": 10
    },
    "auto_trigger": {
      "type": "boolean", "title": "자연어 자동 트리거",
      "description": "끄면 /tene:* 직접 호출만 동작", "default": true
    },
    "workflow_threshold": {
      "type": "number", "title": "워크플로 전환 임계",
      "description": "AC 가 이 수 이상이면 Dynamic Workflow 사용", "default": 8, "min": 2, "max": 100
    },
    "doc_language": {
      "type": "string", "title": "문서 언어",
      "description": "auto | ko | en", "default": "auto"
    },
    "scan_langs": {
      "type": "string", "title": "인덱서 언어", "multiple": true,
      "description": "인덱싱할 언어 팩", "default": "ts,js,py,go,java"
    },
    "browser_adapter": {
      "type": "string", "title": "UX 검증 도구",
      "description": "auto | chrome-mcp | playwright | none", "default": "auto"
    }
  }
}
```

### 2.1 경로 필드 규칙 ⚠️ 구현 중 정정

| 필드 | 동작 | 우리 설정 |
|---|---|---|
| `skills` | 기본 `skills/` 에 추가 | **선언하지 않음** |
| `agents` | 기본을 대체 | **선언하지 않음** |
| `workflows` | 기본을 대체 | **선언하지 않음** |
| `hooks` | 자체 병합 규칙 | `"./hooks/hooks.json"` |

> **기본 위치를 쓰는 컴포넌트는 선언하지 않는다.**
> `"agents": "./agents/"` 를 선언했더니 실측(CC v2.1.235)에서
> `plugins[0] plugin.json → agents: Invalid input` 으로 검증이 실패했다.
> 디렉토리가 비어 있거나 기본 위치와 같으면 선언 자체가 문제를 만든다.
>
> 기본 위치(`skills/`, `agents/`, `workflows/`)를 그대로 쓰면 선언 없이 자동 발견된다.
> 비표준 경로를 쓸 때만 선언한다.

`"."` 대신 `"./"` 를 쓴다 — v2.1.221 이전 호환.

### 2.2 `settings.json`

```json
{}
```

**비워둔다.** `agent` 키로 메인 스레드 에이전트를 교체하는 것은 이 플러그인의 성격과 맞지 않는다 — 사용자의 일반 작업을 방해한다.

### 2.3 `package.json`

```json
{
  "name": "@agent-kay-it/tene-plugin",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "engines": { "node": ">=20" },
  "dependencies": {},
  "devDependencies": {},
  "scripts": {
    "test": "node --test test/",
    "test:guard": "node test/guard-matrix.js",
    "test:latency": "node test/hook-latency.js"
  }
}
```

`version` 은 `plugin.json` 과 동기화한다 (`scripts/sync-version.js` 가 CI 에서 검사).

---

## 3. `marketplace.json`

```json
{
  "$schema": "https://json.schemastore.org/claude-code-plugin-marketplace.json",
  "name": "agent-kay-it",
  "owner": {
    "name": "agent-kay-it",
    "email": "kay@agentkay.it",
    "url": "https://github.com/agent-kay-it"
  },
  "description": "Spec-driven vibe coding tools for Claude Code",
  "plugins": [
    {
      "name": "tene",
      "source": "./plugins/tene",
      "displayName": "Tene",
      "description": "Spec-driven sprint workflow with intent-aware QA",
      "author": { "name": "agent-kay-it" },
      "license": "Apache-2.0",
      "category": "development",
      "tags": ["spec-driven", "sprint", "qa", "workflow", "intent", "context-engineering"],
      "strict": true
    }
  ]
}
```

**`version` 을 넣지 않는다** — `plugin.json` 값이 항상 이기므로 중복은 혼란만 만든다.

### 3.1 마켓플레이스 이름 검증

`agent-kay-it` 은 예약어 목록에 없다. 예약어(사용 불가):
`claude-code-marketplace`, `claude-code-plugins`, `claude-plugins-official`, `claude-plugins-community`, `claude-community`, `anthropic-marketplace`, `anthropic-plugins`, `agent-skills`, `anthropic-agent-skills`, `knowledge-work-plugins`, `life-sciences`, `claude-for-legal`, `claude-for-financial-services`, `financial-services-plugins`, `first-party-plugins`, `healthcare`

---

## 4. 설치 후 파일 배치

```
~/.claude/plugins/cache/tene@agent-kay-it/<version>/
├── .claude-plugin/plugin.json
├── skills/  agents/  workflows/  hooks/  bin/  lib/  templates/
└── package.json

~/.claude/plugins/data/tene-agent-kay-it/          ← ${CLAUDE_PLUGIN_DATA}
└── (캐시. 업데이트에도 생존. 현재 미사용, 향후 인덱스 캐시 후보)
```

### 4.1 `bin/` 실행 권한

```bash
# 저장소에 커밋 시 실행 권한 필요
chmod +x plugins/tene/bin/*
git update-index --chmod=+x plugins/tene/bin/tene-state
```

플러그인이 활성화되면 `bin/` 이 Bash 도구의 `PATH` 에 추가되므로, 스킬에서 `tene-state read --json` 처럼 직접 호출한다.

**shebang 필수**: `#!/usr/bin/env node`

### 4.2 경로 참조 규칙

| 컨텍스트 | 사용 |
|---|---|
| 훅 명령 | `${CLAUDE_PLUGIN_ROOT}/bin/tene-guard` (exec 폼) |
| 스킬 본문 | `tene-state read` (PATH 경유) |
| lib 내부 | `import.meta.url` 기준 상대 경로 |
| 프로젝트 파일 | `CLAUDE_PROJECT_DIR` → cwd 순 탐색 |

**훅 `command` 는 문자열이어야 한다** ⚠️ 구현 중 정정

```json
{
  "type": "command",
  "command": "\"${CLAUDE_PLUGIN_ROOT}/bin/tene-guard\" --event pretooluse-bash",
  "timeout": 10
}
```

설계 초안은 exec 폼(배열)을 썼으나, **실측(CC v2.1.235)에서 validator 가 배열을 거부한다**:

```
hooks.SessionStart.0.hooks.0.command: Invalid input: expected string, received array
```

**대응**
- 문자열 폼을 쓰고 **경로를 따옴표로 감싼다** (공백 있는 경로 대비)
- exec 폼의 목적이었던 `${user_config.*}` 는 훅 `command` 에 **쓰지 않는다.**
  대신 `CLAUDE_PLUGIN_OPTION_<KEY>` 환경변수로 스크립트 안에서 읽는다 (이미 그렇게 설계됨)

---

## 5. 프로젝트 초기화 산출물

`/tene:sprint init` 이 처음 실행될 때 만드는 것.

```
<project>/
├── docs/sprints/
│   ├── _meta/
│   │   ├── layers.yml            ← /tene:layers scan 결과 (사용자 확인 후)
│   │   └── project.json          ← 문서 언어, docs_root 등 프로젝트 고정값
│   └── <sprint-id>-<slug>/
│       ├── 00-prd/
│       ├── 01-plan/
│       ├── 02-design/
│       ├── 03-analysis/
│       ├── 04-report/
│       └── evidence/
└── .tene-claude/
    ├── state/
    │   ├── current.json
    │   ├── master-plan.json
    │   └── sprints/<sprint-id>.json
    ├── index/                    ← .gitignore 대상
    ├── history/                  ← .gitignore 대상
    ├── archive/                  ← .gitignore 대상
    └── .gitignore
```

### 5.1 `.tene-claude/.gitignore` (자동 생성)

```gitignore
index/
history/
archive/
*.corrupt-*
.lock
```

`state/` 는 커밋 대상이다 — 팀이 진행 상태를 공유할 수 있다.

### 5.2 프로젝트 `.gitignore` 제안

```
# tene plugin
.tene-claude/index/
.tene-claude/history/
.tene-claude/archive/
```

**제안만 하고 자동 추가하지 않는다.** 사용자 파일을 말없이 고치지 않는다.

---

## 6. CI 워크플로

```yaml
name: validate
on: [push, pull_request]

jobs:
  static:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }

      - name: Claude Code 설치
        run: npm i -g @anthropic-ai/claude-code

      - name: 플러그인 매니페스트 검증
        run: claude plugin validate ./plugins/tene --strict

      - name: 마켓플레이스 매니페스트 검증
        run: claude plugin validate . --strict

      - name: 외부 의존 0 확인
        run: node scripts/assert-no-deps.js

      - name: 버전 동기화 확인
        run: node scripts/sync-version.js --check

      - name: bin 실행 권한 확인
        run: |
          for f in plugins/tene/bin/*; do
            [ -x "$f" ] || { echo "not executable: $f"; exit 1; }
            head -1 "$f" | grep -q '^#!/usr/bin/env node' || { echo "no shebang: $f"; exit 1; }
          done

      - name: 단위 테스트
        run: node --test plugins/tene/test/

      - name: 가드 매트릭스
        run: node plugins/tene/test/guard-matrix.js

      - name: 훅 지연 벤치마크
        run: node plugins/tene/test/hook-latency.js

  honesty:
    runs-on: ubuntu-latest
    needs: static
    steps:
      - uses: actions/checkout@v4
      - run: node evals/runner.js --honesty-only
```

### 6.1 `scripts/assert-no-deps.js`

```javascript
import { readFileSync } from 'node:fs'
const pkg = JSON.parse(readFileSync('plugins/tene/package.json', 'utf8'))
const deps = { ...pkg.dependencies, ...pkg.devDependencies }
if (Object.keys(deps).length > 0) {
  console.error('외부 의존이 감지되었습니다:', Object.keys(deps).join(', '))
  console.error('tene 플러그인은 외부 의존 0 원칙을 따릅니다 (DEC-02).')
  process.exit(1)
}
console.log('✔ 외부 의존 0 확인')
```

### 6.2 `scripts/sync-version.js`

`plugin.json` 과 `package.json` 의 `version` 이 같은지 확인. `--check` 는 검사만, 없으면 `package.json` 을 `plugin.json` 에 맞춘다.

---

## 7. 로컬 개발 루프

```bash
# 로드
claude --plugin-dir ./plugins/tene

# 수정 후 재로드 (재시작 불필요)
/reload-plugins

# 검증
claude plugin validate ./plugins/tene --strict
node --test plugins/tene/test/
```

### 7.1 알려진 개발 함정

| 함정 | 대응 |
|---|---|
| `/reload-plugins` 가 `0 skills` 보고 | `commands/` 만 세므로 정상. `/help` 로 확인 |
| 설치본과 `--plugin-dir` 충돌 | 로컬이 우선. 정상 |
| 훅 변경이 반영 안 됨 | `/reload-plugins` 후에도 안 되면 세션 재시작 |
| `bin/` 실행 권한 소실 | git 이 mode 를 보존하는지 확인 |

---

## 8. 릴리즈 아티팩트

```
릴리즈 v0.1.0
├── git tag v0.1.0
├── plugins/tene/.claude-plugin/plugin.json  version: 0.1.0
├── CHANGELOG.md  ## 0.1.0 섹션
└── 릴리즈 노트
    · Claude Code 최소 버전: v2.1.154
    · Node.js 최소 버전: 20
    · 상태 스키마 버전: 1
    · 알려진 제약
```

### 8.1 사용자 설치·업데이트 명령

```bash
/plugin marketplace add agent-kay-it/tene-claude
/plugin install tene@agent-kay-it

# 업데이트 — bare 이름은 실패하므로 반드시 name@marketplace (이슈 #86564)
/plugin marketplace update
/plugin update tene@agent-kay-it
```

README 에 이 형식을 명시한다.

### 8.2 팀 자동 배포

프로젝트 `.claude/settings.json`:
```json
{
  "extraKnownMarketplaces": {
    "agent-kay-it": {
      "source": { "source": "github", "repo": "agent-kay-it/tene-claude" }
    }
  }
}
```

폴더를 신뢰하는 순간 별도 프롬프트 없이 마켓플레이스가 추가된다.
