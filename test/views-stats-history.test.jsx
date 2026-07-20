import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import StatsView from '../src/components/StatsView.jsx'
import HistoryView from '../src/components/HistoryView.jsx'

/**
 * View tests for StatsView and HistoryView.
 *
 * StatsView reads its player leaderboards straight from the committed data
 * module, so the module is mocked here: the interesting branches (a season
 * that lacks the chosen category, a player with no club, a leaderboard whose
 * top value is zero) cannot be produced by the real feed, which publishes a
 * full 25-row set for every category in every season. Fixture-derived parts
 * of the view take their data through props and use real clubs.
 */

const players = vi.hoisted(() => ({ PLAYER_STATS: {}, STAT_SEASONS: [], STAT_CATEGORIES: [] }))
vi.mock('../src/data/players.js', () => players)

const CATEGORIES = [
  { key: 'goals', label: 'Goals', short: 'G' },
  { key: 'assists', label: 'Assists', short: 'A' },
  { key: 'yellowCards', label: 'Yellow cards', short: 'YC', lowerIsBetter: true },
  { key: 'redCards', label: 'Red cards', short: 'RC', lowerIsBetter: true },
]

const freshStats = () => ({
  2025: {
    goals: [
      { id: 'p1', name: 'Erling Haaland', pos: 'F', team: 'MNC', value: 20 },
      { id: 'p2', name: 'Bukayo Saka', pos: 'F', team: 'ARS', value: 12 },
      // No club and no position: both are rendered conditionally.
      { id: 'p3', name: 'Unattached Trialist', value: 5 },
      // A club that has since been relegated is not in TEAM_BY_ABBR, so the
      // view has to fall back to the raw abbreviation.
      { id: 'p4', name: 'Departed Striker', pos: 'M', team: 'LEI', value: 3 },
    ],
    assists: [{ id: 'p2', name: 'Bukayo Saka', pos: 'F', team: 'ARS', value: 9 }],
    yellowCards: [{ id: 'p5', name: 'Rough Tackler', pos: 'D', team: 'CHE', value: 8 }],
    // Every entry on zero: the bar scale must not divide by it.
    redCards: [{ id: 'p6', name: 'Clean Defender', pos: 'D', team: 'LIV', value: 0 }],
  },
  2024: {
    goals: [{ id: 'q1', name: 'Mohamed Salah', pos: 'F', team: 'LIV', value: 18 }],
    assists: [{ id: 'q2', name: 'Cole Palmer', pos: 'M', team: 'CHE', value: 11 }],
  },
})

beforeEach(() => {
  // The mocked module object is shared by identity, so reset it in place.
  for (const key of Object.keys(players.PLAYER_STATS)) delete players.PLAYER_STATS[key]
  Object.assign(players.PLAYER_STATS, freshStats())
  players.STAT_SEASONS.splice(0, players.STAT_SEASONS.length, 2025, 2024)
  players.STAT_CATEGORIES.splice(0, players.STAT_CATEGORIES.length, ...CATEGORIES)
})

const played = (home, away, hg, ag, ko = '2025-08-16T14:00:00.000Z') => ({
  id: `${home}${away}`,
  ko,
  home,
  away,
  venue: 'Somewhere',
  city: 'Somewhere',
  score: [hg, ag],
})

const scheduled = (home, away) => ({
  id: `${home}${away}s`,
  ko: '2026-05-24T15:00:00.000Z',
  home,
  away,
  venue: 'Somewhere',
  city: 'Somewhere',
})

/* ── StatsView: season totals ──────────────────────────────────────────── */

