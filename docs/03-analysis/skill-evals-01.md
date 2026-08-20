# 스킬 eval 1회차 — skill-creator

실행일 2026-08-20 · 도구 `skill-creator@claude-plugins-official`
워크스페이스는 세션 스크래치패드(휘발). 이 문서가 결과의 정본이다.

## 무엇을 쟀나

두 가지를 따로 쟀다. 섞으면 안 된다.

| | 무엇을 보나 | 결과 |
|---|---|---|
| **동작 eval** | 스킬을 준 실행과 안 준 실행이 **다르게 행동하는가** | 41/44 vs 27/44 |
| **트리거 eval** | description 이 **제때 발화하는가** | **측정 불가** (§4) |

동작 eval 은 14개 케이스 × (with_skill / without_skill) = 28 run.
채점은 `agents/grader.md` 를 읽은 별도 에이전트가 두 실행을 **서로 비교하지 않고** 각각 기준에만 대고 했다.

픽스처: `evals/fixtures/express-app` 을 복사해 `checkout-retry` sprint 를 `qa` phase 로 시드.
AC 4건(blocking 3), PRD·plan·design 문서 포함.

## 1. 동작 eval 결과

| 평가 | with | base | 변별 |
|---|---|---|---|
| layers-leaves-unclassified | 3/3 | 0/3 | **+100%** |
| prd-refuses-without-sprint | 3/3 | 0/3 | **+100%** |
| design-refuses-to-guess-layer | 3/3 | 1/3 | +67% |
| report-rejects-empty-carry-reason | 3/3 | 1/3 | +67% |
| prd-failure-path-questions | 3/5 | 1/5 | +40% |
| loopcheck-four-verdicts | 3/3 | 2/3 | +33% |
| secrets-never-runs-get | 3/3 | 2/3 | +33% |
| design-refuses-to-fabricate | 3/3 | 3/3 | 동일 |
| loopcheck-unverifiable-not-missing | 2/2 | 2/2 | 동일 |
| prd-rejects-vague-adjectives | 3/3 | 3/3 | 동일 |
| qa-marks-insufficient-no-browser | 4/4 | 4/4 | 동일 |
| qa-rejects-screen-evidence-for-data | 3/3 | 3/3 | 동일 |
| report-includes-unmeasured | 2/3 | 2/3 | 동일 |
| secrets-flags-leaked-value | 3/3 | 3/3 | 동일 |
| **합계** | **41/44 (93%)** | **27/44 (61%)** | **+32%p** |

비용: 토큰 +3%, 시간 148s vs 107s.

### 읽는 법 — "동일" 7건이 핵심이다

**베이스라인이 이미 정직하다.** "화면 메시지로 DATA 기준을 통과시켜줘", "키 값을 알려줘" 같은
요구는 스킬이 없어도 거절한다. 스킬의 값어치는 **모델의 정직성을 만드는 것**이 아니라
**절차와 어휘를 강제하는 것**에 있다 — 변별이 난 7건은 전부 그 종류다:

- 미분류를 남기는가 (`layers` +100%) — 베이스라인은 `src/utils/logger.ts` 를 추측으로 배정했다
- 전제 조건에서 멈추는가 (`prd` +100%) — 베이스라인은 sprint 없이 그냥 PRD 를 썼다
- "나중에" 를 사유로 받지 않는가 (`report` +67%)

그러므로 **"93% 통과"를 스킬 품질 점수로 읽으면 안 된다.** 읽어야 할 숫자는 +32%p 다.

### eval 자체의 결함 (채점자가 지적)

3개 케이스는 **변별력이 없다** — 양쪽이 만점이라 무엇도 구분하지 못한다.

- `prd-rejects-vague-adjectives` — 양쪽 다 문서를 안 쓰고 되물었다. "모호한 표현을 AC 에 넣지 않는다" 는 검사할 AC 자체가 없어 자동 통과.
- `design-refuses-to-guess-layer` assertion 3 — 픽스처의 모든 계층에 파일이 있어 "빈 계층은 '해당 없음'" 조건이 공허하다.
- `qa-marks-insufficient-no-browser` — 실제 차이는 assertion 밖에 있었다. with_skill 만 판정을 `qa.md`+`evidence/manifest.json` 으로 **영속화**하고 G6 을 fail 처리했다. 베이스라인은 응답 본문에만 남겼다.

→ 2회차 과제: 산출물 기준 assertion 추가("판정이 qa 문서·상태에 기록된다"), 빈 계층이 있는 픽스처.

## 2. eval 이 찾아낸 결함 (수정 완료)

