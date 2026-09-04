// V2-I — NEW FILE src/features/plan/launch.ts
// Opens a task resource. Web URLs → new tab. App deep links (anki:// etc.)
// → location.href; if the page is still visible ~1.5s later the OS almost
// certainly had no handler, so show a hint toast (approved fallback).
import type { ResourceRow } from '../../types.ts'

export function launchResource(r: Pick<ResourceRow, 'url' | 'kind' | 'label'>): void {
  const isApp = r.kind === 'app' || !/^https?:/i.test(r.url)
  if (!isApp) {
    window.open(r.url, '_blank', 'noopener')
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
