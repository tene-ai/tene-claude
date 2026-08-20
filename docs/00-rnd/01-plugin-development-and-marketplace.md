# 01. Claude Code 플러그인 개발 및 마켓플레이스 배포 연구

> 조사일: 2026-08-20 · 대상: Claude Code CLI v2.1.x (v2.1.234 기준 문서)
> 목적: `tene` 플러그인의 개발·패키징·배포 전략 수립

---

## 0. 3줄 요약

1. Claude Code 플러그인은 **디렉토리 하나**다. `.claude-plugin/plugin.json` 매니페스트와 `skills/`, `agents/`, `hooks/`, `workflows/`, `.mcp.json`, `.lsp.json`, `monitors/`, `bin/`, `settings.json` 이 플러그인 루트에 놓이는 구조이며, 매니페스트조차 선택 사항이다.
2. 배포는 **`.claude-plugin/marketplace.json`을 담은 git 저장소**를 마켓플레이스로 공개하는 방식. 사용자는 `/plugin marketplace add owner/repo` → `/plugin install name@marketplace`로 설치한다.
3. 공개 유통 경로는 두 갈래다. Anthropic 큐레이션인 `claude-plugins-official`(신청 불가, Anthropic 재량)과 심사 기반 커뮤니티 마켓플레이스 `claude-plugins-community`(제출 폼 존재). **자체 마켓플레이스를 먼저 운영**하고 병행 제출하는 것이 현실적이다.

---

## 1. 플러그인의 구성 요소와 디렉토리 규약

### 1.1 표준 레이아웃

```text
tene/                            # 플러그인 루트 (= --plugin-dir 로 지정하는 경로)
├── .claude-plugin/
│   └── plugin.json              # 매니페스트 (선택이지만 사실상 필수)
├── skills/                      # 스킬: <name>/SKILL.md
│   ├── spec-interview/SKILL.md
│   └── qa-intent-sync/SKILL.md
├── commands/                    # 레거시: 플랫 .md 스킬 파일 (신규는 skills/ 권장)
├── agents/                      # 서브에이전트 정의 (.md + frontmatter)
├── workflows/                   # Dynamic Workflow 스크립트 (.js)
├── hooks/
│   └── hooks.json               # 이벤트 핸들러
├── monitors/
│   └── monitors.json            # 백그라운드 모니터 (experimental)
├── output-styles/               # 출력 스타일
├── themes/                      # 컬러 테마 (experimental)
├── bin/                         # 플러그인 활성 시 Bash PATH 에 추가되는 실행파일
├── .mcp.json                    # MCP 서버 정의
├── .lsp.json                    # LSP 서버 정의
├── settings.json                # 기본 설정 (agent / subagentStatusLine 키만 지원)
├── package.json                 # npm 의존성 (자동 설치 대상)
├── README.md / LICENSE / CHANGELOG.md
```

> ⚠️ **가장 흔한 실수**: `commands/`, `agents/`, `skills/`, `hooks/` 를 `.claude-plugin/` **안에** 넣는 것. `.claude-plugin/` 안에는 `plugin.json` 만 들어간다. 나머지는 모두 플러그인 루트 레벨이어야 한다.

> 단일 스킬 플러그인은 루트에 `SKILL.md` 하나만 두어도 된다. 이 경우 frontmatter `name` 이 호출 이름을 결정한다.

### 1.2 각 구성요소가 하는 일

