import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import RecentMatches from '../src/components/RecentMatches.jsx'
import { clearAthleteCache, fetchRecentMatches } from '../src/services/athlete.js'

// The log is memoised for the lifetime of the page, which would otherwise leak
// one test's stubbed matches into the next.
afterEach(() => clearAthleteCache())

/**
 * A player's recent matches, read out of the `/overview` payload.
 *
 * ESPN's `/gamelog` endpoint — the one the basketball viewers in this family
 * use — answers 500 for soccer, and `/stats` and `/splits` are 404. The log is
 * inside `/overview` instead, which is why the shape below is the one tested.
 *
 * Two properties of that payload drive most of what follows:
 *
 *   1. The figures are a bare positional array described by a sibling `labels`
 *      list, and **goalkeepers are sent a different list** — saves, clean
 *      sheets and goals against instead of shots and offsides.
 *   2. The log is not league-only. Internationals and cup ties are in it, and
 *      through the close season they are usually all of it.
 *
 * Everything drives the real service through a stubbed `fetch` rather than
 * mocking it, so a change to the parsing is caught here.
 */

const respondWith = (body, ok = true) =>
  vi.fn(() => Promise.resolve({ ok, json: () => Promise.resolve(body) }))

const OUTFIELD = ['APP', 'G', 'A', 'SHOT', 'SOG', 'FC', 'FA', 'OF', 'YC', 'RC']
const KEEPER = ['APP', 'CS', 'SV', 'GA', 'G', 'A', 'FC', 'FA', 'YC', 'RC']

const LEAGUE = 'English Premier League'

/** One row of the positional stats array, in the feed's own label order. */
const statLine = (over = {}, labels = OUTFIELD) =>
  labels.map((l) => (l === 'APP' ? over.APP ?? 'Started' : String(over[l] ?? 0)))

/** A match's metadata, a league fixture unless told otherwise. */
const meta = (over = {}) => ({
  gameDate: over.date ?? '2026-05-24T14:00:00.000Z',
  atVs: over.atVs ?? 'vs',
  opponent: 'opponent' in over ? over.opponent : { abbreviation: 'BUR' },
  gameResult: over.result ?? 'W',
  // `in` rather than `??` so a test can assert on a field the feed omitted.
  score: 'score' in over ? over.score : '2-0',
  leagueName: 'leagueName' in over ? over.leagueName : LEAGUE,
  leagueAbbreviation: over.leagueAbbreviation ?? 'Premier League',
})

const overview = ({ events, meta: metas, labels = OUTFIELD } = {}) => ({
  gameLog: {
    displayName: 'Last 5 Matches',
    statistics: [{ labels, events }],
    events: metas,
  },
})

/** Two league matches, deliberately returned out of date order. */
const twoLeague = overview({
  events: [
    { eventId: 'a', stats: statLine({ G: 1, SHOT: 3 }) },
    { eventId: 'b', stats: statLine({ A: 2, YC: 1 }) },
  ],
  meta: {
    a: meta({ date: '2026-05-02T14:00:00.000Z', opponent: { abbreviation: 'AUT' } }),
    b: meta({ date: '2026-05-19T14:00:00.000Z', atVs: '@', opponent: { abbreviation: 'ARG' }, result: 'L', score: '0-1' }),
  },
})

/** A World Cup run on top of one league match — the close-season shape. */
const mixed = overview({
  events: [
    { eventId: 'wc', stats: statLine({ G: 2 }) },
    { eventId: 'pl', stats: statLine({ A: 1 }) },
  ],
  meta: {
    wc: meta({
      date: '2026-07-19T19:00:00.000Z',
      opponent: { abbreviation: 'ARG' },
      leagueName: 'FIFA World Cup',
      leagueAbbreviation: 'FIFA World Cup',
    }),
    pl: meta({ date: '2026-05-24T14:00:00.000Z' }),
  },
})

const show = () => render(<RecentMatches playerId="10" />)

/** Render and wait for the rows the stub will produce. */
const showRows = () => {
  show()
  return screen.findAllByRole('listitem')
}

