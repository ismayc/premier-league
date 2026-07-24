import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import FixturesView from '../src/components/FixturesView.jsx'
import WeekView from '../src/components/WeekView.jsx'
import TableView from '../src/components/TableView.jsx'
import { FollowProvider } from '../src/context/follow.jsx'
import { ServicesProvider } from '../src/context/services.jsx'

// The league roster is normally fixed, but TableView is written to survive an
// abbreviation it has no club record for. The only way to exercise that is to
// add one, so ALL_ABBRS is exposed as a live getter that tests can extend and
// then put back — it reads as the real list unless a test says otherwise.
const extraAbbrs = []
vi.mock('../src/data/teams.js', async (importOriginal) => {
  const real = await importOriginal()
  return {
    ...real,
    get ALL_ABBRS() {
      return [...real.ALL_ABBRS, ...extraAbbrs]
    },
  }
})

/**
 * The three season views. Every one of them decides what to *withhold* —
 * results before kickoff, past fixtures, positions in a table with nothing to
 * rank by — so the cases worth testing are the ones where something is
 * deliberately absent, not the happy path where everything renders.
 *
 * The real 2026-27 fixture list carries no scores (the season hasn't started),
 * so anything touching a played match builds its own fixtures below.
 */

// A Saturday mid-season, fixed so "today", "next kickoff" and the initial week
// are all deterministic. 09:00 UTC is 10:00 in London, comfortably before the
// 15:00 kickoffs used throughout.
const NOW = new Date('2026-09-12T09:00:00.000Z')
const TZ = 'Europe/London'

const fx = (id, ko, home, away, extra = {}) => ({
  id,
  ko,
  home,
  away,
  venue: 'Ground',
  city: 'Town',
  ...extra,
})

const LAST_WEEK = '2026-09-05T14:00:00.000Z'
const TODAY = '2026-09-12T14:00:00.000Z'
const NEXT_WEEK = '2026-09-19T14:00:00.000Z'

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true, now: NOW })
})

afterEach(() => {
  vi.useRealTimers()
})

const setup = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

// FixturesView is controlled: the two filter chips are props so that App can
// serialise them into the query string, which is what makes them survive a
// reload and travel in a shared link. These tests stand in for the shell's
// half of that contract. Props passed by a test still win, so a case can pin
// a filter on from the start.
function Fixtures(props) {
  const [onlyFollowed, setOnlyFollowed] = useState(false)
  const [showPast, setShowPast] = useState(false)
  return (
    <FixturesView
      onlyFollowed={onlyFollowed}
      onToggleFollowed={() => setOnlyFollowed((v) => !v)}
      showPast={showPast}
      onTogglePast={() => setShowPast((v) => !v)}
      {...props}
    />
  )
}

