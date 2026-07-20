import { useMemo, useState } from 'react'
import { HISTORY, HISTORY_BY_YEAR } from '../data/history.js'
import { allTimeRecord, clubHistory } from '../utils/stats.js'

/**
 * Every final Premier League table since 1992-93.
 *
 * These tables are computed from match results by scripts/fetch-history.mjs
 * rather than copied from a published table, and the same ordering rules run
 * over them as over the current season — so a 1994-95 table and this
 * afternoon's table are directly comparable.
 *
 * Two caveats are surfaced in the UI rather than hidden: the first three
 * seasons had 22 clubs and 42 matches, and the European qualification bands
 * shown for the current season did not exist for most of this history, so the
 * historical tables are deliberately not zone-coloured beyond champion and
 * relegated.
 */

const MODES = [
  { key: 'season', label: 'By season' },
  { key: 'alltime', label: 'All-time' },
  { key: 'club', label: 'By club' },
]

export default function HistoryView({ season, onSeason }) {
  const [mode, setMode] = useState('season')

  return (
    <main className="view">
      <div className="view-head">
        <h2>History</h2>
        <div className="view-tools" role="group" aria-label="History mode">
          {MODES.map((m) => (
            <button
              key={m.key}
              type="button"
              className={`chip ${mode === m.key ? 'on' : ''}`}
              onClick={() => setMode(m.key)}
              aria-pressed={mode === m.key}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {mode === 'season' && <SeasonTable season={season} onSeason={onSeason} />}
      {mode === 'alltime' && <AllTime />}
      {mode === 'club' && <ByClub />}
    </main>
  )
}

/* ── One season's final table ──────────────────────────────────────────── */

function SeasonTable({ season, onSeason }) {
  const years = HISTORY.map((s) => s.year).sort((a, b) => b - a)
  const year = HISTORY_BY_YEAR[season] ? season : years[0]
  const data = HISTORY_BY_YEAR[year]
  const relegationFrom = data.teams - 2 // bottom three go down

  return (
    <>
      <div className="card-head standalone">
        <label className="season-pick">
          <span className="sr-only">Season</span>
          <select value={year} onChange={(e) => onSeason?.(Number(e.target.value))}>
            {years.map((y) => (
              <option key={y} value={y}>
                {HISTORY_BY_YEAR[y].label}
              </option>
            ))}
          </select>
        </label>
        <p className="season-summary">
          <strong>{data.champion}</strong> — champions, {data.label}
          <span className="muted">
            {' '}
            · {data.teams} clubs · {data.matches} matches
          </span>
        </p>
      </div>

      <div className="table-wrap">
        <table className="league">
          <caption className="sr-only">Final Premier League table, {data.label}</caption>
          <thead>
            <tr>
              <th className="col-pos" scope="col">#</th>
              <th className="col-club" scope="col">Club</th>
              <th scope="col">P</th>
              <th scope="col">W</th>
              <th scope="col">D</th>
              <th scope="col">L</th>
              <th className="hide-sm" scope="col">GF</th>
              <th className="hide-sm" scope="col">GA</th>
              <th scope="col">GD</th>
              <th scope="col">Pts</th>
            </tr>
          </thead>
          <tbody>
            {data.table.map((r) => (
              <tr
                key={r.team}
                className={
                  r.pos === 1 ? 'zone-champions' : r.pos >= relegationFrom ? 'zone-relegation' : ''
                }
              >
                <td className="col-pos">{r.pos}</td>
                <td className="col-club">
                  <span className="club-plain">{r.team}</span>
                  {r.pos === 1 && <span className="crown" title="Champions">★</span>}
                </td>
                <td>{r.played}</td>
                <td>{r.won}</td>
                <td>{r.drawn}</td>
                <td>{r.lost}</td>
                <td className="hide-sm">{r.gf}</td>
                <td className="hide-sm">{r.ga}</td>
                <td className={r.gd > 0 ? 'pos' : r.gd < 0 ? 'neg' : ''}>
                  {r.gd > 0 ? `+${r.gd}` : r.gd}
                </td>
                <td className="col-pts">{r.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="zone-key">
        <li>
          <span className="zone-swatch zone-champions" aria-hidden="true" />
          Champions
        </li>
        <li>
          <span className="zone-swatch zone-relegation" aria-hidden="true" />
          Relegated
        </li>
      </ul>

      {data.teams === 22 && (
        <p className="note small">
          The Premier League ran with 22 clubs and a 42-match season until 1995, when it cut to 20.
          Point totals from those seasons are not directly comparable with later ones.
        </p>
      )}
    </>
  )
}

/* ── All-time table ────────────────────────────────────────────────────── */

function AllTime() {
  const rows = useMemo(() => allTimeRecord(HISTORY), [])
  const first = HISTORY[0]?.label
  const last = HISTORY[HISTORY.length - 1]?.label

  return (
    <>
      <p className="note">
        Every club to have played in the Premier League, {first} to {last}, ranked by total points.
        Clubs have played wildly different numbers of seasons, so points per match is the fairer
        comparison.
      </p>

      <div className="table-wrap">
        <table className="league">
          <thead>
            <tr>
              <th className="col-pos" scope="col">#</th>
              <th className="col-club" scope="col">Club</th>
              <th scope="col" title="Seasons">S</th>
              <th scope="col">P</th>
              <th scope="col">W</th>
              <th className="hide-sm" scope="col">D</th>
              <th className="hide-sm" scope="col">L</th>
              <th scope="col">GD</th>
              <th scope="col">Pts</th>
              <th scope="col" title="Points per match">PPM</th>
              <th className="hide-sm" scope="col" title="Titles won">🏆</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.team}>
                <td className="col-pos">{i + 1}</td>
                <td className="col-club">
                  <span className="club-plain">{r.team}</span>
                </td>
                <td>{r.seasons}</td>
                <td>{r.played}</td>
                <td>{r.won}</td>
                <td className="hide-sm">{r.drawn}</td>
                <td className="hide-sm">{r.lost}</td>
                <td className={r.gd > 0 ? 'pos' : r.gd < 0 ? 'neg' : ''}>
                  {r.gd > 0 ? `+${r.gd}` : r.gd}
                </td>
                <td className="col-pts">{r.points}</td>
                <td>{r.ppg.toFixed(2)}</td>
                <td className="hide-sm">{r.titles || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

/* ── One club across every season ──────────────────────────────────────── */

function ByClub() {
  const clubs = useMemo(
    () => [...new Set(HISTORY.flatMap((s) => s.table.map((r) => r.team)))].sort(),
    []
  )
  const [club, setClub] = useState(clubs[0])
  const seasons = useMemo(() => clubHistory(HISTORY, club), [club])

  const best = Math.min(...seasons.map((s) => s.pos))
  const worst = Math.max(...seasons.map((s) => s.pos))

  return (
    <>
      <div className="card-head standalone">
        <label className="season-pick">
          <span className="sr-only">Club</span>
          <select value={club} onChange={(e) => setClub(e.target.value)}>
            {clubs.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <p className="season-summary">
          {seasons.length} season{seasons.length === 1 ? '' : 's'}
          <span className="muted">
            {' '}
            · best {ordinal(best)} · worst {ordinal(worst)}
          </span>
        </p>
      </div>

      {/* A position chart, not a bar chart: the scale is inverted because 1st
          belongs at the top. Every season is directly labelled. */}
      <div className="club-chart" role="table" aria-label={`${club} finishing position by season`}>
        {seasons.map((s) => (
          <div key={s.year} className="club-row" role="row">
            <span className="club-season" role="cell">{s.label}</span>
            <span
              className="club-track"
              role="cell"
              style={{ '--w': `${((s.teams - s.pos + 1) / s.teams) * 100}%` }}
            >
              <span
                className={`club-bar ${s.pos === 1 ? 'is-champ' : s.pos > s.teams - 3 ? 'is-down' : ''}`}
                aria-hidden="true"
              />
              <span className="club-pos">{ordinal(s.pos)}</span>
            </span>
            <span className="club-pts" role="cell">{s.points} pts</span>
          </div>
        ))}
      </div>

      <p className="note small">
        Longer bars are higher finishes. Seasons where the club was outside the Premier League are
        simply absent.
      </p>
    </>
  )
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}
