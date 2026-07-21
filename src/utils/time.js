/**
 * Kickoffs are stored as UTC instants and rendered in whichever zone the
 * viewer picked. Everything here goes through Intl rather than a date library
 * — the app needs zone conversion and locale-aware formatting, both of which
 * the platform already does correctly.
 *
 * Premier League kickoffs are published in UK time, which is the one thing a
 * naive "3pm Saturday" string gets wrong for anyone outside Britain twice a
 * year when the clocks shift. Storing the instant sidesteps that entirely.
 *
 * The shared implementation lives in timeCore.js (copied from
 * sports-viewer-meta); this file declares the league facts ONCE — en-GB,
 * Monday-start — instead of hardcoding them per call site, and keeps this
 * app's public API stable on top.
 */
import { createTimeUtils } from './timeCore.js'

export const UK = 'Europe/London'

// The league facts — matches adapters/epl.js in sports-viewer-meta. en-GB
// renders 24-hour with the leading zero ("09:05"); the football week starts
// Monday.
const T = createTimeUtils({ locale: 'en-GB', weekStart: 1 })

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

export const timeOf = T.formatTime

/** The short zone name for an instant — "BST", "MST", "GMT+2" — for the card. */
export function zoneAbbr(iso, tz) {
  try {
    const parts = new Intl.DateTimeFormat(T.locale, {
      timeZone: tz,
      timeZoneName: 'short',
      hour: '2-digit',
    }).formatToParts(new Date(iso))
    // The one try/catch covers both an invalid zone and — should a platform
    // ever omit the part — the missing-part case, which then throws on .value.
    return parts.find((p) => p.type === 'timeZoneName').value
  } catch {
    return ''
  }
}

export const dayOf = T.formatDate

export const longDayOf = (iso, tz) =>
  T.formatDate(iso, tz, { weekday: 'long', month: 'long', year: 'numeric' })

/** A stable YYYY-MM-DD key *in the viewer's zone*, for grouping by matchday. */
export const dateKey = T.dayKey

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
export const startOfWeek = T.startOfWeek

export const countdown = T.countdown

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
