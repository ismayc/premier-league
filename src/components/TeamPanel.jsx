import { useMemo } from 'react'
import TeamLogo from './TeamLogo.jsx'
import { TEAM_BY_ABBR, ALL_ABBRS } from '../data/teams.js'
import { buildTable } from '../utils/table.js'
import { HISTORY } from '../data/history.js'
import { PLAYER_STATS, STAT_SEASONS } from '../data/players.js'
import { clubHistory } from '../utils/stats.js'
import { dayOf, timeOf } from '../utils/time.js'
import { useModalA11y } from '../hooks/useModalA11y.js'
import { useFollow } from '../context/follow.jsx'

/**
 * Everything about one club in a single drawer: current standing, form,
 * home/away split, next fixtures, its leading players, and how it has
 * finished in every previous season.
 *
 * The Premier League table names clubs differently from ESPN ("Man City" vs
 * "Manchester City"), so the historical lookup matches on the club's full
 * display name and tolerates a miss rather than showing a wrong club.
 */
export default function TeamPanel({ abbr, fixtures, tz, hideScores, onClose, onOpen }) {
  const ref = useModalA11y(onClose)
  const { isFollowed, toggle } = useFollow()

  const team = TEAM_BY_ABBR[abbr]

  const row = useMemo(
    () => buildTable(fixtures, ALL_ABBRS).find((r) => r.abbr === abbr),
    [fixtures, abbr]
  )

  const [played, upcoming] = useMemo(() => {
    const mine = fixtures.filter((f) => f.home === abbr || f.away === abbr)
    return [
      mine.filter((f) => f.score).slice(-5).reverse(),
      mine.filter((f) => !f.score && !f.unplayed).slice(0, 5),
    ]
  }, [fixtures, abbr])

  // Historical names differ from the feed's; try the full name then the short.
  const past = useMemo(() => {
    if (!team) return []
    for (const candidate of [team.displayName, team.name]) {
      const found = clubHistory(HISTORY, candidate)
      if (found.length) return found
    }
    return []
  }, [team])

  const topPlayers = useMemo(() => {
    for (const season of STAT_SEASONS) {
      const goals = PLAYER_STATS[season]?.goals?.filter((p) => p.team === abbr) ?? []
      if (goals.length) return { season, players: goals.slice(0, 5) }
    }
    return null
  }, [abbr])

  if (!team) return null

  const titles = past.filter((s) => s.pos === 1).length

  return (
    <div className="modal-wrap" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside
        className="drawer"
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={team.displayName}
      >
        <button className="modal-x" onClick={onClose} aria-label="Close">
          ✕
        </button>

        <header className="tp-head">
          <TeamLogo abbr={abbr} size={48} />
          <div>
            <h2>{team.displayName}</h2>
            <p className="muted">
              {past.length
                ? `${past.length} Premier League season${past.length === 1 ? '' : 's'}${
                    titles ? ` · ${titles} title${titles === 1 ? '' : 's'}` : ''
                  }`
                : 'Premier League'}
            </p>
          </div>
          <button
            type="button"
            className={`chip ${isFollowed(abbr) ? 'on' : ''}`}
            onClick={() => toggle(abbr)}
            aria-pressed={isFollowed(abbr)}
          >
            {isFollowed(abbr) ? '★ Following' : '☆ Follow'}
          </button>
        </header>

        {row && row.played > 0 && (
          <section>
            <h3>This season</h3>
            <div className="tiles compact">
              <Tile value={row.pos} label="Position" />
              <Tile value={row.points} label="Points" sub={`${row.played} played`} />
              <Tile value={`${row.won}-${row.drawn}-${row.lost}`} label="W-D-L" />
              <Tile
                value={row.gd > 0 ? `+${row.gd}` : row.gd}
                label="Goal difference"
                sub={`${row.gf} for, ${row.ga} against`}
              />
              <Tile
                value={row.home.played ? `${row.home.won}-${row.home.drawn}-${row.home.lost}` : '—'}
                label="Home"
              />
              <Tile
                value={row.away.played ? `${row.away.won}-${row.away.drawn}-${row.away.lost}` : '—'}
                label="Away"
              />
            </div>
            {row.form.length > 0 && (
              <p className="tp-form">
                Form{' '}
                <span className="form-strip">
                  {row.form.map((f, i) => (
                    <i key={i} className={`form-${f}`}>
                      {f}
                    </i>
                  ))}
                </span>
              </p>
            )}
          </section>
        )}

        {played.length > 0 && (
          <section>
            <h3>Recent results</h3>
            <ul className="tp-list">
              {played.map((f) => (
                <TeamFixture key={f.id} f={f} abbr={abbr} tz={tz} hideScores={hideScores} onOpen={onOpen} />
              ))}
            </ul>
          </section>
        )}

        {upcoming.length > 0 && (
          <section>
            <h3>Next up</h3>
            <ul className="tp-list">
              {upcoming.map((f) => (
                <TeamFixture key={f.id} f={f} abbr={abbr} tz={tz} onOpen={onOpen} />
              ))}
            </ul>
          </section>
        )}

        {topPlayers && (
          <section>
            <h3>
              Leading scorers{' '}
              <span className="muted small">
                {topPlayers.season}-{String((topPlayers.season + 1) % 100).padStart(2, '0')}
              </span>
            </h3>
            <ul className="tp-players">
              {topPlayers.players.map((p) => (
                <li key={p.id}>
                  <span>{p.name}</span>
                  <span className="muted">
                    {p.value} goal{p.value === 1 ? '' : 's'}
                    {p.matches ? ` in ${p.matches}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {past.length > 0 && (
          <section>
            <h3>Every season</h3>
            <ul className="tp-seasons">
              {[...past].reverse().map((s) => (
                <li key={s.year}>
                  <span className="muted">{s.label}</span>
                  <span className={s.pos === 1 ? 'pos' : s.pos > s.teams - 3 ? 'neg' : ''}>
                    {s.pos === 1 ? 'Champions' : ordinal(s.pos)}
                  </span>
                  <span className="muted">{s.points} pts</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </aside>
    </div>
  )
}

function Tile({ value, label, sub }) {
  return (
    <div className="tile">
      <span className="tile-value">{value}</span>
      <span className="tile-label">{label}</span>
      {sub && <span className="tile-sub">{sub}</span>}
    </div>
  )
}

function TeamFixture({ f, abbr, tz, hideScores, onOpen }) {
  const isHome = f.home === abbr
  const opponent = isHome ? f.away : f.home
  const result = f.score
    ? f.score[0] === f.score[1]
      ? 'D'
      : (f.score[0] > f.score[1]) === isHome
        ? 'W'
        : 'L'
    : null

  return (
    <li>
      <button type="button" className="tp-fixture" onClick={() => onOpen?.(f)}>
        {result && <i className={`form-${result}`}>{result}</i>}
        <span className="tp-venue">{isHome ? 'H' : 'A'}</span>
        <TeamLogo abbr={opponent} size={18} />
        <span className="tp-opp">{TEAM_BY_ABBR[opponent]?.name ?? opponent}</span>
        <span className="muted">
          {f.score && !hideScores
            ? `${f.score[0]}–${f.score[1]}`
            : `${dayOf(f.ko, tz)} ${timeOf(f.ko, tz)}`}
        </span>
      </button>
    </li>
  )
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}
