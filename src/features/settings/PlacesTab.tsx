// V2-V — Settings · Places (prototype A4 Places.html; v2s APPLY.md §Stage 2;
// STEP6 REPLY3). Hub-owned list: rename / class / reorder / retire are held
// in the draft until Save; + Add goes straight to the hub.
// Retired places are read-only — no Restore until the hub ships restorePlace.
// Retiring leaves roadmap_role_locations alone (REPLY3 §2).
import { useEffect, useState, type CSSProperties } from 'react'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ROLES } from '../../seed.ts'
import { hubInstance } from '../../lib/rmHub.ts'
import type { HubPlace, RoleLocationRow } from '../../types.ts'
import { hubErrText, type PlacesDraft } from './usePlacesDraft.ts'

const FALLBACK_CLASSES = ['home', 'office', 'transit', 'cafe', 'out']

type Notice = { kind: 'exists' | 'error' | 'added'; text: string }

export function PlacesTab({ draft }: { draft: PlacesDraft }) {
  const vocabClasses = hubInstance()?.enums('place_class') ?? []
  const classes = vocabClasses.length ? vocabClasses : FALLBACK_CLASSES
  const [newLabel, setNewLabel] = useState('')
  const [newCls, setNewCls] = useState('out')
  const [adding, setAdding] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [retOpen, setRetOpen] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  useEffect(() => {
    if (!selected) return
    document.querySelector(`[data-place="${window.CSS.escape(selected)}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [selected, retOpen, draft.live.length])

  if (draft.status === 'loading') return <p className="st-empty">Loading places from the hub…</p>
  if (draft.status === 'nohub')
    return <p className="st-empty">The hub isn't connected yet. Places are read from Akatsuki — try again once the header shows 🌑 hub.</p>
  if (draft.status === 'error')
    return (
      <div className="st-notice error">
        Couldn't read places: {draft.error}{' '}
        <button type="button" className="st-link" onClick={() => void draft.reload()}>Retry</button>
      </div>
    )

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const ids = draft.live.map((p) => p.id)
    draft.setOrder(arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id))))
  }

  const onAdd = async () => {
    const label = newLabel.trim()
    if (!label || adding) return
    setAdding(true)
    setNotice(null)
    try {
      const r = await draft.add(label, newCls)
      setSelected(r.id)
      if (r.status === 'exists') {
        const matched = draft.byId.get(r.id)
        if (matched?.retired_at) setRetOpen(true)
        setNotice({
          kind: 'exists',
          text: `“${label}” is already a place — matched ${r.label}${matched?.retired_at ? ' (retired)' : ''}. Nothing added.`,
        })
      } else {
        setNewLabel('')
        setNotice({ kind: 'added', text: `Added ${r.label}. Every app sees it now.` })
      }
    } catch (e) {
      setNotice({ kind: 'error', text: `Couldn't add “${label}”: ${hubErrText(e)}` })
    } finally {
      setAdding(false)
    }
  }

  const classOptions = (current: string) => (classes.includes(current) ? classes : [current, ...classes])

  return (
    <>
      {draft.error && <div className="st-notice error">{draft.error}</div>}
      {notice && <div className={'st-notice ' + notice.kind}>{notice.text}</div>}

      <div className="st-grp">
        <div className="st-grp-h">
          <span className="t">Live</span>
          <span className="c">{draft.live.length} place{draft.live.length === 1 ? '' : 's'}</span>
        </div>
        <div className="st-cols" aria-hidden>
          <span className="w-drag" />
          <span className="w-label">Label</span>
          <span className="w-id">id</span>
          <span className="w-cls">class</span>
          <span className="w-aka">also matches</span>
          <span className="w-roles">roles here</span>
          <span className="w-act" />
        </div>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={draft.live.map((p) => p.id)} strategy={verticalListSortingStrategy}>
            {draft.live.map((p) => (
              <LiveRow
                key={p.id}
                place={p}
                label={draft.labelOf(p)}
                cls={draft.classOf(p)}
                classes={classOptions(draft.classOf(p))}
                roleLocs={draft.roleLocs}
                retiring={draft.retire.includes(p.id)}
                blank={draft.blankIds.includes(p.id)}
                selected={selected === p.id}
                onLabel={(v) => draft.setField(p.id, 'label', v)}
                onClass={(v) => draft.setField(p.id, 'class', v)}
                onRetire={() => draft.toggleRetire(p.id)}
              />
            ))}
          </SortableContext>
        </DndContext>
        <div className="st-add-row">
          <span className="st-drag" style={{ visibility: 'hidden' }}>⣿</span>
          <input
            className="st-cell"
            placeholder="New place — e.g. Café Veloce"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void onAdd()
              }
            }}
          />
          <select className="st-cls" aria-label="Class for new place" value={newCls} onChange={(e) => setNewCls(e.target.value)}>
            {classOptions(newCls).map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <button type="button" className="st-add-btn" disabled={!newLabel.trim() || adding} onClick={() => void onAdd()}>
            {adding ? 'Adding…' : '+ Add'}
          </button>
        </div>
      </div>

      {draft.retired.length > 0 && (
        <details className="st-ret" open={retOpen} onToggle={(e) => setRetOpen(e.currentTarget.open)}>
          <summary>Retired · {draft.retired.length}</summary>
          <div className="st-grp">
            {draft.retired.map((p) => (
              <div
                key={p.id}
                data-place={p.id}
                className={'st-row retired' + (selected === p.id ? ' sel' : '')}
                title="Read-only — the hub can't restore a place yet"
              >
                <span className="st-drag" style={{ visibility: 'hidden' }}>⣿</span>
                <span className="st-cell static">{p.label}</span>
                <span className="st-id">{p.id}</span>
                <span className="st-cls static">{p.class}</span>
                <Aliases place={p} />
                <RolesHere placeId={p.id} roleLocs={draft.roleLocs} />
                <span className="w-act" />
              </div>
            ))}
          </div>
        </details>
      )}

      <p className="st-note">
        <b>Class</b> is what the suggester matches on — a task tagged for <i>transit</i> fits any transit place.{' '}
        <b>Roles here</b> will be set per role in Roles &amp; tiers. Retiring hides a place from every app's pickers; old
        tasks still resolve and its role links are kept. Retired places can't be restored from here yet. The pin sets a
        place from your current location once GPS lands.
      </p>
    </>
  )
}

