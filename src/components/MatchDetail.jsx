import TeamLogo from './TeamLogo.jsx'
import Lineups from './Lineups.jsx'
import { TEAM_BY_ABBR } from '../data/teams.js'
import { longDayOf, timeOf, countdown } from '../utils/time.js'
import { useModalA11y } from '../hooks/useModalA11y.js'

const nameOf = (abbr) => TEAM_BY_ABBR[abbr]?.name ?? abbr

/**
 * One fixture in full: kickoff in both the viewer's zone and UK time, venue,
 * broadcasters, and the head-to-head record from the committed season.
 *
 * UK time is always shown alongside the local conversion because that is the
 * time every published Premier League schedule uses — seeing both is what
 * lets someone check this app against a fixture list elsewhere.
 */
export default function MatchDetail({ fixture, tz, fixtures, hideScores, onClose, onPickTeam }) {
  const ref = useModalA11y(onClose)
  if (!fixture) return null

  const { home, away, score, live, unplayed } = fixture
  const showScore = score && !hideScores
  const upcoming = !score && !unplayed

  // Earlier meetings this season between the same two clubs, either way round.
  const h2h = fixtures.filter(
    (f) =>
      f.id !== fixture.id &&
      f.score &&
      ((f.home === home && f.away === away) || (f.home === away && f.away === home))
  )

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal"
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={`${nameOf(home)} versus ${nameOf(away)}`}
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>

        <div className="md-score">
          <button type="button" className="md-team" onClick={() => onPickTeam?.(home)}>
            <TeamLogo abbr={home} size={44} />
            <span>{nameOf(home)}</span>
          </button>

          <div className="md-mid">
            {showScore ? (
              <strong className="md-goals">
                {score[0]}–{score[1]}
              </strong>
            ) : (
              <strong className="md-vs">v</strong>
            )}
            {live && <span className="md-live">{fixture.clock || 'Live'}</span>}
            {unplayed && <span className="md-off">{unplayed}</span>}
            {score && !live && !unplayed && <span className="md-ft">Full time</span>}
          </div>

          <button type="button" className="md-team" onClick={() => onPickTeam?.(away)}>
            <TeamLogo abbr={away} size={44} />
            <span>{nameOf(away)}</span>
          </button>
        </div>

        <dl className="md-facts">
          <div>
            <dt>Kickoff</dt>
            <dd>
              {longDayOf(fixture.ko, tz)}, {timeOf(fixture.ko, tz)}
              <span className="muted"> · {timeOf(fixture.ko, 'Europe/London')} UK</span>
            </dd>
          </div>
          {upcoming && countdown(fixture.ko) && (
            <div>
              <dt>Starts in</dt>
              <dd>{countdown(fixture.ko)}</dd>
            </div>
          )}
          {fixture.venue && (
            <div>
              <dt>Venue</dt>
              <dd>
                {fixture.venue}
                {fixture.city && <span className="muted"> · {fixture.city}</span>}
              </dd>
            </div>
          )}
          {/* Compared against 0 rather than tested for truthiness: React
              renders the number 0, so `tv?.length &&` would print a stray
              "0" in the facts list for a fixture with an empty tv array. */}
          {fixture.tv?.length > 0 && (
            <div>
              <dt>Television</dt>
              <dd>{fixture.tv.join(', ')}</dd>
            </div>
          )}
          {h2h.length > 0 && (
            <div>
              <dt>Earlier this season</dt>
              <dd>
                {h2h.map((f) => (
                  <div key={f.id}>
                    {nameOf(f.home)} {hideScores ? '·' : `${f.score[0]}–${f.score[1]}`}{' '}
                    {nameOf(f.away)}
                  </div>
                ))}
              </dd>
            </div>
          )}
        </dl>

        <Lineups fixture={fixture} />
      </div>
    </div>
  )
}