describe('FixturesView', () => {
  it('shows upcoming days only, and flags the one that is today', async () => {
    render(
      <Fixtures
        fixtures={[
          fx('a', LAST_WEEK, 'ARS', 'CHE', { score: [2, 1] }),
          fx('b', TODAY, 'LIV', 'MNC'),
          fx('c', NEXT_WEEK, 'TOT', 'EVE'),
        ]}
        tz={TZ}
      />
    )

    // The played match is filtered out until "Played" is switched on.
    expect(screen.queryByText('Arsenal')).not.toBeInTheDocument()

    const today = screen.getByRole('heading', { name: /Saturday, 12 September 2026/ })
    expect(within(today).getByText('Today')).toBeInTheDocument()
    expect(within(today).getByText('1')).toBeInTheDocument() // day count

    // A future day gets a heading but no Today tag.
    const later = screen.getByRole('heading', { name: /Saturday, 19 September 2026/ })
    expect(within(later).queryByText('Today')).not.toBeInTheDocument()
  })

  it('reveals results already played when the Played chip is pressed', async () => {
    const user = setup()
    render(
      <Fixtures
        fixtures={[
          fx('a', LAST_WEEK, 'ARS', 'CHE', { score: [2, 1] }),
          fx('b', TODAY, 'LIV', 'MNC'),
        ]}
        tz={TZ}
      />
    )

    const played = screen.getByRole('button', { name: 'Played' })
    expect(played).toHaveAttribute('aria-pressed', 'false')

    await user.click(played)

    expect(played).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Arsenal')).toBeInTheDocument()
  })

  it('keeps a live match visible even though its kickoff has passed', () => {
    // Without the `live` escape hatch the one match people most want to see
    // would disappear the moment it started.
    render(
      <Fixtures
        fixtures={[fx('a', LAST_WEEK, 'ARS', 'CHE', { live: true, clock: "67'" })]}
        tz={TZ}
      />
    )
    expect(screen.getByText('Arsenal')).toBeInTheDocument()
  })

  it('disables the followed filter until a club is followed', () => {
    render(<Fixtures fixtures={[fx('b', TODAY, 'LIV', 'MNC')]} tz={TZ} />)

    const chip = screen.getByRole('button', { name: /Followed/ })
    expect(chip).toBeDisabled()
    expect(chip).toHaveAttribute('title', 'Follow a club first')
  })

  it('filters to followed clubs once one is followed', async () => {
    // Seeded before render: the provider reads localStorage on first state.
    localStorage.setItem('pl:followed', JSON.stringify(['LIV']))
    const user = setup()

    render(
      <FollowProvider>
        <Fixtures
          fixtures={[fx('b', TODAY, 'LIV', 'MNC'), fx('c', TODAY, 'TOT', 'EVE')]}
          tz={TZ}
        />
      </FollowProvider>
    )

    const chip = screen.getByRole('button', { name: /Followed/ })
    expect(chip).toBeEnabled()
    expect(chip).toHaveAttribute('title', 'Only followed clubs')

    await user.click(chip)

    expect(chip).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Liverpool')).toBeInTheDocument()
    expect(screen.queryByText('Spurs')).not.toBeInTheDocument()
  })

  it('explains an empty list caused by the followed filter', async () => {
    localStorage.setItem('pl:followed', JSON.stringify(['NEW']))
    const user = setup()

    render(
      <FollowProvider>
        <Fixtures fixtures={[fx('b', TODAY, 'LIV', 'MNC')]} tz={TZ} />
      </FollowProvider>
    )

    await user.click(screen.getByRole('button', { name: /Followed/ }))

    expect(screen.getByText(/clubs you follow/)).toBeInTheDocument()
  })

  it('falls back to the season tail when nothing is upcoming (off-season)', () => {
    // With no upcoming or live fixture the default view would be blank, so it
    // shows the last week of results instead of an empty page.
    render(
      <Fixtures fixtures={[fx('a', LAST_WEEK, 'ARS', 'CHE', { score: [2, 1] })]} tz={TZ} />
    )
    expect(screen.getByText('Arsenal')).toBeInTheDocument()
    expect(screen.queryByText(/Turn on/)).not.toBeInTheDocument()
  })

  it('shows the empty message only when there are no fixtures at all', () => {
    render(<Fixtures fixtures={[]} tz={TZ} />)
    expect(screen.getByText(/Turn on/)).toBeInTheDocument()
  })

  it('banners the next kickoff with a countdown', () => {
    render(
      <Fixtures
        fixtures={[
          fx('a', LAST_WEEK, 'ARS', 'CHE', { score: [2, 1] }),
          fx('c', NEXT_WEEK, 'TOT', 'EVE'),
        ]}
        tz={TZ}
      />
    )

    expect(screen.getByText('Next kickoff')).toBeInTheDocument()
    expect(screen.getByText('Spurs v Everton')).toBeInTheDocument()
    expect(screen.getByText('7d 5h')).toBeInTheDocument()
  })

  it('has no next-kickoff banner when nothing is left to play', () => {
    // Played, postponed, and a past fixture the feed never scored: none of
    // them is a kickoff still to come.
    render(
      <Fixtures
        fixtures={[
          fx('a', LAST_WEEK, 'ARS', 'CHE', { score: [2, 1] }),
          fx('c', NEXT_WEEK, 'TOT', 'EVE', { unplayed: 'Postponed' }),
          fx('d', LAST_WEEK, 'NEW', 'AVL'),
        ]}
        tz={TZ}
      />
    )
    expect(screen.queryByText('Next kickoff')).not.toBeInTheDocument()
  })

  it('falls back to the raw abbreviation for an unknown club in the banner', () => {
    render(<Fixtures fixtures={[fx('c', NEXT_WEEK, 'ZZZ', 'CHE')]} tz={TZ} />)
    expect(screen.getByText('Next kickoff').closest('.next-up')).toHaveTextContent(/v Chelsea/)
  })

  it('advances the banner to the following fixture once a kickoff passes', () => {
    // `next` must be recomputed with the same `now` the countdown uses. When
    // it was memoised on the fixture list alone it pinned to a kickoff that
    // had already passed, and the banner sat on an expired countdown until
    // the fixture list itself changed.
    render(
      <Fixtures
        fixtures={[
          fx('c', '2026-09-12T09:01:00.000Z', 'TOT', 'EVE'),
          fx('d', '2026-09-12T11:00:00.000Z', 'ARS', 'CHE'),
        ]}
        tz={TZ}
      />
    )
    expect(screen.getByText('Next kickoff').closest('.next-up')).toHaveTextContent(
      /Spurs v Everton/
    )
    expect(screen.getByText('1m')).toBeInTheDocument()

    // Kickoff passes, then any re-render — here, toggling a filter.
    vi.setSystemTime(new Date('2026-09-12T09:05:00.000Z'))
    fireEvent.click(screen.getByRole('button', { name: 'Played' }))

    expect(screen.getByText('Next kickoff').closest('.next-up')).toHaveTextContent(
      /Arsenal v Chelsea/
    )
    expect(screen.getByText('1h 55m')).toBeInTheDocument()
  })

  it('drops the banner entirely when no fixture is still to come', () => {
    render(<Fixtures fixtures={[fx('c', '2026-09-12T09:01:00.000Z', 'TOT', 'EVE')]} tz={TZ} />)
    expect(screen.getByText('Next kickoff')).toBeInTheDocument()

    vi.setSystemTime(new Date('2026-09-12T09:05:00.000Z'))
    fireEvent.click(screen.getByRole('button', { name: 'Played' }))

    expect(screen.queryByText('Next kickoff')).not.toBeInTheDocument()
  })

  it('exports exactly the fixtures currently visible', async () => {
    const onExport = vi.fn()
    const user = setup()
    render(
      <Fixtures
        fixtures={[
          fx('a', LAST_WEEK, 'ARS', 'CHE', { score: [2, 1] }),
          fx('b', TODAY, 'LIV', 'MNC'),
        ]}
        tz={TZ}
        onExport={onExport}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Export' }))

    expect(onExport).toHaveBeenCalledTimes(1)
    expect(onExport.mock.calls[0][0].map((f) => f.id)).toEqual(['b'])
  })

  it('tolerates Export with no handler wired up', async () => {
    const user = setup()
    render(<Fixtures fixtures={[fx('b', TODAY, 'LIV', 'MNC')]} tz={TZ} />)

    await user.click(screen.getByRole('button', { name: 'Export' }))

    expect(screen.getByText('Liverpool')).toBeInTheDocument()
  })
})

/* ── Full season: collapsible months + the sticky jump-bar ───────────────── */

describe('FixturesView full season', () => {
  // Four distinct months relative to NOW (2026-09): August, the current month
  // (with two days, one of them today), October and November.
  const AUG = '2026-08-15T14:00:00.000Z'
  const OCT = '2026-10-17T14:00:00.000Z'
  const NOV = '2026-11-21T14:00:00.000Z'
  const season = [
    fx('aug', AUG, 'ARS', 'CHE', { score: [1, 0] }),
    fx('cur', LAST_WEEK, 'LIV', 'MNC', { score: [2, 2] }),
    fx('today', TODAY, 'TOT', 'EVE'),
    fx('oct', OCT, 'NEW', 'AVL'),
    fx('nov', NOV, 'BRE', 'BHA'),
  ]
  const view = (fixtures = season) =>
    render(<Fixtures fixtures={fixtures} tz={TZ} showPast />)

  it('renders a jump chip per month and opens only the current month', () => {
    const { container } = view()
    // Four months -> four jump chips (plus the Today button) and four sections.
    expect(
      container.querySelectorAll('.month-jump .month-chip:not(.month-today):not(.month-top)')
    ).toHaveLength(4)
    expect(container.querySelector('.month-today')).toBeTruthy()
    expect(container.querySelectorAll('.month')).toHaveLength(4)
    // Only the current month is open, so only its two days render.
    expect(container.querySelectorAll('.month-days')).toHaveLength(1)
    expect(container.querySelectorAll('.day')).toHaveLength(2)
    // The current month's chip is flagged, and its header count is pluralised.
    expect(container.querySelector('.month-chip.is-current')).toBeTruthy()
    expect(container.querySelector('.month-head.open .month-count').textContent).toBe('2 matches')
  })

  it('expands a collapsed month on click, then collapses the current one', () => {
    const { container } = view()
    const currentHead = container.querySelector('.month-head.open')
    const collapsed = [...container.querySelectorAll('.month-head')].find(
      (h) => !h.classList.contains('open')
    )
    fireEvent.click(collapsed)
    expect(container.querySelectorAll('.month-days')).toHaveLength(2)
    expect(collapsed.querySelector('.month-count').textContent).toBe('1 match') // singular
    // Collapsing the current month hides its days again.
    fireEvent.click(currentHead)
    expect(container.querySelectorAll('.month-days')).toHaveLength(1)
  })

  it('jumping to a month expands it and scrolls it into view', () => {
    const spy = Element.prototype.scrollIntoView
    const { container } = view()
    const openedBefore = container.querySelectorAll('.month-days').length
    const calledBefore = spy.mock.calls.length
    // The first chip is August, which starts collapsed.
    fireEvent.click(container.querySelector('.month-jump .month-chip'))
    expect(container.querySelectorAll('.month-days').length).toBeGreaterThan(openedBefore)
    expect(spy.mock.calls.length).toBeGreaterThan(calledBefore)
  })

  it('Today jump scrolls to today’s own day (a day row, not the month header)', () => {
    const spy = Element.prototype.scrollIntoView
    const { container } = view() // includes a fixture dated today
    fireEvent.click(container.querySelector('.month-today'))
    const last = spy.mock.contexts[spy.mock.contexts.length - 1]
    expect(last).toHaveClass('day')
    expect(last).toHaveClass('is-today')
  })

  it('has a Top jump that scrolls the page to the top (to reach the settings)', () => {
    const scrollSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    const { container } = view()
    fireEvent.click(container.querySelector('.month-top'))
    expect(scrollSpy).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }))
    scrollSpy.mockRestore()
  })

  it('Today jump goes to the next fixture-day when today has no fixture', () => {
    const spy = Element.prototype.scrollIntoView
    // No fixture dated today; a later fixture (October) is the next fixture-day.
    // The jump must land on THAT day row, not on a month header.
    const noToday = [
      fx('aug', AUG, 'ARS', 'CHE', { score: [1, 0] }),
      fx('oct', OCT, 'NEW', 'AVL'),
    ]
    const { container } = view(noToday)
    fireEvent.click(container.querySelector('.month-today'))
    const last = spy.mock.contexts[spy.mock.contexts.length - 1]
    expect(last).toHaveClass('day')
    expect(last).not.toHaveClass('is-today') // today itself has no fixture
  })
})

