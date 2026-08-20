export const meta = {
  name: 'understand-sweep',
  description: 'Answer the six questions for many symbols at once and surface what they reveal',
  whenToUse: 'When the user explicitly asks to understand a subsystem or a large set of symbols',
  phases: [
    { title: 'Investigate', detail: 'six questions per symbol' },
    { title: 'Synthesize', detail: 'find patterns across the answers' },
  ],
}

// 6질문의 목적은 표를 채우는 것이 아니라 **채우다 발견하는 것**이다.
// 심볼 하나씩 보면 안 보이는 것이 모아 놓으면 보인다.

const symbols = args?.symbols ?? []
if (!symbols.length) {
  return { error: 'no symbols supplied', hint: 'args.symbols 에 심볼 이름 배열을 넘기세요' }
}

const answers = await parallel(symbols.map((sym) => () => agent(
  `\`${sym}\` 에 대해 6가지 질문에 답하라.\n` +
  `Q1 선언된 이름 / Q2 정의 파일 / Q3 import·참조 위치 / Q4 호출·사용 위치 / ` +
  `Q5 입력 데이터 형태 / Q6 반환·변경 데이터\n\n` +
  `tene-scan questions --symbol ${sym} --render 로 시작하고, ` +
  `unanswered 항목만 직접 조사하라.\n` +
  `Q6 은 반환값만이 아니다 — DB 쓰기·전역 변경·파일 쓰기도 Q6 의 답이다.\n` +
  `모르는 것은 모른다고 적어라.`,
  { label: `six:${sym}`, phase: 'Investigate', agentType: 'tene:cartographer' },
)))

const valid = answers.filter(Boolean)
if (!valid.length) return { error: 'all investigations failed', symbols }

// 개별 답을 모아 패턴을 찾는다 — 이것이 팬아웃하는 이유다
const synthesis = await agent(
  `아래는 심볼 ${valid.length}개의 6질문 답변이다. **가로질러 보이는 것**을 찾아라.\n\n` +
  valid.join('\n\n---\n\n') +
  `\n\n찾을 것:\n` +
  `· 여러 심볼이 같은 곳을 참조하는가 (숨은 결합)\n` +
  `· 호출되지 않는 심볼이 있는가 (orphan)\n` +
  `· 같은 이름이 여러 곳에 정의되어 있는가\n` +
  `· 계층을 넘나드는 호출이 있는가\n` +
  `· Q6 을 답하지 못한 심볼이 몰려 있는가 (부작용이 불투명한 영역)\n\n` +
  `개별 심볼 요약을 반복하지 마라. 모아 놓아야 보이는 것만 써라.`,
  { label: 'synthesize', phase: 'Synthesize', agentType: 'tene:cartographer' },
)

log(`조사 완료: 심볼 ${valid.length}/${symbols.length}`)

return {
  investigated: valid.length,
  omitted: symbols.length - valid.length,
  perSymbol: valid,
  synthesis,
}
