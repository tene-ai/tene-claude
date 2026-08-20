/**
 * 자동 생성 블록 교체 — D04 §6
 *
 * 순수 함수. 블록 밖 내용은 바이트 단위로 보존한다.
 * start/end 쌍이 맞지 않으면 부분 교체하지 않고 오류를 낸다 — 문서가 깨지기 때문이다.
 */
import { TeneError } from '../util/errors.js'
import { nowIso } from '../util/time.js'

const END_MARKER = '<!-- tene:auto:end -->'

function startRe(blockName) {
  return new RegExp(`<!--\\s*tene:auto:start\\s+block=${escapeRe(blockName)}\\b[^>]*-->`)
}

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function formatMeta(meta) {
  const entries = Object.entries({ generated: nowIso(), ...meta }).filter(([, v]) => v != null && v !== '')
  return entries.map(([k, v]) => ` ${k}=${/\s/.test(String(v)) ? `"${v}"` : v}`).join('')
}

/**
 * 블록 내용을 교체한다. 블록이 없으면 해당 섹션 끝에 삽입한다.
 *
 * @param {string} docText
 * @param {string} blockName
 * @param {string} content
 * @param {{ meta?: object, sectionId?: string }} [opts]
 * @returns {string}
 */
export function patchBlock(docText, blockName, content, opts = {}) {
  const meta = opts.meta ?? {}
  const header = `<!-- tene:auto:start block=${blockName}${formatMeta(meta)} -->`
  const body = String(content).replace(/\s+$/, '')

  const m = docText.match(startRe(blockName))
  if (!m) return insertBlock(docText, blockName, header, body, opts.sectionId)

  const startIdx = m.index
  const endIdx = docText.indexOf(END_MARKER, startIdx)
  if (endIdx === -1) {
    throw new TeneError('AUTO_BLOCK_UNPAIRED', { block: blockName })
  }

  return (
    docText.slice(0, startIdx) +
    header + '\n' + body + '\n' + END_MARKER +
    docText.slice(endIdx + END_MARKER.length)
  )
}

/**
 * 섹션 끝에 새 블록을 삽입한다.
 * 섹션 제목 바로 뒤가 아니라 **끝**에 넣는다 — 사람이 쓴 서술을 밀어내지 않기 위함이다.
 */
function insertBlock(docText, blockName, header, body, sectionId) {
  const block = `\n${header}\n${body}\n${END_MARKER}\n`
  if (!sectionId) return docText.replace(/\s*$/, '\n') + block

  const lines = docText.split('\n')
  const anchorRe = new RegExp(`<!--\\s*tene:sec=${escapeRe(sectionId)}\\s*-->`)
  const startIdx = lines.findIndex((l) => anchorRe.test(l))
  if (startIdx === -1) return docText.replace(/\s*$/, '\n') + block

  // 다음 제목 직전까지가 이 섹션이다
  let endIdx = lines.length
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (/^#{1,6}\s+/.test(lines[i])) {
      endIdx = i
      break
    }
  }
  // 섹션 끝의 빈 줄을 건너뛰어 삽입 위치를 정한다
  let insertAt = endIdx
  while (insertAt > startIdx + 1 && lines[insertAt - 1].trim() === '') insertAt--

  return [...lines.slice(0, insertAt), ...block.trim().split('\n'), '', ...lines.slice(insertAt)]
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
}

/** 여러 블록을 한 번에 교체한다 */
export function patchBlocks(docText, patches) {
  let out = docText
  for (const p of patches) {
    out = patchBlock(out, p.block, p.content, { meta: p.meta, sectionId: p.sectionId ?? p.block })
  }
  return out
}

/** frontmatter 의 tene.modified 를 갱신한다 (다른 필드는 건드리지 않는다) */
export function touchModified(docText, iso = nowIso()) {
  const date = iso.slice(0, 10)
  if (/^---[\s\S]*?\bmodified:\s*\S+/m.test(docText)) {
    return docText.replace(/(\bmodified:\s*)\S+/m, `$1${date}`)
  }
  return docText.replace(/^(---\r?\n[\s\S]*?)(\r?\n---)/, `$1\n  modified: ${date}$2`)
}