describe('WeekView', () => {
  it('says so plainly when there is nothing to lay out', () => {
    render(<WeekView fixtures={[]} tz={TZ} />)
    expect(screen.getByText('No fixtures.')).toBeInTheDocument()
  })

  it('opens on the week containing today and renders all seven columns', () => {
    const { container } = render(
      <WeekView
        fixtures={[fx('b', TODAY, 'ARS', 'CHE'), fx('c', '2026-09-13T15:30:00.000Z', 'LIV', 'MNC')]}
        tz={TZ}
      />
    )

    expect(screen.getByText('September 2026')).toBeInTheDocument()
    for (const d of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) {
      expect(screen.getByText(d)).toBeInTheDocument()
    }
    // Monday 7th through Sunday 13th.
    expect(screen.getByText('7')).toBeInTheDocument()
    expect(screen.getByText('13')).toBeInTheDocument()

    // An empty midweek is the point of the grid, so it is marked rather than
    // omitted — five of the seven columns have no match.
    expect(container.querySelectorAll('.week-col.is-empty')).toHaveLength(5)
  })

  it('steps between weeks and disables the arrows at each end', async () => {
    const user = setup()
    render(
      <WeekView
        fixtures={[
          fx('a', LAST_WEEK, 'ARS', 'CHE'),
          fx('b', TODAY, 'LIV', 'MNC'),
          fx('c', NEXT_WEEK, 'TOT', 'EVE'),
        ]}
        tz={TZ}
      />
    )

    const prev = screen.getByRole('button', { name: 'Previous week' })
    const next = screen.getByRole('button', { name: 'Next week' })
    expect(prev).toBeEnabled()
    expect(next).toBeEnabled()

    await user.click(prev)
    expect(screen.getByText('August 2026')).toBeInTheDocument()
    expect(prev).toBeDisabled()

    await user.click(next)
    await user.click(next)
    expect(screen.getByText('20')).toBeInTheDocument() // Sunday 20th of the last week
    expect(next).toBeDisabled()
  })

  it('falls back to the earliest week when every fixture is in the past', () => {
    // findIndex returns -1 here; clamping to 0 must show the first week rather
    // than crashing on weeks[-1].
    render(<WeekView fixtures={[fx('a', LAST_WEEK, 'ARS', 'CHE')]} tz={TZ} />)

    expect(screen.getByRole('button', { name: 'Previous week' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Next week' })).toBeDisabled()
    expect(screen.getByText('August 2026')).toBeInTheDocument()
  })

  it('replaces the kickoff time with LIVE while a match is in progress', () => {
    render(
      <WeekView
        fixtures={[
          fx('b', TODAY, 'ARS', 'CHE'),
          fx('c', '2026-09-13T15:30:00.000Z', 'LIV', 'MNC', { live: true }),
        ]}
        tz={TZ}
      />
    )

    expect(screen.getByText('15:00')).toBeInTheDocument() // 14:00Z in London
    expect(screen.getByText('LIVE')).toBeInTheDocument()
  })

  it('shows goals for a played match, and hides them on request', () => {
    const played = [fx('b', TODAY, 'ARS', 'CHE', { score: [3, 1] }), fx('c', NEXT_WEEK, 'LIV', 'MNC')]

    const { unmount } = render(<WeekView fixtures={played} tz={TZ} />)
    const cell = screen.getByRole('button', { name: /ARS/ })
    expect(within(cell).getByText('3')).toBeInTheDocument()
    expect(within(cell).getByText('1')).toBeInTheDocument()
    unmount()

    render(<WeekView fixtures={played} tz={TZ} hideScores />)
    expect(within(screen.getByRole('button', { name: /ARS/ })).queryByText('3')).toBeNull()
  })

  it('uses the raw abbreviation for a club it does not recognise', () => {
    render(<WeekView fixtures={[fx('b', TODAY, 'ZZZ', 'YYY')]} tz={TZ} />)
    expect(screen.getByText('ZZZ')).toBeInTheDocument()
    expect(screen.getByText('YYY')).toBeInTheDocument()
  })

  it('opens a match when its cell is clicked, and no-ops without a handler', async () => {
    const onOpen = vi.fn()
    const user = setup()

    const { unmount } = render(
      <WeekView fixtures={[fx('b', TODAY, 'ARS', 'CHE')]} tz={TZ} onOpen={onOpen} />
    )
    await user.click(screen.getByRole('button', { name: /ARS/ }))
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'b' }))
    unmount()

    render(<WeekView fixtures={[fx('b', TODAY, 'ARS', 'CHE')]} tz={TZ} />)
    await user.click(screen.getByRole('button', { name: /ARS/ }))
    expect(onOpen).toHaveBeenCalledTimes(1)
  })
})

