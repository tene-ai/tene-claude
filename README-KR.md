# tene

**Claude Code 를 위한 spec-driven vibe coding.**
tene 은 대화 중에 기획 의도를 붙잡아 문서로 남기고, 그 문서를 코드에 앵커한 뒤, 만들어진 것이 의도대로인지 **증거와 함께** 증명한다.

[English README](README.md)

---

## 무엇이 문제인가

바이브 코딩이 무너지는 지점은 코드를 쓰는 속도가 아니다. **검증**이다.

무엇을 만들기로 했는지가 대화 여기저기에 흩어져 있으면, 사람도 모델도 "다 됐다" 가 무슨 뜻이었는지 말할 수 없다. 그러면 검사는 "보기엔 맞는 것 같다" 가 되고, 그건 검사가 아니다.

tene 은 대화와 코드 사이에 문서를 하나 놓고, 양쪽이 그 문서에 답하게 만든다.

---

## 설치

```bash
/plugin marketplace add tene-ai/tene-claude
/plugin install tene@tene-ai
```

**Node.js 20+** 가 필요하다. 외부 패키지 의존은 0 이며 CI 가 이를 강제한다.

### 로컬 클론에서 바로 써보기

이 저장소는 **마켓플레이스**이고 플러그인은 그 안에 있다. `--plugin-dir` 는 플러그인 하나를 가리키므로 하위 경로를 준다:

```bash
claude --plugin-dir plugins/tene
```

`--plugin-dir .` 는 동작하지 않는다 — 저장소 루트에는 `marketplace.json` 만 있고 `plugin.json` 이 없기 때문이다.

제대로 로드됐는지, 그리고 이 프로젝트에서 무엇을 할 수 있고 무엇을 할 수 없는지는 `/tene:doctor` 로 확인한다.

---

## 한 사이클

```
prd → plan → design → do → loop-check → qa → report → archive
```

각 단계 사이에 게이트(G0~G7)가 있다. 게이트는 **결정론**이다 — 같은 입력이면 같은 결과가 나오고, 말로 통과시킬 수 없다.

```bash
/tene:sprint init checkout-retry   # sprint 시작
/tene:prd                          # 의도 인터뷰 → 수용 기준
/tene:plan                         # 작업 분해 + AC 커버리지 확인
/tene:design                       # 처리 로직, 4계층, 6질문, 코드 앵커
# ... 구현 ...
/tene:loop-check                   # 문서 ↔ 구현 대조
/tene:qa                           # 7-Layer 검증
/tene:report                       # R1~R6 회고
/tene:archive                      # 종료 + 미결 항목 승격
```

슬래시로 부르지 않아도 된다. "이거 QA 좀 해줘", "문서대로 됐는지 점검해줘" 같은 말에서 알맞은 스킬이 잡힌다.

---

## 무엇이 다른가

### "100%" 를 백분율로 세지 않는다

```
진행률 67% (2 / 3)
판정: pass | blocking 갭 0
```

백분율은 두 가지로 조작된다 — 분모를 줄이거나, 사소한 통과 아홉 개가 치명적 실패 하나를 평균으로 가리거나. 그래서 게이트는 딱 하나만 묻는다: **blocking 항목이 전부 증거와 함께 통과했는가.** 백분율은 진행 표시일 뿐 판정이 아니다.

### 미측정을 통과로 세탁하지 않는다

| 판정 | 뜻 |
|---|---|
| `passed` | 증거가 충족을 **증명** |
| `failed` | 증거가 위반을 **증명** |
| `insufficient` | **모른다** — 증거가 없거나 불충분 |
| `not-applicable` | 해당 없음 (사유 필수) |

테스트 러너가 없어서 못 잰 것은 `insufficient` 다. `passed` 도 `not-applicable` 도 아니다. 게이트를 막지는 않지만 보고서 R6 에 **반드시** 남는다 — 무엇을 측정하지 못했는지가 다음 sprint 의 입력이기 때문이다.

### 어떤 문서도 요구하지 않은 코드를 찾아낸다

문서대로 구현했는지 보는 건 절반이다. 나머지 절반은 **그 외의 것이 만들어지지 않았는지** 보는 것이다 — 범위는 그렇게 조용히 늘어난다.

앵커에 걸리지 않은 코드 변경은 셋 중 하나로 해소해야 게이트가 통과한다:

- 누락된 앵커였다 → 앵커 추가
- PRD 에 없던 요구가 구현됐다 → **범위 확장**, 사용자 확인 필요
- 리팩터링·오타 → 사유 기록

### 판정과 수집을 물리적으로 분리한다

`tene-judge` 와 `tene-refuter` 에이전트에는 **Read 도구만** 있다. 아무것도 실행할 수 없다.

판정자가 직접 돌려보면 "내가 해보니 되더라" 가 판정이 되고, 그 순간 증거는 형식이 된다. 그래서 수집자의 결론은 판정자 입력에서 제거되며, `passed` 판정은 서로 다른 세 렌즈의 적대적 반박을 견뎌야 한다.

### 시크릿은 컨텍스트에 들어가지 않는다

`tene-guard` 는 이 플러그인에서 유일하게 **fail-closed** 다. 명령을 검사하지 못했으면 차단한다.

