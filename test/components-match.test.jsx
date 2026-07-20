import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// MatchDetail renders team sheets, which fetch when the match is opened.
// These tests are about the detail panel itself, and an unawaited async state
// update from a child turns every one of them into an act() warning. Lineups
// has its own suite, so it is stubbed out here.
vi.mock('../src/components/Lineups.jsx', () => ({ default: () => null }))
import TeamLogo from '../src/components/TeamLogo.jsx'
import MatchCard from '../src/components/MatchCard.jsx'
import MatchDetail from '../src/components/MatchDetail.jsx'
import TeamPanel from '../src/components/TeamPanel.jsx'
import CalendarModal from '../src/components/CalendarModal.jsx'
import { FollowProvider, useFollow } from '../src/context/follow.jsx'

/**
 * The fixture views. These are the components a visitor actually reads a
 * result off, so the cases below are the ones where a wrong branch shows a
 * wrong fact: a score leaking past the spoiler guard, a live clock missing,
 * the wrong club marked as the winner, a historical finish rendered "21th".
 */

/* ------------------------------------------------------------------ *
 * Data doubles.
 *
 * The committed data modules are a snapshot of one particular moment: no
 * club in the current league has exactly one prior season, none is missing
 * from the historical tables under its full name, and no scorer row carries
 * an appearance count. Those combinations are all things the components
 * handle, and the only honest way to exercise them is to feed the component
 * a different snapshot. Each double defaults to the real data so a test that
 * does not care gets the real thing.
 * ------------------------------------------------------------------ */
const doubles = vi.hoisted(() => ({ history: null, stats: null, seasons: null, table: null }))

vi.mock('../src/data/history.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    get HISTORY() {
      return doubles.history ?? actual.HISTORY
    },
  }
})

vi.mock('../src/data/players.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    get PLAYER_STATS() {
      return doubles.stats ?? actual.PLAYER_STATS
    },
    get STAT_SEASONS() {
      return doubles.seasons ?? actual.STAT_SEASONS
    },
  }
})

vi.mock('../src/utils/table.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    buildTable: (...args) => (doubles.table ? doubles.table(...args) : actual.buildTable(...args)),
  }
})

beforeEach(() => {
  doubles.history = null
  doubles.stats = null
  doubles.seasons = null
  doubles.table = null
})

/* ------------------------------------------------------------------ *
 * Fixture helpers
 * ------------------------------------------------------------------ */

const HOUR = 3600_000
const DAY = 24 * HOUR

const at = (offsetMs) => new Date(Date.now() + offsetMs).toISOString()

let seq = 0
const fixture = (props) => ({
  id: `f${++seq}`,
  ko: at(2 * DAY),
  home: 'ARS',
  away: 'CHE',
  ...props,
})

/** Seed the persisted follow list, which FollowProvider reads on first render. */
const following = (...abbrs) => localStorage.setItem('pl:followed', JSON.stringify(abbrs))

const withFollow = (ui) => render(<FollowProvider>{ui}</FollowProvider>)

/* ------------------------------------------------------------------ *
 * TeamLogo
 * ------------------------------------------------------------------ */

describe('TeamLogo', () => {
  it('renders both theme variants so switching theme cannot re-request an image', () => {
    const { container } = render(<TeamLogo abbr="ARS" />)

    const light = container.querySelector('.logo-light')
    const dark = container.querySelector('.logo-dark')
    expect(light).toHaveAttribute('src', expect.stringContaining('logos/eng.arsenal.png'))
    expect(dark).toHaveAttribute('src', expect.stringContaining('logos/eng.arsenal-dark.png'))

    // Decorative: the club name is always adjacent in text.
    expect(light).toHaveAttribute('aria-hidden', 'true')
    expect(container.querySelector('.logo')).toHaveStyle({ width: '22px', height: '22px' })
  })

  it('honours an explicit size', () => {
    const { container } = render(<TeamLogo abbr="LIV" size={48} />)
    expect(container.querySelector('.logo')).toHaveStyle({ width: '48px', height: '48px' })
  })

  it('reserves the same box for a club it has no crest for', () => {
    // A feed can name a club the committed team list has never seen; the
    // layout must not jump because of it.
    const { container } = render(<TeamLogo abbr="ZZZ" size={30} />)
    const missing = container.querySelector('.logo-missing')
    expect(missing).toBeInTheDocument()
    expect(missing).toHaveStyle({ width: '30px', height: '30px' })
    expect(container.querySelector('img')).toBeNull()
  })
})

/* ------------------------------------------------------------------ *
 * MatchCard
 * ------------------------------------------------------------------ */

