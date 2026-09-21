// International breaks, read off the fixture list.
//
// The feed carries this competition and nothing else. There is no field saying
// the players are away with their countries, and ESPN publishes no calendar of
// FIFA windows next to the fixtures. What the fixture list DOES carry is the
// hole a window leaves — two empty weekends where the weekly rhythm should be —
// and that hole is the thing a viewer wants named, because otherwise the app
// simply skips a fortnight and says nothing about it.
//
// A gap between two match days is called an international break when both hold:
//
//   1. It is long. The league plays weekly, and a domestic cup weekend or the
//      mid-season break opens a hole of a week or a little more. A FIFA window
//      empties two weekends at once. In the 2026-27 list the domestic holes run
//      7, 8 and 9 clear days and the international ones 13, 19 and 20, so the
//      threshold below sits in open space between the two populations rather
//      than splitting either of them.
//
//   2. It falls in a window month. FIFA's men's windows are in September,
//      October, November, March and June; a January or February hole is a cup
//      round or the winter break, however long it runs. The gap's MIDPOINT is
//      what gets tested, so a hole that merely spills into a window month from
//      a neighbouring one does not qualify.
//
// Both conditions describe the shape of a league calendar rather than one
// season's dates, so a refreshed fixture list re-derives its own breaks with
// nothing to maintain by hand — the same bargain matchweek.js strikes.
//
// What the app never claims is which countries are playing, or when the window
// itself opens and closes: neither is in the data. The note says only what the
// fixture list can support — no league football for N days, back on this date.
import { dateKey } from './time.js'

// Clear days (days with no match at all) that a gap must reach. Ten is a real
// domestic figure in this very season; eleven is not.
export const MIN_CLEAR_DAYS = 11

// Months holding a FIFA men's international window, 0-based: March, June,
// September, October, November.
const WINDOW_MONTHS = new Set([2, 5, 8, 9, 10])

const DAY_MS = 24 * 60 * 60 * 1000
// Midday UTC, so the arithmetic below never lands on a DST seam.
const noon = (key) => new Date(`${key}T12:00:00.000Z`).getTime()

/**
 * The international breaks in a fixture list, in calendar order.
 *
 * Day keys are taken in the viewer's zone, the same way the fixture list groups
 * its sections, so a break's edges line up with the day headings on screen.
 *
 * Each entry is `{ id, before, after, days, resumeKo }`: the day key of the last
 * match before the break, of the first match back, how many clear days sit
 * between them, and the kickoff that ends it (for formatting that date).
 */
export function findBreaks(fixtures, tz) {
  // Day key -> the earliest kickoff on it, which is the instant a note formats
  // when it names the day the league comes back.
  const byDay = new Map()
  for (const f of fixtures) {
    const key = dateKey(f.ko, tz)
    const first = byDay.get(key)
    if (!first || f.ko < first) byDay.set(key, f.ko)
  }

  const keys = [...byDay.keys()].sort()
  const breaks = []
  for (let i = 1; i < keys.length; i++) {
    const before = keys[i - 1]
    const after = keys[i]
    const days = Math.round((noon(after) - noon(before)) / DAY_MS) - 1
    if (days < MIN_CLEAR_DAYS) continue
    if (!WINDOW_MONTHS.has(new Date((noon(before) + noon(after)) / 2).getUTCMonth())) continue
    breaks.push({ id: `break-${before}`, before, after, days, resumeKo: byDay.get(after) })
  }
  return breaks
}

/**
 * The breaks a rendered list crosses between two of its day sections. The list
 * may be filtered down to one club, so consecutive sections on screen are not
 * necessarily consecutive match days — hence a range test, and a list rather
 * than a single break (a club's next two fixtures can straddle two windows).
 */
export function breaksBetween(breaks, fromKey, toKey) {
  return breaks.filter((b) => b.before >= fromKey && b.after <= toKey)
}

/** The break a day falls inside — what "the league is away right now" means. */
export function breakAt(breaks, key) {
  return breaks.find((b) => key > b.before && key < b.after) ?? null
}

/** The break that begins once the matches in `fromKey`..`toKey` have been played. */
export function breakAfter(breaks, fromKey, toKey = fromKey) {
  return breaks.find((b) => b.before >= fromKey && b.before <= toKey) ?? null
}

/** The break that the matches in `fromKey`..`toKey` are the return from. */
export function breakBefore(breaks, fromKey, toKey = fromKey) {
  return breaks.find((b) => b.after >= fromKey && b.after <= toKey) ?? null
}
