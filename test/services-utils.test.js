import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyLive, fetchLive } from '../src/services/espn.js'
import { buildCalendar } from '../src/utils/ics.js'
import { countdown, dayOf, detectZone, longDayOf, UK } from '../src/utils/time.js'
import { buildTable, relegationSafe, tableByAbbr } from '../src/utils/table.js'
import { allTimeRecord, leaderboard } from '../src/utils/stats.js'

/**
 * The feed adapter and the remaining edges of the pure helpers.
 *
 * fetchLive is the app's only impure boundary, and every one of its failure
 * paths is silent by design — which is exactly why they need tests: a
 * regression there would show up as "yesterday's scores" rather than an error.
 */

/* ── fetchLive ───────────────────────────────────────────────────────────── */

const NOW = new Date('2026-08-22T15:00:00.000Z')
// windowDates(NOW) — yesterday, today, tomorrow, in the feed's YYYYMMDD form.
const DATES = ['20260821', '20260822', '20260823']

const ok = (body) => Promise.resolve({ ok: true, json: () => Promise.resolve(body) })

const event = (id, status, competitors) => ({
  id,
  competitions: [{ status, competitors }],
})

const sides = (hg, ag) => [
  { homeAway: 'home', score: hg },
  { homeAway: 'away', score: ag },
]

/** Route each of the three window days to its own canned response. */
function routeFetch(byDate) {
  global.fetch = vi.fn((url) => {
    const date = new URL(url).searchParams.get('dates')
    const handler = byDate[date]
    if (!handler) return ok({ events: [] })
    return typeof handler === 'function' ? handler() : ok(handler)
  })
}

