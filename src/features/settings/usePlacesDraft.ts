// V2-V — Settings · Places draft. The hub owns the rows (R023); this only
// holds unsaved edits and replays them through editPlace / retirePlace on
// Save. Add is the exception: it goes to the hub at once, because the hub is
// what decides whether the name already exists (by label and alias).
// Lives in SettingsModal, so switching tabs keeps the draft.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { hubInstance, refreshPlaces } from '../../lib/rmHub.ts'
import * as sync from '../../store/sync.ts'
import type { HubPlace, RoleLocationRow } from '../../types.ts'

type Edit = { label?: string; class?: string }
type AddResult = { id: string; label: string; class: string; status: 'created' | 'exists' }

export type PlacesDraft = ReturnType<typeof usePlacesDraft>

// Match on the code, show the message (AKATSUKI.md · Sending).
export const hubErrText = (e: unknown): string => {
  const code = (e as { code?: string })?.code
  const msg = (e as Error)?.message ?? String(e)
  return code ? `${code} · ${msg}` : msg
}

export function usePlacesDraft() {
  const [all, setAll] = useState<HubPlace[]>([])
  const [order, setOrder] = useState<string[]>([])
  const [edits, setEdits] = useState<Record<string, Edit>>({})
  const [retire, setRetire] = useState<string[]>([])
  const [roleLocs, setRoleLocs] = useState<RoleLocationRow[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'nohub' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // keepOrder: the user's unsaved order survives a reload (after an add);
  // places it doesn't know go to the end.
  const load = useCallback(async (keepOrder?: string[]) => {
    const hub = hubInstance()
    if (!hub) {
      setStatus('nohub')
      return
    }
    try {
      const [rows, rl] = await Promise.all([
        hub.hub.places({ withRetired: true }),
        sync.fetchRoleLocations().catch((e) => {
          console.warn('[settings] role locations', hubErrText(e))
          return [] as RoleLocationRow[]
        }),
      ])
      const live = rows.filter((p) => !p.retired_at).map((p) => p.id)
      const kept = (keepOrder ?? []).filter((id) => live.includes(id))
      setAll(rows)
      setOrder([...kept, ...live.filter((id) => !kept.includes(id))])
      setRoleLocs(rl)
      setStatus('ready')
    } catch (e) {
      setError(hubErrText(e))
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const byId = useMemo(() => new Map(all.map((p) => [p.id, p])), [all])
  const baseOrder = useMemo(() => all.filter((p) => !p.retired_at).map((p) => p.id), [all])
  const live = useMemo(() => order.map((id) => byId.get(id)).filter((p): p is HubPlace => !!p), [order, byId])
  const retired = useMemo(() => all.filter((p) => p.retired_at), [all])
  const orderChanged = order.join('\n') !== baseOrder.join('\n')

  const labelOf = (p: HubPlace) => edits[p.id]?.label ?? p.label
  const classOf = (p: HubPlace) => edits[p.id]?.class ?? p.class

  const setField = (id: string, field: keyof Edit, value: string) => {
    const p = byId.get(id)
    if (!p) return
    setEdits((prev) => {
      const next: Edit = { ...prev[id], [field]: value }
      const same = field === 'label' ? value.trim() === p.label : value === p.class
      if (same) delete next[field]
      const out = { ...prev }
      if (Object.keys(next).length) out[id] = next
      else delete out[id]
      return out
    })
  }

  const toggleRetire = (id: string) =>
    setRetire((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  const changes =
    Object.values(edits).reduce((n, e) => n + Object.keys(e).length, 0) + retire.length + (orderChanged ? 1 : 0)
  const blankIds = live.filter((p) => !retire.includes(p.id) && !labelOf(p).trim()).map((p) => p.id)

  const reset = () => {
    setEdits({})
    setRetire([])
    setOrder(baseOrder)
    setError(null)
  }

  // Replays the draft. Every op runs even if one fails; failures are listed
  // and the list reloads to show what actually landed.
  const save = async (): Promise<boolean> => {
    const hub = hubInstance()
    if (!hub || blankIds.length) return false
    setSaving(true)
    const fails: string[] = []
    for (const id of retire) {
      try {
        await hub.hub.retirePlace(id)
      } catch (e) {
        fails.push(`Retire ${byId.get(id)?.label ?? id}: ${hubErrText(e)}`)
      }
    }
    const keep = order.filter((id) => !retire.includes(id))
    for (const [i, id] of keep.entries()) {
      const p = byId.get(id)
      if (!p) continue
      const patch: { label?: string; class?: string; ord?: number } = {}
      const label = edits[id]?.label?.trim()
      if (label && label !== p.label) patch.label = label
      const cls = edits[id]?.class
      if (cls && cls !== p.class) patch.class = cls
      if (orderChanged && p.ord !== (i + 1) * 10) patch.ord = (i + 1) * 10
      if (!Object.keys(patch).length) continue
      try {
        await hub.hub.editPlace(id, patch)
      } catch (e) {
        fails.push(`${p.label}: ${hubErrText(e)}`)
      }
    }
    setEdits({})
    setRetire([])
    await load()
    await refreshPlaces()
    setError(fails.length ? `${fails.length} change${fails.length > 1 ? 's' : ''} failed — ${fails.join(' · ')}` : null)
    setSaving(false)
    return fails.length === 0
  }

  const add = async (label: string, cls: string): Promise<AddResult> => {
    const hub = hubInstance()
    if (!hub) throw new Error('Hub not connected')
    const r = await hub.hub.addPlace(label, cls)
    if (!r) throw new Error('No answer from akatsuki_place_add')
    // 'exists' may name a place another app added since we loaded.
    if (r.status === 'created' || !byId.has(r.id)) {
      await load(order)
      void refreshPlaces()
    }
    return r
  }

  return {
    status, error, saving, live, retired, roleLocs, retire, byId, changes, blankIds,
    labelOf, classOf, setField, setOrder, toggleRetire, reset, save, add, reload: load,
  }
}
