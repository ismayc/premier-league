import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import Lineups from '../src/components/Lineups.jsx'
import { fetchLineup, groupByLine, lineOf } from '../src/services/lineups.js'
import { clearAthleteCache, fetchAthlete } from '../src/services/athlete.js'

// Biographies are memoised for the lifetime of the page, which would leak a
// stubbed response from one test into the next.
afterEach(() => clearAthleteCache())

/**
 * Team sheets are the one thing this app fetches per match rather than
 * committing, because a lineup does not exist until about an hour before
 * kickoff. So the state that matters most is the ordinary one: no sheet
 * published yet, which is not an error.
 *
 * Everything below drives the real service through a stubbed `fetch`, rather
 * than mocking the service, so the payload shape ESPN actually returns is
 * exercised end to end.
 */

const stat = (name, displayValue) => ({ name, abbreviation: name, displayValue })

// The feed returns every counter for every player, mostly zero.
const statsFor = (over = {}) => [
  stat('saves', over.saves ?? '0'),
  stat('goalsConceded', over.conceded ?? '0'),
  stat('shotsFaced', over.shotsFaced ?? '0'),
  stat('totalGoals', over.goals ?? '0'),
  stat('goalAssists', over.assists ?? '0'),
  stat('totalShots', over.shots ?? '0'),
  stat('foulsCommitted', over.fouls ?? '0'),
  stat('yellowCards', over.yellow ?? '0'),
]

const player = (over = {}) => ({
  athlete: { id: over.id ?? '1', displayName: over.name ?? 'A Player' },
  stats: over.stats ?? statsFor(over),
  jersey: over.jersey ?? '9',
  position: { abbreviation: over.pos ?? 'F' },
  // `in` rather than `??`, so a test can say "this player has no formation
  // place" — which is exactly what a bench player looks like in the feed.
  formationPlace: 'place' in over ? over.place : '11',
  starter: over.starter ?? true,
  subbedIn: over.subbedIn ?? false,
  subbedOut: over.subbedOut ?? false,
})

const side = (homeAway, over = {}) => ({
  homeAway,
  team: { displayName: over.name ?? `${homeAway} club` },
  formation: over.formation ?? '4-4-2',
  roster: over.roster ?? [
    player({ id: '1', name: 'Keeper', pos: 'G', place: '1', jersey: '1' }),
    player({ id: '2', name: 'Back', pos: 'LB', place: '3', jersey: '3' }),
    player({ id: '3', name: 'Middle', pos: 'CM-L', place: '7', jersey: '8', subbedOut: true }),
    player({ id: '4', name: 'Striker', pos: 'F', place: '11', jersey: '9' }),
    player({ id: '5', name: 'Benchwarmer', pos: 'F', place: null, jersey: '20', starter: false }),
    player({
      id: '6',
      name: 'Impact Sub',
      pos: 'CM-R',
      place: null,
      jersey: '21',
      starter: false,
      subbedIn: true,
    }),
  ],
})

const payload = (over = {}) => ({
  rosters: over.rosters ?? [side('home'), side('away')],
  keyEvents: over.keyEvents ?? [
    {
      type: { type: 'substitution' },
      clock: { displayValue: "63'" },
      team: { displayName: 'home club' },
      participants: [
        { athlete: { displayName: 'Impact Sub' } },
        { athlete: { displayName: 'Middle' } },
      ],
    },
    // A goal is not a substitution and must not appear in the list.
    { type: { type: 'goal' }, clock: { displayValue: "12'" }, participants: [] },
  ],
})

const respondWith = (body, ok = true) =>
  vi.fn(() => Promise.resolve({ ok, json: () => Promise.resolve(body) }))