describe('fetchLive', () => {
  it('queries a three-day window around now', async () => {
    routeFetch({})
    await fetchLive({ now: NOW })

    const asked = global.fetch.mock.calls.map(([url]) => new URL(url).searchParams.get('dates'))
    expect(asked).toEqual(DATES)
  })

  it('reads an in-progress match as live, with its score and clock', async () => {
    routeFetch({
      20260822: {
        events: [
          event(
            '401',
            { type: { state: 'in', shortDetail: "63'" }, displayClock: "63'" },
            sides('2', '1')
          ),
        ],
      },
    })

    const map = await fetchLive({ now: NOW })
    expect(map.get('401')).toMatchObject({
      id: '401',
      live: true,
      final: false,
      score: [2, 1],
      clock: "63'",
      status: "63'",
    })
  })

  it('reads a completed match as final', async () => {
    routeFetch({
      20260821: {
        events: [
          event('402', { type: { state: 'post', completed: true, description: 'Full Time' } }, sides('0', '3')),
        ],
      },
    })

    const map = await fetchLive({ now: NOW })
    expect(map.get('402')).toMatchObject({ live: false, final: true, score: [0, 3] })
    // No shortDetail, so the description is the fallback status.
    expect(map.get('402').status).toBe('Full Time')
    expect(map.get('402').unplayed).toBeUndefined()
  })

  it('marks a stopped-but-incomplete match unplayed rather than scoring it', async () => {
    // ESPN reports an abandoned or postponed fixture as `post` with
    // completed:false. Treating that as a final would publish a fake 0-0.
    routeFetch({
      20260822: {
        events: [
          event('403', { type: { state: 'post', completed: false, description: 'Postponed' } }, sides('0', '0')),
        ],
      },
    })

    const map = await fetchLive({ now: NOW })
    expect(map.get('403')).toMatchObject({ final: false, unplayed: 'Postponed' })
    expect(map.get('403').score).toBeUndefined()
  })

  it('leaves a scheduled match without a score', async () => {
    routeFetch({
      20260823: { events: [event('404', { type: { state: 'pre', shortDetail: '3:00 PM' } }, sides('0', '0'))] },
    })

    const map = await fetchLive({ now: NOW })
    expect(map.get('404')).toMatchObject({ live: false, final: false, status: '3:00 PM' })
    expect(map.get('404').score).toBeUndefined()
  })

  it('picks up broadcasters for an imminent match, de-duplicated', async () => {
    // Assignments land only a few weeks out, so the committed fixtures carry
    // none; the live poll surfaces them without waiting for a data refresh.
    const withTv = {
      ...event('406', { type: { state: 'pre', shortDetail: '3:00 PM' } }, sides('0', '0')),
    }
    withTv.competitions[0].broadcasts = [
      { market: 'national', names: ['Sky Sports', 'NBC'] },
      { market: 'national', names: ['NBC'] },
    ]
    routeFetch({ 20260823: { events: [withTv] } })

    const map = await fetchLive({ now: NOW })
    expect(map.get('406').tv).toEqual(['Sky Sports', 'NBC'])
  })

  it('adds no tv field when a match has no broadcasters listed', async () => {
    routeFetch({
      20260823: { events: [event('407', { type: { state: 'pre', shortDetail: '3:00 PM' } }, sides('0', '0'))] },
    })
    expect((await fetchLive({ now: NOW })).get('407').tv).toBeUndefined()
  })

  it('ignores a broadcast entry that carries no names', async () => {
    const ev = event('408', { type: { state: 'pre', shortDetail: '3:00 PM' } }, sides('0', '0'))
    ev.competitions[0].broadcasts = [{ market: 'national' }]
    routeFetch({ 20260823: { events: [ev] } })
    expect((await fetchLive({ now: NOW })).get('408').tv).toBeUndefined()
  })

  it('tolerates a status block the feed omitted entirely', async () => {
    routeFetch({ 20260822: { events: [event('405', undefined, sides('1', '1'))] } })

    const map = await fetchLive({ now: NOW })
    expect(map.get('405')).toMatchObject({ id: '405', live: false, final: false })
    expect(map.get('405').status).toBeUndefined()
  })

  it('skips events with no competition and events missing a side', async () => {
    routeFetch({
      20260822: {
        events: [
          { id: 'no-comp' },
          { id: 'empty-comp', competitions: [] },
          event('no-competitors', { type: { state: 'pre' } }, undefined),
          event('home-only', { type: { state: 'pre' } }, [{ homeAway: 'home', score: '1' }]),
          event('away-only', { type: { state: 'pre' } }, [{ homeAway: 'away', score: '1' }]),
        ],
      },
    })

    const map = await fetchLive({ now: NOW })
    expect(map.size).toBe(0)
  })

  it('keeps the other days when one day rejects or answers badly', async () => {
    routeFetch({
      20260821: () => Promise.reject(new Error('network down')),
      20260822: () => Promise.resolve({ ok: false, status: 503, json: () => Promise.resolve({}) }),
      20260823: { events: [event('406', { type: { state: 'in' } }, sides('1', '0')) ] },
    })

    // allSettled, so a bad day is dropped rather than failing the whole poll.
    const map = await fetchLive({ now: NOW })
    expect([...map.keys()]).toEqual(['406'])
  })

  it('tolerates a payload with no events array at all', async () => {
    routeFetch({ 20260821: {}, 20260822: {}, 20260823: {} })
    await expect(fetchLive({ now: NOW })).resolves.toEqual(new Map())
  })

  it('forwards the abort signal to every request', async () => {
    routeFetch({})
    const ctrl = new AbortController()
    await fetchLive({ signal: ctrl.signal, now: NOW })

    expect(global.fetch).toHaveBeenCalledTimes(3)
    for (const [, init] of global.fetch.mock.calls) expect(init.signal).toBe(ctrl.signal)
  })

  it('defaults to the current date when called with no arguments', async () => {
    routeFetch({})
    await expect(fetchLive()).resolves.toBeInstanceOf(Map)
    expect(global.fetch).toHaveBeenCalledTimes(3)
  })
})

describe('applyLive', () => {
  it('leaves fixtures the feed said nothing about untouched', () => {
    // The window covers three days; the other 377 fixtures must come back as
    // the same object references so React can skip re-rendering them.
    const fixtures = [
      { id: '1', home: 'ARS', away: 'CHE' },
      { id: '2', home: 'LIV', away: 'MNC' },
    ]
    const out = applyLive(fixtures, new Map([['2', { id: '2', live: true }]]))

    expect(out[0]).toBe(fixtures[0])
    expect(out[1]).not.toBe(fixtures[1])
    expect(out[1].live).toBe(true)
  })
})

