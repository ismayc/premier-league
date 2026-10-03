import { describe, it, expect } from 'vitest'
import { timeTbd, koDay, koTime, koCountdown, groupByDay, whenBucket } from '../src/utils/time.js'
import { buildCalendar } from '../src/utils/ics.js'

// A KICKOFF ESPN HAS NOT ANNOUNCED.
//
// `timeValid: false` and, in place of a time, midnight US Eastern on the day of the
// match. This league has them for weeks at a stretch while TV picks are made. Read as a
// real instant it prints a kickoff nobody announced, on the day before anywhere west of
// Eastern, and makes the match look played. See sports-viewer-meta/docs/LINEAGES.md §6.
const PHX = 'America/Phoenix' // UTC-7 all year: 04:00Z is 9pm the previous evening.
const UK = 'Europe/London'
const TBC = { id: 'tbc', ko: '2026-12-27T05:00:00.000Z', timeTbd: true, home: 'ARS', away: 'CHE' }
const REAL = { id: 'real', ko: '2026-12-27T15:00:00.000Z', home: 'LIV', away: 'MCI' }

describe('a kickoff with no announced time', () => {
  it('keeps the match on its own date, in a zone where the placeholder reads as the day before', () => {
    expect(koDay(TBC, PHX)).toBe('2026-12-27')
    expect(koDay({ ...TBC, timeTbd: false }, PHX)).toBe('2026-12-26') // the bug
  })

  it('says TBC instead of naming an hour, and counts down to nothing', () => {
    expect(timeTbd(TBC)).toBe(true)
    expect(koTime(TBC, PHX)).toBe('Time TBC')
    expect(koTime(TBC, UK)).toBe('Time TBC')
    expect(koCountdown(TBC, Date.parse('2026-12-26T12:00:00Z'))).toBeNull()
  })

  it('is grouped under its own day, not the evening before', () => {
    const days = groupByDay([TBC], PHX)
    expect(days.map((d) => d.key)).toEqual(['2026-12-27'])
  })

  it('is not treated as kicked off at midnight Eastern', () => {
    // Without the guard this reads 'live' from 05:00Z and 'final' two hours later —
    // for a match that may kick off at lunchtime UK.
    expect(whenBucket(TBC, Date.parse('2026-12-27T06:00:00Z'))).toBe('upcoming')
    expect(whenBucket(TBC, Date.parse('2026-12-27T12:00:00Z'))).toBe('upcoming')
    // A real score or live feed still outranks the guard.
    expect(whenBucket({ ...TBC, score: [2, 1] })).toBe('final')
    expect(whenBucket({ ...TBC, live: true })).toBe('live')
  })

  it('exports as an all-day calendar event', () => {
    const ics = buildCalendar([TBC], { name: 'PL' })
    expect(ics).toContain('DTSTART;VALUE=DATE:20261227')
    expect(ics).not.toContain('DTSTART:20261227T050000Z')
  })

  it('leaves an announced kickoff entirely alone', () => {
    expect(koTime(REAL, UK)).toBe('15:00')
    expect(koDay(REAL, PHX)).toBe('2026-12-27')
    expect(whenBucket(REAL, Date.parse('2026-12-27T15:30:00Z'))).toBe('live')
    expect(buildCalendar([REAL], { name: 'PL' })).toContain('DTSTART:20261227T150000Z')
  })
})
