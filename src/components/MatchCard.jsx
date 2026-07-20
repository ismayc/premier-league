import TeamLogo from './TeamLogo.jsx'
import { TEAM_BY_ABBR } from '../data/teams.js'
import { countdown, timeOf, zoneAbbr } from '../utils/time.js'
import { useFollow } from '../context/follow.jsx'

const nameOf = (abbr) => TEAM_BY_ABBR[abbr]?.name ?? abbr

/**
 * One fixture, laid out after the WNBA schedule's game card: a narrow "when"
 * column on the left (kickoff time and zone, or a Final / Live / Off badge),
 * the two clubs stacked in the middle, and a faint meta line beneath them for
 * the venue and — the reason this shape was adopted — where to watch.
 *
 * The clubs are stacked rather than placed side by side (as the WNBA card does
 * its two teams) because Premier League short names are longer than a
 * basketball nickname and would clip on a phone. Stacking gives each name the
 * full width at every size.
 *
 * Broadcasters are only assigned a few weeks before a match, so most cards
 * show just the venue until then; the TV line appears on its own once the feed
 * carries it.
 */
export default function MatchCard({ fixture, tz, hideScores, onOpen, onPickTeam }) {
  const { isFollowed, toggle } = useFollow()
  const { home, away, score, live, unplayed } = fixture

  const tracked = isFollowed(home) || isFollowed(away)
  const showScore = score && !hideScores
  const winner = score ? (score[0] > score[1] ? home : score[1] > score[0] ? away : null) : null

  const side = (abbr, goals) => (
    <div
      className={`mc-side ${winner === abbr ? 'is-winner' : ''} ${
        isFollowed(abbr) ? 'is-followed' : ''
      }`}
    >
      <button
        type="button"
        className={`mc-star ${isFollowed(abbr) ? 'on' : ''}`}
        onClick={() => toggle(abbr)}
        aria-pressed={isFollowed(abbr)}
        aria-label={`Follow ${nameOf(abbr)}`}
        title={`Follow ${nameOf(abbr)}`}
      >
        {isFollowed(abbr) ? '★' : '☆'}
      </button>
      <button type="button" className="mc-team" onClick={() => onPickTeam?.(abbr)}>
        <TeamLogo abbr={abbr} size={26} />
        <span className="mc-name">{nameOf(abbr)}</span>
      </button>
      {showScore && <span className="mc-score">{goals}</span>}
    </div>
  )

  // Venue and broadcasters share the faint meta line, middle-dot separated,
  // capped so a match with a long TV list can't blow out the card.
  const meta = []
  if (fixture.venue) meta.push(fixture.city ? `${fixture.venue}, ${fixture.city}` : fixture.venue)
  const tv = fixture.tv?.slice(0, 3).join(' · ')

  // A countdown is only useful when kickoff is close; on a fixture weeks away
  // it is noise, and the next-kickoff banner already covers the imminent one.
  const soon = !score && !unplayed && new Date(fixture.ko) - Date.now() < 48 * 3600 * 1000
  const ticks = soon ? countdown(fixture.ko) : null

  return (
    <article className={`mc ${live ? 'is-live' : ''} ${unplayed ? 'is-off' : ''} ${tracked ? 'is-tracked' : ''}`}>
      {/* The whole card opens the match. It sits behind the content as a
          transparent layer so the stars and club buttons stay real buttons on
          top, rather than being nested inside another button. */}
      <button
        type="button"
        className="mc-open"
        onClick={() => onOpen?.(fixture)}
        aria-label={`${nameOf(home)} versus ${nameOf(away)}, details`}
      />

      <div className="mc-when">
        {unplayed ? (
          <span className="mc-off-badge">{unplayed}</span>
        ) : live ? (
          <span className="mc-live-badge">
            <span className="mc-live-dot" aria-hidden="true" />
            {fixture.clock || 'Live'}
          </span>
        ) : showScore ? (
          <span className="mc-ft">FT</span>
        ) : (
          <>
            <span className="mc-ko">{timeOf(fixture.ko, tz)}</span>
            <span className="mc-zone">{zoneAbbr(fixture.ko, tz)}</span>
          </>
        )}
      </div>

      <div className="mc-main">
        <div className="mc-teams">
          {side(home, score?.[0])}
          {side(away, score?.[1])}
        </div>

        {(meta.length > 0 || tv || ticks) && (
          <div className="mc-meta">
            {meta.map((m) => (
              <span key={m}>{m}</span>
            ))}
            {tv && <span className="mc-tv">📺 {tv}</span>}
            {ticks && <span className="mc-countdown">in {ticks}</span>}
          </div>
        )}
      </div>
    </article>
  )
}
