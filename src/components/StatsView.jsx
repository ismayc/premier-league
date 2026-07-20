import { useMemo, useState } from 'react'
import TeamLogo from './TeamLogo.jsx'
import { ALL_ABBRS, TEAM_BY_ABBR } from '../data/teams.js'
import { PLAYER_STATS, STAT_CATEGORIES, STAT_SEASONS } from '../data/players.js'
import { leaderboard, seasonTotals, teamScoring } from '../utils/stats.js'

/**
 * Season statistics: league-wide totals, player leaderboards, and a team
 * attack-versus-defence chart.
 *
 * Player data and fixture data are on different clocks. ESPN publishes player
 * leaders only once a season is underway, so in the weeks before kickoff the
 * leaderboards would be empty while the fixture list is full. Rather than show
 * a blank panel, the season selector defaults to the most recent season that
 * actually has data and says plainly which season is on screen.
 */

const seasonLabel = (year) => `${year}-${String((year + 1) % 100).padStart(2, '0')}`
const one = (n) => n.toFixed(1)
const pct = (n) => `${Math.round(n * 100)}%`

export default function StatsView({ fixtures, onPickTeam }) {
  const totals = useMemo(() => seasonTotals(fixtures), [fixtures])
  const teams = useMemo(() => teamScoring(fixtures, ALL_ABBRS), [fixtures])

  return (
    <main className="view">
      <div className="view-head">
        <h2>Stats</h2>
      </div>

      <SeasonTotals totals={totals} />
      <Leaders onPickTeam={onPickTeam} />
      <GoalDifferenceChart rows={teams} onPickTeam={onPickTeam} />
    </main>
  )
}

/* ── League totals ─────────────────────────────────────────────────────── */