```
tene get KEY                  → deny   (평문이 stdout 으로 나온다)
bash -c 'tene get KEY'        → deny   (간접 실행도 펼쳐서 본다)
/usr/local/bin/tene get KEY   → deny   (절대 경로도)
grep "tene get" README.md     → allow  (언급 ≠ 실행)
```

`--dangerously-skip-permissions` 에서도 deny 를 유지한다.

---

## Understanding Layer 와 6가지 질문

기술부채를 실제로 막아내는 부분이다.

**4계층** — 숲을 본다

| 계층 | 무엇이 사는가 |
|---|---|
| Interface | 진입점 — 외부에서 들어오는 자리 |
| Business Logic | 처리 규칙 — 이 시스템이 실제로 무엇을 하는지 |
| Persistence | 데이터 — 상태가 사는 곳 |
| Infrastructure | 런타임 — 돌아가기 위해 필요한 조건 |

규칙에 걸리지 않는 파일은 **추측으로 배정하지 않는다.** `unclassified` 로 남고, 그 목록이 곧 규칙을 다듬어야 할 지점이다.

**6질문** — 나무를 본다

선언된 이름 / 정의 파일 / import·참조 위치 / 호출·사용 위치 / 입력 형태 / **반환하고 *변경하는* 것**

마지막 질문이 가장 자주 부실하게 답해진다. 답은 반환값만이 아니다 — DB 쓰기, 전역 변경, 파일 쓰기도 답의 일부다.

표를 채우는 것이 목적이 아니다. **채우다 드러나는 것**이 목적이다 — orphan, 정의 모호, 계층 위반.

---

## 코드 인텔리전스

외부 인덱서를 설치할 필요가 없다. 3단 폴백으로 동작한다.

```
LSP (모델의 도구로) → 자체 인덱서 (순수 Node) → 에이전트 조사
```

**어느 단이 답했는지 항상 표기한다.** 인덱스가 답할 수 없으면 낮은 신뢰의 추측 대신 `needs-investigation` 을 돌려준다 — 추측은 문서에 실리는 순간 확정된 사실처럼 읽히기 때문이다.

지원: TypeScript/JavaScript · Python · Go · Java

한계도 함께 보고한다. 동적 디스패치·리플렉션·DI 는 정적으로 추적할 수 없고, tene 은 그 사실을 숨기지 않는다.

---

## 문서 구조

```
docs/sprints/<id>-<slug>/
├── 00-prd/prd.md            의도, 수용 기준 (EARS)
├── 01-plan/plan.md          작업, AC 커버리지
├── 02-design/design.md      처리 로직, 4계층, 6질문, 앵커
├── 03-analysis/
│   ├── loop-check-<n>.md    회차별 대조
│   ├── qa.md                7-Layer 판정
│   └── evidence/            증거 + 해시 매니페스트
└── 04-report/report.md      R1~R6
```

한국어·영어 템플릿을 함께 제공한다. 섹션은 언어 무관 앵커(`<!-- tene:sec=... -->`)로 찾으므로 문서 언어를 바꿔도 검증이 계속 동작한다.

`## +@ <제목>` 으로 자유 섹션을 얼마든지 추가할 수 있다 — 검증에 영향을 주지 않는다.

---

## 상태와 복구

상태는 `.tene-claude/` 에 원자적으로 저장되므로 세션이 끊겨도 이어진다.

**문서가 정본이다.** 상태가 손상되거나 사라져도 문서만 있으면 복구된다:

```bash
/tene:status <sprint-id> --resync
```

반대는 성립하지 않는다. 그래서 tene 은 문서를 지우지 않는다 — 아카이브도 이동만 한다.

---

## 설정

`/plugin` 에서 조정한다.

| 옵션 | 기본 | 뜻 |
|---|---|---|
| `docs_root` | `docs/sprints` | 문서가 생성될 경로 |
| `profile` | `standard` | 검증 강도 (strict / standard / light / off) |
| `max_loop_checks` | 3 | loop-check 반복 상한 |
| `auto_trigger` | true | 자연어 스킬 제안 |
| `doc_language` | `auto` | 문서 언어 (auto / ko / en) |

---

## 개발

```bash
node --test plugins/tene/test/unit/*.test.js          # 단위
node --test plugins/tene/test/guard-matrix.test.js    # 가드 매트릭스
node --test plugins/tene/test/integration/*.test.js   # 사이클 통합
node plugins/tene/test/bench.js                       # 훅 로직 예산
claude plugin validate . --strict                     # 매니페스트
node scripts/check-docs-consistency.js                # 문서 정합성
node scripts/assert-no-deps.js                        # 외부 의존 0
```

---

## 문서

- [요구사항·아키텍처](docs/00-prd/) — 무엇을 왜 만드는가
- [구현 계획](docs/01-plan/) — 마일스톤과 작업 분해
- [상세 설계](docs/02-design/) — 처리 로직 (D00~D13)
- [진행 현황](docs/01-plan/06-progress.md) — 완료 항목과 구현 중 드러난 정정
- [스킬 eval](docs/03-analysis/skill-evals-01.md) — 스킬 없는 대조군과 비교한 실측 결과

---

## 라이선스

Apache-2.0 — [LICENSE](LICENSE) 참조.
