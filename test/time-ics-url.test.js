import { describe, expect, it } from 'vitest'
import {
  countdown,
  dateKey,
  groupByDay,
  isValidZone,
  startOfWeek,
  timeOf,
  zoneAbbr,
} from '../src/utils/time.js'
import { buildCalendar } from '../src/utils/ics.js'
import { readState, writeState } from '../src/utils/urlState.js'
import { applyLive } from '../src/services/espn.js'

describe('time', () => {
  // 20:00 UK on a summer evening is 15:00 in New York and 04:00 the next day
  // in Sydney — the case a naive "kickoff string" gets wrong.
  const ko = '2026-08-21T19:00:00.000Z'

  it('renders the same instant in different zones', () => {
    expect(timeOf(ko, 'Europe/London')).toBe('20:00')
    expect(timeOf(ko, 'America/New_York')).toBe('15:00')
    expect(timeOf(ko, 'Australia/Sydney')).toBe('05:00')
  })

  it('keys a match to the local calendar day, which can differ by zone', () => {
    expect(dateKey(ko, 'Europe/London')).toBe('2026-08-21')
    expect(dateKey(ko, 'Australia/Sydney')).toBe('2026-08-22')
  })

  it('gives a short zone label for the card, and nothing for a bad zone', () => {
    // British Summer Time in August; the exact spelling is the platform's, so
    // this asserts a plausible short form rather than a fixed string.
    expect(zoneAbbr(ko, 'Europe/London')).toMatch(/BST|GMT/)
    expect(zoneAbbr(ko, 'America/New_York')).toMatch(/EDT|GMT|ET/)
    // An invalid zone must not throw — the card just shows no abbreviation.
    expect(zoneAbbr(ko, 'Mars/Olympus')).toBe('')
  })

  it('validates timezones against the platform rather than a list', () => {
    expect(isValidZone('Europe/London')).toBe(true)
    expect(isValidZone('Mars/Olympus')).toBe(false)
    expect(isValidZone('')).toBe(false)
    expect(isValidZone(null)).toBe(false)
  })

  it('groups fixtures into ordered days, each sorted by kickoff', () => {
    const days = groupByDay(
      [
        { id: '2', ko: '2026-08-22T14:00:00.000Z' },
        { id: '3', ko: '2026-08-22T11:30:00.000Z' },
        { id: '1', ko: '2026-08-21T19:00:00.000Z' },
      ],
      'Europe/London'
    )
    expect(days.map((d) => d.key)).toEqual(['2026-08-21', '2026-08-22'])
    expect(days[1].fixtures.map((f) => f.id)).toEqual(['3', '2'])
  })

  it('starts the week on Monday', () => {
    // 2026-08-21 is a Friday.
    expect(startOfWeek('2026-08-21T19:00:00.000Z', 'Europe/London')).toBe('2026-08-17')
    // A Monday is its own week start.
    expect(startOfWeek('2026-08-17T19:00:00.000Z', 'Europe/London')).toBe('2026-08-17')
  })

  it('counts down and returns null once the match has started', () => {
    const now = new Date('2026-08-21T17:00:00.000Z')
    expect(countdown(ko, now)).toBe('2h 0m')
    expect(countdown('2026-08-21T16:00:00.000Z', now)).toBe(null)
  })
})

describe('ics', () => {
  const fixtures = [
    {
      id: '401',
      ko: '2026-08-21T19:00:00.000Z',
      home: 'ARS',
      away: 'CHE',
      venue: 'Emirates Stadium',
      city: 'London',
      tv: ['Sky Sports'],
    },
  ]

  it('writes a valid calendar with UTC instants', () => {
    const ics = buildCalendar(fixtures)
    expect(ics).toContain('BEGIN:VCALENDAR')
    expect(ics).toContain('END:VCALENDAR')
    expect(ics).toContain('UID:401@premier-league-viewer')
    expect(ics).toContain('DTSTART:20260821T190000Z')
    // Two hours reserved for a 90-minute match plus the interval.
    expect(ics).toContain('DTEND:20260821T210000Z')
    expect(ics).toContain('Sky Sports')
  })

  it('uses CRLF line endings, as the spec requires', () => {
    expect(buildCalendar(fixtures).split('\r\n').length).toBeGreaterThan(5)
  })

  it('includes the score for a completed match', () => {
    const ics = buildCalendar([{ ...fixtures[0], score: [2, 1] }])
    expect(ics).toMatch(/SUMMARY:.*\(2-1\)/)
  })
})

describe('urlState', () => {
  it('reads defaults when the query string is empty', () => {
    const s = readState('')
    expect(s.view).toBe('fixtures')
    expect(s.team).toBe(null)
    expect(s.hide).toBe(false)
  })

  it('rejects an unknown view and an invalid timezone', () => {
    const s = readState('?view=bracket&tz=Mars/Olympus')
    expect(s.view).toBe('fixtures')
    expect(isValidZone(s.tz)).toBe(true)
  })

  it('round-trips the state it writes', () => {
    writeState({ view: 'table', tz: 'Europe/London', team: 'ARS', hide: true, season: 2015 }, 'UTC')
    const s = readState(window.location.search)
    expect(s).toMatchObject({ view: 'table', tz: 'Europe/London', team: 'ARS', hide: true, season: 2015 })
  })

  it('omits defaults so a first-time URL stays clean', () => {
    writeState({ view: 'fixtures', tz: 'UTC', team: null, hide: false, season: null }, 'UTC')
    expect(window.location.search).toBe('')
  })
})

describe('applyLive', () => {
  const fixtures = [{ id: '1', ko: '2026-08-21T19:00:00.000Z', home: 'ARS', away: 'CHE' }]

  it('returns the original list when there is nothing live', () => {
    expect(applyLive(fixtures, null)).toBe(fixtures)
    expect(applyLive(fixtures, new Map())).toBe(fixtures)
  })

  it('patches in a live score without dropping existing fields', () => {
    const live = new Map([['1', { id: '1', live: true, score: [1, 0], clock: "63'" }]])
    const [f] = applyLive(fixtures, live)
    expect(f).toMatchObject({ home: 'ARS', away: 'CHE', live: true, score: [1, 0], clock: "63'" })
  })

  it('never blanks a known field with a null from the feed', () => {
    const live = new Map([['1', { id: '1', score: null, clock: undefined, live: true }]])
    const [f] = applyLive(fixtures, live)
    expect(f.score).toBeUndefined()
    expect(f.live).toBe(true)
  })
})