/* ── ics: buildCalendar edges ────────────────────────────────────────────── */

describe('buildCalendar edges', () => {
  const base = {
    id: '1',
    ko: '2026-08-21T19:00:00.000Z',
    home: 'ARS',
    away: 'CHE',
    venue: 'Emirates Stadium',
    city: 'London',
  }

  const lineFor = (ics, prefix) =>
    ics.split('\r\n').findIndex((l) => l.startsWith(prefix))

  it('escapes commas and semicolons, which otherwise split a property', () => {
    const ics = buildCalendar([{ ...base, venue: 'The Ground; Stand A, Block B' }])
    expect(ics).toContain('LOCATION:The Ground\\; Stand A\\, Block B\\, London')
  })

  it('escapes the calendar name too', () => {
    expect(buildCalendar([], { name: 'Arsenal, home' })).toContain('X-WR-CALNAME:Arsenal\\, home')
  })

  it('falls back to the abbreviation for a club it does not know', () => {
    const ics = buildCalendar([{ ...base, home: 'ZZZ', away: 'YYY' }])
    expect(ics).toContain('SUMMARY:ZZZ v YYY')
  })

  it('omits a missing venue or city instead of writing a stray comma', () => {
    expect(buildCalendar([{ ...base, city: undefined }])).toContain('LOCATION:Emirates Stadium')
    expect(buildCalendar([{ ...base, venue: undefined, city: undefined }])).toContain('LOCATION:')
  })

  it('describes a fixture with no broadcaster generically', () => {
    expect(buildCalendar([{ ...base, tv: [] }])).toContain('DESCRIPTION:Premier League')
    expect(buildCalendar([base])).toContain('DESCRIPTION:Premier League')
  })

  it('folds a long line into 75- then 74-octet continuations', () => {
    // Calendar apps reject unfolded lines, so a long TV list must wrap. The
    // continuation marker is a leading space on each subsequent line.
    const tv = Array.from({ length: 12 }, (_, i) => `Broadcaster Number ${i}`)
    const ics = buildCalendar([{ ...base, tv }])
    const lines = ics.split('\r\n')
    const at = lineFor(ics, 'DESCRIPTION:')

    expect(lines[at]).toHaveLength(75)
    expect(lines[at + 1]).toMatch(/^ /)
    expect(lines[at + 1]).toHaveLength(75) // a space plus 74 octets
    // Unfolding must reproduce the original value exactly.
    let folded = lines[at]
    let i = at + 1
    while (lines[i]?.startsWith(' ')) folded += lines[i++].slice(1)
    expect(folded).toBe(`DESCRIPTION:TV: ${tv.join('\\, ')}`)
  })

  it('leaves a line of exactly the limit alone', () => {
    // 75 octets is legal unfolded; folding it would be a wasted continuation.
    const pad = 'x'.repeat(75 - 'LOCATION:'.length)
    const ics = buildCalendar([{ ...base, venue: pad, city: undefined }])
    expect(ics.split('\r\n')).toContain(`LOCATION:${pad}`)
  })

  it('produces a calendar with no events for an empty fixture list', () => {
    const ics = buildCalendar([])
    expect(ics).not.toContain('BEGIN:VEVENT')
    expect(ics.split('\r\n').at(-1)).toBe('END:VCALENDAR')
  })
})

/* ── time: remaining edges ───────────────────────────────────────────────── */

