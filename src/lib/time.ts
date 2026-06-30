export type Daypart = {
  id: 'morning' | 'day' | 'evening' | 'night'
  emoji: string
  label: string
}

export function getDaypart(hour: number): Daypart {
  if (hour >= 5 && hour < 11)  return { id: 'morning', emoji: '🌅', label: 'morning' }
  if (hour >= 11 && hour < 17) return { id: 'day',     emoji: '☀️', label: 'afternoon' }
  if (hour >= 17 && hour < 21) return { id: 'evening', emoji: '🌆', label: 'evening' }
  return { id: 'night', emoji: '🌙', label: 'night' }
}

export function formatHour12(h: number): string {
  const hh = ((h + 11) % 12) + 1
  return `${hh}:00 ${h < 12 ? 'AM' : 'PM'}`
}
