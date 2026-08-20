/** 테스트용 임시 프로젝트 — D13 §9 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'

export function tmpProject(files = {}) {
  const root = mkdtempSync(join(tmpdir(), 'tene-test-'))
  for (const [p, content] of Object.entries(files)) {
    const abs = join(root, p)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, content, 'utf8')
  }
  return {
    root,
    join: (p) => join(root, p),
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  }
}
