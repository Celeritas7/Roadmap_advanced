// V2-H — NEW FILE src/features/plan/langMeta.ts
// Language + phase metadata for the Languages multi-road window. Pure
// constants + tag readers. Language and phase both live in task.tags
// (text[] column) — NO schema change, no migration file needed.
import type { TaskRow } from '../../types.ts'

export type Lang = { id: string; name: string; flag: string }
export const LANGS: Lang[] = [
  { id: 'ja', name: 'Japanese', flag: '🇯🇵' },
  { id: 'zh', name: 'Chinese', flag: '🇨🇳' },
  { id: 'my', name: 'Burmese', flag: '🇲🇲' },
]
export const LANG_BY_ID: Record<string, Lang> = Object.fromEntries(LANGS.map((l) => [l.id, l]))

export type LangPhase = { id: string; label: string }
export const LANG_PHASES: LangPhase[] = [
  { id: 'ph-quick', label: 'Quick study' },
  { id: 'ph-reading', label: 'Reading' },
  { id: 'ph-writing', label: 'Writing' },
  { id: 'ph-listening', label: 'Listening' },
  { id: 'ph-speaking', label: 'Speaking' },
]

const LANG_IDS = new Set(LANGS.map((l) => l.id))
const PHASE_IDS = new Set(LANG_PHASES.map((p) => p.id))

export const taskLang = (t: TaskRow): string | null =>
  t.tags.find((tag) => LANG_IDS.has(tag)) ?? null
export const taskPhase = (t: TaskRow): string | null =>
  t.tags.find((tag) => PHASE_IDS.has(tag)) ?? null

// Hide these meta tags wherever raw tag chips render (TaskRow, filters).
export const isLangMetaTag = (id: string): boolean => LANG_IDS.has(id) || PHASE_IDS.has(id)
