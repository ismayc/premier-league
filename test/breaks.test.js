import { describe, expect, it } from 'vitest'
import {
  MIN_CLEAR_DAYS,
  breakAfter,
  breakAt,
  breakBefore,
  breaksBetween,
  findBreaks,
} from '../src/utils/breaks.js'
import { FIXTURES } from '../src/data/fixtures.js'

/**
 * Reading the international breaks off the fixture list.
 *
 * The risk here is not missing a break — a three-week hole is hard to miss —
 * but naming the wrong hole. A domestic cup weekend and the mid-season break
 * leave gaps of the same kind, differing only in length and in when they fall,
 * so most of what follows is about the holes that must NOT be called a break.
 */

const fx = (id, ko) => ({ id, ko, home: 'ARS', away: 'LIV' })

// A day's worth of kickoffs, at the hour a Saturday afternoon slate uses.
const day = (key, hour = 14) => fx(`${key}-${hour}`, `${key}T${String(hour).padStart(2, '0')}:00:00.000Z`)

const TZ = 'Europe/London'

describe('findBreaks', () => {
  it('names the hole a FIFA window leaves in the calendar', () => {
    const breaks = findBreaks([day('2026-09-19'), day('2026-10-10'), day('2026-10-17')], TZ)

    expect(breaks).toEqual([
      {
        id: 'break-2026-09-19',
        before: '2026-09-19',
        after: '2026-10-10',
        days: 20,
        resumeKo: '2026-10-10T14:00:00.000Z',
      },
    ])
  })

  it('carries the earliest kickoff of the day back, whatever order the list is in', () => {
    const [gap] = findBreaks(
      [day('2026-10-10', 17), day('2026-09-19'), day('2026-10-10', 12)],
      TZ
    )

    // The lunchtime kickoff, not the one that happened to come first in the list.
    expect(gap.resumeKo).toBe('2026-10-10T12:00:00.000Z')
  })

  it('leaves a cup weekend alone', () => {
    // Nine clear days in January: a third-round weekend, not a call-up.
    expect(findBreaks([day('2027-01-07'), day('2027-01-17')], TZ)).toEqual([])
  })

  it('leaves even a long January hole alone', () => {
    // Three weeks with no football, but in a month FIFA holds no men's window:
    // a winter break, and calling it an international one would be a guess.
    expect(findBreaks([day('2027-01-05'), day('2027-01-26')], TZ)).toEqual([])
  })

  it('treats the threshold as the boundary it is', () => {
    const from = new Date('2026-09-19T14:00:00.000Z')
    const back = (clear) =>
      new Date(from.getTime() + (clear + 1) * 24 * 60 * 60 * 1000).toISOString()

    expect(findBreaks([fx('a', from.toISOString()), fx('b', back(MIN_CLEAR_DAYS))], TZ)).toHaveLength(1)
    expect(findBreaks([fx('a', from.toISOString()), fx('b', back(MIN_CLEAR_DAYS - 1))], TZ)).toEqual([])
  })

  it('has nothing to say about an empty or one-match list', () => {
    expect(findBreaks([], TZ)).toEqual([])
    expect(findBreaks([day('2026-09-19')], TZ)).toEqual([])
  })

  it('draws the edges in the viewer’s own zone', () => {
    // A Friday-night kickoff that is still Friday in New York and already
    // Saturday in Paris: the league comes back a day later there, and the
    // break the viewer sat through is a day longer.
    const list = [day('2026-09-19'), fx('b', '2026-10-09T23:30:00.000Z')]

    expect(findBreaks(list, 'America/New_York')[0]).toMatchObject({
      after: '2026-10-09',
      days: 19,
    })
    expect(findBreaks(list, 'Europe/Paris')[0]).toMatchObject({ after: '2026-10-10', days: 20 })
  })

  it('finds this season’s three windows and nothing else', () => {
    const breaks = findBreaks(FIXTURES, TZ)

    // September/October, November and March — the men's windows. The season's
    // other long holes (a nine-day January, two ten-day stretches in February
    // and March) are domestic, and none of them is listed here.
    expect(breaks.map((b) => [b.before, b.after, b.days])).toEqual([
      ['2026-09-20', '2026-10-10', 19],
      ['2026-11-07', '2026-11-21', 13],
      ['2027-03-20', '2027-04-10', 20],
    ])
  })
})

/* The selectors each answer one question a view asks: what sits between these
 * two sections, where are we right now, and which edge is this match on. */

const BREAKS = findBreaks(FIXTURES, TZ)
const [SEP, NOV] = BREAKS

describe('breaksBetween', () => {
  it('returns the breaks that fall wholly between two day sections', () => {
    expect(breaksBetween(BREAKS, '2026-09-20', '2026-10-10')).toEqual([SEP])
  })

  it('returns every break in a long jump, for a list filtered down to one club', () => {
    expect(breaksBetween(BREAKS, '2026-09-20', '2026-11-21')).toEqual([SEP, NOV])
  })

  it('returns nothing for two days on the same side of a break', () => {
    expect(breaksBetween(BREAKS, '2026-10-10', '2026-10-17')).toEqual([])
    // The far edge is one day short of the day back, so the break is not crossed.
    expect(breaksBetween(BREAKS, '2026-09-20', '2026-10-09')).toEqual([])
  })
})

describe('breakAt', () => {
  it('reports the break a date falls inside', () => {
    expect(breakAt(BREAKS, '2026-09-29')).toBe(SEP)
  })

  it('reports nothing on the last day before or the first day back', () => {
    expect(breakAt(BREAKS, '2026-09-20')).toBeNull()
    expect(breakAt(BREAKS, '2026-10-10')).toBeNull()
  })

  it('reports nothing in a normal week', () => {
    expect(breakAt(BREAKS, '2026-10-14')).toBeNull()
  })
})

describe('breakAfter and breakBefore', () => {
  it('identify the two edges of a break by a single day', () => {
    expect(breakAfter(BREAKS, '2026-09-20')).toBe(SEP)
    expect(breakBefore(BREAKS, '2026-10-10')).toBe(SEP)
  })

  it('do not confuse one edge for the other', () => {
    expect(breakBefore(BREAKS, '2026-09-20')).toBeNull()
    expect(breakAfter(BREAKS, '2026-10-10')).toBeNull()
  })

  it('take a range, which is how a week asks the question', () => {
    // The week of the last matches before the September window.
    expect(breakAfter(BREAKS, '2026-09-14', '2026-09-20')).toBe(SEP)
    // The week the league comes back in.
    expect(breakBefore(BREAKS, '2026-10-05', '2026-10-11')).toBe(SEP)
    // A quiet week in between touches neither edge.
    expect(breakAfter(BREAKS, '2026-09-21', '2026-09-27')).toBeNull()
    expect(breakBefore(BREAKS, '2026-09-21', '2026-09-27')).toBeNull()
  })
})
