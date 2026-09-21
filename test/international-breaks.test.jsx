import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// MatchDetail pulls team sheets over the network when it opens; Lineups has its
// own suite, and an unawaited fetch here would only add act() noise.
vi.mock('../src/components/Lineups.jsx', () => ({ default: () => null }))

import BreakNote from '../src/components/BreakNote.jsx'
import FixturesView from '../src/components/FixturesView.jsx'
import MatchDetail from '../src/components/MatchDetail.jsx'
import TeamPanel from '../src/components/TeamPanel.jsx'
import WeekView from '../src/components/WeekView.jsx'
import { findBreaks } from '../src/utils/breaks.js'

/**
 * The international break, everywhere it shows up.
 *
 * A window empties two or three weekends, and every view has its own way of
 * making that disappear: the fixture list jumps a fortnight between two day
 * headings, the week pager skips the blank weeks entirely, a club's next
 * fixtures sit three weeks apart, and the banner counts down to a match
 * eighteen days out. Each case below is one of those silences, and what it
 * asserts is that the app says something in it.
 */

const TZ = 'Europe/London'

// Four clubs, two matches a day, so each match-day is a matchweek of its own.
// The hole between 19 September and 10 October is the September window.
const fx = (id, ko, home, away, extra = {}) => ({
  id,
  ko,
  home,
  away,
  venue: 'Ground',
  city: 'Town',
  ...extra,
})

const MW1 = '2026-09-12T14:00:00.000Z'
const MW2 = '2026-09-19T14:00:00.000Z'
const MW3 = '2026-10-10T14:00:00.000Z'
const MW4 = '2026-10-17T14:00:00.000Z'

const SEASON = [
  fx('a1', MW1, 'ARS', 'LIV'),
  fx('a2', MW1, 'CHE', 'EVE'),
  fx('b1', MW2, 'LIV', 'CHE'),
  fx('b2', MW2, 'EVE', 'ARS'),
  fx('c1', MW3, 'ARS', 'CHE'),
  fx('c2', MW3, 'LIV', 'EVE'),
  fx('d1', MW4, 'CHE', 'ARS'),
  fx('d2', MW4, 'EVE', 'LIV'),
]

// Two Mondays: one before the window opens, one in the middle of it.
const BEFORE = new Date('2026-09-14T09:00:00.000Z')
const DURING = new Date('2026-09-28T09:00:00.000Z')

const notes = () => [...document.querySelectorAll('.break-note')]
// The running order of the page, which is the whole point of a note that
// explains a gap: it has to sit IN the gap.
const sequence = (selector) =>
  [...document.querySelectorAll(selector)].map((el) =>
    el.classList.contains('break-note') ? 'break' : el.textContent
  )

const at = (now) => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now })
  })
  afterEach(() => {
    vi.useRealTimers()
  })
}

// FixturesView is controlled by the shell; this stands in for that half.
function Fixtures(props) {
  const [showPast, setShowPast] = useState(false)
  return (
    <FixturesView
      onlyFollowed={false}
      onToggleFollowed={() => {}}
      showPast={showPast}
      onTogglePast={() => setShowPast((v) => !v)}
      fixtures={SEASON}
      tz={TZ}
      {...props}
    />
  )
}

describe('BreakNote', () => {
  const [gap] = findBreaks(SEASON, TZ)

  it('says how long the league is away and when it is back', () => {
    render(<BreakNote gap={gap} tz={TZ} />)

    expect(screen.getByText(/International break/)).toBeInTheDocument()
    expect(
      screen.getByText(/20 days without a Premier League match · back on Saturday, 10 October 2026/)
    ).toBeInTheDocument()
    // A break still to come is not counted down to; only the one being lived through is.
    expect(document.querySelector('.bn-countdown')).toBeNull()
    expect(document.querySelector('.break-note')).not.toHaveClass('is-active')
  })

  it('counts down the break the viewer is actually sitting in', () => {
    vi.useFakeTimers({ now: DURING })
    render(<BreakNote gap={gap} tz={TZ} active />)

    expect(document.querySelector('.break-note')).toHaveClass('is-active')
    // 28 September, 09:00, to the first kickoff back on 10 October.
    expect(document.querySelector('.bn-countdown')).toHaveTextContent('12d 5h')
    vi.useRealTimers()
  })
})