function SeasonTotals({ totals }) {
  if (!totals.played) {
    return (
      <section className="card">
        <h3>This season</h3>
        <p className="note">
          No matches played yet — {totals.remaining} fixtures to come. Totals appear here from the
          opening weekend.
        </p>
      </section>
    )
  }

  const tiles = [
    { label: 'Matches played', value: totals.played, sub: `${totals.remaining} to go` },
    { label: 'Goals', value: totals.goals, sub: `${one(totals.gpg)} per match` },
    { label: 'Home wins', value: totals.homeWins, sub: pct(totals.homeWinPct) },
    { label: 'Draws', value: totals.draws, sub: pct(totals.drawPct) },
    { label: 'Away wins', value: totals.awayWins, sub: `${totals.cleanSheets} clean sheets` },
    { label: 'Goalless draws', value: totals.goalless, sub: '0-0' },
  ]

  return (
    <section className="card">
      <h3>This season</h3>
      <div className="tiles">
        {tiles.map((t) => (
          <div key={t.label} className="tile">
            <span className="tile-value">{t.value}</span>
            <span className="tile-label">{t.label}</span>
            <span className="tile-sub">{t.sub}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

/* ── Player leaderboards ───────────────────────────────────────────────── */

function Leaders({ onPickTeam }) {
  const [category, setCategory] = useState('goals')
  const available = useMemo(
    () => STAT_SEASONS.filter((s) => PLAYER_STATS[s]?.[category]?.length),
    [category]
  )
  const [season, setSeason] = useState(available[0])

  // Switching to a category the chosen season lacks would blank the panel;
  // fall back to the newest season that has it instead.
  const active = available.includes(season) ? season : available[0]
  const rows = PLAYER_STATS[active]?.[category] ?? []
  const ranked = useMemo(() => leaderboard(rows, { limit: 10 }), [rows])
  const meta = STAT_CATEGORIES.find((c) => c.key === category)

  if (!available.length) return null

  const max = ranked[0]?.value || 1

  return (
    <section className="card">
      <div className="card-head">
        <h3>{meta?.label ?? 'Leaders'}</h3>
        <label className="season-pick">
          <span className="sr-only">Season</span>
          <select value={active} onChange={(e) => setSeason(Number(e.target.value))}>
            {available.map((s) => (
              <option key={s} value={s}>
                {seasonLabel(s)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="pills" role="group" aria-label="Statistic">
        {STAT_CATEGORIES.filter((c) => PLAYER_STATS[active]?.[c.key]?.length).map((c) => (
          <button
            key={c.key}
            type="button"
            className={`pill ${category === c.key ? 'on' : ''}`}
            onClick={() => setCategory(c.key)}
            aria-pressed={category === c.key}
          >
            {c.label}
          </button>
        ))}
      </div>

      {meta?.lowerIsBetter && (
        <p className="note small">
          Most {meta.label.toLowerCase()} — a tally, not a ranking of merit.
        </p>
      )}

      <table className="leaders">
        <caption className="sr-only">
          {meta?.label} leaders, {seasonLabel(active)}
        </caption>
        <thead>
          <tr>
            <th scope="col" className="col-pos">#</th>
            <th scope="col">Player</th>
            <th scope="col" className="hide-sm">Club</th>
            <th scope="col" className="col-bar">
              <span className="sr-only">Relative total</span>
            </th>
            <th scope="col" className="col-val">{meta?.short}</th>
          </tr>
        </thead>
        <tbody>
          {ranked.map((p) => (
            <tr key={`${p.id}-${p.rank}`}>
              <td className="col-pos">{p.rank}</td>
              <td>
                <span className="lead-name">{p.name}</span>
                {p.pos && <span className="lead-pos">{p.pos}</span>}
              </td>
              <td className="hide-sm">
                {p.team && <PlayerClub player={p} onPickTeam={onPickTeam} />}
              </td>
              <td className="col-bar">
                {/* Single series, so no legend — the column header names it, and
                    every bar is directly labelled by the value beside it. */}
                <span className="bar" style={{ '--w': `${(p.value / max) * 100}%` }} />
              </td>
              <td className="col-val">{p.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

/**
 * The club a leaderboard row belongs to.
 *
 * A leaderboard reaches back years, so it names clubs that are no longer in
 * the league — Burnley, Leicester, Watford and others. Their name and crest
 * come from the row itself rather than the current-season lookup, which would
 * otherwise render a bare abbreviation next to an empty circle.
 *
 * Only a club still in the league is clickable: the team drawer is built from
 * this season's fixtures and table, so opening it for a relegated club would
 * show an empty panel.
 */
function PlayerClub({ player, onPickTeam }) {
  const current = TEAM_BY_ABBR[player.team]
  const name = current?.name ?? player.teamName ?? player.team
  const crest = <TeamLogo abbr={player.team} slug={player.teamSlug} size={18} />

  if (!current) {
    return (
      <span className="club-btn is-former" title={`${name} are not in the league this season`}>
        {crest}
        <span className="hide-xs">{name}</span>
      </span>
    )
  }

  return (
    <button type="button" className="club-btn" onClick={() => onPickTeam?.(player.team)}>
      {crest}
      <span className="hide-xs">{name}</span>
    </button>
  )
}

/* ── Team goal difference ──────────────────────────────────────────────── */

function GoalDifferenceChart({ rows, onPickTeam }) {
  if (!rows.length) {
    return (
      <section className="card">
        <h3>Attack and defence</h3>
        <p className="note">Appears once clubs have played.</p>
      </section>
    )
  }

  // Symmetric scale so a +1.2 bar and a −1.2 bar are the same length.
  const span = Math.max(...rows.map((r) => Math.abs(r.gdpg))) || 1

  return (
    <section className="card">
      <h3>Goal difference per match</h3>
      <p className="note small">
        Bars run right for a positive difference, left for negative. The figures on the right are
        goals scored and conceded per match.
      </p>

      <div className="margin-chart" role="table" aria-label="Goal difference per match by club">
        {rows.map((r) => {
          const positive = r.gdpg >= 0
          const width = (Math.abs(r.gdpg) / span) * 40 // each arm gets 40% of the track
          return (
            <div key={r.abbr} className="margin-row" role="row">
              {/* The cell role belongs on a wrapper, not on the button. Put
                  it on the button itself and it overrides the native button
                  role, so the only way to drill into a club from this chart
                  is announced as a table cell and not as something operable. */}
              <div className="margin-club" role="cell">
                <button type="button" className="club-btn" onClick={() => onPickTeam?.(r.abbr)}>
                  <TeamLogo abbr={r.abbr} size={18} />
                  <span>{TEAM_BY_ABBR[r.abbr]?.name ?? r.abbr}</span>
                </button>
              </div>

              <div className="margin-track" role="cell" style={{ '--w': `${width}%` }}>
                <span className="margin-zero" aria-hidden="true" />
                <span className={`margin-bar ${positive ? 'pos' : 'neg'}`} aria-hidden="true" />
                <span className={`margin-label ${positive ? 'pos' : 'neg'}`}>
                  {positive ? '+' : '−'}
                  {one(Math.abs(r.gdpg))}
                </span>
              </div>

              <span className="margin-split" role="cell">
                <span title={`${one(r.gfpg)} scored per match (rank ${r.attackRank} of ${rows.length})`}>
                  {one(r.gfpg)}
                </span>
                <i aria-hidden="true">/</i>
                <span title={`${one(r.gapg)} conceded per match (rank ${r.defenceRank} of ${rows.length})`}>
                  {one(r.gapg)}
                </span>
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}