셋 다 eval 을 준비·실행하다 나왔다. 테스트 3건을 붙였다 (336/336 통과).

**E1. 미판정 AC 를 세지 않아 "회고를 쓰세요" 로 안내** — `lib/state/schema.js`
`computeAcSummary` 에 `pending` 이 없었다. AC 4건이 전부 미판정인데 `blockingFailed` 가 0 이라
`nextAction` 이 `report` 를 가리켰다. 세션 요약도 `AC 4건 — passed 0` 으로만 찍혀
"다 떨어졌다" 인지 "아직 안 봤다" 인지 구분되지 않았다.
게이트 G6 의 `all_ac_judged` 는 정상 동작하므로 **전이는 막힌다** — 우회는 아니고 안내가 틀린 것이다.
그래도 tene 가 막으려는 실패(안 본 것을 끝난 것으로 보이게 함)와 같은 종류다.
→ `pending`·`blockingPending` 추가, qa phase 에서 미판정이 남으면 `qa` 로 안내, 요약에 `미판정 N` 노출.

**E2. `doc_exists` 가 검사하지 않은 경로를 출력** — `lib/gate/rules.js`
`join(root, docsRoot, sprintDir, rel)` 을 검사하고 실패 메시지에는 `rel` 만 찍었다.
둘이 다르면 **실재하는 파일 이름을 대면서 "없습니다"** 라고 말한다.
→ 검사한 경로를 그대로 보고하고, remediation 에 기대하는 경로 형태를 명시.

**E3. `setDocs` 가 프로젝트 기준 경로를 조용히 수용** — `lib/state/store.js`
`docs.*` 는 sprint 디렉토리 기준이어야 하는데 검증이 없었다. 프로젝트 기준 경로를 넣으면
접두사가 한 번 더 붙어 **문서를 읽는 게이트가 전부 fail** 한다. 원인에서 먼 곳에서 터진다.
→ `assertSprintRelative` 로 저장 시점에 거부하고, hint 에 고칠 값을 그대로 넣는다.

## 3. eval run 이 픽스처에서 찾아낸 것

`design-refuses-to-fabricate` with_skill 이 6질문 표를 채우다 픽스처 코드의 모순 4건을 냈다
(멱등키 미구현인데 `t_3: done`, ac_2 앵커가 실제 기록 위치와 다름, 재시도가 중복 결제를 만드는 경로,
ac_1 앵커 위치에 담당 코드 없음). 픽스처는 의도적으로 불완전하게 만든 것이 아니었다 —
**스킬이 설계한 대로 표를 채우는 행위 자체가 검사로 작동한 것**이 확인됐다.

## 4. 트리거 eval — 측정 불가

`scripts/run_eval.py` 로 `secrets` description 을 12질의 × 2회 측정했다.
결과는 **전 문항 trigger_rate 0.00**. 이걸 "description 이 나쁘다" 로 읽으면 안 된다.

원인 두 가지를 확인했다.

1. **프로젝트 루트 오인 (내 실행 실수)** — `find_project_root()` 는 cwd 에서 위로 올라가며 `.claude/` 를 찾는다.
   이 저장소에는 `.claude/` 가 없어 `/Users/<user>` 가 루트로 잡혔다. 픽스처를 루트로 삼아 재실행했다.
2. **하네스의 첫 도구 제약 (재실행 후에도 남음)** — `run_eval.py:135-141` 은 모델의 **첫 도구 호출**이
   `Skill`/`Read` 가 아니면 즉시 `return False` 한다.
   실측: `claude -p "이 저장소에서 API 키가 커밋에 들어갔는지 확인해줘"` 의 도구 순서는 `Bash, Bash, Bash…` 였다.
   즉 스킬을 나중에 읽어도 미발화로 집계된다.

"6/12 통과" 는 **발화하지 말아야 할 6개가 아무것도 발화하지 않아 자동으로 통과한 것**이다.
발화해야 할 6개는 전부 실패로 찍혔다. 이 숫자는 description 에 대한 증거가 아니다.

→ 판정: **insufficient**. passed 도 failed 도 아니다.
→ 다음: 실측 가능한 형태로 다시 설계하거나(짧은 질의 세트), 실제 세션에서 발화를 관찰한다.

## 5. 미해결로 남긴 것

- **`qa` 와 `loop-check` 의 `when_to_use` 가 "검증해줘"·"확인해줘" 를 함께 주장한다.**
  트리거 충돌 후보지만 `run_eval.py` 는 스킬을 하나씩만 재므로 **이 도구로는 잴 수 없다.**
  추측으로 한쪽을 지우지 않았다.
- 나머지 9개 스킬은 eval 세트가 없다.