describe('StatsView season totals', () => {
  it('says how many fixtures are still to come before a ball is kicked', () => {
    render(<StatsView fixtures={[scheduled('ARS', 'CHE'), scheduled('LIV', 'TOT')]} tz="UTC" />)

    expect(
      screen.getByText(/No matches played yet — 2 fixtures to come/)
    ).toBeInTheDocument()
    // The tiles are the alternative to this note; they must not both show.
    expect(screen.queryByText('Matches played')).not.toBeInTheDocument()
  })

  it('summarises results once matches have been played', () => {
    render(
      <StatsView
        tz="UTC"
        fixtures={[
          played('ARS', 'CHE', 2, 1), // home win
          played('LIV', 'TOT', 0, 0), // goalless draw, two clean sheets
          played('NEW', 'EVE', 1, 3), // away win
          scheduled('BOU', 'FUL'),
        ]}
      />
    )

    // "Goals" is also a leaderboard heading, so scope to the totals card.
    const card = screen.getByRole('heading', { name: 'This season' }).closest('.card')
    const tile = (label) => within(card).getByText(label).closest('.tile')

    expect(within(tile('Matches played')).getByText('3')).toBeInTheDocument()
    expect(within(tile('Matches played')).getByText('1 to go')).toBeInTheDocument()
    expect(within(tile('Goals')).getByText('7')).toBeInTheDocument()
    expect(within(tile('Goals')).getByText('2.3 per match')).toBeInTheDocument()
    expect(within(tile('Home wins')).getByText('33%')).toBeInTheDocument()
    expect(within(tile('Draws')).getByText('33%')).toBeInTheDocument()
    expect(within(tile('Away wins')).getByText('2 clean sheets')).toBeInTheDocument()
    expect(within(tile('Goalless draws')).getByText('1')).toBeInTheDocument()
  })
})

/* ── StatsView: leaderboards ───────────────────────────────────────────── */

