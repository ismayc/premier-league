import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import FixturesView from './components/FixturesView.jsx'
import WeekView from './components/WeekView.jsx'
import TableView from './components/TableView.jsx'
import StatsView from './components/StatsView.jsx'
import HistoryView from './components/HistoryView.jsx'
import MatchDetail from './components/MatchDetail.jsx'
import TeamPanel from './components/TeamPanel.jsx'
import CalendarModal from './components/CalendarModal.jsx'
import { FIXTURES } from './data/fixtures.js'
import { SEASON_LABEL } from './data/teams.js'
import { applyLive, fetchLive } from './services/espn.js'
import { readState, writeState } from './utils/urlState.js'
import { COMMON_ZONES, detectZone } from './utils/time.js'

/**
 * The shell: one impure boundary (the live poll), one merge, and everything
 * downstream a pure function of the merged fixture list.
 *
 * There is no router and no state library. The set of things a viewer can
 * choose — which view, which timezone, which club, whether to hide scores —
 * is small enough to live in useState and serialise into the query string,
 * which has the useful property that any state worth reaching is shareable.
 */

const VIEWS = [
  { id: 'fixtures', label: 'Fixtures' },
  { id: 'week', label: 'Week' },
  { id: 'table', label: 'Table' },
  { id: 'stats', label: 'Stats' },
  { id: 'history', label: 'History' },
]

const LIVE_REFRESH_MS = 30_000
const IDLE_REFRESH_MS = 120_000

export default function App() {
  const detected = useMemo(() => detectZone(), [])
  const initial = useMemo(() => readState(), [])

  const [view, setView] = useState(initial.view)
  const [tz, setTz] = useState(initial.tz)
  const [hideScores, setHideScores] = useState(initial.hide)
  const [season, setSeason] = useState(initial.season)
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'dark')

  const [live, setLive] = useState(null)
  const [detail, setDetail] = useState(null)
  const [teamPanel, setTeamPanel] = useState(initial.team)
  const [showCalendar, setShowCalendar] = useState(false)

  // The single merge. Every view below is a pure function of `fixtures`.
  const fixtures = useMemo(() => applyLive(FIXTURES, live), [live])

  const liveCount = useMemo(() => fixtures.filter((f) => f.live).length, [fixtures])
  const seasonOver = useMemo(
    () => fixtures.every((f) => f.score || f.unplayed),
    [fixtures]
  )

  /* ── URL + theme persistence ─────────────────────────────────────────── */

  useEffect(() => {
    writeState({ view, tz, team: teamPanel, hide: hideScores, season }, detected)
  }, [view, tz, teamPanel, hideScores, season, detected])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try {
      localStorage.setItem('pl:theme', theme)
    } catch {
      // Non-persistent storage; the theme still applies for this session.
    }
  }, [theme])

  /* ── Live polling ────────────────────────────────────────────────────── */

  const load = useCallback(async (signal) => {
    try {
      setLive(await fetchLive({ signal }))
    } catch {
      // Offline, rate-limited, or a feed hiccup. The committed fixture list
      // still renders — the app is stale, not broken.
    }
  }, [])

  useEffect(() => {
    if (seasonOver) return
    const ctrl = new AbortController()
    load(ctrl.signal)
    const every = liveCount ? LIVE_REFRESH_MS : IDLE_REFRESH_MS
    const id = setInterval(() => load(ctrl.signal), every)
    return () => {
      ctrl.abort()
      clearInterval(id)
    }
  }, [load, liveCount, seasonOver])

  /* ── Handlers ────────────────────────────────────────────────────────── */

  const openTeam = useCallback((abbr) => {
    setDetail(null)
    setTeamPanel(abbr)
  }, [])

  const zones = useMemo(
    () => (COMMON_ZONES.includes(detected) ? COMMON_ZONES : [detected, ...COMMON_ZONES]),
    [detected]
  )

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <h1>Premier League</h1>
          <span className="season">{SEASON_LABEL.replace(' English Premier League', '')}</span>
          {liveCount > 0 && (
            <span className="live-pill">
              <span className="mc-live-dot" aria-hidden="true" />
              {liveCount} live
            </span>
          )}
        </div>

        <div className="topbar-tools">
          <label className="tz-pick">
            <span className="sr-only">Timezone</span>
            <select value={tz} onChange={(e) => setTz(e.target.value)}>
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            className={`chip ${hideScores ? 'on' : ''}`}
            onClick={() => setHideScores((v) => !v)}
            aria-pressed={hideScores}
            title="Hide scores until you open a match"
          >
            {hideScores ? 'Scores hidden' : 'Scores shown'}
          </button>

          <button
            type="button"
            className="chip"
            onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          >
            {theme === 'dark' ? '☀' : '☾'}
          </button>
        </div>
      </header>

      <nav className="views" aria-label="Views">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            className={`view-btn ${view === v.id ? 'active' : ''}`}
            onClick={() => setView(v.id)}
            aria-current={view === v.id ? 'page' : undefined}
          >
            {v.label}
          </button>
        ))}
      </nav>

      {view === 'fixtures' && (
        <FixturesView
          fixtures={fixtures}
          tz={tz}
          hideScores={hideScores}
          onOpen={setDetail}
          onPickTeam={openTeam}
          onExport={() => setShowCalendar(true)}
        />
      )}
      {view === 'week' && (
        <WeekView fixtures={fixtures} tz={tz} hideScores={hideScores} onOpen={setDetail} />
      )}
      {view === 'table' && <TableView fixtures={fixtures} onPickTeam={openTeam} />}
      {view === 'stats' && <StatsView fixtures={fixtures} onPickTeam={openTeam} />}
      {view === 'history' && <HistoryView season={season} onSeason={setSeason} />}

      {detail && (
        <MatchDetail
          fixture={detail}
          fixtures={fixtures}
          tz={tz}
          hideScores={hideScores}
          onClose={() => setDetail(null)}
          onPickTeam={openTeam}
        />
      )}
      {teamPanel && (
        <TeamPanel
          abbr={teamPanel}
          fixtures={fixtures}
          tz={tz}
          hideScores={hideScores}
          onClose={() => setTeamPanel(null)}
          onOpen={(f) => {
            setTeamPanel(null)
            setDetail(f)
          }}
        />
      )}
      {showCalendar && (
        <CalendarModal fixtures={fixtures} onClose={() => setShowCalendar(false)} />
      )}

      <footer className="foot">
        <p>
          Unofficial. Fixtures and player statistics from ESPN; historical tables computed from{' '}
          <a href="https://github.com/openfootball/england" rel="noreferrer noopener" target="_blank">
            openfootball
          </a>{' '}
          results. Not affiliated with the Premier League.
        </p>
      </footer>
    </div>
  )
}