describe('time edges', () => {
  const ko = '2026-08-21T19:00:00.000Z'

  afterEach(() => vi.restoreAllMocks())

  it('formats short and long day labels in the viewer zone', () => {
    expect(dayOf(ko, UK)).toBe('Fri 21 Aug')
    // Sydney is already into the next day at a Friday-evening UK kickoff.
    expect(dayOf(ko, 'Australia/Sydney')).toBe('Sat 22 Aug')
    expect(longDayOf(ko, UK)).toBe('Friday, 21 August 2026')
  })

  it('counts down in days and hours, then hours and minutes, then minutes', () => {
    expect(countdown(ko, new Date('2026-08-19T16:30:00.000Z'))).toBe('2d 2h')
    expect(countdown(ko, new Date('2026-08-21T16:15:00.000Z'))).toBe('2h 45m')
    expect(countdown(ko, new Date('2026-08-21T18:23:00.000Z'))).toBe('37m')
  })

  it('detects the platform zone', () => {
    vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({
      timeZone: 'Pacific/Chatham',
    })
    expect(detectZone()).toBe('Pacific/Chatham')
  })

  it('falls back to UK when the platform reports no zone or throws', () => {
    // A locked-down or ancient engine: the app must still pick a zone rather
    // than render every kickoff as "Invalid Date".
    const spy = vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions')
    spy.mockReturnValue({ timeZone: '' })
    expect(detectZone()).toBe(UK)

    spy.mockImplementation(() => {
      throw new Error('no Intl')
    })
    expect(detectZone()).toBe(UK)
  })
})

/* ── table + stats: remaining edges ──────────────────────────────────────── */

describe('table edges', () => {
  const match = (home, away, hg, ag, ko = '2026-08-21T19:00:00.000Z') => ({
    id: `${home}-${away}-${ko}`,
    ko,
    home,
    away,
    score: [hg, ag],
  })

  it('adds a club that appears only in a fixture, not in the club list', () => {
    // The historical ETL runs this over seasons whose club list it does not
    // know up front, so an unlisted club must create its own row.
    const table = buildTable([match('ARS', 'WBA', 1, 0)], ['ARS'])
    expect(table.map((r) => r.abbr).sort()).toEqual(['ARS', 'WBA'])
    expect(table.find((r) => r.abbr === 'WBA').lost).toBe(1)
  })

  it('records a draw and an away win in both clubs’ form', () => {
    const table = buildTable(
      [
        match('ARS', 'CHE', 1, 1, '2026-08-21T19:00:00.000Z'),
        match('ARS', 'LIV', 0, 2, '2026-08-28T19:00:00.000Z'),
      ],
      ['ARS', 'CHE', 'LIV']
    )
    const row = (a) => table.find((r) => r.abbr === a)

    expect(row('ARS').form).toEqual(['D', 'L'])
    expect(row('CHE').form).toEqual(['D'])
    expect(row('LIV').form).toEqual(['W'])
  })

  it('declares nobody safe in a league with no survivors', () => {
    const table = buildTable([], ['ARS', 'CHE', 'LIV'])
    expect(relegationSafe(table, 38, 3)).toEqual(new Set())
  })

  it('indexes a table by club abbreviation', () => {
    const table = buildTable([match('ARS', 'CHE', 2, 0)], ['ARS', 'CHE'])
    const by = tableByAbbr(table)
    expect(by.ARS.points).toBe(3)
    expect(by.CHE.points).toBe(0)
  })
})

describe('stats edges', () => {
  it('reports zero points per game for a club that played nothing', () => {
    const history = [
      { year: 2000, label: '2000-01', teams: 20, table: [{ team: 'Ghost', pos: 20, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, points: 0 }] },
    ]
    expect(allTimeRecord(history)[0].ppg).toBe(0)
  })

  it('separates clubs level on all-time points by goal difference', () => {
    const row = (team, gf, ga) => ({ team, pos: 1, played: 38, won: 30, drawn: 0, lost: 8, gf, ga, points: 90 })
    const history = [{ year: 2000, label: '2000-01', teams: 20, table: [row('Low', 80, 40), row('High', 90, 30)] }]

    expect(allTimeRecord(history).map((c) => c.team)).toEqual(['High', 'Low'])
  })

  it('returns everyone when the limit exceeds the number of entries', () => {
    const rows = [{ value: 3 }, { value: 1 }]
    expect(leaderboard(rows, { limit: 10 })).toHaveLength(2)
  })
})