type RowProps = {
  place: HubPlace
  label: string
  cls: string
  classes: string[]
  roleLocs: RoleLocationRow[]
  retiring: boolean
  blank: boolean
  selected: boolean
  onLabel: (v: string) => void
  onClass: (v: string) => void
  onRetire: () => void
}

function LiveRow({ place, label, cls, classes, roleLocs, retiring, blank, selected, onLabel, onClass, onRetire }: RowProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: place.id,
  })
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    ...(isDragging ? { opacity: 0.6, zIndex: 1, position: 'relative' } : null),
  }
  return (
    <div
      ref={setNodeRef}
      style={style}
      data-place={place.id}
      className={'st-row' + (retiring ? ' retiring' : '') + (selected ? ' sel' : '')}
    >
      <span
        ref={setActivatorNodeRef}
        className="st-drag"
        style={{ touchAction: 'none' }}
        aria-label={`Reorder ${place.label}`}
        {...attributes}
        {...listeners}
      >
        ⣿
      </span>
      <input
        className={'st-cell' + (blank ? ' invalid' : '')}
        value={label}
        disabled={retiring}
        aria-label={`Label for ${place.label}`}
        aria-invalid={blank}
        onChange={(e) => onLabel(e.target.value)}
      />
      <span className="st-id">{place.id}</span>
      <select className="st-cls" aria-label={`Class for ${place.label}`} value={cls} disabled={retiring} onChange={(e) => onClass(e.target.value)}>
        {classes.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
      <Aliases place={place} />
      <RolesHere placeId={place.id} roleLocs={roleLocs} />
      <span className="w-act">
        <button type="button" className="st-gps" disabled title="Set from current location — arrives with GPS (R018)">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M8 14s4.5-4.2 4.5-7.5a4.5 4.5 0 0 0-9 0C3.5 9.8 8 14 8 14Z" />
            <circle cx="8" cy="6.5" r="1.6" />
          </svg>
        </button>
        {retiring ? (
          <button type="button" className="st-undo" onClick={onRetire} title="Keep this place">Undo</button>
        ) : (
          <button type="button" className="st-x" onClick={onRetire} title="Retire on save" aria-label={`Retire ${place.label}`}>×</button>
        )}
      </span>
    </div>
  )
}

function Aliases({ place }: { place: HubPlace }) {
  const aka = (place.aliases ?? []).join(', ')
  return <span className="st-aka" title={aka || undefined}>{aka || '—'}</span>
}

function RolesHere({ placeId, roleLocs }: { placeId: string; roleLocs: RoleLocationRow[] }) {
  return (
    <span className="st-roles">
      {ROLES.map((r) => {
        const on = roleLocs.some((rl) => rl.role_id === r.id && rl.location_id === placeId)
        return (
          <span key={r.id} className={'st-rl' + (on ? ' on' : '')} title={`${r.label}${on ? ' works here' : ''}`}>
            {r.badge}
          </span>
        )
      })}
    </span>
  )
}
