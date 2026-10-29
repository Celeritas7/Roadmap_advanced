// Search — pure, no store or I/O. Every word typed must appear somewhere in
// the task's title, its folder path, or its link labels (any order, any case,
// full-width/half-width alike). Title hits rank above path hits; open tasks
// above done ones; then the most recently changed.
import type { TaskRow } from '../types.ts'

export type SearchHit = { t: TaskRow; path: string; score: number }
type LinkLike = { task_id: string; label: string }

const norm = (s: string) => s.normalize('NFKC').toLowerCase()

export function pathOf(byId: Map<string, TaskRow>, t: TaskRow): string {
  const parts: string[] = []
  let p = t.parent_id ? byId.get(t.parent_id) : undefined
  for (let i = 0; p && i < 64; i++) { parts.unshift(p.title); p = p.parent_id ? byId.get(p.parent_id) : undefined }
  return parts.join(' › ')
}

export function searchTasks(tree: TaskRow[], query: string, links: LinkLike[] = [], limit = 40): SearchHit[] {
  const q = norm(query).trim()
  if (!q) return []
  const terms = q.split(/\s+/).filter(Boolean)
  const byId = new Map(tree.map((t) => [t.id, t]))
  const labels = new Map<string, string>()
  for (const l of links) labels.set(l.task_id, (labels.get(l.task_id) ?? '') + ' ' + l.label)
  const hits: SearchHit[] = []
  for (const t of tree) {
    const title = norm(t.title)
    const path = pathOf(byId, t)
    const rest = norm(path + ' ' + (labels.get(t.id) ?? ''))
    let score = 0
    let all = true
    for (const w of terms) {
      const i = title.indexOf(w)
      if (i >= 0) score += 10 + (i === 0 || /[\s\-—・(（「]/.test(title[i - 1]) ? 5 : 0)
      else if (rest.includes(w)) score += 3
      else { all = false; break }
    }
    if (!all) continue
    if (title === q) score += 60
    else if (title.startsWith(q)) score += 30
    else if (title.includes(q)) score += 15
    if (t.done) score -= 20
    if (t.kind === 'group') score -= 4
    hits.push({ t, path, score })
  }
  hits.sort((a, b) => b.score - a.score || (b.t.updated_at ?? '').localeCompare(a.t.updated_at ?? ''))
  return hits.slice(0, limit)
}