describe('TableView', () => {
  // Six home wins with descending goal differences, so positions 1–6 are
  // distinct, the eight clubs still to play share 7th (no zone), and the six
  // losers fill out the bottom. That spread is what makes the zone bands,
  // shared positions and goal-difference signs all observable at once.
  const RESULTS = [
    fx('r1', LAST_WEEK, 'ARS', 'CHE', { score: [6, 0] }),
    fx('r2', LAST_WEEK, 'AVL', 'BOU', { score: [5, 0] }),
    fx('r3', LAST_WEEK, 'BRE', 'BHA', { score: [4, 0] }),
    fx('r4', LAST_WEEK, 'CRY', 'COV', { score: [3, 0] }),
    fx('r5', LAST_WEEK, 'EVE', 'FUL', { score: [2, 0] }),
    fx('r6', LAST_WEEK, 'HUL', 'IPS', { score: [1, 0] }),
  ]

  const bodyRows = () => within(screen.getByRole('table')).getAllByRole('row').slice(1)
  const clubs = () => bodyRows().map((r) => within(r).getByRole('button').textContent)

  it('withholds positions and zones before a ball is kicked', () => {
    const { container } = render(<TableView fixtures={[]} />)

    expect(screen.getByText(/hasn’t kicked off yet/)).toBeInTheDocument()

    const rows = bodyRows()
    expect(rows).toHaveLength(20)
    // Every club is genuinely joint-first, so a position number would be true
    // and unreadable — an em dash is shown instead.
    expect(within(rows[0]).getByText('—', { selector: '.col-pos' })).toBeInTheDocument()
    // ...and the order falls back to club name, not the abbreviation order
    // that would otherwise put Brighton (BHA) above Bournemouth (BOU).
    expect(clubs().slice(0, 5)).toEqual([
      'Arsenal',
      'Aston Villa',
      'Bournemouth',
      'Brentford',
      'Brighton',
    ])

    // Nothing has happened, so there is no zone striping and no key for it.
    expect(container.querySelectorAll('[class^="zone-"]')).toHaveLength(0)
    expect(screen.queryByText('Champions League')).not.toBeInTheDocument()
    // No results means no form; the dash keeps the column from collapsing.
    expect(within(rows[0]).getByText('—', { selector: '.muted' })).toBeInTheDocument()
    // Goal difference of zero is printed bare, with no sign and no colour.
    expect(within(rows[0]).getByText('0', { selector: 'td[class=""]' })).toBeInTheDocument()
  })

  it('ranks, stripes and keys the table once results land', () => {
    const { container } = render(<TableView fixtures={RESULTS} />)

    expect(screen.queryByText(/hasn’t kicked off yet/)).not.toBeInTheDocument()
    expect(clubs().slice(0, 6)).toEqual([
      'Arsenal',
      'Aston Villa',
      'Brentford',
      'C Palace',
      'Everton',
      'Hull',
    ])

    const rows = bodyRows()
    expect(within(rows[0]).getByText('1', { selector: '.col-pos' })).toBeInTheDocument()
    expect(rows[0]).toHaveClass('zone-champions')
    expect(rows[4]).toHaveClass('zone-europa')
    expect(rows[5]).toHaveClass('zone-conference')
    expect(rows[19]).toHaveClass('zone-relegation')
    // The eight clubs yet to play share 7th, which is in no zone at all.
    expect(rows[6].className).toBe('')

    // Signed goal difference, both ways round.
    expect(within(rows[0]).getByText('+6')).toBeInTheDocument()
    expect(within(rows[19]).getByText('-6')).toBeInTheDocument()

    // Form appears only for clubs with a result behind them.
    expect(within(rows[0]).getByTitle('Won')).toHaveTextContent('W')
    expect(within(rows[19]).getByTitle('Lost')).toHaveTextContent('L')
    expect(within(rows[6]).getByText('—', { selector: '.muted' })).toBeInTheDocument()

    expect(container.querySelectorAll('.zone-key li')).toHaveLength(4)
    expect(screen.getByText('Relegation')).toBeInTheDocument()
  })

  it('re-sorts on the home and away splits and drops the overall trimmings', async () => {
    const user = setup()
    render(<TableView fixtures={RESULTS} />)

    const home = screen.getByRole('button', { name: 'Home' })
    await user.click(home)

    expect(home).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Overall' })).toHaveAttribute('aria-pressed', 'false')
    // Form and the zone key belong to the overall reading only — a split
    // position is not a European place.
    expect(screen.queryByRole('columnheader', { name: 'Form' })).not.toBeInTheDocument()
    expect(screen.queryByText('Champions League')).not.toBeInTheDocument()

    // Chelsea played away, so its home record is blank and it drops to the
    // undifferentiated tail of the home table.
    const che = bodyRows().find((r) => within(r).getByRole('button').textContent === 'Chelsea')
    expect(within(che).getAllByRole('cell')[2]).toHaveTextContent('0')

    await user.click(screen.getByRole('button', { name: 'Away' }))
    const cheAway = bodyRows().find((r) => within(r).getByRole('button').textContent === 'Chelsea')
    expect(within(cheAway).getAllByRole('cell')[2]).toHaveTextContent('1')
    // Six goals conceded away and none scored — bottom of the away table.
    expect(within(cheAway).getByText('-6')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Overall' }))
    expect(screen.getByRole('columnheader', { name: 'Form' })).toBeInTheDocument()
  })

  it('sorts an unrecognised club by its abbreviation before kickoff', () => {
    // The pre-season sort is by club *name*, so a roster entry with no club
    // record has to fall back to the abbreviation or the comparator would be
    // handed undefined and throw.
    extraAbbrs.push('QPR')
    try {
      render(<TableView fixtures={[]} />)
      expect(bodyRows()).toHaveLength(21)
      // "QPR" sorts between Newcastle and Nottm Forest as a bare string.
      expect(clubs().slice(16, 19)).toEqual(['Newcastle', 'Nottm Forest', 'QPR'])
    } finally {
      extraAbbrs.length = 0
    }
  })

  it('lists a club that is not in the league from the fixtures alone', () => {
    render(<TableView fixtures={[fx('r7', LAST_WEEK, 'ZZZ', 'YYY', { score: [1, 0] })]} />)
    expect(screen.getByText('ZZZ')).toBeInTheDocument()
    expect(screen.getByText('YYY')).toBeInTheDocument()
  })

  it('picks a team from its row, and no-ops without a handler', async () => {
    const onPickTeam = vi.fn()
    const user = setup()

    const { unmount } = render(<TableView fixtures={RESULTS} onPickTeam={onPickTeam} />)
    await user.click(screen.getByRole('button', { name: 'Arsenal' }))
    expect(onPickTeam).toHaveBeenCalledWith('ARS')
    unmount()

    render(<TableView fixtures={RESULTS} />)
    await user.click(screen.getByRole('button', { name: 'Arsenal' }))
    expect(onPickTeam).toHaveBeenCalledTimes(1)
  })
})

/* ── The "on my services" filter ─────────────────────────────────────────── */

describe('FixturesView watch filter', () => {
  const withServices = (keys, props) => {
    localStorage.setItem('pl:services', JSON.stringify(keys))
    return render(
      <ServicesProvider>
        <Fixtures {...props} />
      </ServicesProvider>
    )
  }

  const LISTED = [
    fx('a', TODAY, 'LIV', 'MNC', { tv: ['Peacock'] }),
    fx('b', TODAY, 'ARS', 'CHE', { tv: ['CNBC'] }),
    fx('c', TODAY, 'TOT', 'EVE'), // no listing published yet
  ]

  it('narrows to matches the chosen services carry', () => {
    withServices(['peacock'], { fixtures: LISTED, tz: TZ, watchOnly: true })

    expect(screen.getByText('Liverpool')).toBeInTheDocument()
    // CNBC is not on Peacock, so that one goes.
    expect(screen.queryByText('Arsenal')).not.toBeInTheDocument()
  })

  it('keeps a match whose broadcaster has not been announced', () => {
    // Listings land only weeks ahead. Treating "unknown" as "cannot watch"
    // would empty most of the season.
    withServices(['peacock'], { fixtures: LISTED, tz: TZ, watchOnly: true })
    expect(screen.getByText('Spurs')).toBeInTheDocument()
  })

  it('is a no-op until services are chosen, so nothing vanishes', () => {
    withServices([], { fixtures: LISTED, tz: TZ, watchOnly: true })
    expect(screen.getByText('Liverpool')).toBeInTheDocument()
    expect(screen.getByText('Arsenal')).toBeInTheDocument()
  })

  it('shows the filter chip only once services are chosen', () => {
    const { unmount } = withServices([], { fixtures: LISTED, tz: TZ })
    expect(screen.queryByRole('button', { name: /On my services/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /My services/ })).toBeInTheDocument()
    unmount()

    withServices(['peacock', 'fubo'], { fixtures: LISTED, tz: TZ })
    expect(screen.getByRole('button', { name: /On my services \(2\)/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit services' })).toBeInTheDocument()
  })

  it('hands the toggles back to the shell', () => {
    const onToggleWatch = vi.fn()
    const onEditServices = vi.fn()
    withServices(['peacock'], { fixtures: LISTED, tz: TZ, onToggleWatch, onEditServices })

    fireEvent.click(screen.getByRole('button', { name: /On my services/ }))
    expect(onToggleWatch).toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Edit services' }))
    expect(onEditServices).toHaveBeenCalled()
  })
})
