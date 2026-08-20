---
name: secrets
description: tene CLI 로 시크릿을 안전하게 다룬다. 평문 값이 AI 컨텍스트에 들어가지 않도록 강제한다.
when_to_use: "API 키, 시크릿, 토큰, 크리덴셜, 환경변수, .env, process.env, os.Getenv, 키 저장, 개발서버 실행, secret, api key, token, credential, env var, 비밀번호"
argument-hint: "[init|list|set|run|import|env|status]"
allowed-tools: Read Glob Grep Bash(tene list*) Bash(tene whoami*) Bash(tene version*) Bash(tene env*) Bash(tene status*)
# allowed-tools 는 "사전 승인" 이지 제한이 아니다. 실제 방어는 아래 두 줄이다.
disallowed-tools: Write Edit NotebookEdit
metadata:
  tene:
    phase: null
    standalone: true
    optionalDependency: tene-cli
---

# tene:secrets — 시크릿 취급

## 절대 규칙

**이 네 가지는 협상 대상이 아니다.** 위반하면 평문 시크릿이 대화 컨텍스트에 들어가고, 그 컨텍스트는 로깅·캐시·보존될 수 있다.

| # | 규칙 | 대신 |
|---|---|---|
| **SR1** | `tene get` 을 실행하지 않는다 | 사용자가 별도 터미널에서 직접 실행 |
| **SR2** | `tene export` 를 `--encrypted` 없이 실행하지 않는다 | `tene export --encrypted --file backup.tene.enc` |
| **SR3** | `.tene/` 아래를 읽지 않는다 | `tene list` (이름만) |
| **SR4** | 시크릿 값을 CLI 인자로 넘기지 않는다 | `cat key.txt \| tene set KEY --stdin` |

`.tene/` 는 암호문이지만 **암호문조차 컨텍스트에 넣지 않는다.**

**방어는 두 겹이다.**

| 겹 | 무엇 | 한계 |
|---|---|---|
| `disallowed-tools` | Write·Edit 를 **실제로 제거**한다 — 내가 시크릿을 파일에 쓸 수 없다 | Bash 는 남는다 |
| `tene-guard` 훅 | `tene get`·비암호화 export·`.tene/` 읽기를 **fail-closed 로 차단** | — |

`allowed-tools` 는 방어가 아니다. 권한 승인 없이 쓸 수 있게 하는 편의일 뿐이고,
목록에 없는 도구도 여전히 호출 가능하다. 실제 경계는 위 두 줄이다.

## 수행 규칙

1. **값을 보지 않는다.** 사용자가 값을 붙여넣으려 하면 **먼저 말린다**: "여기 붙여넣지 마세요. 대화 기록에 남습니다."
2. **값이 필요한 명령은 사용자에게 넘긴다.** 내가 실행하지 않고, 복사해서 쓸 명령을 보여준다.
3. **이름과 존재 여부만 다룬다.** `tene list` 는 키 이름만 낸다. 그것으로 충분한 경우가 대부분이다.
4. **tene CLI 가 없어도 동작한다.** 없으면 `.env` 기반 조언을 하되, 도입을 강권하지 않는다.

## 단계

### 상태 확인

```
tene list
tene status
```

없는 CLI 를 있다고 가정하지 않는다. 명령이 실패하면 미설치로 보고 그렇게 말한다.

### 저장 — 사용자가 직접 실행하게 한다

값이 들어가는 명령은 내가 실행하지 않는다. 이렇게 안내한다:

```
아래를 직접 실행하세요 (저는 값을 보지 않습니다):

  파일에서:      cat api-key.txt | tene set STRIPE_KEY --stdin
  대화형 입력:   tene set STRIPE_KEY
```

`tene set KEY <값>` 형태를 제안하지 않는다. `ps` 와 셸 히스토리에 남는다.

### 실행 — 값을 파일에 두지 않는다

```
tene run -- npm run dev
tene run -- python manage.py runserver
```

`tene run` 은 시크릿을 프로세스 환경변수로만 주입한다. `.env` 파일이 필요 없어진다.

### `.env` 이관

`.env` 가 있으면 이관을 제안한다. **강제하지 않는다** — `.env` 는 정당한 용도가 많다.

```
tene import .env
rm .env
echo '.env' >> .gitignore
```

이후 실행을 `tene run --` 으로 바꾼다.

### 코드에서 참조 확인

```
Grep: process\.env\.|os\.Getenv|os\.environ|ENV\[
```

어떤 키를 쓰는지 **이름만** 모은다. 값은 보지 않는다. 코드가 참조하는 이름과 `tene list` 의 이름을 대조하면 누락을 찾을 수 있다.

## 출력 형식

```
[tene:secrets]

볼트
  tene CLI    : ✅ v0.4.2 | ⛔ 미설치
  저장된 키   : 12개 (이름만 표시)
    STRIPE_KEY, DATABASE_URL, JWT_SECRET, ...

코드가 참조하는 키
  process.env.STRIPE_KEY     src/payments/client.ts:12
  process.env.MISSING_KEY    src/jobs/mail.ts:8   ⚠️ 볼트에 없음

평문 파일
  ⚠️ .env (14줄) — .gitignore 에 있음
  ⚠️ .env.production — .gitignore 에 없음 ⛔

권장
  1. .env.production 을 .gitignore 에 추가하세요
  2. MISSING_KEY 를 볼트에 넣으세요:
       tene set MISSING_KEY        (대화형 입력)
```

## 하지 않는 것

- `tene get` / `tene export`(비암호화) 를 실행하지 않는다
- `.tene/` 를 읽지 않는다
- 시크릿 값을 명령 인자로 만들지 않는다
- 사용자가 붙여넣은 값을 그대로 명령에 넣지 않는다 — **먼저 말린다**
- `.env` 를 임의로 지우지 않는다 (이관 명령을 보여주고 사용자가 실행하게 한다)
- 값의 일부라도 출력하지 않는다 (앞 4자리도 안 된다)

## 사용자가 값을 붙여넣었다면

이미 컨텍스트에 들어간 것이다. 숨기지 말고 알린다:

```
그 값이 이미 대화 기록에 들어갔습니다. 다음을 권합니다:
  1. 해당 키를 회전(rotate)하세요 — 발급처에서 재발급
  2. 새 값은 여기 붙여넣지 말고 `tene set KEY` 로 직접 입력하세요
```

## 실패 시

- tene CLI 미설치 → `.env` + `.gitignore` 기반 조언으로 대체한다. 설치를 조건으로 걸지 않는다
- `tene list` 실패 → 볼트 미초기화일 수 있다. `tene init` 을 안내한다
- 가드가 명령을 차단했다면 → 차단 사유를 그대로 전달하고 안전한 대안을 제시한다
