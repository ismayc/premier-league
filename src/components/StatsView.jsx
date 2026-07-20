import { useEffect, useMemo, useState } from 'react'
import TeamLogo from './TeamLogo.jsx'
import { ALL_ABBRS, TEAMS, TEAM_BY_ABBR } from '../data/teams.js'
import { PLAYER_STATS, STAT_CATEGORIES, STAT_SEASONS } from '../data/players.js'
import { HISTORY, HISTORY_BY_YEAR } from '../data/history.js'
import { fetchAthlete } from '../services/athlete.js'
import { leaderboard, seasonScoring, seasonTotals, teamScoring } from '../utils/stats.js'

/**
 * Historical tables name clubs in full; the current-season data is keyed by
 * abbreviation. This maps one to the other so a past season still shows a
 * crest for any club that is still in the league.
 */
const ABBR_BY_NAME = Object.fromEntries(
  TEAMS.flatMap((t) => [t.name, t.displayName].map((n) => [n, t.abbr]))
)

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

  return (
    <main className="view">
      <div className="view-head">
        <h2>Stats</h2>
      </div>

      <SeasonTotals totals={totals} />
      <Leaders onPickTeam={onPickTeam} />
      <AttackAndDefence fixtures={fixtures} onPickTeam={onPickTeam} />
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
            <LeaderRow
              key={`${p.id}-${p.rank}`}
              player={p}
              meta={meta}
              season={active}
              max={max}
              onPickTeam={onPickTeam}
            />
          ))}
        </tbody>
      </table>
    </section>
  )
}

/**
 * One leaderboard row, expandable to the player's biography.
 *
 * Expanded in place rather than in a dialog, matching the team-sheet player
 * detail — the row already sits in a table, and a second focus trap for a
 * name and four facts would be more machinery than the content warrants.
 */
function LeaderRow({ player, meta, season, max, onPickTeam }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <tr className={open ? 'is-open' : ''}>
        <td className="col-pos">{player.rank}</td>
        <td>
          <button
            type="button"
            className="lead-player"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
          >
            <span className="lead-name">{player.name}</span>
            {player.pos && <span className="lead-pos">{player.pos}</span>}
            <span className="lead-caret" aria-hidden="true">
              {open ? '▾' : '▸'}
            </span>
          </button>
        </td>
        <td className="hide-sm">{player.team && <PlayerClub player={player} onPickTeam={onPickTeam} />}</td>
        <td className="col-bar">
          {/* Single series, so no legend — the column header names it, and
              every bar is directly labelled by the value beside it. */}
          <span className="bar" style={{ '--w': `${(player.value / max) * 100}%` }} />
        </td>
        <td className="col-val">{player.value}</td>
      </tr>

      {open && (
        <tr className="lead-detail-row">
          <td colSpan={5}>
            <PlayerBio player={player} meta={meta} season={season} />
          </td>
        </tr>
      )}
    </>
  )
}

/**
 * The person behind a leaderboard line: their season tally in words, plus the
 * biography the leaderboard cannot carry — full position, age, nationality,
 * height and a headshot.
 *
 * The tally shows immediately; the biography is a second request and may not
 * arrive (or exist), so the panel is useful before it lands rather than
 * waiting on it.
 */
