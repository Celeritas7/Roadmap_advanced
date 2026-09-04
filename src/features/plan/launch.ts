// V2-L — FULL REPLACEMENT for src/features/plan/launch.ts
// Delta vs V2-I: launching now (a) opens today's session row so a study app
// has something to complete, and (b) stamps the handshake params onto web
// URLs so the app knows WHICH stop it is completing.
import type { ResourceRow } from '../../types.ts'
import { dayKey } from '../../lib/dailyReset.ts'
import { startSession } from '../../store/studySessions.ts'

// Handshake contract — these three names are also read by rmSession.js in
// every study-app repo. Changing one means changing all of them.
export const RM_TASK_PARAM = 'rm_task'
export const RM_DAY_PARAM = 'rm_day'
export const RM_RET_PARAM = 'rm_ret'

// Only YOUR apps get the handshake params. A third-party site would ignore
// unknown params harmlessly, but stamping them everywhere leaks task uuids
// into other people's logs — so this is an explicit allowlist. Add a host
// here when you wire up another repo.
const HANDSHAKE_HOSTS = [
  'japanese-study-app-advanced',
  'japanese-grammer-app',
  'combined-japanese-goi',
  'writing-test',
  'chinese-study-app-simple',
  'chinese-study-app',
  'conversation-app-google-sheet',
  'burmese-study-app-advanced',
  'burmese-consonent-study-app-advanced',
  'burmese-conversation-study-advanved',
  'consonants-writing-app-advanced',
  'localhost',
  '127.0.0.1',
]

function wantsHandshake(url: URL): boolean {
  return HANDSHAKE_HOSTS.some(
    (h) => url.hostname === h || url.hostname.startsWith(h + '.'),
  )
}

function withHandshake(rawUrl: string, taskId: string): string {
  try {
    const u = new URL(rawUrl)
    if (!wantsHandshake(u)) return rawUrl
    u.searchParams.set(RM_TASK_PARAM, taskId)
    u.searchParams.set(RM_DAY_PARAM, dayKey())
    u.searchParams.set(RM_RET_PARAM, window.location.origin)
    return u.toString()
  } catch {
    return rawUrl // not a parseable absolute URL (app:// deep link etc.)
  }
}

export function launchResource(
  r: Pick<ResourceRow, 'url' | 'kind' | 'label'>,
  taskId?: string,
): void {
  // Open the session first, fire-and-forget. If it fails the launch still
  // happens — the study app's own completion call will create the row.
  if (taskId) void startSession(taskId).catch(() => {})

  const isApp = r.kind === 'app' || !/^https?:/i.test(r.url)
  if (!isApp) {
    window.open(taskId ? withHandshake(r.url, taskId) : r.url, '_blank', 'noopener')
    return
  }
  const t = window.setTimeout(() => {
    if (!document.hidden) showToast(`Couldn't open "${r.label}" — is the app installed?`)
  }, 1500)
  const clear = () => window.clearTimeout(t)
  window.addEventListener('pagehide', clear, { once: true })
  document.addEventListener('visibilitychange', clear, { once: true })
  window.location.href = r.url
}

// Framework-free transient toast — no store or portal plumbing needed for a
// fire-and-forget hint. Styles in the V2-I CSS append (.lr-toast).
export function showToast(msg: string): void {
  const el = document.createElement('div')
  el.className = 'lr-toast'
  el.setAttribute('role', 'status')
  el.textContent = msg
  document.body.appendChild(el)
  window.setTimeout(() => el.classList.add('on'), 20)
  window.setTimeout(() => {
    el.classList.remove('on')
    window.setTimeout(() => el.remove(), 300)
  }, 3200)
}
