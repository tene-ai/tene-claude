---
name: clear
description: tene 의 상태 파일과 이벤트 로그를 정리한다. 기본은 미리보기이며 삭제·이동은 사용자가 확인한 뒤에만 실행한다.
when_to_use: "tene 상태 정리, 초기화, 기록 지워, 용량 정리, clear, cleanup, 상태 파일 정리, 처음부터 다시"
argument-hint: "[--history] [--archived] [--quarantine] [--apply]"
disable-model-invocation: true
allowed-tools: Read Bash(${CLAUDE_PLUGIN_ROOT}/bin/*)
metadata:
  tene:
    phase: null
    standalone: true
    user_invocable_only: true
---

# tene:clear — 상태 정리

## 언제 적용되는가

상태 디렉토리가 커졌을 때, 또는 사용자가 명시적으로 정리를 요청할 때.

**모델이 스스로 부르지 않는다.** 이 스킬은 사용자가 직접 호출할 때만 동작한다. 상태를 지우는 일은 사용자의 결정이다.

## 원칙

1. **기본은 미리보기다.** `--apply` 없이는 아무것도 옮기거나 지우지 않는다.
2. **이동이지 삭제가 아니다.** 이벤트와 archived sprint 는 `archive/` 로 **옮긴다**. 지우는 것은 격리 파일(`--quarantine`)뿐이고 그것도 30일 지난 것만이다.
3. **활성 sprint 는 건드리지 않는다.** `status: active` 인 sprint 파일은 어떤 옵션으로도 정리 대상이 아니다.
4. **지운 것을 말한다.** 무엇이 어디로 갔는지 경로를 보여준다.

## 단계

1. 먼저 크기를 확인한다:
   ```
   "${CLAUDE_PLUGIN_ROOT}/bin/tene-state" size
   ```
2. 미리보기:
   ```
   "${CLAUDE_PLUGIN_ROOT}/bin/tene-state" clean
   ```
   `--history` / `--archived` / `--quarantine` 로 대상을 좁힐 수 있다. 아무것도 주지 않으면 history + archived 를 본다.
3. 결과를 §출력 형식으로 보여주고 **사용자에게 확인을 받는다**
4. 동의하면:
   ```
   "${CLAUDE_PLUGIN_ROOT}/bin/tene-state" clean --apply [옵션 그대로]
   ```

## 대상

| 옵션 | 대상 | 동작 |
|---|---|---|
| `--history` | `history/events.ndjson` 이 5,000줄 또는 256KB 초과 | 오래된 절반을 `archive/<YYYY-MM>/` 로 이동 |
| `--archived` | `status: archived` 인 sprint 파일 (최근 10개 제외) | `archive/<YYYY-MM>/sprints/` 로 이동 |
| `--quarantine` | 30일 지난 `.corrupt-*` / `.bak-*` | **삭제** |

최근 archived sprint 10개를 남기는 이유: 보고서의 R1(이전 sprint 와의 연결)이 그것을 읽는다.

## 출력 형식

```
[tene:clear] 미리보기 — 아직 아무것도 옮기지 않았습니다

이벤트 로그
  현재      : 6,214줄 (312KB) — 상한 초과
  이동 대상  : 오래된 3,107줄 → .tene-claude/archive/2026-08/events.ndjson

archived sprint
  이동 대상  : payment-core, user-auth (2건)
  유지      : 최근 10건

격리 파일
  (--quarantine 을 주지 않아 검사하지 않음)

실행하려면 /tene:clear --apply
```

`--apply` 이후:

```
[tene:clear] 완료

  이벤트    3,107줄 → .tene-claude/archive/2026-08/events.ndjson
  sprint    2건    → .tene-claude/archive/2026-08/sprints/

현재 상태와 활성 sprint 는 그대로입니다.
```

## 하지 않는 것

- 활성 sprint 를 지우지 않는다
- 문서(`docs/sprints/`)를 건드리지 않는다 — **문서가 정본이다.** 문서를 지우면 `--resync` 로도 복구할 수 없다
- `.tene/` (시크릿 볼트)를 건드리지 않는다
- 확인 없이 `--apply` 를 실행하지 않는다

## 사용자가 "전부 초기화" 를 원할 때

상태 디렉토리 전체를 지우는 옵션은 제공하지 않는다. 대신 이렇게 안내한다:

> `.tene-claude/` 를 통째로 지우면 상태가 사라지지만 문서는 남습니다.
> 문서가 정본이므로 `/tene:status <id> --resync` 로 다시 만들 수 있습니다.
> 정말 지우시겠다면 직접 삭제하세요 — 되돌릴 수 없어 제가 대신 하지 않습니다.

## 실패 시

정리 중 오류가 나면 **이미 옮긴 것과 못 옮긴 것을 나눠서** 보고한다. 이동은 파일 단위로 원자적이므로 중간에 멈춰도 반쪽짜리 파일은 생기지 않는다.