describe('fetchAthlete', () => {
  it('returns null for a player with no id, without calling the feed', async () => {
    global.fetch = vi.fn()
    expect(await fetchAthlete(undefined)).toBeNull()
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('normalises a record and falls back through the name fields', async () => {
    global.fetch = respondWith({
      athlete: { id: '9', fullName: 'Only A Full Name', team: { displayName: 'A Club' } },
    })
    expect(await fetchAthlete('9')).toMatchObject({
      id: '9',
      name: 'Only A Full Name',
      team: 'A Club',
      position: null,
      age: null,
      headshot: null,
    })
  })

  it('reads a payload that is not wrapped in an athlete key', async () => {
    global.fetch = respondWith({ id: '7', displayName: 'Unwrapped' })
    expect((await fetchAthlete('7')).name).toBe('Unwrapped')
  })

  it('returns null on a failure and does not ask twice', async () => {
    // Cached as null deliberately: a player whose record is missing should
    // not be refetched every time their row is reopened.
    global.fetch = respondWith({}, false)
    expect(await fetchAthlete('404')).toBeNull()
    expect(await fetchAthlete('404')).toBeNull()
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it('is not spoiled by a caller that stops caring', async () => {
    // The cache is shared, so an earlier version let one consumer abort the
    // request and memoise the rejection — the biography then never loaded for
    // anyone. React's development double-mount triggered this on every open.
    global.fetch = respondWith({ athlete: { id: '3', displayName: 'Still Here', age: 30 } })

    const abandoned = fetchAthlete('3')
    const wanted = fetchAthlete('3')

    expect(await wanted).toMatchObject({ name: 'Still Here', age: 30 })
    expect(await abandoned).toBe(await wanted)
    expect(global.fetch).toHaveBeenCalledTimes(1)
    // No signal is accepted, so no consumer can cancel the shared request.
    expect(global.fetch.mock.calls[0]).toHaveLength(1)
  })

  it('serves a repeat request from cache', async () => {
    global.fetch = respondWith({ athlete: { id: '5', displayName: 'Cached Player' } })
    const first = await fetchAthlete('5')
    const second = await fetchAthlete('5')

    expect(second).toBe(first)
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })
})

describe('lineOf', () => {
  it('reads the granular position codes ESPN publishes', () => {
    // CD, CM and CF all begin with C, and LB/RB begin with neither D nor B,
    // so a leading-letter match would misfile most of a back four.
    expect(lineOf('G')).toBe('Goalkeepers')
    for (const code of ['CD', 'CD-L', 'CD-R', 'LB', 'RB', 'LWB', 'RWB', 'SW', 'D']) {
      expect(lineOf(code), code).toBe('Defenders')
    }
    for (const code of ['LM', 'RM', 'CM-L', 'CM-R', 'AM', 'AM-L', 'DM', 'M']) {
      expect(lineOf(code), code).toBe('Midfielders')
    }
    for (const code of ['F', 'CF-L', 'CF-R', 'ST', 'LW', 'RW']) {
      expect(lineOf(code), code).toBe('Forwards')
    }
  })

  it('files an unrecognised or missing code under Other rather than guessing', () => {
    expect(lineOf(null)).toBe('Other')
    expect(lineOf('')).toBe('Other')
    expect(lineOf('ZZ')).toBe('Other')
  })

  it('is case-insensitive', () => {
    expect(lineOf('cd-l')).toBe('Defenders')
  })
})

describe('groupByLine', () => {
  it('keeps the lines in the order the players arrive', () => {
    // Starters are sorted by formation place, which already runs from the
    // goalkeeper outwards, so insertion order gives the right sequence.
    const grouped = groupByLine([
      { pos: 'G', name: 'a' },
      { pos: 'LB', name: 'b' },
      { pos: 'CM-L', name: 'c' },
      { pos: 'F', name: 'd' },
    ])
    expect(grouped.map((g) => g.line)).toEqual([
      'Goalkeepers',
      'Defenders',
      'Midfielders',
      'Forwards',
    ])
    expect(grouped[1].players).toHaveLength(1)
  })

  it('returns nothing for an empty squad', () => {
    expect(groupByLine([])).toEqual([])
  })
})

describe('fetchLineup', () => {
  it('splits a published sheet into starters and bench, sorted by formation place', async () => {
    global.fetch = respondWith(payload())
    const lineup = await fetchLineup('123')

    expect(lineup.home.formation).toBe('4-4-2')
    expect(lineup.home.name).toBe('home club')
    expect(lineup.home.starters.map((p) => p.name)).toEqual([
      'Keeper',
      'Back',
      'Middle',
      'Striker',
    ])
    expect(lineup.home.bench.map((p) => p.name)).toEqual(['Benchwarmer', 'Impact Sub'])
    expect(lineup.home.starters[2]).toMatchObject({ jersey: '8', subbedOut: true })
    expect(lineup.home.bench[1]).toMatchObject({ subbedIn: true })
  })

  it('pairs each substitution as on, off, with the minute', async () => {
    global.fetch = respondWith(payload())
    const { subs } = await fetchLineup('123')

    expect(subs).toEqual([
      { minute: "63'", team: 'home club', on: 'Impact Sub', off: 'Middle' },
    ])
  })

  it('returns null when no sheet has been published', async () => {
    // The normal state for any fixture more than about an hour away: both
    // sides come back, with no formation and an empty squad.
    global.fetch = respondWith({
      rosters: [
        { homeAway: 'home', team: {}, formation: null, roster: [] },
        { homeAway: 'away', team: {}, formation: null, roster: [] },
      ],
    })
    expect(await fetchLineup('123')).toBeNull()
  })

  it('returns null rather than throwing when the feed fails', async () => {
    global.fetch = respondWith({}, false)
    expect(await fetchLineup('123')).toBeNull()

    global.fetch = vi.fn(() => Promise.reject(new Error('offline')))
    expect(await fetchLineup('123')).toBeNull()
  })

  it('copes with a sheet for only one side', async () => {
    global.fetch = respondWith(payload({ rosters: [side('away')] }))
    const lineup = await fetchLineup('123')

    expect(lineup.home).toBeUndefined()
    expect(lineup.away.starters).toHaveLength(4)
  })

  it('tolerates missing fields throughout the payload', async () => {
    global.fetch = respondWith({
      rosters: [
        {
          homeAway: 'home',
          team: { shortDisplayName: 'Fallback name' },
          roster: [{ starter: true }],
        },
      ],
      keyEvents: [
        // A substitution with neither participant named is dropped.
        { type: { type: 'substitution' }, participants: [] },
      ],
    })
    const lineup = await fetchLineup('123')

    expect(lineup.home.name).toBe('Fallback name')
    expect(lineup.home.formation).toBeNull()
    expect(lineup.home.starters[0]).toMatchObject({ name: 'Unknown', jersey: null, place: null })
    expect(lineup.subs).toEqual([])
  })

  it('has no key events at all', async () => {
    global.fetch = respondWith({ rosters: [side('home')] })
    expect((await fetchLineup('123')).subs).toEqual([])
  })

  it('keeps a non-numeric stat value as written', async () => {
    // Most counters are integers, but the feed occasionally sends a dash or a
    // rate; coercing that to NaN would render "NaN" in the panel.
    global.fetch = respondWith(
      payload({
        rosters: [
          side('home', {
            roster: [
              player({
                id: '1',
                stats: [
                  { name: 'totalGoals', displayValue: '2' },
                  { name: 'totalShots', displayValue: '-' },
                ],
              }),
            ],
          }),
        ],
      })
    )
    const { home } = await fetchLineup('123')

    expect(home.starters[0].stats).toEqual([
      { name: 'totalGoals', label: 'Goals', value: 2 },
      { name: 'totalShots', label: 'Shots', value: '-' },
    ])
  })

  it('copes with a side carrying no roster array at all', async () => {
    global.fetch = respondWith({
      rosters: [{ homeAway: 'home', team: { displayName: 'Sheetless' } }, side('away')],
    })
    const lineup = await fetchLineup('123')

    expect(lineup.home.starters).toEqual([])
    expect(lineup.home.bench).toEqual([])
    // The other side's sheet is still worth showing.
    expect(lineup.away.starters).toHaveLength(4)
  })
})

describe('<Lineups>', () => {
  const fixture = { id: '123' }

  it('says so while it is still loading', () => {
    global.fetch = vi.fn(() => new Promise(() => {})) // never settles
    render(<Lineups fixture={fixture} />)
    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })

  it('explains an unpublished sheet as a matter of timing, not an error', async () => {
    global.fetch = respondWith({ rosters: [] })
    render(<Lineups fixture={fixture} />)

    expect(
      await screen.findByText(/lineups usually appear about an hour before kickoff/)
    ).toBeInTheDocument()
  })

  it('renders both sides, their formations, the lines and the bench', async () => {
    global.fetch = respondWith(payload())
    const { container } = render(<Lineups fixture={fixture} />)

    // Scoped to the team sheets: club and player names also appear in the
    // substitutions list below, so an unscoped query matches twice.
    await screen.findAllByText('4-4-2')
    const sheets = within(container.querySelector('.lu-sides'))

    expect(sheets.getByText('home club')).toBeInTheDocument()
    expect(sheets.getByText('away club')).toBeInTheDocument()
    expect(sheets.getAllByText('4-4-2')).toHaveLength(2)
    expect(sheets.getAllByText('Goalkeepers')).toHaveLength(2)
    expect(sheets.getAllByText('Defenders')).toHaveLength(2)
    expect(sheets.getAllByText('Bench')).toHaveLength(2)
    expect(sheets.getAllByText('Keeper')).toHaveLength(2)
  })

  it('marks who went off and who came on', async () => {
    global.fetch = respondWith(payload({ rosters: [side('home')] }))
    const { container } = render(<Lineups fixture={fixture} />)

    // Direction is meaningful: down out of the XI, up off the bench.
    const off = await screen.findByTitle('Substituted off')
    const on = screen.getByTitle('Came on')
    expect(off).toHaveTextContent('▼')
    expect(on).toHaveTextContent('▲')

    const sheets = within(container.querySelector('.lu-sides'))
    expect(sheets.getByText('Middle').closest('li')).toHaveClass('lu-moved')
    expect(sheets.getByText('Benchwarmer').closest('li')).not.toHaveClass('lu-moved')
  })

  it('lists the substitutions with minute and both players', async () => {
    global.fetch = respondWith(payload())
    const { container } = render(<Lineups fixture={fixture} />)

    expect(await screen.findByText('Substitutions')).toBeInTheDocument()

    const subs = within(container.querySelector('.lu-subs'))
    expect(subs.getByText("63'")).toBeInTheDocument()
    expect(subs.getByText('Impact Sub')).toBeInTheDocument()
    expect(subs.getByText('Middle')).toBeInTheDocument()
    expect(subs.getByText('home club')).toBeInTheDocument()
  })

  it('omits the substitutions heading when none were made', async () => {
    global.fetch = respondWith(payload({ keyEvents: [] }))
    render(<Lineups fixture={fixture} />)

    expect(await screen.findByText('home club')).toBeInTheDocument()
    expect(screen.queryByText('Substitutions')).not.toBeInTheDocument()
  })

  it('omits the bench when every named player started', async () => {
    const eleven = [player({ id: '1', name: 'Only Starter', pos: 'G', place: '1' })]
    global.fetch = respondWith(payload({ rosters: [side('home', { roster: eleven })] }))
    render(<Lineups fixture={fixture} />)

    expect(await screen.findByText('Only Starter')).toBeInTheDocument()
    expect(screen.queryByText('Bench')).not.toBeInTheDocument()
  })

  it('renders nothing for a side the feed did not include', async () => {
    // No key events either, so "home club" cannot leak in via a sub row.
    global.fetch = respondWith(payload({ rosters: [side('away')], keyEvents: [] }))
    render(<Lineups fixture={fixture} />)

    expect(await screen.findByText('away club')).toBeInTheDocument()
    expect(screen.queryByText('home club')).not.toBeInTheDocument()
  })

  it('renders a sparse sheet without a formation, shirt numbers or player ids', async () => {
    // Early team sheets are often published without shirt numbers, and the
    // formation can be absent entirely. None of that should blank the panel.
    global.fetch = respondWith({
      rosters: [
        {
          homeAway: 'home',
          team: { displayName: 'Sparse FC' },
          roster: [
            { starter: true, position: { abbreviation: 'G' }, athlete: { displayName: 'No Number' } },
            {
              starter: false,
              position: { abbreviation: 'F' },
              athlete: { displayName: 'Unnumbered Sub' },
            },
          ],
        },
      ],
      keyEvents: [],
    })
    const { container } = render(<Lineups fixture={fixture} />)

    expect(await screen.findByText('No Number')).toBeInTheDocument()
    expect(screen.getByText('Unnumbered Sub')).toBeInTheDocument()
    expect(container.querySelector('.lu-formation')).toBeNull()
    // A dash stands in for the missing shirt number so the column still lines up.
    expect(container.querySelectorAll('.lu-jersey')[0]).toHaveTextContent('–')
  })

  it('opens a player to show what they did in the match', async () => {
    const user = userEvent.setup()
    global.fetch = respondWith(
      payload({
        rosters: [
          side('home', {
            roster: [
              player({
                id: '1',
                name: 'Busy Winger',
                pos: 'LM',
                place: '7',
                goals: '2',
                assists: '1',
                shots: '5',
                yellow: '1',
              }),
            ],
          }),
        ],
        keyEvents: [],
      })
    )
    render(<Lineups fixture={fixture} />)

    const row = await screen.findByRole('button', { name: /Busy Winger/ })
    expect(row).toHaveAttribute('aria-expanded', 'false')

    await user.click(row)

    expect(row).toHaveAttribute('aria-expanded', 'true')
    // Only the counters that actually happened; the zeroes are noise.
    expect(screen.getByText('Goals')).toBeInTheDocument()
    expect(screen.getByText('Assists')).toBeInTheDocument()
    expect(screen.getByText('Shots')).toBeInTheDocument()
    expect(screen.getByText('Yellow')).toBeInTheDocument()
    expect(screen.queryByText('Fouls')).not.toBeInTheDocument()

    await user.click(row)
    expect(screen.queryByText('Goals')).not.toBeInTheDocument()
  })

  it('keeps goalkeeping figures off an outfielder', async () => {
    // The feed reports goalsConceded against every player, so an ever-present
    // full-back would otherwise read "Conceded 3" — the team's tally, which
    // says nothing about them.
    const user = userEvent.setup()
    global.fetch = respondWith(
      payload({
        rosters: [
          side('home', {
            roster: [
              player({ id: '1', name: 'The Keeper', pos: 'G', place: '1', saves: '5', conceded: '3' }),
              player({ id: '2', name: 'The Full Back', pos: 'LB', place: '3', conceded: '3', fouls: '4' }),
            ],
          }),
        ],
        keyEvents: [],
      })
    )
    render(<Lineups fixture={fixture} />)

    const keeper = await screen.findByRole('button', { name: /The Keeper/ })
    await user.click(keeper)
    const keeperPanel = within(keeper.closest('li').querySelector('.lu-detail'))
    expect(keeperPanel.getByText('Saves')).toBeInTheDocument()
    expect(keeperPanel.getByText('Conceded')).toBeInTheDocument()

    const back = screen.getByRole('button', { name: /The Full Back/ })
    await user.click(back)
    // Scoped to this player's own panel — rows expand independently, so the
    // keeper's figures are still on screen.
    const backPanel = within(back.closest('li').querySelector('.lu-detail'))
    expect(backPanel.getByText('Fouls')).toBeInTheDocument()
    expect(backPanel.queryByText('Conceded')).not.toBeInTheDocument()
    expect(backPanel.queryByText('Saves')).not.toBeInTheDocument()
  })

  it('says so when a player did nothing countable', async () => {
    const user = userEvent.setup()
    global.fetch = respondWith(
      payload({
        rosters: [side('home', { roster: [player({ id: '1', name: 'Quiet Game', pos: 'CM-L' })] })],
        keyEvents: [],
      })
    )
    render(<Lineups fixture={fixture} />)

    await user.click(await screen.findByRole('button', { name: /Quiet Game/ }))
    expect(screen.getByText(/No goals, cards or saves recorded/)).toBeInTheDocument()
  })

  it('adds the biography once it arrives, and copes without one', async () => {
    const user = userEvent.setup()
    const bio = {
      athlete: {
        id: '1',
        displayName: 'Busy Winger',
        position: { displayName: 'Forward' },
        age: 21,
        citizenship: 'Gambia',
        flag: { href: 'https://a.espncdn.com/i/teamlogos/countries/500/gam.png' },
        displayHeight: `5' 11"`,
        headshot: { href: 'https://example.test/head.png' },
      },
    }
    global.fetch = vi.fn((url) =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve(String(url).includes('/athletes/') ? bio : payload({ keyEvents: [] })),
      })
    )
    render(<Lineups fixture={fixture} />)

    const row = (await screen.findAllByRole('button', { name: /Keeper/ }))[0]
    await user.click(row)

    expect(await screen.findByText('Forward')).toBeInTheDocument()
    // Scoped: an age of 21 would otherwise collide with a shirt number.
    const bioEl = row.closest('li').querySelector('.lu-bio')
    const bioPanel = within(bioEl)
    expect(bioPanel.getByText('21')).toBeInTheDocument()
    expect(bioPanel.getByText('Gambia')).toBeInTheDocument()
    const flag = bioEl.querySelector('img.bio-flag')
    expect(flag?.getAttribute('src')).toContain('/countries/500/gam.png')
    // A flag that 404s hides itself rather than showing a broken image.
    fireEvent.error(flag)
    expect(flag.style.display).toBe('none')
    expect(bioPanel.getByText(`5' 11"`)).toBeInTheDocument()
  })

  it('shows the match figures even when the biography fails', async () => {
    const user = userEvent.setup()
    global.fetch = vi.fn((url) =>
      String(url).includes('/athletes/')
        ? Promise.reject(new Error('offline'))
        : Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve(
                payload({
                  rosters: [
                    side('home', {
                      roster: [player({ id: '1', name: 'Scorer', pos: 'F', goals: '1' })],
                    }),
                  ],
                  keyEvents: [],
                })
              ),
          })
    )
    render(<Lineups fixture={fixture} />)

    await user.click(await screen.findByRole('button', { name: /Scorer/ }))

    expect(screen.getByText('Goals')).toBeInTheDocument()
    await waitFor(() => expect(document.querySelector('.lu-bio')).toBeNull())
  })

  it('drops a response that arrives after the match was closed', async () => {
    // Without the aborted guard this would set state on an unmounted tree and,
    // worse, paint one match's sheet into another's detail view.
    let settle
    global.fetch = vi.fn(
      () => new Promise((resolve) => {
        settle = () => resolve({ ok: true, json: () => Promise.resolve(payload()) })
      })
    )

    const { unmount } = render(<Lineups fixture={fixture} />)
    unmount()
    settle()

    await waitFor(() => expect(screen.queryByText('home club')).not.toBeInTheDocument())
  })

  it('reloads when a different match is opened', async () => {
    global.fetch = respondWith(payload())
    const { rerender } = render(<Lineups fixture={{ id: '1' }} />)
    await screen.findAllByText('home club')

    rerender(<Lineups fixture={{ id: '2' }} />)

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2))
    expect(global.fetch.mock.calls[1][0]).toContain('event=2')
  })
})
