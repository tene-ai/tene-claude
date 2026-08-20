---
name: doctor
description: tene 플러그인이 이 프로젝트에서 무엇을 할 수 있고 무엇을 할 수 없는지 진단한다. 환경·상태·인덱스·QA 도구·시크릿 가용성을 표로 보여준다.
when_to_use: "tene 진단, 환경 확인, 뭐가 안 되지, 설정 확인, 왜 안 돼, doctor, diagnose, check environment, what's available"
argument-hint: "[--json]"
allowed-tools: Read Glob Bash(${CLAUDE_PLUGIN_ROOT}/bin/*) Bash(git *)
metadata:
  tene:
    phase: null
    standalone: true
---

# tene:doctor — 환경 진단

## 언제 적용되는가

사용자가 tene 이 무엇을 할 수 있는지 묻거나, 기능이 기대대로 동작하지 않을 때. sprint 없이도 항상 동작한다.

## 수행 규칙

1. **사실은 스크립트가, 해석은 내가.** 진단 데이터는 `"${CLAUDE_PLUGIN_ROOT}/bin/tene-state" doctor` 가 만든다. 나는 그것을 읽기 쉽게 렌더링하고 권장 조치를 붙인다.
2. **없는 것을 없다고 정확히 말한다.** "아마 될 것"이라고 하지 않는다.
3. **Chrome MCP 는 내가 판단한다.** 스크립트는 MCP 도구 가용 여부를 알 수 없다. 내 도구 목록에 `mcp__claude-in-chrome__*` 가 있으면 `--capability '{"chromeMcp":true}'` 로 주입한다.

## 단계

1. Chrome MCP 가용 여부를 판단한다 (내 도구 목록 확인)
2. 진단 실행:
   ```
   "${CLAUDE_PLUGIN_ROOT}/bin/tene-state" doctor --capability '{"chromeMcp":<true|false>}'
   ```
3. 반환된 JSON 을 §출력 형식으로 렌더링한다
4. `findings` 를 severity 순(blocker → warning → info)으로 정리해 권장 조치를 제시한다

`--json` 인자가 오면 렌더링 없이 원본 JSON 을 그대로 보여준다 (이슈 리포트용).

## 출력 형식

```
[tene:doctor]

환경
  Claude Code      : v2.1.235 ✅  (Dynamic Workflow 사용 가능)
  Node.js          : v22.3.0  ✅  (요구: >=20)
  플랫폼            : darwin-arm64

상태
  프로젝트 루트     : <root>
  상태 디렉토리     : .tene-claude/ ✅ | 없음
  활성 sprint       : <id> (<phase>) | 없음
  lock             : 없음 ✅ | 점유 중 (stale)

인덱스
  심볼 인덱스       : ✅ N 심볼 / M 참조 (X분 전) | 없음
  앵커 인덱스       : ✅ N AC | 없음
  계층 규칙         : ✅ <path> | 없음 (기본 프리셋 사용)

QA capability
  테스트 러너       : ✅ <command> | ⛔ 없음 → UNIT insufficient
  타입체크          : ✅ <command> | ⛔ 없음
  브라우저          : ✅ Chrome MCP | ✅ Playwright | ⛔ 없음 → UX insufficient

시크릿
  tene CLI         : ✅ v<version> | 미설치 (선택 사항)
  볼트             : ✅ .tene/ | 없음
  평문 .env        : ⚠️ <files> | 없음 ✅

권장 조치
  1. ...
```

없는 항목은 **⛔ 로 표시하고 그것이 어떤 결과를 낳는지** 함께 적는다. 예: "테스트 러너 없음 → UNIT 검증이 insufficient 로 보고됩니다".

## 하지 않는 것

- 진단 중 상태를 변경하지 않는다 (읽기 전용)
- `.tene/` 를 읽지 않는다 (시크릿 볼트)
- 감지 실패를 "정상"으로 포장하지 않는다

## 실패 시

`"${CLAUDE_PLUGIN_ROOT}/bin/tene-state" doctor` 가 오류를 반환하면 `error.hint` 를 그대로 전달한다. 스크립트 자체가 실행되지 않으면 플러그인 설치 문제이므로 `/plugin` 의 Errors 탭 확인을 안내한다.
