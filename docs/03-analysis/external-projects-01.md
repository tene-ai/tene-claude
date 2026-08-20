---
tene:
  doc: analysis
  status: done
  created: 2026-08-20
  lang: ko
---

# 외부 프로젝트 적용 #1 — 웹앱 구조 검증

> dogfooding #1 은 tene 자신(플러그인 구조)이었다. 그건 tene 원칙에 맞게 쓰인 코드라 유리한 조건이다.
> 이 회차는 **기본 프리셋이 가정하는 구조** — Express·FastAPI 웹앱에서 확인한다.

## 왜 필요한가

dogfooding 에서 미분류가 92/112 나왔다. 원인은 "기본 프리셋이 웹앱을 가정하는데 tene 는 플러그인" 이었다.

그렇다면 **웹앱에서는 정말 잘 맞는가?** 그것을 확인하지 않으면 프리셋이 어디서도 안 맞는 것일 수 있다.

---

## 1. Express (TypeScript)

`evals/fixtures/express-app` — routes / services / repositories / models / config / middleware / utils

**프로젝트 규칙 없이 프리셋만으로 8/8 정확.**

| 계층 | 분류된 파일 |
|---|---|
| interface | `routes/orders.ts`, `routes/health.ts` |
| business-logic | `services/order.ts`, `services/payment.ts` |
| persistence | `repositories/order.ts`, `models/client.ts` |
| infrastructure | `config/env.ts`, `middleware/auth.ts` |
| test | `tests/order.test.ts` |
| 미분류 | `utils/logger.ts` |

`utils/logger.ts` 가 미분류로 남는 것은 **정상이다.** 공통 유틸은 4계층 어디에도 속하지 않는다 (D06 §3.1.1).

capability 도 정확했다 — `package.json` 의 `test`/`lint`/`typecheck` 를 전부 찾고, 브라우저는 없다고 보고했다.

---

## 2. FastAPI (Python)

`evals/fixtures/fastapi-app` — api / services / db / core

### 발견: `src/core/**` 오분류

처음에는 `core/auth.py`(인증)와 `core/config.py`(설정)가 **business-logic** 으로 잡혔다.

프리셋의 business-logic 경로에 `src/core/**` 가 있었기 때문이다.

**`src/core/` 는 프로젝트마다 뜻이 다르다.**

| 프로젝트 | `src/core/` 의 의미 |
|---|---|
| DDD 스타일 | 도메인 코어 → business-logic |
| FastAPI 관례 | 설정·인증·의존성 → infrastructure |

모호한 이름을 프리셋이 한쪽으로 정하면 **절반의 프로젝트에서 틀린다.**

### 조치 1 · 프리셋에서 `src/core/**` 제거

모호하면 미분류로 두고 사용자가 정하게 한다. 미분류는 결함이 아니라 규칙을 다듬을 지점이다.

### 조치 2 · Python·Go·Java 인프라 라이브러리 추가

프리셋의 `infrastructure.imports` 에 **JS 생태계만** 있었다 (`jsonwebtoken`, `dotenv`, `@aws-sdk/*` …).

Python 의 `jwt`, `boto3`, `structlog` 나 Go 의 `github.com/golang-jwt/jwt` 가 없어서, 경로로 못 잡은 파일을 import 로도 못 잡았다.

### 결과

| 파일 | 판정 | 근거 |
|---|---|---|
| `api/orders.py` | interface | 경로 (`src/api/**`) |
| `services/*.py` | business-logic | 경로 |
| `db/*.py` | persistence | 경로 |
| `core/auth.py` | infrastructure | **import `jwt`** (confidence: medium) |
| `core/config.py` | **미분류** | 경로·import 어디에도 안 걸림 → 사용자가 정한다 |

`core/auth.py` 가 경로가 아니라 import 로 판정된 것이 중요하다. 경로 규칙이 모든 관례를 알 수는 없고, import 는 실제 의존을 보여준다.

심볼·참조도 정확했다 — `create_order` 의 정의(`services/order.py:4`)와 호출처(`api/orders.py:9`)를 찾았다.

---

## 3. 함께 발견한 결함

### `assertInProject` 가 상대 경로 root 를 처리하지 못함

`lib` 를 직접 쓰는 코드가 상대 경로를 넘기면 멀쩡한 경로가 `PATH_ESCAPE` 로 잡혔다.

`bin/` 은 `findProjectRoot()` 가 절대 경로로 바꿔주므로 정상 경로에서는 안 나타난다. **API 를 직접 쓸 때만 나타나는 결함이었다.**

→ `resolve(root)` 를 먼저 하도록 수정. 이탈 차단은 그대로 유지된다.

---

## 4. 배운 것

| # | |
|---|---|
| 1 | **프리셋은 자기가 가정한 구조에서는 정확하다** — Express 8/8. 문제는 가정 밖이다 |
| 2 | **모호한 이름을 프리셋이 정하면 절반이 틀린다** — `src/core/` 가 그랬다 |
| 3 | **import 규칙이 경로 규칙의 빈틈을 메운다** — 단 생태계를 빠짐없이 넣어야 한다 |
| 4 | JS 만 넣고 "다국어 지원" 이라고 하면 안 된다. Python·Go·Java 인프라 라이브러리가 통째로 빠져 있었다 |
| 5 | `bin` 경로로만 테스트하면 API 계약의 결함이 안 보인다 |

## +@ 자유 관점

프리셋을 고칠 때 유혹이 있었다. `src/core/**` 를 infrastructure 로 옮기면 FastAPI 에서 미분류가 0이 된다. 숫자가 예뻐진다.

하지만 DDD 프로젝트에서는 그게 틀린 답이 된다. **한쪽을 맞히려고 다른 쪽을 틀리게 만드는 것보다, 모르는 것을 모른다고 두는 편이 낫다.**

미분류 1건은 사용자가 30초면 정한다. 잘못 분류된 1건은 아무도 눈치채지 못한 채 계층 통계를 왜곡한다.
