---
tene:
  doc: analysis
  status: done
  created: 2026-08-20
  lang: ko
---

# Dogfooding #1 — tene 를 tene 에 적용

> D13 §6. M1~M8 완료 직후, 도구를 자기 자신에게 돌려본 기록.

## 왜 하는가

픽스처 테스트는 **내가 상상한 결함**만 잡는다. 실제 코드베이스는 상상하지 못한 모양을 하고 있다.

이 회차에서 나온 결함 3건은 **전부 테스트 257개가 통과하는 상태에서** 발견됐다.

---

## 1. 발견한 결함

### D-1 · 프로토타입 오염으로 인덱서가 죽음

```
INTERNAL index.refs[r.name].push is not a function
```

첫 명령에서 바로 터졌다.

**원인**: 심볼 이름은 사용자 코드에서 온다. `constructor`, `toString`, `valueOf` 가 될 수 있다. 일반 객체에서 `obj['constructor'] ??= []` 는 `Object.prototype.constructor`(함수)를 반환하므로 배열이 할당되지 않는다.

```javascript
const o = {}
typeof (o['constructor'] ??= [])   // 'function' — 배열이 아니다
```

**왜 픽스처가 못 잡았나**: 내가 만든 픽스처의 심볼 이름은 전부 `processPayment`, `markFailed` 같은 평범한 것이었다. 실제 코드에는 `class TeneError { constructor(...) }` 가 있다.

**조치**: `Object.create(null)` 로 만들고 `Object.hasOwn` 으로 확인 후 push. 디스크에서 읽은 인덱스도 되살린다.

### D-2 · 확장자 없는 진입점이 통째로 누락

`judgeBash` 의 6질문을 돌렸더니 **테스트 파일에서만 참조**된다고 나왔다. 실제로는 `bin/tene-guard` 가 쓴다.

**원인**: `langOf()` 가 확장자로만 언어를 판별한다. `bin/tene-guard` 는 확장자가 없다. **bin 9개가 전부 인덱싱되지 않았다.**

**영향**: 진입점이 인덱스에 없으면

- orphan 오탐이 쏟아진다 (진입점에서만 호출되는 심볼이 전부 orphan)
- interface 계층이 비어 보인다
- 6질문의 Q3/Q4 가 실제와 다르다

**조치**: 확장자가 없으면 첫 줄을 읽어 shebang 으로 판별한다. `#!/usr/bin/env node` → typescript 팩.

### D-3 · resync 가 계층을 위반하고 있었다

계층 검사가 blocker 2건을 냈다.

```
[blocker] reverse  lib/state/resync.js → lib/doc/parser.js
[blocker] reverse  lib/state/resync.js → lib/doc/extract.js
```

**판단**: 도구가 맞았다. `resync` 는 문서(business-logic)와 상태(persistence)를 **잇는** 조합 로직인데 `lib/state/` 에 있었다.

**조치**: `lib/recover/resync.js` 로 옮기고 business-logic 으로 분류. `bin/tene-loop` 을 별도로 둔 것과 같은 이유다.

> 도구가 blocker 라고 판정했는데 만든 사람이 무시하면, 사용자도 무시한다.

---

## 2. 규칙의 문제로 드러난 것

전부 **코드가 아니라 규칙이 틀린** 경우다. 위반 목록이 한 곳에 몰려 있으면 규칙을 의심해야 한다.

### R-1 · 훅을 infrastructure 로 분류 → blocker 15건

`lib/hooks/**` 를 infrastructure 로 두었더니 `hooks → state` 참조가 전부 reverse 로 잡혔다.

훅은 **Claude Code 가 호출하는 진입점**이다. `bin/` 과 같은 성격이므로 interface 가 맞다.

→ 규칙 수정 후 blocker 15 → 2

### R-2 · 공통 유틸을 infrastructure 로 분류 → infra-leak 29건

`lib/util/**`(errors, time, json)을 infrastructure 로 두었더니 `business-logic → util` 참조가 전부 infra-leak 경고로 잡혔다.

**4계층 모델에 횡단 관심사(공통 유틸)의 자리가 없다.** 이것이 근본 원인이고, D06 §3.1.1 에 한계로 기록했다.

→ `exclude` 로 계층 판정에서 제외. 오탐 29건이 검사 전체의 신뢰를 무너뜨리는 것보다 낫다.

---

## 3. 남긴 위반 — layer-skip 10건

```
lib/hooks/*.js → lib/state/*.js   (interface → persistence)
```

**의도된 설계다.** 훅은 200ms 예산 안에서 상태를 읽어야 하고, business-logic 을 거칠 여유가 없다 (D12 §3.4).

warning 이지 blocker 가 아니므로 게이트를 막지 않는다. 여기 기록해 다음에 볼 사람이 판단할 수 있게 한다.

---

## 4. 최종 상태

```
인덱싱     121 파일 / 875 심볼 / 7,919 참조 / 369ms
계층       interface 13 · business-logic 39 · persistence 7 · infrastructure 3 · test 20
미분류     0건
위반       blocker 0 · warning 10 (전부 문서화된 훅 → 상태)
```

계층 규칙: `docs/sprints/_meta/layers.yml`

---

## 5. 배운 것

| # | |
|---|---|
| 1 | **픽스처는 상상한 결함만 잡는다.** D-1, D-2 는 실제 코드베이스에서만 나왔다 |
| 2 | **위반이 한 곳에 몰리면 규칙을 의심한다.** R-1(15건 전부 훅), R-2(29건 전부 util) |
| 3 | **위반이 흩어져 있으면 코드를 의심한다.** D-3 은 2건이지만 같은 파일이었고 진짜였다 |
| 4 | 자기 도구의 판정을 자기가 존중하지 않으면 그 판정은 의미가 없다 |
| 5 | 기본 프리셋은 웹앱을 가정한다. 다른 구조에서는 92/112 가 미분류로 나왔고, **그것이 규칙을 다듬을 지점을 정확히 알려줬다** |

## +@ 자유 관점

미분류 92건이 나왔을 때 "도구가 쓸모없다" 고 느낄 수 있다. 하지만 그 목록이 곧 규칙 초안이었다 — 제안된 16개 패턴을 그대로 받아 적으니 미분류가 0이 됐다.

추측으로 채웠다면 92개 파일이 그럴듯한 계층에 배정됐을 것이고, 그 통계는 아무 의미가 없었을 것이다. **모른다고 말한 것이 규칙을 만들게 했다.**
