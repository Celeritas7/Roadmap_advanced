// V2-V — Settings modal, layout A (prototype "A Sidebar tabs.html"). First
// Settings UI: Appearance + Places. Roles & tiers and Projects stay disabled
// until seed.ts is rewired to roadmap_roles / roadmap_projects (V2-W).
// Save / Cancel batch the Places draft; Appearance applies on click.
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { wfUserEmail } from '../../lib/wfAuth.ts'
import { AppearanceTab } from './AppearanceTab.tsx'
import { PlacesTab } from './PlacesTab.tsx'
import { usePlacesDraft } from './usePlacesDraft.ts'

type TabId = 'appearance' | 'roles' | 'projects' | 'places'

const TABS: Array<{ id: TabId; label: string; soon?: boolean }> = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'roles', label: 'Roles & tiers', soon: true },
  { id: 'projects', label: 'Projects', soon: true },
  { id: 'places', label: 'Places' },
]

const HEADS: Record<'appearance' | 'places', { title: string; sub: string }> = {
  appearance: { title: 'Appearance', sub: 'The direction the whole app is drawn in. Saved on this device.' },
  places: {
    title: 'Places',
    sub: 'The one list every app reads. Renaming keeps the old name as an alias, so tasks tagged with it still match.',
  },
}

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<'appearance' | 'places'>('appearance')
  const [email, setEmail] = useState<string | null>(null)
  const places = usePlacesDraft()
  const dirty = places.changes

  useEffect(() => {
    void wfUserEmail().then(setEmail)
  }, [])

  const close = () => {
    if (dirty && !window.confirm(`Discard ${dirty} unsaved change${dirty > 1 ? 's' : ''}?`)) return
    onClose()
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const save = async () => {
    if (await places.save()) onClose()
  }

  const head = HEADS[tab]
  const footText = places.saving
    ? 'Saving to the hub…'
    : places.blankIds.length
      ? 'A place needs a label'
      : dirty
        ? `${dirty} unsaved change${dirty > 1 ? 's' : ''} · saves to the hub`
        : 'No unsaved changes'

  // Portaled to the `.rm` root (token context, viewport-height) — the sticky
  // header's backdrop-filter would otherwise contain a fixed layer.
  const target = document.querySelector('.rm') ?? document.body
  return createPortal(
    <div className="st-layer">
      <div className="st-scrim" onClick={close} />
      <div className="st-modal" role="dialog" aria-modal="true" aria-labelledby="st-title">
        <aside className="st-rail">
          <div className="st-rail-h">Settings</div>
          <nav className="st-nav" aria-label="Settings sections">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                className={tab === t.id ? 'on' : ''}
                disabled={t.soon}
                aria-current={tab === t.id ? 'page' : undefined}
                onClick={() => !t.soon && setTab(t.id as 'appearance' | 'places')}
              >
                <span className="dot" />
                {t.label}
                {t.soon && <span className="soon">soon</span>}
              </button>
            ))}
          </nav>
          <div className="st-who">
            Signed in<b>{email ?? '…'}</b>
          </div>
        </aside>
        <section className="st-pane">
          <div className="st-pane-h">
            <div>
              <h2 id="st-title">
                {head.title}
                {tab === 'places' && <span className="st-shared">AKATSUKI · ALL APPS</span>}
              </h2>
              <p>{head.sub}</p>
            </div>
            <button type="button" className="st-close" aria-label="Close settings" onClick={close}>×</button>
          </div>
          <div className="st-body">
            {tab === 'appearance' ? <AppearanceTab /> : <PlacesTab draft={places} />}
          </div>
          <div className="st-foot">
            <span className={'st-dirty' + (places.blankIds.length ? ' warn' : '')}>{footText}</span>
            <button type="button" className="st-btn" onClick={close}>Cancel</button>
            <button
              type="button"
              className="st-btn pri"
              disabled={!dirty || places.saving || places.blankIds.length > 0}
              onClick={() => void save()}
            >
              Save
            </button>
          </div>
        </section>
      </div>
    </div>,
    target,
  )
}
