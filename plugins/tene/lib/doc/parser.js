/**
 * 문서 파서 — D04 §2
 *
 * 순수 함수다. fs 를 import 하지 않는다 (D00 §4 순수성 경계).
 * 파일 내용은 인자로 받는다.
 */

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/
const SECTION_ANCHOR_RE = /<!--\s*tene:sec=([\w-]+)\s*-->/
const AUTO_START_RE = /<!--\s*tene:auto:start\b([^>]*?)-->/
const AUTO_END_RE = /<!--\s*tene:auto:end\s*-->/
const FREE_SECTION_RE = /^#{1,6}\s*\+@\s*/
const HEADING_RE = /^(#{1,6})\s+(.*)$/

/** 템플릿을 채우지 않은 것을 잡는다 — D04 §2.4 */
const PLACEHOLDER_PATTERNS = [
  /^<[^>]+>$/,
  /^(TODO|TBD|FIXME)\b/i,
  /^\(작성 필요\)$/,
  /^\.\.\.$/,
  /^-$/,
  /^…$/,
]

/**
 * @typedef {Object} Section
 * @property {string} id
 * @property {string} heading      원본 제목 (언어 무관)
 * @property {number} level
 * @property {number} startLine    1-indexed
 * @property {number} endLine
 * @property {string} body
 * @property {Table[]} tables
 */

/**
 * @typedef {Object} Table
 * @property {string[]} headers
 * @property {string[][]} rows
 * @property {number} startLine
 */

/**
 * @typedef {Object} AutoBlock
 * @property {string} name
 * @property {Record<string,string>} meta
 * @property {number} startLine
 * @property {number|null} endLine   null 이면 쌍이 맞지 않는 것
 */

/** 아주 작은 YAML 서브셋 파서. layers.yml 과 frontmatter 만 다룬다. */
export function parseSimpleYaml(text) {
  const root = {}
  const stack = [{ indent: -1, value: root }]

  for (const raw of text.split('\n')) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue
    const indent = raw.length - raw.trimStart().length
    const line = raw.trim()

    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop()
    const parent = stack[stack.length - 1].value

    // 리스트 항목
    if (line.startsWith('- ')) {
      const item = coerce(line.slice(2).trim())
      const key = stack[stack.length - 1].pendingKey
      if (key !== undefined) {
        const holder = stack[stack.length - 1].holder
        if (!Array.isArray(holder[key])) holder[key] = []
        holder[key].push(item)
      }
      continue
    }

    const m = line.match(/^([\w.-]+)\s*:\s*(.*)$/)
    if (!m) continue
    const [, key, rest] = m

    if (rest === '') {
      const child = {}
      parent[key] = child
      stack.push({ indent, value: child, pendingKey: undefined, holder: parent })
      // 다음 줄이 리스트면 배열로 바뀐다
      stack[stack.length - 1].pendingKey = key
      stack[stack.length - 1].holder = parent
    } else if (rest.startsWith('[') && rest.endsWith(']')) {
      parent[key] = rest
        .slice(1, -1)
        .split(',')
        .map((s) => coerce(s.trim()))
        .filter((s) => s !== '')
    } else {
      parent[key] = coerce(rest)
    }
  }
  return root
}

