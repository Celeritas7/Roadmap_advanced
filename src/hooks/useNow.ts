import { useEffect } from 'react'
import { useStore } from '../store/useStore.ts'

const isDebugTime =
  import.meta.env.VITE_DEBUG_TIME === 'true' || import.meta.env.VITE_DEBUG_TIME === '1'

// Ticks the store's `now.hour` from the real wall clock once a minute.
// Skipped entirely when VITE_DEBUG_TIME is on — in that mode the simulated-
// hour slider owns the value.
export function useNow() {
  const setHour = useStore((s) => s.setHour)
  useEffect(() => {
    if (isDebugTime) return
    const tick = () => setHour(new Date().getHours())
    tick()
    const id = window.setInterval(tick, 60_000)
    return () => window.clearInterval(id)
  }, [setHour])
}
