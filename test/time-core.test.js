import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createTimeUtils,
  detectTimezone,
  TIMEZONES,
  timezoneOptions,
  formatTime,
  formatDate,
  formatZoneAbbr,
  dayKey,
  todayKey,
  dayLabel,
  startOfWeek,
  liveState,
  countdown,
} from '../src/utils/timeCore.js'

/**
 * The vendored shared time core (from sports-viewer-meta). This file is the
 * reference suite for the factory itself; utils/time.js instantiates it with
 * the league facts (en-GB, Monday) and is covered by the existing tests.
 *
 * Two instants carry most of the file: a 19:00 UK Saturday kickoff (14:00 in
 * New York) and a 09:05 UK morning — the one that catches the hour-width bug
 * (a 24-hour locale must keep the leading zero; 12-hour must drop it).
 */

const KO = '2026-08-15T18:00:00Z' // Sat 19:00 UK / 14:00 New York
const NINE = '2026-08-15T08:05:00Z' // Sat 09:05 UK

const us = createTimeUtils() // defaults: en-US, Sunday, 2.25h game
const uk = createTimeUtils({ locale: 'en-GB', weekStart: 1 })

afterEach(() => vi.restoreAllMocks())

describe('locale-driven formatting', () => {
  it('renders the hour cycle and width the locale expects', () => {
    expect(us.formatTime(KO, 'America/New_York')).toBe('2:00 PM')
    expect(uk.formatTime(KO, 'Europe/London')).toBe('19:00')
    // Leading zero: kept in 24-hour locales, dropped in 12-hour ones.
    expect(uk.formatTime(NINE, 'Europe/London')).toBe('09:05')
    expect(us.formatTime(NINE, 'Europe/London')).toBe('9:05 AM')
  })

  it('formats dates with defaults and with overrides', () => {
    expect(us.formatDate(KO, 'America/New_York')).toBe('Sat, Aug 15')
    expect(uk.formatDate(KO, 'Europe/London')).toBe('Sat 15 Aug')
    expect(uk.formatDate(KO, 'Europe/London', { weekday: 'long', month: 'long', year: 'numeric' })).toBe(
      'Saturday, 15 August 2026'
    )
  })

  it('reports the short zone name for the instant', () => {
    expect(us.formatZoneAbbr(KO, 'America/New_York')).toBe('EDT')
    // BST in August — the reason instants are stored instead of "3pm Saturday".
    expect(uk.formatZoneAbbr(KO, 'Europe/London')).toBe('BST')
  })

  it('falls back to an empty zone name if the part is ever missing', () => {
    const spy = vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => ({
      formatToParts: () => [],
    }))
    expect(us.formatZoneAbbr(KO, 'America/New_York')).toBe('')
    spy.mockRestore()
  })
})

describe('day bucketing', () => {
  it('keys a game by the calendar day in the viewer zone', () => {
    // 19:00 UK is still the 15th in New York; a late US tip crosses in the other direction.
    expect(us.dayKey(KO, 'America/New_York')).toBe('2026-08-15')
    expect(us.dayKey('2026-08-16T02:30:00Z', 'America/New_York')).toBe('2026-08-15')
    expect(us.dayKey('2026-08-16T02:30:00Z', 'Europe/London')).toBe('2026-08-16')
  })

  it('todayKey is dayKey of now', () => {
    const now = new Date('2026-08-15T12:00:00Z')
    expect(us.todayKey('Europe/London', now)).toBe('2026-08-15')
    expect(us.todayKey('Pacific/Auckland', now)).toBe('2026-08-16')
  })

  it('labels today, tomorrow, yesterday, and everything else', () => {
    const now = new Date('2026-08-15T12:00:00Z')
    expect(us.dayLabel('2026-08-15', 'Europe/London', now)).toBe('Today')
    expect(us.dayLabel('2026-08-16', 'Europe/London', now)).toBe('Tomorrow')
    expect(us.dayLabel('2026-08-14', 'Europe/London', now)).toBe('Yesterday')
    expect(us.dayLabel('2026-08-22', 'Europe/London', now)).toBe('Saturday, August 22')
    expect(uk.dayLabel('2026-08-22', 'Europe/London', now)).toBe('Saturday 22 August')
  })
})

