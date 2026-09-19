import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../../src/App.jsx'
import { FollowProvider } from '../../src/context/follow.jsx'
import { ServicesProvider } from '../../src/context/services.jsx'
import { FIXTURES } from '../../src/data/fixtures.js'
import { TEAMS } from '../../src/data/teams.js'
import { HISTORY } from '../../src/data/history.js'
import MatchDetail from '../../src/components/MatchDetail.jsx'
import TeamPanel from '../../src/components/TeamPanel.jsx'
import HistoryView from '../../src/components/HistoryView.jsx'
import StatsView from '../../src/components/StatsView.jsx'

// LIVE suite (npm run test:data): the whole site, mounted on the real refreshed data.
//
// The main suite used to do this job by accident: its test files imported the live
// modules, so data that broke a view failed something. Those tests read frozen data now,
// and this file does the job on purpose. It asserts nothing about WHAT the season looks
// like, only that every view renders it and that nothing on screen is the residue of a
// bad value.

// What a broken value looks like once it reaches the DOM. 1969/1970 is `new Date(null)`,
// which printed a TBC tip as December 31, 1969 in the FIBA sibling.
const RESIDUE = /\bNaN\b|\bundefined\b|\bnull\b|Invalid Date|\[object Object\]|\b19(69|70)\b/

const wrap = (ui) => (
  <FollowProvider>
    <ServicesProvider>{ui}</ServicesProvider>
  </FollowProvider>
)

const mount = async () => {
  const utils = render(wrap(<App />))
  await act(async () => {})
  return utils
}

// App renders the whole 380-fixture season on every interaction.
vi.setConfig({ testTimeout: 120_000 })

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
  localStorage.clear()
  // hide=0: spoiler-free is on by default here, and a masked score would hide exactly
  // the values this file exists to look at.
  window.history.replaceState(null, '', '/?hide=0')
  // The live poll, the team sheets, and the player cards all fetch. A failed response
  // is the path every service already handles, so it keeps them inert and offline.
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }))
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('every view renders the refreshed data', () => {
  it.each(['Fixtures', 'Week', 'Table', 'Stats', 'History'])('%s', async (label) => {
    const { container } = await mount()
    await userEvent.click(screen.getAllByRole('button', { name: label })[0])
    const main = container.querySelector('main') ?? container
    expect(main.textContent.length).toBeGreaterThan(0)
    expect(main.textContent).not.toMatch(RESIDUE)
  })

  it('shows the whole season, past days included, without residue', async () => {
    window.history.replaceState(null, '', '/?past=1&hide=0')
    const { container } = await mount()
    expect(container.textContent).not.toMatch(RESIDUE)
  })
})

describe('every match and every club opens', () => {
  it('renders the match dialog for every fixture on the board', () => {
    for (const fixture of FIXTURES) {
      const { container, unmount } = render(
        wrap(
          <MatchDetail
            fixture={fixture}
            fixtures={FIXTURES}
            tz="Europe/London"
            hideScores={false}
            onClose={() => {}}
            onPickTeam={() => {}}
          />
        )
      )
      expect(container.textContent, `fixture ${fixture.id}`).not.toMatch(RESIDUE)
      unmount()
    }
  })

  it('renders the club panel for every club', () => {
    for (const t of TEAMS) {
      const { container, unmount } = render(
        wrap(
          <TeamPanel
            abbr={t.abbr}
            fixtures={FIXTURES}
            tz="Europe/London"
            hideScores={false}
            onClose={() => {}}
            onOpen={() => {}}
          />
        )
      )
      expect(container.textContent, `club ${t.abbr}`).not.toMatch(RESIDUE)
      unmount()
    }
  })
})

describe('every season of every board', () => {
  it('renders each historical season, the all-time table, and every club record', () => {
    for (const s of HISTORY) {
      const { container, unmount } = render(<HistoryView season={s.year} onSeason={() => {}} />)
      expect(container.textContent, s.label).not.toMatch(RESIDUE)
      unmount()
    }
    const { container } = render(<HistoryView season={HISTORY.at(-1).year} onSeason={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'All-time' }))
    expect(container.textContent, 'all-time').not.toMatch(RESIDUE)
    fireEvent.click(screen.getByRole('button', { name: 'By club' }))
    const select = container.querySelector('select')
    for (const option of [...select.options]) {
      fireEvent.change(select, { target: { value: option.value } })
      expect(container.textContent, `club ${option.value}`).not.toMatch(RESIDUE)
    }
  })

  it('renders every leaderboard in every season that has it', () => {
    const { container } = render(<StatsView fixtures={FIXTURES} onPickTeam={() => {}} />)
    const leaders = () => screen.getByRole('group', { name: 'Statistic' }).closest('section')
    const seasons = [...within(leaders()).getByRole('combobox').options].map((o) => o.value)
    expect(seasons.length).toBeGreaterThan(0)
    for (const season of seasons) {
      fireEvent.click(within(leaders()).getByRole('button', { name: 'Goals' }))
      fireEvent.change(within(leaders()).getByRole('combobox'), { target: { value: season } })
      const pills = within(screen.getByRole('group', { name: 'Statistic' })).getAllByRole('button')
      for (const pill of pills.map((p) => p.textContent)) {
        fireEvent.click(within(leaders()).getByRole('button', { name: pill }))
        expect(container.textContent, `${season} ${pill}`).not.toMatch(RESIDUE)
      }
    }
  })
})