describe('StatsView leaders', () => {
  const renderStats = (props = {}) => render(<StatsView fixtures={[]} tz="UTC" {...props} />)

  it('ranks the newest season and labels clubs, falling back to the abbreviation', () => {
    renderStats()

    const table = screen.getByRole('table', { name: /Goals leaders, 2025-26/ })
    const rows = within(table).getAllByRole('row').slice(1) // drop the header row
    expect(rows.map((r) => within(r).getAllByRole('cell')[0].textContent)).toEqual([
      '1',
      '2',
      '3',
      '4',
    ])

    expect(within(rows[0]).getByRole('button', { name: 'Man City' })).toBeInTheDocument()
    expect(within(rows[0]).getByText('F')).toBeInTheDocument()
    // No club: the cell is empty rather than showing a bare button.
    expect(within(rows[2]).queryByRole('button')).not.toBeInTheDocument()
    expect(within(rows[2]).queryByText('F')).not.toBeInTheDocument()
    // Unknown club abbreviation is shown verbatim.
    expect(within(rows[3]).getByRole('button', { name: 'LEI' })).toBeInTheDocument()
  })

  it('reports the club behind a leader when its badge is clicked', async () => {
    const onPickTeam = vi.fn()
    renderStats({ onPickTeam })

    await userEvent.click(screen.getByRole('button', { name: 'Man City' }))
    expect(onPickTeam).toHaveBeenCalledWith('MNC')
  })

  it('does not present a disciplinary tally as a ranking of merit', async () => {
    renderStats()
    expect(screen.queryByText(/a tally, not a ranking of merit/)).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Yellow cards' }))

    expect(screen.getByRole('heading', { name: 'Yellow cards' })).toBeInTheDocument()
    expect(screen.getByText(/Most yellow cards — a tally, not a ranking of merit/)).toBeInTheDocument()
    expect(screen.getByText('Rough Tackler')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Yellow cards' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
  })

  it('draws a full-width bar when every entry is on zero', async () => {
    const { container } = renderStats()
    await userEvent.click(screen.getByRole('button', { name: 'Red cards' }))

    // max falls back to 1 rather than dividing by zero, giving a 0% bar.
    expect(container.querySelector('.leaders .bar').style.getPropertyValue('--w')).toBe('0%')
    expect(screen.getByText('Clean Defender')).toBeInTheDocument()
  })

  it('switches season from the picker', async () => {
    renderStats()
    await userEvent.selectOptions(screen.getByRole('combobox'), '2024')

    expect(screen.getByText('Mohamed Salah')).toBeInTheDocument()
    expect(screen.queryByText('Erling Haaland')).not.toBeInTheDocument()
    expect(screen.getByRole('table', { name: /Goals leaders, 2024-25/ })).toBeInTheDocument()
  })

  it('falls back to the newest season that has the chosen category', async () => {
    renderStats()
    expect(screen.getByRole('combobox')).toHaveValue('2025')

    // Simulate a data refresh that drops assists from the selected season: the
    // panel must retarget rather than render an empty leaderboard.
    delete players.PLAYER_STATS[2025].assists
    await userEvent.click(screen.getByRole('button', { name: 'Assists' }))

    expect(screen.getByRole('combobox')).toHaveValue('2024')
    expect(screen.getByText('Cole Palmer')).toBeInTheDocument()
  })

  it('falls back to a generic heading for a category with no metadata', () => {
    // The panel opens on "goals" whether or not that key is described in
    // STAT_CATEGORIES, so the label lookup has to tolerate a miss.
    players.STAT_CATEGORIES.splice(0, 1)
    renderStats()

    expect(screen.getByRole('heading', { name: 'Leaders' })).toBeInTheDocument()
    expect(screen.getByText('Erling Haaland')).toBeInTheDocument()
    // No metadata means no disciplinary caveat and no short column label.
    expect(screen.queryByText(/a tally, not a ranking of merit/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Goals' })).not.toBeInTheDocument()
  })

  it('renders nothing at all when no season carries player data', () => {
    for (const key of Object.keys(players.PLAYER_STATS)) delete players.PLAYER_STATS[key]
    renderStats()

    expect(screen.queryByRole('heading', { name: 'Goals' })).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    // The rest of the view still renders.
    expect(screen.getByRole('heading', { name: 'Stats' })).toBeInTheDocument()
  })
})

/* ── StatsView: goal difference chart ──────────────────────────────────── */

describe('StatsView goal difference chart', () => {
  it('waits for results before drawing anything', () => {
    render(<StatsView fixtures={[scheduled('ARS', 'CHE')]} tz="UTC" />)

    expect(screen.getByRole('heading', { name: 'Attack and defence' })).toBeInTheDocument()
    expect(screen.getByText('Appears once clubs have played.')).toBeInTheDocument()
    expect(screen.queryByRole('table', { name: /Goal difference/ })).not.toBeInTheDocument()
  })

  it('signs each club’s margin and scales the arms symmetrically', async () => {
    const onPickTeam = vi.fn()
    const { container } = render(
      <StatsView
        tz="UTC"
        onPickTeam={onPickTeam}
        fixtures={[played('ARS', 'CHE', 3, 0), played('ZZZ', 'LIV', 1, 2)]}
      />
    )

    // Club names also appear in the leaderboard above, so scope to the chart.
    const chart = screen.getByRole('table', { name: 'Goal difference per match by club' })
    const row = (name) => within(chart).getByText(name).closest('.margin-row')

    expect(within(row('Arsenal')).getByText('+3.0')).toBeInTheDocument()
    expect(within(row('Chelsea')).getByText('−3.0')).toBeInTheDocument()
    expect(within(row('Liverpool')).getByText('+1.0')).toBeInTheDocument()
    // A club outside the current league still appears, under its abbreviation.
    expect(within(row('ZZZ')).getByText('−1.0')).toBeInTheDocument()

    // The widest margin takes the full 40% arm; a third of it takes a third.
    expect(row('Arsenal').querySelector('.margin-track').style.getPropertyValue('--w')).toBe('40%')
    expect(
      parseFloat(row('Liverpool').querySelector('.margin-track').style.getPropertyValue('--w'))
    ).toBeCloseTo(40 / 3, 6)
    expect(container.querySelectorAll('.margin-bar.pos')).toHaveLength(2)
    expect(container.querySelectorAll('.margin-bar.neg')).toHaveLength(2)

    // Scored / conceded per match, with the rank in the tooltip.
    expect(
      within(row('Arsenal')).getByTitle('3.0 scored per match (rank 1 of 4)')
    ).toBeInTheDocument()
    expect(
      within(row('Chelsea')).getByTitle('3.0 conceded per match (rank 4 of 4)')
    ).toBeInTheDocument()

    await userEvent.click(within(chart).getByText('Chelsea'))
    expect(onPickTeam).toHaveBeenCalledWith('CHE')
  })

  it('keeps a sane scale when every club is level on goal difference', () => {
    const { container } = render(<StatsView fixtures={[played('ARS', 'CHE', 1, 1)]} tz="UTC" />)
    const chart = screen.getByRole('table', { name: 'Goal difference per match by club' })

    // span would be 0, so it falls back to 1 and every bar collapses to zero.
    expect(within(chart).getAllByText('+0.0')).toHaveLength(2)
    expect(container.querySelectorAll('.margin-bar.neg')).toHaveLength(0)
    for (const track of container.querySelectorAll('.margin-track')) {
      expect(track.style.getPropertyValue('--w')).toBe('0%')
    }
  })
})

/* ── HistoryView ───────────────────────────────────────────────────────── */

describe('HistoryView by season', () => {
  it('shows the newest final table when no season is selected', () => {
    render(<HistoryView />)

    expect(screen.getByRole('combobox')).toHaveValue('2025')
    expect(screen.getByText(/champions, 2025-26/)).toBeInTheDocument()
    expect(screen.getByText(/· 20 clubs · 380 matches/)).toBeInTheDocument()
    expect(screen.getByRole('table', { name: /Final Premier League table, 2025-26/ }))
      .toBeInTheDocument()
  })

  it('falls back to the newest season for a year that never happened', () => {
    render(<HistoryView season={1066} />)
    expect(screen.getByRole('combobox')).toHaveValue('2025')
  })

  it('marks the champions and the bottom three, and signs goal difference', () => {
    render(<HistoryView season={2025} />)

    // The champion is also named in the summary line above the table.
    const table = screen.getByRole('table', { name: /Final Premier League table/ })
    const row = (club) => within(table).getByText(club).closest('tr')

    expect(row('Arsenal')).toHaveClass('zone-champions')
    expect(within(row('Arsenal')).getByTitle('Champions')).toBeInTheDocument()
    expect(within(row('Arsenal')).getByText('+44')).toBeInTheDocument()
    expect(row('Manchester City')).not.toHaveClass('zone-champions')
    expect(within(row('Manchester City')).queryByTitle('Champions')).not.toBeInTheDocument()

    // 18th of 20 is the first relegation place.
    expect(row('Tottenham Hotspur')).not.toHaveClass('zone-relegation')
    expect(row('West Ham United')).toHaveClass('zone-relegation')
    expect(row('Wolverhampton Wanderers')).toHaveClass('zone-relegation')
    expect(within(row('West Ham United')).getByText('-19')).toHaveClass('neg')
    expect(within(row('Arsenal')).getByText('+44')).toHaveClass('pos')
  })

  it('leaves a level goal difference unsigned and uncoloured', () => {
    render(<HistoryView season={1999} />)

    // Leicester City finished 1999-2000 with 55 scored and 55 conceded.
    const gd = within(screen.getByText('Leicester City').closest('tr')).getByText('0')
    expect(gd).not.toHaveClass('pos')
    expect(gd).not.toHaveClass('neg')
  })

  it('flags the 22-club seasons, whose points totals are not comparable', () => {
    const note = /ran with 22 clubs and a 42-match season until 1995/

    const { unmount } = render(<HistoryView season={1994} />)
    expect(screen.getByText(note)).toBeInTheDocument()
    expect(screen.getAllByRole('row')).toHaveLength(23) // 22 clubs plus the header

    // 1995-96 was the first 20-club season, so the caveat must disappear.
    unmount()
    render(<HistoryView season={1995} />)
    expect(screen.queryByText(note)).not.toBeInTheDocument()
    expect(screen.getAllByRole('row')).toHaveLength(21)
  })

  it('reports a season change to the caller as a number', async () => {
    const onSeason = vi.fn()
    render(<HistoryView season={2025} onSeason={onSeason} />)

    await userEvent.selectOptions(screen.getByRole('combobox'), '1995')
    expect(onSeason).toHaveBeenCalledWith(1995)
  })

  it('survives a season change with no handler attached', async () => {
    render(<HistoryView season={2025} />)
    await userEvent.selectOptions(screen.getByRole('combobox'), '1995')
    // Uncontrolled: the view keeps showing the season it was given.
    expect(screen.getByRole('combobox')).toHaveValue('2025')
  })
})

describe('HistoryView all-time', () => {
  it('ranks every club by total points and shows titles only where won', async () => {
    render(<HistoryView />)
    await userEvent.click(screen.getByRole('button', { name: 'All-time' }))

    expect(screen.getByText(/1992-93 to 2025-26, ranked by total points/)).toBeInTheDocument()

    const united = screen.getByText('Manchester United').closest('tr')
    const cells = within(united).getAllByRole('cell')
    expect(cells[0]).toHaveTextContent('1')
    expect(cells[8]).toHaveTextContent('2614')
    expect(cells[9]).toHaveTextContent('2.00') // points per match, two decimals
    expect(cells[10]).toHaveTextContent('13') // titles

    // A club that has never won it leaves the trophy column blank.
    const spurs = within(screen.getByText('Tottenham Hotspur').closest('tr')).getAllByRole('cell')
    expect(spurs[10].textContent).toBe('')

    // Only one mode is on screen at a time.
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })
})

describe('HistoryView by club', () => {
  const openByClub = async () => {
    render(<HistoryView />)
    await userEvent.click(screen.getByRole('button', { name: 'By club' }))
  }

  it('opens on the first club alphabetically', async () => {
    await openByClub()

    expect(screen.getByRole('combobox')).toHaveValue('AFC Bournemouth')
    expect(screen.getByText(/9 seasons/)).toBeInTheDocument()
    expect(screen.getByRole('table', { name: 'AFC Bournemouth finishing position by season' }))
      .toBeInTheDocument()
  })

  it('uses the singular for a club that lasted one season', async () => {
    await openByClub()
    await userEvent.selectOptions(screen.getByRole('combobox'), 'Barnsley')

    expect(document.querySelector('.season-summary').textContent).toMatch(/^1 season\b/)
    expect(screen.getAllByRole('row')).toHaveLength(1)
  })

  it('marks a title-winning season and a relegation season differently', async () => {
    await openByClub()
    await userEvent.selectOptions(screen.getByRole('combobox'), 'Leicester City')

    expect(screen.getByText(/18 seasons/)).toBeInTheDocument()
    expect(screen.getByText(/best 1st · worst 21st/)).toBeInTheDocument()

    const bar = (label) => screen.getByText(label).closest('.club-row').querySelector('.club-bar')

    expect(bar('2015-16')).toHaveClass('is-champ') // won the league
    expect(bar('1994-95')).toHaveClass('is-down') // 21st of 22
    expect(bar('1996-97')).not.toHaveClass('is-champ')
    expect(bar('1996-97')).not.toHaveClass('is-down')

    // ordinal(): 21 takes its suffix from the tens rule, 12 and 13 are the
    // exceptions that must stay "th", and 1 is the plain case.
    const chart = screen.getByRole('table', { name: /Leicester City/ })
    expect(within(chart).getByText('1st')).toBeInTheDocument()
    expect(within(chart).getByText('21st')).toBeInTheDocument()
    expect(within(chart).getByText('12th')).toBeInTheDocument()
    expect(within(chart).getByText('13th')).toBeInTheDocument()

    // Higher finishes get longer bars: 1st of 20 is the full track.
    expect(
      screen.getByText('2015-16').closest('.club-row').querySelector('.club-track').style
        .getPropertyValue('--w')
    ).toBe('100%')
  })

  it('renders the low ordinals a champion never reaches', async () => {
    await openByClub()
    await userEvent.selectOptions(screen.getByRole('combobox'), 'Manchester United')

    const chart = screen.getByRole('table', { name: /Manchester United/ })
    for (const label of ['1st', '2nd', '3rd', '4th']) {
      expect(within(chart).getAllByText(label).length).toBeGreaterThan(0)
    }
  })
})

describe('HistoryView all-time goal difference of exactly zero', () => {
  /**
   * No club in 34 seasons has scored exactly as many as it conceded, so the
   * unsigned/uncoloured branch of the all-time table is only reachable with a
   * substituted history.
   */
  it('leaves a level all-time record unsigned', async () => {
    vi.resetModules()
    vi.doMock('../src/data/history.js', () => {
      const HISTORY = [
        {
          year: 1992,
          label: '1992-93',
          champion: 'Alpha',
          teams: 22,
          matches: 462,
          table: [
            { team: 'Alpha', played: 42, won: 24, drawn: 12, lost: 6, gf: 67, ga: 31, gd: 36, points: 84, pos: 1 },
            { team: 'Level', played: 42, won: 18, drawn: 10, lost: 14, gf: 50, ga: 50, gd: 0, points: 64, pos: 2 },
            { team: 'Omega', played: 42, won: 5, drawn: 5, lost: 32, gf: 20, ga: 70, gd: -50, points: 20, pos: 22 },
          ],
        },
      ]
      return {
        HISTORY,
        HISTORY_BY_YEAR: Object.fromEntries(HISTORY.map((s) => [s.year, s])),
        HISTORY_YEARS: HISTORY.map((s) => s.year),
      }
    })

    try {
      const { default: MockedHistoryView } = await import('../src/components/HistoryView.jsx')
      render(<MockedHistoryView />)
      await userEvent.click(screen.getByRole('button', { name: 'All-time' }))

      const gd = (club) => within(screen.getByText(club).closest('tr')).getAllByRole('cell')[7]
      expect(gd('Level')).toHaveTextContent('0')
      expect(gd('Level')).not.toHaveClass('pos')
      expect(gd('Level')).not.toHaveClass('neg')
      expect(gd('Alpha')).toHaveTextContent('+36')
      expect(gd('Omega')).toHaveTextContent('-50')
    } finally {
      vi.doUnmock('../src/data/history.js')
      vi.resetModules()
    }
  })
})
