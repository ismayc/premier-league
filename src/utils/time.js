/**
 * Kickoffs are stored as UTC instants and rendered in whichever zone the
 * viewer picked. Everything here goes through Intl rather than a date library
 * — the app needs zone conversion and locale-aware formatting, both of which
 * the platform already does correctly.
 *
 * Premier League kickoffs are published in UK time, which is the one thing a
 * naive "3pm Saturday" string gets wrong for anyone outside Britain twice a
 * year when the clocks shift. Storing the instant sidesteps that entirely.
 */

export const UK = 'Europe/London'

export function detectZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || UK
  } catch {
    return UK
  }
}

/** Validate against Intl rather than a hard-coded list, so any zone works. */
export function isValidZone(tz) {
  if (!tz) return false
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

const fmt = (tz, opts) => new Intl.DateTimeFormat('en-GB', { timeZone: tz, ...opts })

export const timeOf = (iso, tz) =>
  fmt(tz, { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso))

export const dayOf = (iso, tz) =>
  fmt(tz, { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(iso))

export const longDayOf = (iso, tz) =>
  fmt(tz, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso))

/** A stable YYYY-MM-DD key *in the viewer's zone*, for grouping by matchday. */
export function dateKey(iso, tz) {
  const parts = fmt(tz, { year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(
    new Date(iso)
  )
  const get = (t) => parts.find((p) => p.type === t)?.value
  return `${get('year')}-${get('month')}-${get('day')}`
}

/** Group fixtures into ordered day buckets in the viewer's zone. */
export function groupByDay(fixtures, tz) {
  const days = new Map()
  for (const f of fixtures) {
    const key = dateKey(f.ko, tz)
    if (!days.has(key)) days.set(key, { key, iso: f.ko, fixtures: [] })
    days.get(key).fixtures.push(f)
  }
  return [...days.values()]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((d) => ({ ...d, fixtures: d.fixtures.sort((a, b) => a.ko.localeCompare(b.ko)) }))
}

/** Monday-based week key — the Premier League week runs Sat through midweek. */
export function startOfWeek(iso, tz) {
  const key = dateKey(iso, tz)
  const d = new Date(`${key}T12:00:00Z`)
  const dow = (d.getUTCDay() + 6) % 7 // Monday = 0
  d.setUTCDate(d.getUTCDate() - dow)
  return d.toISOString().slice(0, 10)
}

export function countdown(iso, now = new Date()) {
  const ms = new Date(iso) - now
  if (ms <= 0) return null
  const mins = Math.floor(ms / 60000)
  const days = Math.floor(mins / 1440)
  const hours = Math.floor((mins % 1440) / 60)
  if (days) return `${days}d ${hours}h`
  if (hours) return `${hours}h ${mins % 60}m`
  return `${mins}m`
}

/** Zones offered in the picker, with the viewer's own prepended if unusual. */
export const COMMON_ZONES = [
  UK,
  'Europe/Dublin',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Lisbon',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Sao_Paulo',
  'Africa/Lagos',
  'Africa/Johannesburg',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
]