function coerce(v) {
  const s = String(v).replace(/^["']|["']$/g, '')
  if (s === 'true') return true
  if (s === 'false') return false
  if (s === 'null' || s === '~') return null
  if (/^-?\d+$/.test(s)) return Number(s)
  if (/^-?\d*\.\d+$/.test(s)) return Number(s)
  return s
}

/** 마크다운 표를 구조화한다 — D04 §2.3 */
export function parseTables(body, baseLine = 1) {
  const lines = body.split('\n')
  const tables = []
  let i = 0

  while (i < lines.length) {
    const header = lines[i]
    const sep = lines[i + 1]
    if (header?.trim().startsWith('|') && /^\s*\|[\s:|-]+\|\s*$/.test(sep ?? '')) {
      const headers = splitRow(header)
      const rows = []
      let j = i + 2
      while (j < lines.length && lines[j].trim().startsWith('|')) {
        const cells = splitRow(lines[j])
        if (cells.some((c) => c !== '')) rows.push(cells)
        j++
      }
      tables.push({ headers, rows, startLine: baseLine + i })
      i = j
    } else {
      i++
    }
  }
  return tables
}

function splitRow(line) {
  const t = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  const cells = []
  let cur = ''
  for (let i = 0; i < t.length; i++) {
    if (t[i] === '\\' && t[i + 1] === '|') {
      cur += '|'
      i++
      continue
    }
    if (t[i] === '|') {
      cells.push(cur.trim())
      cur = ''
      continue
    }
    cur += t[i]
  }
  cells.push(cur.trim())
  return cells
}

/** 본문이 플레이스홀더뿐인가 — D04 §2.4 */
export function isPlaceholderOnly(body) {
  const lines = String(body ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    // 인용(>)·주석·코드펜스는 내용으로 치지 않는다
    .filter((l) => !l.startsWith('>') && !l.startsWith('<!--') && !l.startsWith('```'))
    .map((l) => l.replace(/^[-*+]\s+/, '').trim())
    .filter(Boolean)

  if (!lines.length) return true
  return lines.every((l) => PLACEHOLDER_PATTERNS.some((p) => p.test(l)))
}

/**
 * @param {string} text
 * @returns {{ frontmatter: object, tene: object, sections: Map<string, Section>,
 *             freeSections: string[], autoBlocks: AutoBlock[], raw: string,
 *             errors: Array<{code:string, detail:string, line?:number}> }}
 */
export function parseDoc(text) {
  const errors = []
  const raw = String(text ?? '')

  // frontmatter
  let frontmatter = {}
  let bodyStartLine = 1
  const fm = raw.match(FRONTMATTER_RE)
  if (fm) {
    frontmatter = parseSimpleYaml(fm[1])
    bodyStartLine = fm[0].split('\n').length
  } else {
    errors.push({ code: 'NO_FRONTMATTER', detail: 'YAML frontmatter 가 없습니다' })
  }

  const lines = raw.split('\n')

  // 섹션 — 앵커가 있는 제목만 수집한다
  const sections = new Map()
  const freeSections = []
  const headings = []

  lines.forEach((line, idx) => {
    const h = line.match(HEADING_RE)
    if (!h) return
    const lineNo = idx + 1
    const level = h[1].length
    if (FREE_SECTION_RE.test(line)) {
      freeSections.push(h[2].trim())
      headings.push({ lineNo, level, free: true })
      return
    }
    const anchor = line.match(SECTION_ANCHOR_RE)
    headings.push({ lineNo, level, free: false, id: anchor?.[1] ?? null })
    if (!anchor) return
    sections.set(anchor[1], {
      id: anchor[1],
      heading: h[2].replace(SECTION_ANCHOR_RE, '').trim(),
      level: h[1].length,
      startLine: lineNo,
      endLine: lines.length,
      body: '',
      tables: [],
    })
  })

  // 각 섹션의 끝 = **같거나 상위 레벨**의 다음 제목 직전.
  // 하위 제목(### Interface 등)은 섹션 본문에 포함된다 — 자동 생성 블록이 하위 제목을 쓰기 때문이다.
  const ordered = [...sections.values()].sort((a, b) => a.startLine - b.startLine)
  for (const sec of ordered) {
    const next = headings.find((h) => h.lineNo > sec.startLine && h.level <= sec.level)
    sec.endLine = next ? next.lineNo - 1 : lines.length
    sec.body = lines.slice(sec.startLine, sec.endLine).join('\n')
    sec.tables = parseTables(sec.body, sec.startLine + 1)
  }

  // 자동 생성 블록
  const autoBlocks = []
  lines.forEach((line, idx) => {
    const start = line.match(AUTO_START_RE)
    if (!start) return
    const meta = parseBlockMeta(start[1])
    const endIdx = lines.findIndex((l, i) => i > idx && AUTO_END_RE.test(l))
    autoBlocks.push({
      name: meta.block ?? '(unnamed)',
      meta,
      startLine: idx + 1,
      endLine: endIdx >= 0 ? endIdx + 1 : null,
    })
    if (endIdx < 0) {
      errors.push({ code: 'AUTO_BLOCK_UNPAIRED', detail: meta.block ?? '(unnamed)', line: idx + 1 })
    }
  })

  return {
    frontmatter,
    tene: frontmatter.tene ?? {},
    sections,
    freeSections,
    autoBlocks,
    raw,
    bodyStartLine,
    errors,
  }
}

function parseBlockMeta(attrText) {
  const meta = {}
  for (const m of String(attrText ?? '').matchAll(/([\w-]+)\s*=\s*("([^"]*)"|(\S+))/g)) {
    meta[m[1]] = m[3] ?? m[4]
  }
  return meta
}

/** 표를 { 헤더명: 값 } 객체 배열로 — 헤더 이름은 소문자·공백제거로 정규화 */
export function tableToObjects(table) {
  if (!table) return []
  const keys = table.headers.map((h) => normalizeHeader(h))
  return table.rows.map((row) => {
    const o = {}
    keys.forEach((k, i) => {
      o[k] = row[i] ?? ''
    })
    return o
  })
}

export function normalizeHeader(h) {
  return String(h)
    .replace(/\*\*/g, '')
    .replace(/\([^)]*\)/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
}

/** 셀에서 마크다운 장식을 제거한다 */
export function plainCell(cell) {
  return String(cell ?? '')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\*\*/g, '')
    .replace(/^\s*[✅❌⚠️⬜]\s*/, '')
    .trim()
}
