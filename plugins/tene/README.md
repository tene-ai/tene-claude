# tene

Spec-driven vibe coding for Claude Code. 기획 의도를 문서로 남기고, 코드에 앵커해서, 증거와 함께 검증한다.

전체 설명은 [저장소 README](../../README.md) 를 보라. 이 문서는 플러그인 내부 구조다.

## 구조

```
bin/          진입점 — 인자 파싱 + lib 호출만 (판정 없음)
lib/
  util/       공통 (원자적 쓰기, lock, 오류, 경로, 예산)
  doc/        문서 계약 — 파서·검증·추출·patch
  state/      상태 — 스키마·저장소·이벤트·요약·보존
  recover/    문서 → 상태 복구 (문서와 상태를 잇는 조합)
  scan/       코드 인텔리전스 — 워커·언어팩·인덱스·질의·계층·6질문·앵커
  loop/       loop-check — 요구 추출·판정·수렴·미귀속
  qa/         QA — charter·7Layer·capability·증거·커버리지
  gate/       게이트 규칙 G0~G7 (결정론)
  guard/      시크릿 가드 (fail-closed)
  report/     R1~R6 조립
  plan/       master plan 집계·승격
  router/     자연어 키워드 라우팅
  hooks/      훅 핸들러 10종
skills/       16종 (사용자·모델 진입점)
agents/       8종
workflows/    3종 (Dynamic Workflow)
templates/    문서 7종 × 2언어 + 계층 프리셋
test/         단위·통합·가드 매트릭스·정직성 Eval·벤치
```

## 경계

| 경계 | 규칙 |
|---|---|
| `bin/` ↔ `lib/` | bin 은 인자 파싱과 호출만. 로직은 lib |
| 판정 ↔ 서술 | 게이트·인덱서는 결정론(L2), 해석은 스킬·에이전트(L4) |
| 수집 ↔ 판정 | runner 의 결론은 judge 입력에서 제거된다 |
| 순수 ↔ I/O | `lib/doc/parser.js` 등은 fs 를 import 하지 않는다 |
| fail-open ↔ fail-closed | 전부 fail-open. **`tene-guard` 만 fail-closed** |

## 개발

```bash
# 로컬 로드 (저장소 루트에서)
claude --plugin-dir plugins/tene
```

스킬 이름은 **디렉토리 이름**에서 온다. `skills/prd/` → `/tene:prd`.
frontmatter 의 `name:` 은 무시되므로 디렉토리에 `tene-` 를 붙이면 `/tene:tene-prd` 가 된다.
에이전트는 반대로 파일명에 `tene-` 가 있어야 한다 (네임스페이스가 붙지 않는다).

```bash
node --test test/unit/*.test.js          # 단위
node --test test/guard-matrix.test.js    # 가드 매트릭스 (회귀 기준: 오탐 0)
node --test test/integration/*.test.js   # 사이클 통합
node --test test/eval-honesty.test.js    # 정직성 (실패 시 릴리스 중단)
node test/bench.js                       # 훅 로직 예산
```

외부 의존 0. Node 20+ 내장 모듈만 쓴다. CI 가 강제한다.

## 새 언어 팩 추가

`lib/scan/langs/` 에 모듈을 만들고 `index.js` 의 `PACKS` 에 등록한다.

계약은 `validatePack()` 이 검사한다 — 특히 **`stripNonCode` 는 길이와 줄 수를 보존해야 한다.** 어기면 모든 `file:line` 이 어긋난다.

## 문서

- 설계: [docs/02-design/](../../docs/02-design/) D00~D13
- 진행: [docs/01-plan/06-progress.md](../../docs/01-plan/06-progress.md)
- dogfooding: [docs/03-analysis/](../../docs/03-analysis/)
