// Quick capture — pure, no store or I/O.
// One typed line becomes a parked Inbox task. The words give a first guess
// at its category, place and effort; every guess is a pill the user can
// change later in the Inbox. A "!" anywhere marks it high priority.

export type CaptureCategory = 'shop' | 'place' | 'dx' | 'lang' | 'work' | 'house' | 'other'

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
  { category: 'work', folder: 'Office', folderTags: ['work'], tags: ['office'],
    words: /\b(meeting|email|mail|report|slides|deck|client|boss|timesheet|expense|invoice|office)\b|会議|報告|資料/i },
  { category: 'house', folder: 'Home', folderTags: ['house'], tags: ['home'],
    words: /\b(clean|laundry|wash|cook|dishes|gomi|trash|garbage|vacuum|tidy|iron)\b|掃除|洗濯|料理|ゴミ/i },
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

/** One typed line → separate captures. Splits on commas (also 、 and ，),
 *  semicolons and new lines; blanks are dropped. "!" stays with its own piece. */
export function splitCapture(text: string): string[] {
  return text.split(/[,，、;；\n]+/).map((s) => s.trim()).filter((s) => guessCapture(s) !== null)
}

/** True when the request never reached the server: offline, Wi-Fi dropped,
 *  device just woke, or a blocker. Chrome says "Failed to fetch", Firefox
 *  "NetworkError…", Safari "Load failed". */
export function isNetworkError(e: unknown): boolean {
  const m = e instanceof Error ? e.message : String(e ?? '')
  return /failed to fetch|networkerror|load failed|network request failed|fetch failed/i.test(m)
}

export const NETWORK_MESSAGE = "Couldn't reach the server. Check your connection and tap Add again. Your text is kept."
