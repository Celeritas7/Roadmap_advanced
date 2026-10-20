// Quick capture — pure, no store or I/O.
// One typed line becomes a parked Inbox task. The words give a first guess
// at its category, place and effort; every guess is a pill the user can
// change later in the Inbox. A "!" anywhere marks it high priority.

export type CaptureCategory = 'shop' | 'place' | 'dx' | 'lang' | 'other'

export type Capture = {
  title: string
  category: CaptureCategory
  folder: string          // sub-folder title under the capture root
  folderTags: string[]    // category tag carried by that folder
  tags: string[]          // the task's own rule tags (parked is added by the caller)
  high: boolean
}

export const CAPTURE_ROOT = 'Captured'

// Checked in this order; the first match wins. Word boundaries keep "budget"
// from matching "get", and "get together / up / ready…" isn't shopping. The
// Japanese verbs have no spaces, so they match anywhere in the line.
const RULES: { category: CaptureCategory; folder: string; folderTags: string[]; tags: string[]; words: RegExp }[] = [
  { category: 'shop', folder: 'Shopping', folderTags: ['shop'], tags: ['outside', 'short-burst'],
    words: /\b(buy|order|pick up|restock|refill)\b|\bget\b(?!\s+(together|up|ready|back|home|out|done|started|rid|better)\b)|買う|買い|注文/i },
  { category: 'place', folder: 'Places', folderTags: ['place'], tags: ['outside'],
    words: /\b(visit|go to|try|check out|explore|eat at)\b|行く|行きたい/i },
  { category: 'dx', folder: 'App dev', folderTags: ['dx'], tags: ['keyboard'],
    words: /\b(fix|bug|app|deploy|feature|ui|repo|pr)\b/i },
  { category: 'lang', folder: 'Languages', folderTags: ['lang'], tags: [],
    words: /\b(study|practice|practise|revise|kanji|hanzi|hsk|jlpt|n[1-5]|goi|grammar|burmese|chinese|japanese)\b|勉強/i },
]
const OTHER = { category: 'other' as const, folder: 'Other', folderTags: [] as string[], tags: [] as string[] }

export function guessCapture(line: string): Capture | null {
  const high = line.includes('!')
  const title = line.replace(/!+/g, ' ').replace(/\s+/g, ' ').trim()
  if (!title) return null
  const rule = RULES.find((r) => r.words.test(title)) ?? OTHER
  return {
    title,
    category: rule.category,
    folder: rule.folder,
    folderTags: rule.folderTags,
    tags: [...rule.tags, ...(high ? ['high'] : [])],
    high,
  }
}
