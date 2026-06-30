import { useEffect, useState } from 'react'

// Reactively tracks a CSS media query. Used to switch the filter UI between the
// desktop popover and the mobile bottom sheet (the sheet must be portaled out of
// the backdrop-filtered topbar, which isn't expressible in CSS alone).
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false,
  )

  useEffect(() => {
    const mql = window.matchMedia(query)
    const onChange = () => setMatches(mql.matches)
    onChange()
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])

  return matches
}
