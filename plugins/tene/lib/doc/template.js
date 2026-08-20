/**
 * 스캐폴드 생성 — D04 §5
 *
 * 치환 변수는 {{sprint}} {{title}} {{today}} {{profile}} {{round}} {{maxRound}} 뿐이다.
 * 복잡한 템플릿 엔진을 만들지 않는다.
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { TeneError } from '../util/errors.js'
import { todayIso } from '../util/time.js'
import { isPlaceholderOnly, parseDoc } from './parser.js'
import { DOC_TYPES } from './sections.js'

const TEMPLATE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'templates')

export function templatePath(docType, lang = 'ko') {
  const p = join(TEMPLATE_DIR, `${docType}.template.${lang}.md`)
  if (existsSync(p)) return p
  const fallback = join(TEMPLATE_DIR, `${docType}.template.ko.md`)
  if (existsSync(fallback)) return fallback
  throw new TeneError('DOC_MISSING', { doc: docType, path: p })
}

export function render(text, vars) {
  return text.replace(/\{\{(\w+)\}\}/g, (m, k) => (vars[k] !== undefined ? String(vars[k]) : m))
}

/**
 * @param {string} docType
 * @param {{ sprintId: string, title?: string, profile?: string, lang?: string,
 *           round?: number, maxRound?: number }} ctx
 */
export function scaffold(docType, ctx) {
  if (!DOC_TYPES.includes(docType)) {
    throw new TeneError('UNKNOWN_COMMAND', { command: docType, available: DOC_TYPES })
  }
  const tpl = readFileSync(templatePath(docType, ctx.lang ?? 'ko'), 'utf8')
  return render(tpl, {
    sprint: ctx.sprintId ?? '',
    title: ctx.title ?? ctx.sprintId ?? '',
    today: todayIso(),
    profile: ctx.profile ?? 'standard',
    round: ctx.round ?? 1,
    maxRound: ctx.maxRound ?? 3,
  })
}

/**
 * 기존 파일 보호 — D04 §5.1
 * 플레이스홀더만 있으면 덮어써도 되고, 사람이 쓴 내용이 있으면 거부한다.
 */
export function isUntouched(existingText, docType) {
  const doc = parseDoc(existingText)
  if (!doc.sections.size) return true
  for (const sec of doc.sections.values()) {
    if (!isPlaceholderOnly(sec.body)) return false
  }
  return true
}

/** --merge: 누락된 섹션 앵커만 문서 끝에 추가한다. 기존 내용은 건드리지 않는다. */
export function mergeMissingSections(existingText, docType, ctx, requiredIds) {
  const doc = parseDoc(existingText)
  const missing = requiredIds.filter((id) => !doc.sections.has(id))
  if (!missing.length) return { text: existingText, added: [] }

  const tplDoc = parseDoc(scaffold(docType, ctx))
  const chunks = missing
    .map((id) => {
      const sec = tplDoc.sections.get(id)
      if (!sec) return null
      return `\n${'#'.repeat(sec.level)} ${sec.heading}     <!-- tene:sec=${id} -->\n${sec.body.trim()}\n`
    })
    .filter(Boolean)

  return { text: existingText.replace(/\s*$/, '\n') + chunks.join(''), added: missing }
}
