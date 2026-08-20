/**
 * 미귀속 변경 검사 — D07 §5
 *
 * **이 검사가 spec driven 강제의 실질적 수단이다.**
 *
 * 문서에 없는데 구현된 것을 찾아낸다. 이것을 안 하면 "문서대로 구현했는가" 만 보게 되고,
 * "문서에 없는 것을 구현하지 않았는가" 는 아무도 안 본다. 후자가 빠지면
 * 범위가 조용히 늘어나고, 늘어난 부분은 QA 대상이 아니므로 검증도 안 된다.
 */
import { execFileSync } from 'node:child_process'
import { judgeLayer } from '../scan/layer.js'
import { symbolsIn } from '../scan/query.js'
import { isConfigFile, isDocOrState, isTestFile, isVaultPath } from '../util/paths.js'

/** 해소 방법 — 셋 중 하나여야 G5 를 통과한다 */
export const RESOLUTIONS = {
  ANCHOR: 'anchor',       // (a) 누락된 앵커였다 → design.md 앵커 표에 추가
  PROMOTE: 'promote',     // (b) PRD 에 없던 요구가 구현됐다 → 범위 확장, 사용자 확인 필수
  UNRELATED: 'unrelated', // (c) 리팩터링·오타·포맷팅 → 사유 기록
}

/**
 * git 으로 변경 파일 목록을 얻는다.
 * git 이 없거나 저장소가 아니면 **빈 목록이 아니라 null** 을 낸다 —
 * "변경 없음" 과 "확인 못 함" 은 다르다.
 */
export function changedFiles(root, fromCommit, toRef = 'HEAD') {
  if (!fromCommit) return null
  try {
    const out = execFileSync('git', ['diff', '--name-only', `${fromCommit}..${toRef}`], {
      cwd: root, encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'],
    })
    return out.split('\n').map((s) => s.trim()).filter(Boolean)
  } catch {
    return null
  }
}

/**
 * 커밋되지 않은 변경도 본다 — 구현 직후 loop-check 를 돌리는 것이 보통이다.
 *
 * `-uall` 이 필수다. 없으면 git 이 추적되지 않은 **디렉토리를 `src/` 로 축약**해서
 * 새로 만든 파일이 전부 "변경 안 됨" 으로 판정된다. 구현 직후가 정확히 그 상황이다.
 */
export function workingChanges(root) {
  try {
    const out = execFileSync('git', ['status', '--porcelain', '-uall'], {
      cwd: root, encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'],
    })
    return out.split('\n')
      .map((l) => l.slice(3).trim())
      .filter(Boolean)
      .map((p) => (p.includes(' -> ') ? p.split(' -> ')[1] : p)) // 이름 변경
  } catch {
    return null
  }
}

export function diffStat(root, fromCommit, path) {
  try {
    const out = execFileSync('git', ['diff', '--numstat', `${fromCommit}..HEAD`, '--', path], {
      cwd: root, encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'],
    })
    const line = out.split('\n')[0]
    if (!line) return null
    const [added, removed] = line.split('\t')
    return { added: Number(added) || 0, removed: Number(removed) || 0 }
  } catch {
    return null
  }
}

/**
 * 검사에서 제외할 파일.
 *
 * 테스트와 설정은 앵커 대상이 아니다 — 테스트는 검증이지 구현이 아니고,
 * 설정 변경은 AC 에 걸리기보다 인프라 계층 전체에 걸친다.
 */
export function isExempt(path, docsRoot) {
  return isDocOrState(path, docsRoot) || isVaultPath(path) || isTestFile(path) || isConfigFile(path)
}

/**
 * 앵커에 걸리지 않은 변경을 찾는다.
 *
 * @param {{ root: string, changed: string[]|null, anchors: object, index: object, rules: object,
 *           startCommit?: string, docsRoot?: string }} input
 * @returns {{ items: object[], exempt: string[], checked: number, available: boolean }}
 */
