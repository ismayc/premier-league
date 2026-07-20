import TeamLogo from './TeamLogo.jsx'
import { TEAM_BY_ABBR } from '../data/teams.js'
import { timeOf } from '../utils/time.js'
import { useFollow } from '../context/follow.jsx'

const nameOf = (abbr) => TEAM_BY_ABBR[abbr]?.name ?? abbr

/**
 * One fixture. The same card serves an unplayed fixture, a match in progress,
 * and a finished result — the shape stays put and only the middle column
 * changes, so a list doesn't reflow as matches kick off.
 *
 * `hideScores` is a real feature rather than a nicety: this is a global
 * competition and plenty of people watch on delay.
 */
export default function MatchCard({ fixture, tz, hideScores, onOpen, onPickTeam }) {
  const { isFollowed, toggle } = useFollow()
  const { home, away, score, live, unplayed } = fixture

  const followed = isFollowed(home) || isFollowed(away)
  const showScore = score && !hideScores
  const winner = score ? (score[0] > score[1] ? home : score[1] > score[0] ? away : null) : null

  const side = (abbr, goals, align) => (
    <button
      type="button"
      className={`mc-team mc-${align} ${winner === abbr ? 'is-winner' : ''} ${
        isFollowed(abbr) ? 'is-followed' : ''
      }`}
      onClick={(e) => {
        e.stopPropagation()
        onPickTeam?.(abbr)
      }}
    >
      <TeamLogo abbr={abbr} />
      <span className="mc-name">{nameOf(abbr)}</span>
      {showScore && <span className="mc-goals">{goals}</span>}
    </button>
  )

  return (
    <article
      className={`mc ${live ? 'is-live' : ''} ${unplayed ? 'is-off' : ''} ${followed ? 'is-tracked' : ''}`}
    >
      {/* The whole-card "open details" control sits *behind* the team buttons
          rather than wrapping them. A button may not legally contain another
          button, and nesting them left the team controls unreachable by
          keyboard and inconsistently announced. Stacking keeps the whole card
          clickable while the team buttons stay real buttons on top. */}
      <button
        type="button"
        className="mc-open"
        onClick={() => onOpen?.(fixture)}
        aria-label={`${nameOf(home)} versus ${nameOf(away)}, details`}
      />

      <div className="mc-body">
        {side(home, score?.[0], 'home')}

        <span className="mc-mid">
          {unplayed ? (
            <span className="mc-status mc-off">{unplayed}</span>
          ) : live ? (
            <>
              <span className="mc-clock">{fixture.clock || "LIVE"}</span>
              <span className="mc-live-dot" aria-hidden="true" />
            </>
          ) : showScore ? (
            <span className="mc-ft">FT</span>
          ) : score && hideScores ? (
            <span className="mc-hidden" title="Scores hidden">
              &middot;&middot;&middot;
            </span>
          ) : (
            <span className="mc-ko">{timeOf(fixture.ko, tz)}</span>
          )}
        </span>

        {side(away, score?.[1], 'away')}
      </div>

      <button
        type="button"
        className={`mc-star ${followed ? 'on' : ''}`}
        onClick={() => toggle(home)}
        aria-pressed={isFollowed(home)}
        aria-label={`Follow ${nameOf(home)}`}
        title={`Follow ${nameOf(home)}`}
      >
        {isFollowed(home) ? '★' : '☆'}
      </button>
    </article>
  )
}