describe('fetchRecentMatches', () => {
  it('returns nothing for a player with no id, without calling the feed', async () => {
    global.fetch = vi.fn()
    expect(await fetchRecentMatches(undefined)).toEqual([])
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('reads the log from /overview, newest first', async () => {
    global.fetch = respondWith(twoLeague)
    const log = await fetchRecentMatches('10')

    expect(global.fetch.mock.calls[0][0]).toMatch(/\/athletes\/10\/overview$/)
    // Returned out of order by the feed; the newest match must lead.
    expect(log.map((m) => m.id)).toEqual(['b', 'a'])
    expect(log[0]).toMatchObject({
      date: '2026-05-19T14:00:00.000Z',
      atVs: '@',
      opponent: 'ARG',
      result: 'L',
      score: '0-1',
      competition: 'Premier League',
      isLeague: true,
      appearance: 'Started',
    })
  })

  it('marks matches from other competitions as outside the league', async () => {
    global.fetch = respondWith(mixed)
    const log = await fetchRecentMatches('10')
    expect(log.map((m) => [m.competition, m.isLeague])).toEqual([
      ['FIFA World Cup', false],
      ['Premier League', true],
    ])
  })

  it('reads the score from the player’s side, not the winner’s', async () => {
    // The feed writes `score` winner-first. These are Danny Welbeck's real
    // May 2026 results: Brighton (331) lost 0-3 at home to Man United and 0-1
    // away at Leeds, and both arrive from ESPN as "3-0" and "1-0". Printed
    // beside the "L" that reads as though Brighton scored three.
    global.fetch = respondWith(
      overview({
        events: [
          { eventId: 'home', stats: statLine() },
          { eventId: 'away', stats: statLine() },
        ],
        meta: {
          home: {
            gameDate: '2026-05-24T14:00:00.000Z',
            leagueName: LEAGUE,
            gameResult: 'L',
            score: '3-0',
            team: { id: '331' },
            homeTeamId: '331',
            homeTeamScore: 0,
            awayTeamId: '360',
            awayTeamScore: 3,
          },
          away: {
            gameDate: '2026-05-17T14:00:00.000Z',
            leagueName: LEAGUE,
            gameResult: 'L',
            score: '1-0',
            team: { id: '331' },
            homeTeamId: '357',
            homeTeamScore: 1,
            awayTeamId: '331',
            awayTeamScore: 0,
          },
        },
      })
    )
    const log = await fetchRecentMatches('10')
    expect(log.map((m) => m.score)).toEqual(['0-3', '0-1'])
  })

  it('keeps the feed’s score when a match has no team scores to rebuild from', async () => {
    global.fetch = respondWith(
      overview({
        events: [{ eventId: 'a', stats: statLine() }],
        meta: { a: meta({ score: '2-0' }) },
      })
    )
    const [m] = await fetchRecentMatches('10')
    expect(m.score).toBe('2-0')
  })

  it('resolves the figures by label rather than by position', async () => {
    // The same numbers under a reordered header must follow their labels. A
    // hardcoded index would report the goals as assists here.
    global.fetch = respondWith(
      overview({
        labels: ['APP', 'A', 'G'],
        events: [{ eventId: 'a', stats: ['Started', '4', '1'] }],
        meta: { a: meta() },
      })
    )
    const [m] = await fetchRecentMatches('10')
    expect(m.stats).toMatchObject({ A: '4', G: '1' })
  })

  it('keeps a goalkeeper’s columns, which are not the outfield ones', async () => {
    // The feed sends keepers CS/SV/GA in place of SHOT/SOG/OF. Reading the
    // outfield set for them is not an error it reports — it just goes blank.
    global.fetch = respondWith(
      overview({
        labels: KEEPER,
        events: [{ eventId: 'a', stats: statLine({ SV: 5, GA: 3 }, KEEPER) }],
        meta: { a: meta() },
      })
    )
    const [m] = await fetchRecentMatches('10')
    expect(m.stats).toMatchObject({ SV: '5', GA: '3', CS: '0' })
    expect(m.stats.SHOT).toBeUndefined()
  })

  it('carries only the columns the feed actually sent', async () => {
    global.fetch = respondWith(
      overview({
        labels: ['APP', 'G'],
        events: [{ eventId: 'a', stats: ['Started', '2'] }],
        meta: { a: meta() },
      })
    )
    const [m] = await fetchRecentMatches('10')
    expect(m.stats).toEqual({ APP: 'Started', G: '2' })
  })

  it('survives an event with no stats array at all', async () => {
    global.fetch = respondWith(
      overview({ events: [{ eventId: 'a' }], meta: { a: meta() } })
    )
    const [m] = await fetchRecentMatches('10')
    expect(m.appearance).toBeNull()
    expect(m.stats.G).toBeNull()
  })

  it('falls back to the full club name, and to the long competition name', async () => {
    global.fetch = respondWith(
      overview({
        events: [{ eventId: 'a', stats: statLine() }],
        meta: {
          a: {
            gameDate: '2026-05-24T14:00:00.000Z',
            opponent: { displayName: 'Nottingham Forest' },
            leagueName: LEAGUE,
          },
        },
      })
    )
    const [m] = await fetchRecentMatches('10')
    expect(m.opponent).toBe('Nottingham Forest')
    // No abbreviation on the competition either, so the long name stands in.
    expect(m.competition).toBe(LEAGUE)
    expect(m.isLeague).toBe(true)
  })

  it('drops an undated match, and one it has no metadata for', async () => {
    // The stats block and the event map are separate; an id present in one and
    // missing from the other is the feed's business, not a crash.
    global.fetch = respondWith(
      overview({
        events: [
          { eventId: 'a', stats: statLine() },
          { eventId: 'b', stats: statLine() },
          { eventId: 'orphan', stats: statLine() },
        ],
        meta: { a: meta(), b: { opponent: { abbreviation: 'X' } } },
      })
    )
    expect((await fetchRecentMatches('10')).map((m) => m.id)).toEqual(['a'])
  })

  it('returns every match it was given, leaving the trimming to the caller', async () => {
    // Trimming here would cut league matches out of a log that opens with a
    // run of internationals, before anything could filter them.
    const days = ['01', '02', '03', '04', '05', '06', '07']
    global.fetch = respondWith(
      overview({
        events: days.map((d) => ({ eventId: d, stats: statLine() })),
        meta: Object.fromEntries(days.map((d) => [d, meta({ date: `2026-05-${d}T14:00:00.000Z` })])),
      })
    )
    expect(await fetchRecentMatches('10')).toHaveLength(7)
  })

  it('returns nothing when the payload carries no log', async () => {
    global.fetch = respondWith({ statistics: {}, news: [] })
    expect(await fetchRecentMatches('10')).toEqual([])
  })

  it('returns nothing when the log block has no events', async () => {
    global.fetch = respondWith({ gameLog: { statistics: [{ labels: OUTFIELD }], events: {} } })
    expect(await fetchRecentMatches('10')).toEqual([])
  })

  it('yields nothing from a log block with no header and no match metadata', async () => {
    // Both halves of the block are optional in the payload; without the labels
    // there is no way to read the figures, and without the event map there are
    // no dates, so every row falls away rather than rendering as blanks.
    global.fetch = respondWith({
      gameLog: { statistics: [{ events: [{ eventId: 'a', stats: ['1'] }] }] },
    })
    expect(await fetchRecentMatches('10')).toEqual([])
  })

  it('returns nothing on a failed response, and does not ask twice', async () => {
    global.fetch = respondWith({}, false)
    expect(await fetchRecentMatches('404')).toEqual([])
    expect(await fetchRecentMatches('404')).toEqual([])
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it('returns nothing when the request itself fails', async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error('offline')))
    expect(await fetchRecentMatches('10')).toEqual([])
  })

  it('serves a repeat request from cache', async () => {
    global.fetch = respondWith(twoLeague)
    const first = await fetchRecentMatches('10')
    expect(await fetchRecentMatches('10')).toBe(first)
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it('is not spoiled by a caller that stops caring', async () => {
    // Same shared-cache hazard as the biography: no consumer may cancel it.
    global.fetch = respondWith(twoLeague)
    const abandoned = fetchRecentMatches('10')
    const wanted = fetchRecentMatches('10')

    expect(await abandoned).toBe(await wanted)
    expect(global.fetch.mock.calls[0]).toHaveLength(1)
  })
})

describe('<RecentMatches>', () => {
  it('shows nothing at all when the player has no recent matches', async () => {
    global.fetch = respondWith({ gameLog: null })
    const { container } = show()
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    expect(container.querySelector('.recent')).toBeNull()
  })

  it('lists the league matches with opponent, result and figures', async () => {
    global.fetch = respondWith(twoLeague)
    show()

    await screen.findByText(/Recent league matches/)
    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(2)

    // Newest first, and the date is the match day rather than a weekday.
    expect(rows[0]).toHaveTextContent('19 May')
    expect(rows[0]).toHaveTextContent('@')
    expect(rows[0]).toHaveTextContent('ARG')
    expect(rows[0]).toHaveTextContent('L')
    expect(rows[0]).toHaveTextContent('0-1')
    expect(rows[0]).toHaveTextContent('2 assists')
    expect(rows[1]).toHaveTextContent('1 goal')
    expect(rows[1]).toHaveTextContent('3 shots')
  })

  it('names no competition while the list is league-only', async () => {
    // Every row would say "Premier League"; the heading says it once instead.
    global.fetch = respondWith(twoLeague)
    const [row] = await showRows()
    expect(row.querySelector('.rm-comp')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('leaves other competitions out, behind a button that says how many', async () => {
    global.fetch = respondWith(mixed)
    show()

    const rows = await screen.findAllByRole('listitem')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toHaveTextContent('1 assist')
    expect(screen.queryByText('2 goals')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'All competitions (1 more)' }))

    expect(screen.getByText(/^Recent matches/)).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByText('2 goals')).toBeInTheDocument()
    // Now that the list is mixed, each row says where it came from.
    expect(screen.getByText('FIFA World Cup')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Premier League only' }))
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
  })

  it('says so when the recent matches were all internationals', async () => {
    // The close-season case: the season is over and the player went to a
    // tournament, so the league-only list is empty and needs to explain itself
    // rather than vanish while a button offers more.
    global.fetch = respondWith(
      overview({
        events: [{ eventId: 'wc', stats: statLine({ G: 2 }) }],
        meta: { wc: meta({ leagueName: 'FIFA World Cup', leagueAbbreviation: 'FIFA World Cup' }) },
      })
    )
    show()

    expect(await screen.findByText(/No Premier League matches/)).toBeInTheDocument()
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)

    await userEvent.click(screen.getByRole('button', { name: 'All competitions (1 more)' }))
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
  })

  it('names the season when the matches are not from the current one', async () => {
    // May 2026 belongs to 2025-26; the app is showing 2026-27. Without the
    // label these read as current form.
    global.fetch = respondWith(twoLeague)
    show()
    expect(await screen.findByText('2025-26')).toBeInTheDocument()
  })

  it('drops last season the moment the player has played in this one', async () => {
    // Two matches into the new season beats five from last May, even though it
    // is the shorter list — and there is no season label, because it is the
    // season the rest of the app is already showing.
    global.fetch = respondWith(
      overview({
        events: [
          { eventId: 'new1', stats: statLine({ G: 1 }) },
          { eventId: 'new2', stats: statLine({ A: 1 }) },
          { eventId: 'old1', stats: statLine({ G: 3 }) },
          { eventId: 'old2', stats: statLine({ G: 3 }) },
        ],
        meta: {
          new1: meta({ date: '2026-08-22T14:00:00.000Z' }),
          new2: meta({ date: '2026-08-29T14:00:00.000Z' }),
          old1: meta({ date: '2026-05-24T14:00:00.000Z' }),
          old2: meta({ date: '2026-05-17T14:00:00.000Z' }),
        },
      })
    )
    show()

    const rows = await screen.findAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(screen.queryByText('2025-26')).not.toBeInTheDocument()
    // Last season's hat-tricks are not this season's form.
    expect(screen.queryByText('3 goals')).not.toBeInTheDocument()
  })

  it('counts an August match as the new season, and a May one as the old', async () => {
    // The league runs August to May, so the year alone does not say which
    // season a match belongs to — both of these are in 2026.
    global.fetch = respondWith(
      overview({
        events: [{ eventId: 'aug', stats: statLine({ G: 1 }) }],
        meta: { aug: meta({ date: '2026-08-15T14:00:00.000Z' }) },
      })
    )
    show()
    await screen.findAllByRole('listitem')
    expect(screen.queryByText('2025-26')).not.toBeInTheDocument()
  })

  it('shows at most five, however many the feed sent', async () => {
    const days = ['01', '02', '03', '04', '05', '06', '07']
    global.fetch = respondWith(
      overview({
        events: days.map((d) => ({ eventId: d, stats: statLine() })),
        meta: Object.fromEntries(days.map((d) => [d, meta({ date: `2026-05-${d}T14:00:00.000Z` })])),
      })
    )
    expect(await showRows()).toHaveLength(5)
  })

  it('writes a goalkeeper’s match in saves and goals against', async () => {
    global.fetch = respondWith(
      overview({
        labels: KEEPER,
        events: [{ eventId: 'a', stats: statLine({ SV: 5, GA: 3 }, KEEPER) }],
        meta: { a: meta() },
      })
    )
    const [row] = await showRows()
    expect(row).toHaveTextContent('5 saves')
    expect(row).toHaveTextContent('3 conceded')
    // The outfield line must not be attempted for a keeper.
    expect(row).not.toHaveTextContent('shot')
  })

  it('calls a goalless keeper’s match a clean sheet', async () => {
    global.fetch = respondWith(
      overview({
        labels: KEEPER,
        events: [{ eventId: 'a', stats: statLine({ SV: 1, CS: 1 }, KEEPER) }],
        meta: { a: meta() },
      })
    )
    const [row] = await showRows()
    expect(row).toHaveTextContent('1 save')
    expect(row).toHaveTextContent('clean sheet')
    expect(row).not.toHaveTextContent('conceded')
  })

  it('gives a keeper credit for a goal or an assist', async () => {
    global.fetch = respondWith(
      overview({
        labels: KEEPER,
        events: [{ eventId: 'a', stats: statLine({ SV: 2, GA: 1, G: 1, A: 1 }, KEEPER) }],
        meta: { a: meta() },
      })
    )
    const [row] = await showRows()
    expect(row).toHaveTextContent('1 goal')
    expect(row).toHaveTextContent('1 assist')
  })

  it('uses the plural for goals and the singular for a lone shot', async () => {
    global.fetch = respondWith(
      overview({
        events: [{ eventId: 'a', stats: statLine({ G: 2, A: 1, SHOT: 1 }) }],
        meta: { a: meta() },
      })
    )
    const [row] = await showRows()
    expect(row).toHaveTextContent('2 goals')
    expect(row).toHaveTextContent('1 assist')
    expect(row).toHaveTextContent('1 shot')
  })

  it('marks a booking and a sending-off', async () => {
    global.fetch = respondWith(
      overview({
        events: [{ eventId: 'a', stats: statLine({ YC: 1, RC: 1 }) }],
        meta: { a: meta() },
      })
    )
    show()

    expect(await screen.findByLabelText('Yellow card')).toBeInTheDocument()
    expect(screen.getByLabelText('Red card')).toBeInTheDocument()
  })

  it('says an appearance was quiet rather than leaving the line blank', async () => {
    global.fetch = respondWith(
      overview({
        labels: ['G', 'A', 'SHOT'],
        events: [{ eventId: 'a', stats: ['0', '0', '0'] }],
        meta: { a: meta() },
      })
    )
    const [row] = await showRows()
    expect(row).toHaveTextContent('No figures')
  })

  it('lets the appearance stand alone when there is nothing else to report', async () => {
    global.fetch = respondWith(
      overview({
        events: [{ eventId: 'a', stats: statLine({ APP: 'Substitute' }) }],
        meta: { a: meta() },
      })
    )
    const [row] = await showRows()
    expect(row).toHaveTextContent('Substitute')
    expect(row).not.toHaveTextContent('No figures')
  })

  it('copes with a match the feed gave no opponent, side or result', async () => {
    global.fetch = respondWith(
      overview({
        events: [{ eventId: 'a', stats: statLine() }],
        meta: {
          a: { gameDate: '2026-05-24T14:00:00.000Z', leagueName: LEAGUE },
        },
      })
    )
    const [row] = await showRows()
    expect(row).toHaveTextContent('—')
    // No result means no score chip and no win/loss colour to get wrong.
    expect(row.querySelector('.rm-result')).toBeNull()
  })

  it('shows a result that carries no score', async () => {
    global.fetch = respondWith(
      overview({
        events: [{ eventId: 'a', stats: statLine() }],
        meta: { a: meta({ result: 'D', score: null }) },
      })
    )
    const [row] = await showRows()
    expect(row.querySelector('.rm-d')).toBeInTheDocument()
    expect(row.querySelector('.rm-score')).toBeNull()
  })

  it('treats an empty figure the same as a missing one', async () => {
    global.fetch = respondWith(
      overview({
        events: [{ eventId: 'a', stats: statLine({ G: '', A: '', SHOT: '' }) }],
        meta: { a: meta() },
      })
    )
    const [row] = await showRows()
    expect(row).toHaveTextContent('Started')
    expect(row).not.toHaveTextContent('goal')
  })

  it('ignores an answer that lands after the pop-out has closed', async () => {
    let settle
    global.fetch = vi.fn(
      () =>
        new Promise((r) => {
          settle = () => r({ ok: true, json: () => Promise.resolve(twoLeague) })
        })
    )
    const { unmount } = show()
    unmount()
    settle()

    // The shared request still completes for everyone else; it simply has no
    // component left to update, and React must not warn about it.
    expect(await fetchRecentMatches('10')).toHaveLength(2)
  })
})