describe('MatchCard', () => {
  it('shows a kickoff time for a fixture that has not started', () => {
    const { container } = render(
      <MatchCard fixture={fixture({ ko: '2026-08-21T19:00:00.000Z' })} tz="Europe/London" />
    )

    expect(container.querySelector('.mc-ko')).toHaveTextContent('20:00')
    // The zone abbreviation sits beneath the time in the when-column.
    expect(container.querySelector('.mc-zone')).toBeInTheDocument()
    expect(container.querySelector('.mc-score')).toBeNull()
    expect(container.querySelector('.mc')).not.toHaveClass('is-live', 'is-off', 'is-tracked')
  })

  it('shows the postponement reason instead of a time when a match is off', () => {
    const { container } = render(
      <MatchCard fixture={fixture({ unplayed: 'Postponed' })} tz="Europe/London" />
    )

    expect(screen.getByText('Postponed')).toHaveClass('mc-off-badge')
    expect(container.querySelector('.mc')).toHaveClass('is-off')
    expect(container.querySelector('.mc-ko')).toBeNull()
  })

  it('shows the live clock while a match is in progress', () => {
    const { container } = render(
      <MatchCard fixture={fixture({ live: true, clock: "67'", score: [1, 0] })} tz="Europe/London" />
    )

    expect(container.querySelector('.mc-live-badge')).toHaveTextContent("67'")
    expect(container.querySelector('.mc')).toHaveClass('is-live')
  })

  it('falls back to a generic live label when the feed sends no clock', () => {
    // ESPN drops `clock` at half time; the card must still read as in-progress.
    const { container } = render(
      <MatchCard fixture={fixture({ live: true, score: [1, 0] })} tz="Europe/London" />
    )
    expect(container.querySelector('.mc-live-badge')).toHaveTextContent('Live')
  })

  it('shows the score and marks the winning side once a match is finished', () => {
    const { container } = render(
      <MatchCard fixture={fixture({ home: 'ARS', away: 'CHE', score: [2, 0] })} tz="Europe/London" />
    )

    expect(container.querySelector('.mc-ft')).toHaveTextContent('FT')
    expect([...container.querySelectorAll('.mc-score')].map((n) => n.textContent)).toEqual(['2', '0'])
    // The winner styling is on the whole side row, not the club button.
    expect(screen.getByText('Arsenal').closest('.mc-side')).toHaveClass('is-winner')
    expect(screen.getByText('Chelsea').closest('.mc-side')).not.toHaveClass('is-winner')
  })

  it('marks the away side as the winner when it wins', () => {
    render(<MatchCard fixture={fixture({ score: [0, 3] })} tz="Europe/London" />)
    expect(screen.getByText('Chelsea').closest('.mc-side')).toHaveClass('is-winner')
    expect(screen.getByText('Arsenal').closest('.mc-side')).not.toHaveClass('is-winner')
  })

  it('marks neither side on a draw', () => {
    render(<MatchCard fixture={fixture({ score: [1, 1] })} tz="Europe/London" />)
    expect(screen.getByText('Arsenal').closest('.mc-side')).not.toHaveClass('is-winner')
    expect(screen.getByText('Chelsea').closest('.mc-side')).not.toHaveClass('is-winner')
  })

  it('withholds the score and shows the kickoff time when scores are hidden', () => {
    // Spoiler-free: a finished match reads as an ordinary upcoming card —
    // its kickoff time, no score, and no "FT" that would hint it is over.
    const { container } = render(
      <MatchCard fixture={fixture({ score: [2, 0], ko: '2026-08-21T19:00:00.000Z' })} tz="Europe/London" hideScores />
    )

    expect(container.querySelector('.mc-score')).toBeNull()
    expect(container.querySelector('.mc-ft')).toBeNull()
    expect(container.querySelector('.mc-ko')).toHaveTextContent('20:00')
  })

  it('shows the venue and where to watch beneath the clubs', () => {
    const { container } = render(
      <MatchCard
        fixture={fixture({
          venue: 'Emirates Stadium',
          city: 'London',
          tv: ['Sky Sports', 'NBC', 'Peacock', 'Extra Channel'],
        })}
        tz="Europe/London"
      />
    )

    const meta = container.querySelector('.mc-meta')
    expect(meta).toHaveTextContent('Emirates Stadium, London')
    // Broadcasters are capped at three so a long list can't blow out the card.
    expect(container.querySelector('.mc-tv')).toHaveTextContent('Sky Sports · NBC · Peacock')
    expect(container.querySelector('.mc-tv')).not.toHaveTextContent('Extra Channel')
  })

  it('shows the venue without a city when the feed omits one', () => {
    const { container } = render(
      <MatchCard fixture={fixture({ venue: 'Somewhere' })} tz="Europe/London" />
    )
    expect(container.querySelector('.mc-meta')).toHaveTextContent('Somewhere')
    expect(container.querySelector('.mc-tv')).toBeNull()
  })

  it('counts down only for a match that kicks off soon', () => {
    const { container } = render(
      <MatchCard fixture={fixture({ ko: at(3 * HOUR) })} tz="Europe/London" />
    )
    expect(container.querySelector('.mc-countdown')).toHaveTextContent(/in \d/)
  })

  it('does not count down a fixture that is still days away', () => {
    const { container } = render(
      <MatchCard fixture={fixture({ ko: at(5 * DAY) })} tz="Europe/London" />
    )
    expect(container.querySelector('.mc-countdown')).toBeNull()
  })

  it('falls back to the abbreviation for a club it does not know', () => {
    render(<MatchCard fixture={fixture({ home: 'ZZZ' })} tz="Europe/London" />)
    expect(screen.getByRole('button', { name: /ZZZ versus Chelsea, details/ })).toBeInTheDocument()
  })

  it('marks followed clubs on both the card and the side', () => {
    following('CHE')
    const { container } = withFollow(<MatchCard fixture={fixture({})} tz="Europe/London" />)

    // The card as a whole is tracked if *either* club is followed...
    expect(container.querySelector('.mc')).toHaveClass('is-tracked')
    expect(screen.getByText('Chelsea').closest('.mc-side')).toHaveClass('is-followed')
    expect(screen.getByText('Arsenal').closest('.mc-side')).not.toHaveClass('is-followed')
  })

  it('gives each club its own star, reporting that club’s state', () => {
    // A single star could not say which club it followed: the old one sat at
    // the away club's edge, toggled the home club, and took its filled styling
    // from "either club is followed" while its icon and aria-pressed reported
    // the home club — so it could render filled while announcing unpressed.
    following('CHE')
    withFollow(<MatchCard fixture={fixture({})} tz="Europe/London" />)

    const homeStar = screen.getByRole('button', { name: 'Follow Arsenal' })
    const awayStar = screen.getByRole('button', { name: 'Follow Chelsea' })

    expect(homeStar).toHaveAttribute('aria-pressed', 'false')
    expect(homeStar).not.toHaveClass('on')
    expect(homeStar).toHaveTextContent('☆')

    expect(awayStar).toHaveAttribute('aria-pressed', 'true')
    expect(awayStar).toHaveClass('on')
    expect(awayStar).toHaveTextContent('★')
  })

  it('follows the club whose star was pressed, not the home club', async () => {
    // The regression that mattered: pressing the right-hand star used to
    // follow the left-hand club.
    const user = userEvent.setup()
    withFollow(<MatchCard fixture={fixture({})} tz="Europe/London" />)

    await user.click(screen.getByRole('button', { name: 'Follow Chelsea' }))

    expect(screen.getByRole('button', { name: 'Follow Chelsea' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    expect(screen.getByRole('button', { name: 'Follow Arsenal' })).toHaveAttribute(
      'aria-pressed',
      'false'
    )
    expect(JSON.parse(localStorage.getItem('pl:followed'))).toEqual(['CHE'])
  })

  it('unfollows a club when its star is pressed again', async () => {
    const user = userEvent.setup()
    following('ARS')
    withFollow(<MatchCard fixture={fixture({})} tz="Europe/London" />)

    const homeStar = screen.getByRole('button', { name: 'Follow Arsenal' })
    expect(homeStar).toHaveAttribute('aria-pressed', 'true')

    await user.click(homeStar)

    expect(screen.getByRole('button', { name: 'Follow Arsenal' })).toHaveAttribute(
      'aria-pressed',
      'false'
    )
    expect(JSON.parse(localStorage.getItem('pl:followed'))).toEqual([])
  })

  it('picks a team without also opening the fixture', async () => {
    // Both handlers sit on nested buttons; without stopPropagation a tap on a
    // club would open the match detail on top of the team panel.
    const user = userEvent.setup()
    const onOpen = vi.fn()
    const onPickTeam = vi.fn()
    const f = fixture({})
    render(<MatchCard fixture={f} tz="Europe/London" onOpen={onOpen} onPickTeam={onPickTeam} />)

    await user.click(screen.getByText('Arsenal'))

    expect(onPickTeam).toHaveBeenCalledWith('ARS')
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('opens the fixture when the card itself is pressed', async () => {
    const user = userEvent.setup()
    const onOpen = vi.fn()
    const f = fixture({})
    render(<MatchCard fixture={f} tz="Europe/London" onOpen={onOpen} />)

    await user.click(screen.getByRole('button', { name: /Arsenal versus Chelsea, details/ }))
    expect(onOpen).toHaveBeenCalledWith(f)
  })

  it('does nothing when no handlers are supplied', async () => {
    const user = userEvent.setup()
    render(<MatchCard fixture={fixture({})} tz="Europe/London" />)

    await user.click(screen.getByText('Arsenal'))
    await user.click(screen.getByRole('button', { name: /Arsenal versus Chelsea, details/ }))
    expect(screen.getByText('Arsenal')).toBeInTheDocument()
  })

  it('toggles following the home club from the star', async () => {
    const user = userEvent.setup()
    const { container } = withFollow(<MatchCard fixture={fixture({})} tz="Europe/London" />)
    const star = screen.getByRole('button', { name: 'Follow Arsenal' })

    expect(star).toHaveTextContent('☆')
    await user.click(star)
    expect(star).toHaveTextContent('★')
    expect(star).toHaveAttribute('aria-pressed', 'true')
    expect(container.querySelector('.mc')).toHaveClass('is-tracked')

    await user.click(star)
    expect(star).toHaveTextContent('☆')
    expect(container.querySelector('.mc')).not.toHaveClass('is-tracked')
  })
})

/* ------------------------------------------------------------------ *
 * MatchDetail
 * ------------------------------------------------------------------ */

describe('MatchDetail', () => {
  it('renders nothing without a fixture', () => {
    const { container } = render(<MatchDetail fixture={null} fixtures={[]} tz="Europe/London" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the score, full-time badge, and both kickoff zones', () => {
    render(
      <MatchDetail
        fixture={fixture({ ko: '2026-08-21T19:00:00.000Z', score: [2, 1] })}
        fixtures={[]}
        tz="America/New_York"
      />
    )

    expect(screen.getByText('2–1')).toBeInTheDocument()
    expect(screen.getByText('Full time')).toBeInTheDocument()
    // UK time is shown alongside the local conversion so the card can be
    // checked against any published fixture list.
    const kickoff = document.querySelector('.md-facts dd')
    expect(kickoff).toHaveTextContent('Friday, 21 August 2026, 15:00')
    expect(kickoff).toHaveTextContent('· 20:00 UK')
  })

  it('shows "v" instead of a score when scores are hidden', () => {
    render(
      <MatchDetail
        fixture={fixture({ score: [2, 1] })}
        fixtures={[]}
        tz="Europe/London"
        hideScores
      />
    )
    expect(screen.getByText('v')).toBeInTheDocument()
    expect(screen.queryByText('2–1')).toBeNull()
    // A finished match is still declared finished — only the score is withheld.
    expect(screen.getByText('Full time')).toBeInTheDocument()
  })

  it('shows a live badge with the clock, and a generic one without', () => {
    const { unmount } = render(
      <MatchDetail
        fixture={fixture({ live: true, score: [1, 1], clock: "45+2'" })}
        fixtures={[]}
        tz="Europe/London"
      />
    )
    expect(screen.getByText("45+2'")).toHaveClass('md-live')
    expect(screen.queryByText('Full time')).toBeNull()
    unmount()

    render(
      <MatchDetail
        fixture={fixture({ live: true, score: [1, 1] })}
        fixtures={[]}
        tz="Europe/London"
      />
    )
    expect(screen.getByText('Live')).toHaveClass('md-live')
  })

  it('shows the postponement reason for an unplayed match', () => {
    render(
      <MatchDetail
        fixture={fixture({ unplayed: 'Abandoned' })}
        fixtures={[]}
        tz="Europe/London"
      />
    )
    expect(screen.getByText('Abandoned')).toHaveClass('md-off')
    expect(screen.queryByText('Starts in')).toBeNull()
  })

  it('counts down only for a match that is still to come', () => {
    render(
      <MatchDetail
        fixture={fixture({ ko: at(2 * DAY + 3 * HOUR + 60_000) })}
        fixtures={[]}
        tz="Europe/London"
      />
    )
    expect(screen.getByText('Starts in')).toBeInTheDocument()
    expect(screen.getByText('2d 3h')).toBeInTheDocument()
  })

  it('drops the countdown once kickoff has passed even with no score in yet', () => {
    // A match can sit past its kickoff with nothing published; a negative
    // countdown would be worse than none.
    render(
      <MatchDetail fixture={fixture({ ko: at(-HOUR) })} fixtures={[]} tz="Europe/London" />
    )
    expect(screen.queryByText('Starts in')).toBeNull()
  })

  it('shows venue, city, and broadcasters when the feed carries them', () => {
    render(
      <MatchDetail
        fixture={fixture({ venue: 'Emirates Stadium', city: 'London', tv: ['Sky Sports', 'USA'] })}
        fixtures={[]}
        tz="Europe/London"
      />
    )
    expect(screen.getByText('Emirates Stadium')).toBeInTheDocument()
    expect(screen.getByText(/· London/)).toBeInTheDocument()
    expect(screen.getByText('Sky Sports, USA')).toBeInTheDocument()
  })

  it('omits the optional rows the feed left out', () => {
    render(<MatchDetail fixture={fixture({ venue: 'Anfield' })} fixtures={[]} tz="Europe/London" />)

    expect(screen.getByText('Anfield')).toBeInTheDocument()
    expect(screen.queryByText(/·\s*London/)).toBeNull()
    expect(screen.queryByText('Television')).toBeNull()
  })

  it('omits the venue row entirely when there is no venue', () => {
    render(<MatchDetail fixture={fixture({})} fixtures={[]} tz="Europe/London" />)
    expect(screen.queryByText('Venue')).toBeNull()
  })

  it('names an unknown club by its abbreviation', () => {
    render(<MatchDetail fixture={fixture({ away: 'ZZZ' })} fixtures={[]} tz="Europe/London" />)
    expect(screen.getByRole('dialog', { name: 'Arsenal versus ZZZ' })).toBeInTheDocument()
  })

  it('lists earlier meetings between the same clubs, either way round', () => {
    const sameWayRound = fixture({ home: 'ARS', away: 'CHE', score: [2, 2], ko: at(-40 * DAY) })
    const earlier = fixture({ home: 'CHE', away: 'ARS', score: [1, 3], ko: at(-30 * DAY) })
    const other = fixture({ home: 'LIV', away: 'ARS', score: [0, 0], ko: at(-20 * DAY) })
    const unplayedMeeting = fixture({ home: 'CHE', away: 'ARS', ko: at(-10 * DAY) })
    const current = fixture({ home: 'ARS', away: 'CHE' })

    render(
      <MatchDetail
        fixture={current}
        fixtures={[sameWayRound, earlier, other, unplayedMeeting, current]}
        tz="Europe/London"
      />
    )

    expect(screen.getByText('Earlier this season')).toBeInTheDocument()
    expect(screen.getByText(/Chelsea 1–3 Arsenal/)).toBeInTheDocument()
    expect(screen.getByText(/Arsenal 2–2 Chelsea/)).toBeInTheDocument()
    // Only meetings between these two, only ones with a result.
    expect(screen.queryByText(/Liverpool/)).toBeNull()
  })

  it('withholds the head-to-head score when scores are hidden', () => {
    const earlier = fixture({ home: 'CHE', away: 'ARS', score: [1, 3], ko: at(-30 * DAY) })
    const current = fixture({ home: 'ARS', away: 'CHE' })

    render(
      <MatchDetail
        fixture={current}
        fixtures={[earlier, current]}
        tz="Europe/London"
        hideScores
      />
    )
    expect(screen.getByText(/Chelsea · Arsenal/)).toBeInTheDocument()
  })

  it('omits the head-to-head section when the clubs have not met yet', () => {
    render(<MatchDetail fixture={fixture({})} fixtures={[]} tz="Europe/London" />)
    expect(screen.queryByText('Earlier this season')).toBeNull()
  })

  it('closes from the close button and from the backdrop, but not from the dialog', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const { container } = render(
      <MatchDetail fixture={fixture({})} fixtures={[]} tz="Europe/London" onClose={onClose} />
    )

    await user.click(screen.getByRole('dialog'))
    expect(onClose).not.toHaveBeenCalled()

    await user.click(container.querySelector('.modal-backdrop'))
    expect(onClose).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('picks either club from the scoreline', async () => {
    const user = userEvent.setup()
    const onPickTeam = vi.fn()
    const { rerender } = render(
      <MatchDetail
        fixture={fixture({})}
        fixtures={[]}
        tz="Europe/London"
        onPickTeam={onPickTeam}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Arsenal' }))
    await user.click(screen.getByRole('button', { name: 'Chelsea' }))
    expect(onPickTeam.mock.calls).toEqual([['ARS'], ['CHE']])

    // Without a handler the buttons are inert rather than throwing.
    rerender(<MatchDetail fixture={fixture({})} fixtures={[]} tz="Europe/London" />)
    await user.click(screen.getByRole('button', { name: 'Arsenal' }))
    expect(onPickTeam).toHaveBeenCalledTimes(2)
  })
})

/* ------------------------------------------------------------------ *
 * TeamPanel
 * ------------------------------------------------------------------ */

const result = (home, away, hg, ag, ko) => fixture({ home, away, score: [hg, ag], ko })

describe('TeamPanel', () => {
  it('renders nothing for a club that is not in the league', () => {
    const { container } = render(<TeamPanel abbr="ZZZ" fixtures={[]} tz="Europe/London" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('summarises the season, form, results, and next fixtures', async () => {
    const user = userEvent.setup()
    const onOpen = vi.fn()
    const next = fixture({ home: 'ARS', away: 'LIV', ko: at(3 * DAY) })
    const fixtures = [
      result('ARS', 'CHE', 3, 0, at(-30 * DAY)),
      result('EVE', 'ARS', 1, 1, at(-20 * DAY)),
      result('ARS', 'TOT', 0, 2, at(-10 * DAY)),
      next,
      fixture({ home: 'ARS', away: 'NEW', unplayed: 'Postponed', ko: at(5 * DAY) }),
    ]

    render(
      <TeamPanel abbr="ARS" fixtures={fixtures} tz="Europe/London" onOpen={onOpen} />
    )

    expect(screen.getByRole('dialog', { name: 'Arsenal' })).toBeInTheDocument()
    expect(screen.getByText('W-D-L').previousSibling).toHaveTextContent('1-1-1')
    expect(screen.getByText('3 played')).toBeInTheDocument()
    expect(screen.getByText('4 for, 3 against')).toBeInTheDocument()
    // Goal difference is signed so a positive figure reads as positive.
    expect(screen.getByText('Goal difference').previousSibling).toHaveTextContent('+1')
    expect(screen.getByText('Home').previousSibling).toHaveTextContent('1-0-1')
    expect(screen.getByText('Away').previousSibling).toHaveTextContent('0-1-0')

    // Form reads oldest to newest.
    expect([...document.querySelectorAll('.form-strip i')].map((n) => n.textContent)).toEqual([
      'W',
      'D',
      'L',
    ])

    // Recent results are newest first, with the result letter and H/A marker.
    const recents = within(screen.getByText('Recent results').closest('section')).getAllByRole(
      'button'
    )
    expect(recents[0]).toHaveTextContent('LHSpurs0–2')
    expect(recents[1]).toHaveTextContent('DAEverton1–1')
    expect(recents[2]).toHaveTextContent('WHChelsea3–0')

    // An unplayed fixture is neither a result nor "next up".
    const upcoming = within(screen.getByText('Next up').closest('section')).getAllByRole('button')
    expect(upcoming).toHaveLength(1)
    expect(upcoming[0]).toHaveTextContent('Liverpool')

    await user.click(upcoming[0])
    expect(onOpen).toHaveBeenCalledWith(next)
  })

  it('shows a dash for a split the club has no matches in, and a negative goal difference', () => {
    // Every away fixture: the home column has nothing to report.
    render(
      <TeamPanel
        abbr="ARS"
        fixtures={[result('CHE', 'ARS', 3, 0, at(-10 * DAY))]}
        tz="Europe/London"
      />
    )

    expect(screen.getByText('Home').previousSibling).toHaveTextContent('—')
    expect(screen.getByText('Away').previousSibling).toHaveTextContent('0-0-1')
    expect(screen.getByText('Goal difference').previousSibling).toHaveTextContent('-3')
  })

  it('shows a dash for the away split when every match has been at home', () => {
    render(
      <TeamPanel
        abbr="ARS"
        fixtures={[result('ARS', 'CHE', 1, 0, at(-10 * DAY))]}
        tz="Europe/London"
      />
    )
    expect(screen.getByText('Away').previousSibling).toHaveTextContent('—')
  })

  it('omits the season section, results, and next up for a club with nothing yet', () => {
    doubles.stats = {}
    doubles.seasons = []
    render(<TeamPanel abbr="ARS" fixtures={[]} tz="Europe/London" />)

    expect(screen.queryByText('This season')).toBeNull()
    expect(screen.queryByText('Recent results')).toBeNull()
    expect(screen.queryByText('Next up')).toBeNull()
    expect(screen.queryByText(/Leading scorers/)).toBeNull()
  })

  it('withholds recent scores when scores are hidden, showing the date instead', () => {
    render(
      <TeamPanel
        abbr="ARS"
        fixtures={[result('ARS', 'ZZZ', 4, 0, '2026-08-21T19:00:00.000Z')]}
        tz="Europe/London"
        hideScores
      />
    )

    const row = within(screen.getByText('Recent results').closest('section')).getByRole('button')
    expect(row).toHaveTextContent('Fri 21 Aug 20:00')
    expect(row).not.toHaveTextContent('4–0')
    // An unknown opponent falls back to its abbreviation.
    expect(row).toHaveTextContent('ZZZ')
  })

  it('survives a fixture row with no open handler', async () => {
    const user = userEvent.setup()
    render(
      <TeamPanel abbr="ARS" fixtures={[result('ARS', 'CHE', 1, 0, at(-DAY))]} tz="Europe/London" />
    )
    await user.click(within(screen.getByText('Recent results').closest('section')).getByRole('button'))
    expect(screen.getByText('Recent results')).toBeInTheDocument()
  })

  it('hides the season section when the table has no row for the club', () => {
    // Defensive: the table is derived, and a club with no row must not crash
    // the drawer that the rest of the panel still has content for.
    doubles.table = () => []
    render(
      <TeamPanel abbr="ARS" fixtures={[result('ARS', 'CHE', 1, 0, at(-DAY))]} tz="Europe/London" />
    )
    expect(screen.queryByText('This season')).toBeNull()
    expect(screen.getByText('Recent results')).toBeInTheDocument()
  })

  it('omits the form strip when a row reports matches but no form', () => {
    doubles.table = () => [
      {
        abbr: 'ARS',
        pos: 1,
        points: 3,
        played: 1,
        won: 1,
        drawn: 0,
        lost: 0,
        gf: 1,
        ga: 0,
        gd: 1,
        home: { played: 1, won: 1, drawn: 0, lost: 0 },
        away: { played: 0, won: 0, drawn: 0, lost: 0 },
        form: [],
      },
    ]
    render(<TeamPanel abbr="ARS" fixtures={[]} tz="Europe/London" />)

    expect(screen.getByText('This season')).toBeInTheDocument()
    expect(document.querySelector('.form-strip')).toBeNull()
  })

  it('counts historical seasons and titles from the committed tables', () => {
    render(<TeamPanel abbr="ARS" fixtures={[]} tz="Europe/London" />)
    expect(screen.getByText('34 Premier League seasons · 4 titles')).toBeInTheDocument()
    expect(screen.getByText('Every season')).toBeInTheDocument()
  })

  it('falls back to the short club name when the full name is not in the tables', () => {
    // Published tables and the feed disagree on club names ("Man City" vs
    // "Manchester City"); the panel tries both rather than showing nothing.
    doubles.history = [
      { year: 2001, label: '2001-02', teams: 20, table: [{ team: 'Man City', pos: 1, points: 90 }] },
    ]
    render(<TeamPanel abbr="MNC" fixtures={[]} tz="Europe/London" />)

    expect(screen.getByText('1 Premier League season · 1 title')).toBeInTheDocument()
    expect(screen.getByText('Champions')).toHaveClass('pos')
  })

  it('says only "Premier League" for a club with no history at all', () => {
    doubles.history = []
    render(<TeamPanel abbr="ARS" fixtures={[]} tz="Europe/London" />)

    expect(screen.getByText('Premier League')).toBeInTheDocument()
    expect(screen.queryByText('Every season')).toBeNull()
  })

  it('drops the title count for a club that has never won it', () => {
    doubles.history = [
      { year: 2001, label: '2001-02', teams: 20, table: [{ team: 'Arsenal', pos: 5, points: 70 }] },
    ]
    render(<TeamPanel abbr="ARS" fixtures={[]} tz="Europe/London" />)
    expect(screen.getByText('1 Premier League season')).toBeInTheDocument()
  })

  it('renders every finishing position with the right ordinal suffix', () => {
    // "21st", not "21th": the suffix table is easy to get wrong past twenty,
    // and 1994-95 was a 22-club season, so those positions really occur.
    doubles.history = [
      { year: 1994, label: '1994-95', teams: 22, table: [{ team: 'Arsenal', pos: 21, points: 29 }] },
      { year: 1995, label: '1995-96', teams: 20, table: [{ team: 'Arsenal', pos: 11, points: 46 }] },
      { year: 1996, label: '1996-97', teams: 20, table: [{ team: 'Arsenal', pos: 2, points: 78 }] },
      { year: 1997, label: '1997-98', teams: 20, table: [{ team: 'Arsenal', pos: 1, points: 78 }] },
    ]
    render(<TeamPanel abbr="ARS" fixtures={[]} tz="Europe/London" />)

    expect(screen.getByText('4 Premier League seasons · 1 title')).toBeInTheDocument()
    // Newest season first.
    const seasons = [...document.querySelectorAll('.tp-seasons li')].map((li) => li.textContent)
    expect(seasons).toEqual([
      '1997-98Champions78 pts',
      '1996-972nd78 pts',
      '1995-9611th46 pts',
      '1994-9521st29 pts',
    ])

    expect(screen.getByText('21st')).toHaveClass('neg')
    expect(screen.getByText('2nd').className).toBe('')
    expect(screen.getByText('Champions')).toHaveClass('pos')
  })

  it('shows the most recent season in which the club had a scorer', () => {
    render(<TeamPanel abbr="ARS" fixtures={[]} tz="Europe/London" />)

    expect(screen.getByText(/Leading scorers/)).toHaveTextContent('2025-26')
    const players = [...document.querySelectorAll('.tp-players li')]
    expect(players.length).toBeGreaterThan(0)
    expect(players.length).toBeLessThanOrEqual(5)
    // Real rows carry no appearance count, so only the goal total is shown.
    expect(players[0]).toHaveTextContent(/^.+\d+ goals$/)
  })

  it('skips seasons with no data for the club and reports appearances when known', () => {
    // STAT_SEASONS is derived from whatever the stats fetch committed, so a
    // listed season can be empty or missing its goals table entirely.
    doubles.seasons = [2027, 2026, 2025]
    doubles.stats = {
      2027: { assists: [] },
      2025: {
        goals: [
          { id: 'p1', name: 'A Striker', team: 'ARS', value: 1, matches: 12 },
          { id: 'p2', name: 'B Striker', team: 'CHE', value: 9, matches: null },
        ],
      },
    }
    render(<TeamPanel abbr="ARS" fixtures={[]} tz="Europe/London" />)

    expect(screen.getByText(/Leading scorers/)).toHaveTextContent('2025-26')
    const players = [...document.querySelectorAll('.tp-players li')]
    expect(players).toHaveLength(1)
    expect(players[0]).toHaveTextContent('A Striker1 goal in 12')
  })

  it('omits leading scorers for a club with none in any season', () => {
    render(<TeamPanel abbr="COV" fixtures={[]} tz="Europe/London" />)
    expect(screen.queryByText(/Leading scorers/)).toBeNull()
  })

  it('follows and unfollows the club from the drawer', async () => {
    const user = userEvent.setup()
    withFollow(<TeamPanel abbr="ARS" fixtures={[]} tz="Europe/London" />)
    const chip = screen.getByRole('button', { name: '☆ Follow' })

    await user.click(chip)
    expect(screen.getByRole('button', { name: '★ Following' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )

    await user.click(screen.getByRole('button', { name: '★ Following' }))
    expect(screen.getByRole('button', { name: '☆ Follow' })).toBeInTheDocument()
  })

  it('closes from the close button and the backdrop, but not from the drawer', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const { container } = render(
      <TeamPanel abbr="ARS" fixtures={[]} tz="Europe/London" onClose={onClose} />
    )

    await user.click(screen.getByRole('dialog'))
    expect(onClose).not.toHaveBeenCalled()

    await user.click(container.querySelector('.modal-backdrop'))
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})

/* ------------------------------------------------------------------ *
 * CalendarModal
 * ------------------------------------------------------------------ */

/** jsdom's Blob has no text(); FileReader is the portable way to read one. */
const readBlob = (blob) =>
  new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.readAsText(blob)
  })

describe('CalendarModal', () => {
  let clicks
  let blobs

  beforeEach(() => {
    clicks = []
    blobs = []
    // jsdom has no object-URL support; the export path needs one to hand an
    // anchor, and the anchor click is the only observable side effect.
    URL.createObjectURL = vi.fn((blob) => {
      blobs.push(blob)
      return 'blob:calendar'
    })
    URL.revokeObjectURL = vi.fn()
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click() {
      clicks.push({ href: this.href, download: this.download })
    })
  })

  afterEach(() => {
    delete URL.createObjectURL
    delete URL.revokeObjectURL
  })

  const soon = fixture({ home: 'ARS', away: 'CHE', ko: at(2 * DAY), venue: 'Emirates Stadium' })
  const later = fixture({ home: 'LIV', away: 'TOT', ko: at(5 * DAY) })
  const gone = fixture({ home: 'EVE', away: 'ARS', ko: at(-5 * DAY), score: [1, 2] })
  const all = [soon, later, gone]

  it('defaults to every club and cannot narrow to followed when nothing is followed', () => {
    render(<CalendarModal fixtures={all} onClose={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Every club' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    expect(screen.getByRole('button', { name: 'Followed only' })).toBeDisabled()
    // Past fixtures are excluded by default.
    expect(screen.getByText(/Downloads a file of 2 fixtures/)).toBeInTheDocument()
  })

  it('includes past fixtures when the upcoming-only filter is unticked', async () => {
    const user = userEvent.setup()
    render(<CalendarModal fixtures={all} onClose={vi.fn()} />)

    const check = screen.getByRole('checkbox', { name: /Upcoming fixtures only/ })
    expect(check).toBeChecked()

    await user.click(check)
    expect(check).not.toBeChecked()
    expect(screen.getByText(/Downloads a file of 3 fixtures/)).toBeInTheDocument()
  })

  it('opens on the followed scope and lists the followed clubs', () => {
    following('ARS', 'ZZZ')
    withFollow(<CalendarModal fixtures={all} onClose={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Followed only' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    // An abbreviation with no club record still names itself.
    expect(screen.getByText('Arsenal, ZZZ')).toBeInTheDocument()
    expect(screen.getByText(/Downloads a file of 1 fixture\./)).toBeInTheDocument()
  })

  it('switches back to every club', async () => {
    const user = userEvent.setup()
    following('ARS')
    withFollow(<CalendarModal fixtures={all} onClose={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Every club' }))
    expect(screen.queryByText('Arsenal')).toBeNull()
    expect(screen.getByText(/Downloads a file of 2 fixtures/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Followed only' }))
    expect(screen.getByText('Arsenal')).toBeInTheDocument()
    expect(screen.getByText(/Downloads a file of 1 fixture\./)).toBeInTheDocument()
  })

  it('falls back to every fixture if the last club is unfollowed while the dialog is open', async () => {
    // Following is global state; it can change under the dialog. Narrowing to
    // an empty follow list would silently export nothing.
    const user = userEvent.setup()
    following('ARS')

    function Harness() {
      const { toggle } = useFollow()
      return (
        <>
          <button type="button" onClick={() => toggle('ARS')}>
            unfollow elsewhere
          </button>
          <CalendarModal fixtures={all} onClose={vi.fn()} />
        </>
      )
    }
    render(
      <FollowProvider>
        <Harness />
      </FollowProvider>
    )

    expect(screen.getByText(/Downloads a file of 1 fixture\./)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'unfollow elsewhere' }))
    expect(screen.getByRole('button', { name: 'Followed only' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    expect(screen.queryByText('Arsenal')).toBeNull()
    expect(screen.getByText(/Downloads a file of 2 fixtures/)).toBeInTheDocument()
  })

  it('disables the download when the filters leave nothing to export', () => {
    render(<CalendarModal fixtures={[gone]} onClose={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Download .ics' })).toBeDisabled()
  })

  it('downloads the selected fixtures and closes', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<CalendarModal fixtures={all} onClose={onClose} />)

    await user.click(screen.getByRole('button', { name: 'Download .ics' }))

    expect(clicks).toEqual([{ href: 'blob:calendar', download: 'premier-league.ics' }])
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:calendar')
    // The anchor is a transient: it must not be left in the document.
    expect(document.querySelector('a[download]')).toBeNull()

    const text = await readBlob(blobs[0])
    expect(text).toContain('BEGIN:VCALENDAR')
    expect(text).toContain('X-WR-CALNAME:Premier League')
    expect(text).toContain('SUMMARY:Arsenal v Chelsea')
    expect(text).not.toContain('Everton v Arsenal')

    expect(onClose).toHaveBeenCalled()
  })

  it('names the calendar after the followed clubs', async () => {
    const user = userEvent.setup()
    following('ARS')
    withFollow(<CalendarModal fixtures={all} />)

    await user.click(screen.getByRole('button', { name: 'Download .ics' }))

    const text = await readBlob(blobs[0])
    expect(text).toContain('X-WR-CALNAME:Premier League — Arsenal')
    expect(text).toContain('SUMMARY:Arsenal v Chelsea')
    expect(text).not.toContain('Liverpool v Spurs')
  })

  it('closes from the close button and the backdrop, but not from the dialog', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const { container } = render(<CalendarModal fixtures={all} onClose={onClose} />)

    await user.click(screen.getByRole('dialog'))
    expect(onClose).not.toHaveBeenCalled()

    await user.click(container.querySelector('.modal-backdrop'))
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  const FEED = 'https://premier-league-viewer.netlify.app/calendar.ics'

  it('offers an "All clubs" subscribe row with webcal + Google links', () => {
    render(<CalendarModal fixtures={all} onClose={vi.fn()} />)
    expect(screen.getByText('All clubs')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Subscribe' })[0]).toHaveAttribute(
      'href',
      'webcal://premier-league-viewer.netlify.app/calendar.ics'
    )
    expect(screen.getAllByRole('link', { name: 'Google' })[0].getAttribute('href')).toBe(
      'https://www.google.com/calendar/render?cid=webcal://premier-league-viewer.netlify.app/calendar.ics'
    )
  })

  it('adds a "Followed" subscribe row carrying a ?teams= filter when following', () => {
    following('ARS', 'LIV')
    withFollow(<CalendarModal fixtures={all} onClose={vi.fn()} />)
    expect(screen.getByText('Followed (2)')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Subscribe' }).at(-1)).toHaveAttribute(
      'href',
      'webcal://premier-league-viewer.netlify.app/calendar.ics?teams=ARS,LIV'
    )
  })

  it('shows no "Followed" subscribe row when nothing is followed', () => {
    render(<CalendarModal fixtures={all} onClose={vi.fn()} />)
    expect(screen.queryByText(/^Followed \(/)).toBeNull()
  })

  it('copies the feed URL and flips the label to "Copied!" then back', async () => {
    vi.useFakeTimers()
    const writeText = vi.fn().mockResolvedValue()
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    render(<CalendarModal fixtures={all} onClose={vi.fn()} />)

    const copy = screen.getAllByRole('button', { name: 'Copy URL' })[0]
    await act(async () => {
      fireEvent.click(copy)
    })
    expect(writeText).toHaveBeenCalledWith(FEED)
    expect(copy).toHaveTextContent('Copied!')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500)
    })
    expect(copy).toHaveTextContent('Copy URL')

    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('leaves the copy label unchanged when the clipboard write is rejected', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    })
    render(<CalendarModal fixtures={all} onClose={vi.fn()} />)

    const copy = screen.getAllByRole('button', { name: 'Copy URL' })[0]
    await user.click(copy)
    expect(copy).toHaveTextContent('Copy URL')

    vi.unstubAllGlobals()
  })
})