function PlayerBio({ player, meta, season }) {
  const [bio, setBio] = useState(null)

  useEffect(() => {
    // Not cancellable: fetchAthlete shares a cache, so aborting here would
    // poison the entry for every later reader. A late answer is simply
    // ignored. See services/athlete.js.
    let cancelled = false
    fetchAthlete(player.id).then((data) => {
      if (!cancelled) setBio(data)
    })
    return () => {
      cancelled = true
    }
  }, [player.id])

  // meta is always the category this leaderboard is showing — it comes from
  // the same lookup that titled the table — so no defensive fallback here.
  const tally =
    `${player.value} ${meta.label.toLowerCase()} in ${seasonLabel(season)}` +
    (player.matches ? ` · ${player.matches} matches` : '')

  return (
    <div className="lead-detail">
      {bio?.headshot && <img className="lead-shot" src={bio.headshot} alt="" aria-hidden="true" loading="lazy" />}

      <div className="lead-facts">
        <p className="lead-tally">{tally}</p>
        {bio && (
          <dl>
            {bio.position && (
              <div>
                <dt>Position</dt>
                <dd>{bio.position}</dd>
              </div>
            )}
            {bio.age && (
              <div>
                <dt>Age</dt>
                <dd>{bio.age}</dd>
              </div>
            )}
            {bio.citizenship && (
              <div>
                <dt>Nationality</dt>
                <dd>{bio.citizenship}</dd>
              </div>
            )}
            {bio.height && (
              <div>
                <dt>Height</dt>
                <dd>{bio.height}</dd>
              </div>
            )}
          </dl>
        )}
      </div>
    </div>
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

/**
 * Attack and defence, for the season in progress or any completed one.
 *
 * The current season is derived from its fixtures and a past season from its
 * final table, but both go through the same ranking, so the two are directly
 * comparable. Before a ball is kicked the current season has nothing to show,
 * so the selector opens on the most recent completed season instead of an
 * empty card.
 */
function AttackAndDefence({ fixtures, onPickTeam }) {
  const current = useMemo(() => teamScoring(fixtures, ALL_ABBRS), [fixtures])
  const pastYears = useMemo(() => HISTORY.map((s) => s.year).sort((a, b) => b - a), [])

  const [season, setSeason] = useState(current.length ? 'current' : pastYears[0])

  const rows = useMemo(() => {
    if (season === 'current') return current
    // This memo runs before the "nothing to show" early return below, so when
    // history is empty `season` is undefined here and the lookup misses. The
    // fallback keeps that from throwing on the way to the placeholder.
    const past = HISTORY_BY_YEAR[season]
    return past ? seasonScoring(past) : []
  }, [season, current])

  // Nothing at all to show: no results this season and no history either.
  if (!current.length && !pastYears.length) {
    return (
      <section className="card">
        <h3>Attack and defence</h3>
        <p className="note">Appears once clubs have played.</p>
      </section>
    )
  }

  return (
    <section className="card">
      <div className="card-head">
        <h3>Goal difference per match</h3>
        <label className="season-pick">
          <span className="sr-only">Season</span>
          <select
            value={season}
            onChange={(e) => {
              const v = e.target.value
              setSeason(v === 'current' ? 'current' : Number(v))
            }}
          >
            {current.length > 0 && <option value="current">This season</option>}
            {pastYears.map((y) => (
              <option key={y} value={y}>
                {HISTORY_BY_YEAR[y].label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {season !== 'current' && (
        <p className="note small">
          Final table for {HISTORY_BY_YEAR[season].label}
          {HISTORY_BY_YEAR[season].teams === 22 && ' — a 22-club, 42-match season'}.
        </p>
      )}

      <GoalDifferenceChart rows={rows} onPickTeam={onPickTeam} />
    </section>
  )
}

function GoalDifferenceChart({ rows, onPickTeam }) {
  if (!rows.length) {
    return <p className="note">Appears once clubs have played.</p>
  }

  // Symmetric scale so a +1.2 bar and a −1.2 bar are the same length.
  const span = Math.max(...rows.map((r) => Math.abs(r.gdpg))) || 1

  return (
    <>
      <p className="note small">
        Bars run right for a positive difference, left for negative. The figures on the right are
        goals scored and conceded per match.
      </p>

      <div className="margin-chart" role="table" aria-label="Goal difference per match by club">
        {rows.map((r) => (
          <ScoringRow key={r.key} row={r} span={span} count={rows.length} onPickTeam={onPickTeam} />
        ))}
      </div>
    </>
  )
}

function ScoringRow({ row, span, count, onPickTeam }) {
  const positive = row.gdpg >= 0
  const width = (Math.abs(row.gdpg) / span) * 40 // each arm gets 40% of the track

  // A current-season row is keyed by abbreviation; a historical one by full
  // name. Resolve an abbreviation either way so a club still in the league
  // gets its crest and stays clickable, and a relegated one is shown plainly.
  const abbr = row.abbr ?? ABBR_BY_NAME[row.name] ?? null
  const label = row.name ?? TEAM_BY_ABBR[abbr]?.name ?? abbr

  return (
    <div className="margin-row" role="row">
      {/* The cell role belongs on a wrapper, not on the button. Put it on the
          button itself and it overrides the native button role, so the only
          way to drill into a club from this chart is announced as a table cell
          rather than as something operable. */}
      <div className="margin-club" role="cell">
        {abbr ? (
          <button type="button" className="club-btn" onClick={() => onPickTeam?.(abbr)}>
            <TeamLogo abbr={abbr} size={18} />
            <span>{TEAM_BY_ABBR[abbr]?.name ?? label}</span>
          </button>
        ) : (
          <span className="club-btn is-former">
            <TeamLogo abbr={null} size={18} />
            <span>{label}</span>
          </span>
        )}
      </div>

      <div className="margin-track" role="cell" style={{ '--w': `${width}%` }}>
        <span className="margin-zero" aria-hidden="true" />
        <span className={`margin-bar ${positive ? 'pos' : 'neg'}`} aria-hidden="true" />
        <span className={`margin-label ${positive ? 'pos' : 'neg'}`}>
          {positive ? '+' : '−'}
          {one(Math.abs(row.gdpg))}
        </span>
      </div>

      <span className="margin-split" role="cell">
        <span title={`${one(row.gfpg)} scored per match (rank ${row.attackRank} of ${count})`}>
          {one(row.gfpg)}
        </span>
        <i aria-hidden="true">/</i>
        <span title={`${one(row.gapg)} conceded per match (rank ${row.defenceRank} of ${count})`}>
          {one(row.gapg)}
        </span>
      </span>
    </div>
  )
}