export function detectUnattributed({ root, changed, anchors, index, rules, startCommit, docsRoot }) {
  if (changed === null) {
    // git 을 못 읽었다. 0건이라고 말하지 않는다.
    return {
      items: [], exempt: [], checked: 0, available: false,
      reason: startCommit ? 'git_unavailable' : 'no_start_commit',
      hint: startCommit
        ? 'git 명령을 실행할 수 없어 미귀속 변경을 확인하지 못했습니다'
        : 'sprint 시작 커밋이 없어 무엇이 이번 변경인지 알 수 없습니다',
    }
  }

  const items = []
  const exempt = []

  for (const path of changed) {
    if (isExempt(path, docsRoot)) { exempt.push(path); continue }
    if (anchors?.byPath?.[path]?.length) continue

    const layer = judgeLayer(path, rules, {
      imports: (index?.imports?.[path] ?? []).map((im) => im.from),
    })
    const syms = index?.files?.[path] ? symbolsIn(index, path) : { results: [] }

    items.push({
      path,
      layer: layer.layer,
      indexed: Boolean(index?.files?.[path]),
      symbols: syms.results.slice(0, 8).map((s) => s.name),
      stat: startCommit ? diffStat(root, startCommit, path) : null,
      status: 'open',
      resolution: null,
    })
  }

  return { items, exempt, checked: changed.length, available: true }
}

/**
 * 해소 상태를 반영한다. sprint 상태에 저장된 결정을 덮어씌운다.
 * @param {object[]} items
 * @param {Array<{ path: string, resolution: string, reason?: string, ac?: string }>} decisions
 */
export function applyResolutions(items, decisions = []) {
  const byPath = new Map(decisions.map((d) => [d.path, d]))
  return items.map((it) => {
    const d = byPath.get(it.path)
    if (!d) return it
    return {
      ...it,
      status: 'resolved',
      resolution: d.resolution,
      resolutionReason: d.reason ?? null,
      resolvedAc: d.ac ?? null,
    }
  })
}

/** G5 는 미귀속이 전부 해소되어야 통과한다 */
export function unresolvedCount(items) {
  return items.filter((it) => it.status !== 'resolved').length
}

/**
 * 사용자에게 물을 질문을 만든다. 셋 중 하나를 고르게 한다 —
 * 자유 서술로 두면 "나중에 정리" 같은 답이 나오고 그건 해소가 아니다.
 */
export function promptFor(item) {
  return {
    path: item.path,
    question: `${item.path} (${item.layer}${item.stat ? `, +${item.stat.added}/-${item.stat.removed}` : ''}) 이 변경은 어떤 수용 기준을 위한 것입니까?`,
    options: [
      { id: RESOLUTIONS.ANCHOR, label: '기존 AC 의 앵커로 추가', note: 'design.md 앵커 표가 갱신됩니다' },
      { id: RESOLUTIONS.PROMOTE, label: '새 수용 기준으로 승격', note: '범위 확장입니다. PRD 를 갱신해야 합니다' },
      { id: RESOLUTIONS.UNRELATED, label: '무관한 변경', note: '사유를 함께 기록합니다' },
    ],
    symbols: item.symbols,
  }
}

/** loop-check 문서의 자동 생성 블록에 들어갈 마크다운 */
export function renderUnattributed(result, { lang = 'ko' } = {}) {
  if (!result.available) {
    return lang === 'ko'
      ? `> ⚠️ 확인하지 못했습니다: ${result.hint}`
      : `> ⚠️ Not checked: ${result.hint}`
  }
  if (!result.items.length) {
    return lang === 'ko' ? '(없음)' : '(none)'
  }

  const head = lang === 'ko'
    ? ['| 파일 | 계층 | 변경 | 심볼 | 해소 |', '|---|---|---|---|---|']
    : ['| File | Layer | Diff | Symbols | Resolution |', '|---|---|---|---|---|']

  const rows = result.items.map((it) => {
    const stat = it.stat ? `+${it.stat.added}/-${it.stat.removed}` : '—'
    const syms = it.symbols.length ? it.symbols.map((s) => `\`${s}\``).join(', ') : '—'
    const res = it.status === 'resolved'
      ? `${it.resolution}${it.resolutionReason ? ` — ${it.resolutionReason}` : ''}`
      : (lang === 'ko' ? '**미해소**' : '**unresolved**')
    return `| ${it.path} | ${it.layer} | ${stat} | ${syms} | ${res} |`
  })

  return [...head, ...rows].join('\n')
}