| 구성요소 | 실행 주체 | 성격 | tene 에서의 쓰임새 |
|---|---|---|---|
| **Skills** (`skills/*/SKILL.md`) | 모델 또는 사용자 | 필요할 때만 로드되는 절차/지식 | spec 인터뷰, PDCA 단계별 절차, QA 시나리오 생성 |
| **Agents** (`agents/*.md`) | 모델이 위임 | 독립 컨텍스트 워커 | 스펙 검증기, 갭 탐지기, 적대적 리뷰어 |
| **Hooks** (`hooks/hooks.json`) | 런타임(결정론적) | 이벤트 시점 강제 실행 | 스펙 없는 구현 차단, QA 게이트, 의도 캡처 트리거 |
| **Workflows** (`workflows/*.js`) | 워크플로 런타임 | 다수 서브에이전트 오케스트레이션 스크립트 | 전 화면 QA 스윕, 스펙↔구현 대조 감사 |
| **MCP** (`.mcp.json`) | 외부 프로세스 | 도구/리소스 제공 | tene studio 그래프 질의, 의도 저장소 |
| **Monitors** (`monitors/monitors.json`) | 백그라운드 | stdout 라인을 세션에 알림 | 개발서버 로그 감시(Zero-Script QA) |
| **bin/** | Bash PATH | CLI 헬퍼 | `tene-spec`, `tene-verify` 등 |
| **settings.json** | 세션 기본값 | `agent` 로 메인 스레드 에이전트 교체 가능 | spec-driven 모드 기본 활성화 |

**중요한 설계 함의**: CLAUDE.md는 *권고*, Hooks는 *강제*다. 문서(스펙) 기반 바이브 코딩을 "지켜지게" 만들려면 규칙을 CLAUDE.md에 쓰는 것이 아니라 **Hook으로 내려야** 한다. 이것이 하네스 엔지니어링의 실전 진입점이다.

---

## 2. `plugin.json` 매니페스트 전체 스키마

```json
{
  "$schema": "https://json.schemastore.org/claude-code-plugin-manifest.json",
  "name": "tene",
  "displayName": "Tene",
  "version": "0.1.0",
  "description": "Spec-driven vibe coding with intent-aware QA",
  "author": { "name": "agent-kay-it", "email": "kay@agentkay.it", "url": "https://github.com/agent-kay-it" },
  "homepage": "https://github.com/agent-kay-it/tene-claude",
  "repository": "https://github.com/agent-kay-it/tene-claude",
  "license": "MIT",
  "keywords": ["spec-driven", "qa", "context-engineering"],
  "defaultEnabled": true,

  "skills": "./skills/",
  "commands": ["./commands/"],
  "agents": "./agents/",
  "workflows": "./workflows/",
  "hooks": "./hooks/hooks.json",
  "mcpServers": "./.mcp.json",
  "lspServers": "./.lsp.json",
  "outputStyles": "./output-styles/",

  "experimental": {
    "themes": "./themes/",
    "monitors": "./monitors/monitors.json"
  },

  "userConfig": {
    "tene_studio_endpoint": {
      "type": "string", "title": "tene studio endpoint",
      "description": "그래프 질의 대상", "default": "http://localhost:7777"
    },
    "intent_store_dir": {
      "type": "directory", "title": "의도 저장소 경로",
      "description": "스펙/의도 아티팩트 위치", "default": "./docs"
    },
    "api_token": {
      "type": "string", "title": "API token", "sensitive": true
    }
  },

  "dependencies": [
    "some-lsp-plugin",
    { "name": "helper-plugin", "version": "~2.1.0" }
  ]
}
```

### 2.1 필드 규칙 요약

| 구분 | 필드 | 비고 |
|---|---|---|
| 필수 | `name` | kebab-case, 공백 불가. **네임스페이스로 사용됨** (`/tene:spec`) |
| 메타 | `displayName`, `version`, `description`, `author`, `homepage`, `repository`, `license`, `keywords`, `metadata`, `defaultEnabled` | `metadata`는 자유 형식(Claude Code가 읽지 않음) |
| 경로 | `skills`, `commands`, `agents`, `workflows`, `hooks`, `mcpServers`, `outputStyles`, `lspServers` | 상대경로, `./` 로 시작해야 함 |
| 확장 | `experimental.themes`, `experimental.monitors` | |
| 설정 | `userConfig`, `channels`, `dependencies` | |

### 2.2 경로 병합 규칙 (함정 주의)

- **기본값에 *추가*되는 것**: `skills` — 기본 `skills/` 는 항상 스캔되고 지정 경로가 **추가로** 로드된다.
- **기본값을 *대체*하는 것**: `commands`, `agents`, `workflows`, `outputStyles`, `experimental.themes`, `experimental.monitors`. 기본 디렉토리도 유지하려면 배열로 둘 다 명시: `"commands": ["./commands/", "./extras/"]`
- **자체 병합 규칙**: `hooks`, `mcpServers`, `lspServers` — 인라인 객체로도 정의 가능.
- `"."` 는 `skills` 에서만 허용되며 v2.1.221 이전에는 검증 실패했다. 호환성을 위해 `"./"` 사용 권장.

### 2.3 환경변수 치환

| 변수 | 해석 | 용도 |
|---|---|---|
| `${CLAUDE_PLUGIN_ROOT}` | 플러그인 설치 디렉토리 절대경로 | 번들 스크립트/바이너리 호출 |
| `${CLAUDE_PLUGIN_DATA}` | `~/.claude/plugins/data/{plugin-id}/` | **업데이트에도 살아남는 영속 데이터** — venv, node_modules, 캐시, 의도 인덱스 |
| `${CLAUDE_PROJECT_DIR}` | 프로젝트 루트 | 프로젝트 로컬 스크립트/설정 |
| `${user_config.KEY}` | 사용자 설정값 | MCP/LSP config, hook command, 스킬/에이전트 본문 |
| `CLAUDE_PLUGIN_OPTION_<KEY>` | 훅 프로세스 환경변수 | 훅에서 사용자 설정 읽기 |

> `${user_config.*}` 는 **셸 폼 hook command / monitor command / MCP `headersHelper` 에서 거부**된다. hook 은 exec 폼(`"command": ["...","..."]`)을 써야 한다.

> 민감 값(`sensitive: true`)은 macOS Keychain 또는 `~/.claude/.credentials.json`(약 2KB 한도)에 저장된다. 비민감 값은 `~/.claude/settings.json` 의 `pluginConfigs[<plugin-id>].options`. **v2.1.207+ 부터 프로젝트 settings 의 `pluginConfigs` 는 무시된다** — 사용자/관리자 스코프만 읽는다.

### 2.4 `${CLAUDE_PLUGIN_DATA}` 의 전략적 가치

tene 의 "의도 저장소"를 어디에 둘 것인가는 핵심 설계 결정이다.

| 위치 | 팀 공유 | 업데이트 생존 | 권장 용도 |
|---|---|---|---|
| `${CLAUDE_PROJECT_DIR}/docs/**` | ✅ git | ✅ | **스펙/의도 원본 (SSOT)** |
| `${CLAUDE_PLUGIN_DATA}/` | ❌ 로컬 | ✅ | 인덱스, 임베딩 캐시, 세션 상태 |
| `~/.claude/projects/<p>/memory/` | ❌ 로컬 | ✅ | Claude 자동 메모리(학습 축적) |

→ **의도의 정본은 git 에 커밋되는 문서**, 파생 인덱스는 `CLAUDE_PLUGIN_DATA` 에 두는 이중 구조를 권장한다.

---

## 3. 개발 워크플로우

### 3.1 최소 스캐폴딩

```bash
# (a) 스킬 디렉토리 방식 — 마켓플레이스 없이 자동 로드
claude plugin init tene            # ~/.claude/skills/tene/ 에 생성, 다음 세션에 tene@skills-dir 로 로드

# (b) 수동 생성
mkdir -p tene/.claude-plugin tene/skills/hello
cat > tene/.claude-plugin/plugin.json <<'JSON'
{ "name": "tene", "description": "Spec-driven QA plugin", "version": "0.1.0" }
JSON
```

### 3.2 로컬 테스트 루프

```bash
claude --plugin-dir ./tene                 # 디렉토리 로드
claude --plugin-dir ./tene.zip             # zip 아카이브도 가능
claude --plugin-dir ./a --plugin-dir ./b   # 다중 로드
claude --plugin-url https://ci/artifact.zip  # 원격 zip (세션 한정)
```

- 동일 이름의 설치된 마켓플레이스 플러그인이 있어도 **`--plugin-dir` 로컬 사본이 우선**한다 (관리 설정으로 강제 활성/비활성된 플러그인 제외).
- 코드 수정 후 `/reload-plugins` 로 재시작 없이 반영. 스킬, 에이전트, 훅, 플러그인 MCP/LSP 서버가 모두 다시 로드된다.
  - ⚠️ 요약에 표시되는 skills 카운트는 `commands/` 디렉토리만 세므로 `skills/` 만 있으면 `0 skills` 로 보인다. 버그가 아니다.

### 3.3 검증

```bash
claude plugin validate ./tene            # ✔ Validation passed (with warnings)
claude plugin validate ./tene --strict   # 경고를 에러로 — CI 에 사용
```

### 3.4 컴포넌트별 확인 방법

| 컴포넌트 | 확인법 |
|---|---|
| Skill | `/tene:skill-name` 실행, `/help` → Custom commands 탭 |
| Agent | `/context` 의 Custom Agents 항목, 또는 `@에이전트명` |
| Hook | 해당 이벤트 유발 후 디버그 로그에서 매칭/exit code/출력 확인, `/hooks` |
| MCP | `/mcp` |
| LSP | `/plugin` → Errors 탭 (미설치 바이너리는 여기 뜸), `claude --debug` |
| 로딩 실패 전반 | `/plugin` → **Errors 탭** |

---

## 4. 마켓플레이스 제작과 배포

### 4.1 `marketplace.json` (저장소 루트의 `.claude-plugin/marketplace.json`)

```json
{
  "$schema": "https://json.schemastore.org/claude-code-plugin-marketplace.json",
  "name": "agent-kay-it",
  "owner": { "name": "agent-kay-it", "email": "kay@agentkay.it", "url": "https://github.com/agent-kay-it" },
  "description": "Tene — spec-driven vibe coding & intent-aware QA",
  "metadata": { "pluginRoot": "./plugins" },
  "plugins": [
    {
      "name": "tene",
      "source": "./tene",
      "displayName": "Tene",
      "description": "Spec-driven development with intent-aware QA",
      "version": "0.1.0",
      "author": { "name": "agent-kay-it" },
      "license": "MIT",
      "category": "development",
      "tags": ["spec-driven", "qa", "context-engineering", "workflow"],
      "strict": true,
      "defaultEnabled": true
    }
  ]
}
```

#### 스키마 요약

**필수**: `name`(마켓플레이스 식별자, 공개 노출됨), `owner`(`name` 필수), `plugins[]`
**선택**: `$schema`, `description`, `version`, `metadata.pluginRoot`, `allowCrossMarketplaceDependenciesOn`, `renames`

**플러그인 엔트리 필수**: `name`, `source`
**플러그인 엔트리 선택**: plugin.json 의 모든 필드 + `category`, `tags`, `strict`, `relevance`, `defaultEnabled`

> **예약된 마켓플레이스 이름** (제3자 사용 불가): `claude-code-marketplace`, `claude-code-plugins`, `claude-plugins-official`, `claude-plugins-community`, `claude-community`, `anthropic-marketplace`, `anthropic-plugins`, `agent-skills`, `anthropic-agent-skills`, `knowledge-work-plugins`, `life-sciences`, `claude-for-legal`, `claude-for-financial-services`, `financial-services-plugins`, `first-party-plugins`, `healthcare`. 공식을 사칭하는 이름(`official-claude-plugins`, `anthropic-plugins-v2` 등)도 차단된다.
> 예약 이름은 **로드할 때마다 재검사**되므로, 나중에 예약어가 된 이름을 쓰던 마켓플레이스는 갑자기 로드가 중단된다.

> 사용자 1명당 **마켓플레이스 이름 하나**만 등록 가능. 같은 이름을 다시 추가하면 기존 것이 대체된다. 여러 플러그인을 배포하려면 **하나의 `marketplace.json` 에 모두 나열**해야 한다.

### 4.2 플러그인 소스 유형

| source | 필드 | 특징 |
|---|---|---|
| 상대 경로 (`"./tene"`) | — | 마켓플레이스 저장소 내부. `.claude-plugin/` 이 아니라 **마켓플레이스 루트 기준**. `../` 금지. **URL 직접 배포 시 해석 불가** |
| `github` | `repo`, `ref?`, `sha?` | `owner/repo` |
| `url` | `url`, `ref?`, `sha?` | 임의 git URL |
| `git-subdir` | `url`, `path`, `ref?`, `sha?` | 모노레포용 sparse clone |
| `npm` | `package`, `version?`, `registry?` | `npm install` |
| `archive` | `url`, `sha256?` | HTTPS zip. git/npm 불필요. **v2.1.224+** |
| `command` | `command`, `timeout?`, `mode?` | 로컬 명령이 만든 디렉토리. 세션당 1회 재실행. **v2.1.229+** |

`ref`와 `sha`가 모두 있으면 `sha`가 유효 핀이다.

### 4.3 `strict` 모드

| 값 | 의미 |
|---|---|
| `true` (기본) | `plugin.json` 이 컴포넌트 정의의 권위. 마켓플레이스 엔트리는 **보충**만 하며 둘이 병합됨 |
| `false` | 마켓플레이스 엔트리가 정의 전체. plugin.json 이 컴포넌트를 선언하면 **충돌로 로드 실패** |

자체 플러그인을 자체 마켓플레이스로 배포하는 tene 는 `strict: true`(기본) 유지가 맞다.

### 4.4 호스팅 & 사용자 설치

```bash
# 사용자 측
/plugin marketplace add agent-kay-it/tene-claude       # GitHub shorthand
/plugin marketplace add https://gitlab.com/x/y.git     # 다른 git 호스트
/plugin marketplace add https://example.com/marketplace.json  # URL 직접 (상대경로 소스 불가!)
/plugin install tene@agent-kay-it
/plugin marketplace update                             # 갱신
```

CLI 논-인터랙티브 버전도 있다:
```bash
claude plugin marketplace add agent-kay-it/tene-claude --scope project
claude plugin marketplace add agent-kay-it/monorepo --sparse .claude-plugin plugins
claude plugin marketplace add agent-kay-it/tene-claude@v2.0   # ref 핀
```

> URL 은 반드시 스킴 포함(`https://`). v2.1.196+ 는 스킴 없는 호스트를 `owner/repo` 로 오인하지 않고 거부한다.

### 4.5 팀 자동 배포

프로젝트 `.claude/settings.json` 에 넣으면 폴더를 신뢰하는 순간 별도 프롬프트 없이 마켓플레이스가 추가된다:

```json
{
  "extraKnownMarketplaces": {
    "agent-kay-it": {
      "source": { "source": "github", "repo": "agent-kay-it/tene-claude" }
    }
  }
}
```

### 4.6 버전 관리 — **가장 흔한 배포 사고**

> ⚠️ `version` 을 설정하면 그 문자열로 **핀**된다(`command` 소스 제외). `"version": "1.0.0"` 을 선언한 채 커밋만 밀면 **기존 사용자는 캐시된 구버전을 계속 쓴다.** 릴리즈마다 반드시 bump 하거나, 아예 `version` 을 생략해서 커밋 SHA 로 해석되게 하라.

> ⚠️ `plugin.json` 과 마켓플레이스 엔트리 **둘 다에 `version` 을 두지 마라.** Claude Code 는 경고 없이 `plugin.json` 값을 쓴다. 오래된 매니페스트 버전이 마켓플레이스 버전을 가려버린다.

**릴리즈 채널**: 같은 저장소의 다른 `ref` 를 가리키는 마켓플레이스 2개(`tene-stable`, `tene-latest`)를 만들고 관리 설정으로 그룹별 배분. 단, 두 채널이 **서로 다른 버전으로 해석**되어야 한다.

### 4.7 이름 변경/제거

```json
{ "renames": { "old-plugin-name": "tene", "dead-plugin": null } }
```
기존 사용자가 자동 마이그레이션된다. **v2.1.193+** 필요.

---

## 5. 공개 유통 경로

| 경로 | 등록 방법 | 심사 | 비고 |
|---|---|---|---|
| **자체 마켓플레이스** | GitHub 저장소 공개 | 없음 | 즉시 가능. **1순위 권장** |
| **`claude-plugins-community`** | claude.ai 또는 Console 제출 폼 | 있음(자동 안전성 스크리닝 + 검증) | 승인 시 특정 커밋 SHA로 핀, CI가 자동 bump. 공개 카탈로그는 야간 동기화 |
| **`claude-plugins-official`** | 신청 불가 | Anthropic 재량 | 큐레이션. 제출 폼으로 들어갈 수 없음 |

**제출 폼**
- claude.ai: `claude.ai/admin-settings/directory/submissions/plugins/new` (Team/Enterprise + 디렉토리 관리 권한 필요)
- Console: `platform.claude.com/plugins/submit` (개인 저자용)

제출 전 반드시 `claude plugin validate ./tene` 통과 확인. 심사 파이프라인이 동일 검사를 수행한다.

설치 가능 여부 확인: [`anthropics/claude-plugins-community` 의 marketplace.json](https://github.com/anthropics/claude-plugins-community/blob/main/.claude-plugin/marketplace.json) 에서 이름 검색.

---

## 6. GitHub 이슈에서 확인된 실전 함정 (anthropics/claude-code, 2026-08 기준 OPEN)

플러그인 개발/배포 시 반드시 방어해야 할 알려진 이슈들:

| 이슈 | 내용 | tene 대응 |
|---|---|---|
| #72162 | `/plugin marketplace update` + `/reload-plugins` 가 푸시된 변경을 반영하지 않음 | 버전 bump를 릴리즈 절차로 강제. 개발 중엔 `--plugin-dir` 사용 |
| #86700 | `claude plugin install` 이 새 버전을 보고도 "already installed" 반환 (2.1.232) | 문서에 재설치 절차 명시 |
| #86564 | `claude plugin update <name>` 이 bare 이름에서 실패, `name@marketplace` 만 동작 | README에 `tene@agent-kay-it` 형태로 안내 |
| #76234 | `.claude-plugin/plugin.json` 없이 캐시된 플러그인이 버전 문자열 이름으로 인라인 로드되어 **네임스페이스가 중복·병합됨** | 매니페스트를 반드시 포함 |
| #71948 | 마켓플레이스 디렉토리를 지우고 재클론 실패 → 모든 플러그인 + MCP 서버 로드 실패 | `CLAUDE_CODE_PLUGIN_KEEP_MARKETPLACE_ON_FAILURE=1` 안내 |
| #87778 | `~/.claude/plugins/marketplaces` 아래 `temp_<epoch-ms>` 고아 폴더 누적 | 운영 이슈, 인지만 |
| #84157 | `--channels plugin:<name>@<marketplace>` 가 플러그인 MCP 서버에 연결되지 않음(무음 실패) | 채널 기능 의존 최소화 |
| #86493 | npm 소스 플러그인에서 `allowCrossMarketplaceDependenciesOn` 무시 | 크로스 마켓플레이스 의존 회피 |
| #84857 | 번들 LSP 플러그인이 설치 후 `lspServers` 설정 누락 | LSP 의존 시 설치 후 검증 스텝 제공 |
| #82428 | `CLAUDE_CONFIG_DIR` 이 마켓플레이스 플러그인 설치 시 무시됨 | 비표준 config dir 사용자 대상 안내 |
| #87667 | user-scope / project-scope 설치가 동일 행으로 표시되어 구버전 핀이 감춰짐 | 설치 스코프를 문서에서 명확히 지정 |

**교훈**: 배포 안정성의 대부분은 **버전 전략**과 **매니페스트 존재 여부**에서 갈린다. 두 가지만 지켜도 위 이슈 중 절반을 피한다.

---

## 7. tene 플러그인 권장 배포 전략

### 7.1 단계별 로드맵

```
Phase 0  로컬 개발      : claude --plugin-dir ./tene  +  /reload-plugins 루프
Phase 1  내부 배포      : 프로젝트 .claude/settings.json 의 extraKnownMarketplaces
Phase 2  공개 마켓플레이스: agent-kay-it/tene-claude 저장소에 .claude-plugin/marketplace.json
Phase 3  커뮤니티 제출  : claude plugin validate --strict 통과 후 Console 폼 제출
Phase 4  채널 분리      : tene-stable / tene-latest 두 마켓플레이스
```

### 7.2 저장소 레이아웃 제안 (모노레포형)

```
tene-claude/                       ← 마켓플레이스 저장소 겸 플러그인 저장소
├── .claude-plugin/
│   └── marketplace.json           ← 마켓플레이스 정의
├── plugins/
│   └── tene/                      ← source: "./plugins/tene"  (metadata.pluginRoot 사용 시 "tene")
│       ├── .claude-plugin/plugin.json
│       ├── skills/ agents/ hooks/ workflows/ ...
├── docs/00-rnd/                   ← 본 연구 문서
└── .github/workflows/validate.yml ← CI: claude plugin validate --strict
```

### 7.3 CI 검증 워크플로 (권장)

```yaml
name: validate-plugin
on: [push, pull_request]
jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm i -g @anthropic-ai/claude-code
      - run: claude plugin validate ./plugins/tene --strict
      - run: claude plugin validate . --strict     # 마켓플레이스 자체 검증
```

### 7.4 버전 정책 결정

| 옵션 | 장점 | 단점 | 권장 |
|---|---|---|---|
| `version` 명시 + 릴리즈마다 bump | 사용자에게 명확한 버전 | bump 누락 시 업데이트 안 됨 | ✅ 공개 배포 |
| `version` 생략 (SHA 해석) | 커밋마다 자동 업데이트 | 버전 추적 불가 | 내부 개발 채널 |

→ **`plugin.json` 에만** `version` 을 두고, `marketplace.json` 엔트리에서는 생략한다. 릴리즈는 태그 + bump를 하나의 커밋으로 묶는다.

---

## 출처

- [Create plugins — Claude Code Docs](https://code.claude.com/docs/en/plugins)
- [Create and distribute a plugin marketplace — Claude Code Docs](https://code.claude.com/docs/en/plugin-marketplaces)
- [Plugins reference — Claude Code Docs](https://code.claude.com/docs/en/plugins-reference)
- [Discover and install plugins — Claude Code Docs](https://code.claude.com/docs/en/discover-plugins)
- [Hooks reference — Claude Code Docs](https://code.claude.com/docs/en/hooks)
- [anthropics/claude-plugins-official](https://github.com/anthropics/claude-plugins-official)
- [anthropics/claude-plugins-community — marketplace.json](https://github.com/anthropics/claude-plugins-community/blob/main/.claude-plugin/marketplace.json)
- [anthropics/claude-code — Issues (플러그인/마켓플레이스 OPEN 이슈 25건 조회)](https://github.com/anthropics/claude-code/issues)
- [How to Publish a Claude Code Plugin to the Marketplace — systemprompt.io](https://systemprompt.io/guides/publish-plugin-claude-marketplace)
- [Claude Code Plugins: A 2026 Guide — Nimbalyst](https://nimbalyst.com/blog/claude-code-plugins-guide/)
