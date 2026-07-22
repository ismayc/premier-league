import { useEffect, useState } from 'react'
import { fetchLineup, groupByLine, lineOf } from '../services/lineups.js'
import { fetchAthlete } from '../services/athlete.js'
import RecentMatches from './RecentMatches.jsx'

/**
 * Team sheets inside the match detail.
 *
 * Loaded when the match is opened rather than with the page, because a lineup
 * does not exist until about an hour before kickoff. The three states worth
 * distinguishing are "still loading", "no sheet published yet" (the normal
 * state for most fixtures, and not an error) and "here it is".
 */
/** Reported for every player, but only meaningful for the one in goal. */
const GK_ONLY = new Set(['saves', 'goalsConceded', 'shotsFaced'])

export default function Lineups({ fixture }) {
  const [state, setState] = useState({ status: 'loading', lineup: null })

  useEffect(() => {
    const ctrl = new AbortController()
    setState({ status: 'loading', lineup: null })

    fetchLineup(fixture.id, { signal: ctrl.signal }).then((lineup) => {
      // An aborted request resolves after the modal has gone; setting state
      // then would warn and, worse, overwrite a newer match's sheet.
      if (ctrl.signal.aborted) return
      setState({ status: lineup ? 'ready' : 'empty', lineup })
    })

    return () => ctrl.abort()
  }, [fixture.id])

  if (state.status === 'loading') {
    return (
      <section className="lineups">
        <h3>Team sheets</h3>
        <p className="note small">Loading…</p>
      </section>
    )
  }

  if (state.status === 'empty') {
    return (
      <section className="lineups">
        <h3>Team sheets</h3>
        <p className="note small">
          Not published yet — lineups usually appear about an hour before kickoff.
        </p>
      </section>
    )
  }

  const { home, away, subs } = state.lineup

  return (
    <section className="lineups">
      <h3>Team sheets</h3>

      <div className="lu-sides">
        <Side side={home} />
        <Side side={away} />
      </div>

      {subs.length > 0 && (
        <>
          <h4 className="lu-subs-head">Substitutions</h4>
          <ul className="lu-subs">
            {subs.map((s, i) => (
              <li key={`${s.minute}-${s.on}-${i}`}>
                <span className="lu-min">{s.minute}</span>
                <span className="lu-on">{s.on}</span>
                <span className="lu-arrow" aria-hidden="true">
                  ←
                </span>
                <span className="lu-off">{s.off}</span>
                <span className="muted lu-subteam">{s.team}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

function Side({ side }) {
  if (!side) return null

  return (
    <div className="lu-side">
      <header className="lu-head">
        <strong>{side.name}</strong>
        {side.formation && <span className="lu-formation">{side.formation}</span>}
      </header>

      {groupByLine(side.starters).map(({ line, players }) => (
        <div key={line} className="lu-line">
          <span className="lu-line-name">{line}</span>
          <ul>
            {players.map((p) => (
              <Player key={p.id ?? p.name} player={p} />
            ))}
          </ul>
        </div>
      ))}

      {side.bench.length > 0 && (
        <div className="lu-line lu-bench">
          <span className="lu-line-name">Bench</span>
          <ul>
            {side.bench.map((p) => (
              <Player key={p.id ?? p.name} player={p} bench />
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function Player({ player, bench }) {
  const [open, setOpen] = useState(false)

  // On the bench, coming on is the notable thing; in the XI, going off is.
  const moved = bench ? player.subbedIn : player.subbedOut
  const label = bench ? 'Came on' : 'Substituted off'

  return (
    <li className={moved ? 'lu-moved' : ''}>
      {/* Expanded in place rather than in a second dialog: the team sheet
          already lives inside the match modal, and nesting dialogs means two
          competing focus traps. */}
      <button
        type="button"
        className="lu-player"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="lu-jersey">{player.jersey ?? '–'}</span>
        <span className="lu-name">{player.name}</span>
        {moved && (
          <span className={bench ? 'lu-in' : 'lu-out'} title={label}>
            {bench ? '▲' : '▼'}
          </span>
        )}
        <span className="lu-caret" aria-hidden="true">
          {open ? '▾' : '▸'}
        </span>
      </button>

      {open && <PlayerDetail player={player} />}
    </li>
  )
}

/**
 * What one player did in this match, plus who they are.
 *
 * The match figures came with the lineup, so they render immediately; the
 * biography is a second request and arrives late, which is why the panel is
 * useful before it lands rather than waiting on it.
 */
function PlayerDetail({ player }) {
  const [bio, setBio] = useState(null)

  useEffect(() => {
    // A plain flag rather than an AbortController: the biography request is
    // shared and memoised, so cancelling it here would discard the result for
    // everyone else too. Ignoring a late answer is all that is needed.
    let cancelled = false
    fetchAthlete(player.id).then((data) => {
      if (!cancelled) setBio(data)
    })
    return () => {
      cancelled = true
    }
  }, [player.id])

  // Every player carries all twelve counters; the zeroes say nothing.
  //
  // The goalkeeping ones need dropping for everybody else: the feed reports
  // goalsConceded against outfield players too, so a left-back who played the
  // whole match reads "Conceded 3", which is the team's tally and says
  // nothing about them.
  const keeper = lineOf(player.pos) === 'Goalkeepers'
  const notable = player.stats.filter(
    (s) => s.value && (keeper || !GK_ONLY.has(s.name))
  )

  return (
    <div className="lu-detail">
      {bio && (
        <div className="lu-bio">
          {bio.headshot && <img src={bio.headshot} alt="" aria-hidden="true" loading="lazy" />}
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
                <dd className="bio-nat">
                  {bio.flag && (
                    <img
                      className="bio-flag"
                      src={bio.flag}
                      alt=""
                      width="20"
                      height="14"
                      loading="lazy"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none'
                      }}
                    />
                  )}
                  {bio.citizenship}
                </dd>
              </div>
            )}
            {bio.height && (
              <div>
                <dt>Height</dt>
                <dd>{bio.height}</dd>
              </div>
            )}
          </dl>
        </div>
      )}

      {notable.length > 0 ? (
        <ul className="lu-stats">
          {notable.map((s) => (
            <li key={s.name}>
              <span className="lu-stat-value">{s.value}</span>
              <span className="lu-stat-label">{s.label}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="lu-nothing">No goals, cards or saves recorded.</p>
      )}

      {/* The figures above are this match; these are the matches around it. */}
      <RecentMatches playerId={player.id} />
    </div>
  )
}
