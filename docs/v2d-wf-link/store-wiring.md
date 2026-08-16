# V2-D · Phase 2 — Roadmap store + header wiring (small inline edits)

## 1 · src/store/useStore.ts
Add to StoreState type:
    wfSyncing: boolean
    syncWeekly: () => Promise<void>

Add to the create() body:
    wfSyncing: false,
    syncWeekly: async () => {
      if (get().wfSyncing) return
      set({ wfSyncing: true })
      try {
        const { syncWeekly } = await import('../lib/wfLink.ts')
        await syncWeekly(get().tree)
        const tree = await sync.fetchTasks()   // re-pull merged truth
        set({ tree, wfSyncing: false })
      } catch (e) {
        set({ wfSyncing: false, error: errorMessage(e) })
      }
    },

Call it once after init loads: inside init(), after the initial set(),
    void get().syncWeekly()

## 2 · src/features/header/Header.tsx
Next to ThemeSwitcher add a refresh button:
    const wfSyncing = useStore((s) => s.wfSyncing)
    const syncWeekly = useStore((s) => s.syncWeekly)
    …
    <button type="button" className="rm-tab" disabled={wfSyncing}
      onClick={() => void syncWeekly()}
      title="Sync Weekly Focus">
      {wfSyncing ? '⟳ syncing…' : '⟳ weekly'}
    </button>

## 3 · seed.ts
If no 'weekly' project exists, add the catch-all:
    { id: 'weekly', label: 'Weekly', short: 'Wk', role: <pick tier>, hue: 260 }
(⚠ pick which tier owns imported weekly tasks — vetoable default: attackers)