describe('the fixture list', () => {
  at(BEFORE)

  it('marks the break between the two day sections it separates', () => {
    render(<Fixtures />)

    expect(notes()).toHaveLength(1)
    expect(notes()[0]).toHaveTextContent('20 days without a Premier League match')
    // Between the last day before the window and the first day back — and not
    // tacked onto the end of the list after the final day.
    expect(sequence('.day .day-name, .break-note')).toEqual([
      'Saturday, 19 September 2026',
      'break',
      'Saturday, 10 October 2026',
      'Saturday, 17 October 2026',
    ])
  })

  it('explains the jump between two collapsed matchweeks', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<Fixtures />)
    await user.click(screen.getByRole('button', { name: 'Played' }))

    expect(sequence('.month-head span:nth-child(2), .break-note')).toEqual([
      'Matchweek 1',
      'Matchweek 2',
      'break',
      'Matchweek 3',
      'Matchweek 4',
    ])
  })
})

describe('the fixture list during a break', () => {
  at(DURING)

  it('leads with the break rather than with a fortnight-long countdown', () => {
    render(<Fixtures />)

    // One note, above the next-match banner, counting down to the return. The
    // days either side of the window are past, so nothing repeats it in the list.
    expect(notes()).toHaveLength(1)
    expect(notes()[0]).toHaveClass('is-active')
    expect(notes()[0].nextElementSibling).toHaveClass('nextmatch')
    expect(notes()[0]).toHaveTextContent('back on Saturday, 10 October 2026')
  })
})

describe('the week grid', () => {
  at(BEFORE)

  const nextWeek = () => screen.getByRole('button', { name: 'Next week' })

  it('captions the weeks it skips over', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<WeekView fixtures={SEASON} tz={TZ} onOpen={() => {}} />)

    // The week the window opens in: the note follows the grid, because the
    // break is what happens next.
    expect(notes()).toHaveLength(1)
    expect(notes()[0].previousElementSibling).toHaveClass('week-grid')

    // One click forward is three weeks later on the calendar. The same note
    // now leads the week, which is the week the league comes back in.
    await user.click(nextWeek())
    expect(screen.getByText('October 2026')).toBeInTheDocument()
    expect(notes()).toHaveLength(1)
    expect(notes()[0].nextElementSibling).toHaveClass('week-grid')

    // An ordinary week says nothing.
    await user.click(nextWeek())
    expect(notes()).toHaveLength(0)
  })
})

describe('a club’s drawer', () => {
  // Arsenal's own fixtures either side of the window, one already played.
  const ARSENAL = [fx('p', MW1, 'ARS', 'LIV', { score: [1, 0] }), ...SEASON.slice(2)]

  it('breaks up the run of next fixtures where the window falls', () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: BEFORE })
    render(<TeamPanel abbr="ARS" fixtures={ARSENAL} tz={TZ} onClose={() => {}} />)

    const list = within(screen.getByText('Next up').closest('section'))
    expect(list.getByText(/20 days without a Premier League match/)).toBeInTheDocument()
    // Directly after the away trip to Everton, the club's last match before it.
    expect(notes()[0].closest('li').previousElementSibling).toHaveTextContent('Everton')
    vi.useRealTimers()
  })

  it('opens the run with the break when the club is in one', () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: DURING })
    render(<TeamPanel abbr="ARS" fixtures={ARSENAL} tz={TZ} onClose={() => {}} />)

    const first = screen.getByText('Next up').closest('section').querySelector('li')
    expect(first).toHaveClass('tp-break')
    expect(within(first).getByText(/back on Saturday, 10 October 2026/)).toBeInTheDocument()
    expect(first.querySelector('.break-note')).toHaveClass('is-active')
    vi.useRealTimers()
  })
})

describe('a match popout', () => {
  const open = (id) =>
    render(
      <MatchDetail
        fixture={SEASON.find((f) => f.id === id)}
        fixtures={SEASON}
        tz={TZ}
        onClose={() => {}}
      />
    )

  it('says when a match is the last before the window', () => {
    open('b1')
    expect(screen.getByText('International break').nextSibling).toHaveTextContent(
      'Last match before 20 days without a fixture'
    )
  })

  it('says when a match is the first one back', () => {
    open('c1')
    expect(screen.getByText('International break').nextSibling).toHaveTextContent(
      'First match back, after 20 days without a fixture'
    )
  })

  it('says nothing about a match in an ordinary week', () => {
    open('d1')
    expect(screen.queryByText('International break')).toBeNull()
  })
})