describe('week start comes from the adapter', () => {
  it('buckets a Saturday by Sunday-start and Monday-start weeks', () => {
    expect(us.startOfWeek(KO, 'America/New_York')).toBe('2026-08-09')
    expect(uk.startOfWeek(KO, 'Europe/London')).toBe('2026-08-10')
  })

  it('a Sunday opens a US week and closes a UK one', () => {
    const sun = '2026-08-16T15:00:00Z'
    expect(us.startOfWeek(sun, 'America/New_York')).toBe('2026-08-16')
    expect(uk.startOfWeek(sun, 'Europe/London')).toBe('2026-08-10')
  })
})

describe('liveState', () => {
  const t0 = new Date(KO).getTime()
  it('walks a game through its whole life', () => {
    expect(us.liveState({ tip: KO }, t0 - 1000)).toBe('upcoming')
    expect(us.liveState({ tip: KO, live: { period: 2 } }, t0)).toBe('live')
    expect(us.liveState({ tip: KO }, t0 + 60_000)).toBe('likely-live')
    expect(us.liveState({ tip: KO }, t0 + 3 * 60 * 60 * 1000)).toBe('past')
    expect(us.liveState({ tip: KO, score: [2, 1] }, t0 + 3 * 60 * 60 * 1000)).toBe('final')
  })

  it('voids postponed and canceled games regardless of time', () => {
    expect(us.liveState({ tip: KO, postponed: true }, t0)).toBe('void')
    expect(us.liveState({ tip: KO, canceled: true }, t0)).toBe('void')
  })

  it('respects the adapter game length for the likely-live window', () => {
    const short = createTimeUtils({ gameLengthMs: 60_000 })
    expect(short.liveState({ tip: KO }, t0 + 30_000)).toBe('likely-live')
    expect(short.liveState({ tip: KO }, t0 + 90_000)).toBe('past')
  })
})

describe('countdown', () => {
  const now = new Date(KO).getTime()
  it('steps down through days, hours, minutes, and ends at null', () => {
    expect(us.countdown('2026-08-17T20:00:00Z', now)).toBe('2d 2h')
    expect(us.countdown('2026-08-15T21:30:00Z', now)).toBe('3h 30m')
    expect(us.countdown('2026-08-15T18:45:00Z', now)).toBe('45m')
    expect(us.countdown(KO, now)).toBe(null)
  })
})

describe('timezone plumbing', () => {
  it('offers the known list, prepending an unusual current zone', () => {
    expect(us.timezoneOptions('America/Chicago')).toBe(TIMEZONES)
    const opts = us.timezoneOptions('Pacific/Chatham')
    expect(opts[0]).toEqual({ id: 'Pacific/Chatham', label: 'Chatham' })
    expect(opts).toHaveLength(TIMEZONES.length + 1)
  })

  it('an adapter can supply its own picker list', () => {
    const zones = [{ id: 'Europe/London', label: 'London' }]
    const t = createTimeUtils({ timezones: zones })
    expect(t.timezoneOptions('Europe/London')).toBe(zones)
  })

  it('detects the platform zone, with a fallback when Intl is unhelpful', () => {
    expect(detectTimezone()).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone)
    const spy = vi
      .spyOn(Intl, 'DateTimeFormat')
      .mockImplementation(() => ({ resolvedOptions: () => ({ timeZone: '' }) }))
    expect(detectTimezone()).toBe('America/New_York')
    spy.mockImplementation(() => {
      throw new Error('no Intl today')
    })
    expect(detectTimezone()).toBe('America/New_York')
    spy.mockRestore()
  })
})

describe('bare en-US exports (compatibility surface for older builds)', () => {
  it('are the default-instance functions', () => {
    expect(formatTime(KO, 'America/New_York')).toBe('2:00 PM')
    expect(formatDate(KO, 'America/New_York')).toBe('Sat, Aug 15')
    expect(formatZoneAbbr(KO, 'America/New_York')).toBe('EDT')
    expect(dayKey(KO, 'America/New_York')).toBe('2026-08-15')
    expect(todayKey('Europe/London', new Date(KO))).toBe('2026-08-15')
    expect(dayLabel('2026-08-15', 'Europe/London', new Date(KO))).toBe('Today')
    expect(startOfWeek(KO, 'America/New_York')).toBe('2026-08-09')
    expect(liveState({ tip: KO }, new Date(KO).getTime() - 1)).toBe('upcoming')
    expect(countdown('2026-08-15T18:45:00Z', new Date(KO).getTime())).toBe('45m')
    expect(timezoneOptions('America/Chicago')).toBe(TIMEZONES)
  })
})
