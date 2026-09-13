import { useEffect, useState } from 'react'
import TeamLogo from './TeamLogo.jsx'
import Lineups from './Lineups.jsx'
import { TEAM_BY_ABBR } from '../data/teams.js'
import { longDayOf, timeOf, countdown } from '../utils/time.js'
import Modal from './Modal.jsx'
import { LEAGUE } from '../config/league.js'

const nameOf = (abbr) => TEAM_BY_ABBR[abbr]?.name ?? abbr

// Sort key for a match minute like "45'+2'": the base minute, with stoppage time
// as a tiebreak so "90'+1'" follows "90'" rather than sorting as 901.
const minSort = (min) => {
  const s = String(min ?? '')
  const base = parseInt(s, 10) || 0
  const extra = /\+(\d+)/.exec(s)
  return base * 100 + (extra ? Number(extra[1]) : 0)
}

const eventIcon = (e) =>
  e.type === 'card' ? (e.color === 'red' ? '🟥' : '🟨') : e.type === 'sub' ? '🔁' : '⚽'

/**
 * One fixture in full: kickoff in both the viewer's zone and UK time, venue,
 * broadcasters, and the head-to-head record from the committed season.
 *
 * UK time is always shown alongside the local conversion because that is the
 * time every published Premier League schedule uses — seeing both is what
 * lets someone check this app against a fixture list elsewhere.
 */
export default function MatchDetail({ fixture, tz, fixtures, hideScores, onClose, onPickTeam }) {
  // A per-match score reveal for spoiler-free mode: shows THIS match's result inside
  // the popout without turning spoiler-free off everywhere else. Re-masks when a
  // different match opens.
  const [revealed, setRevealed] = useState(false)
  useEffect(() => {
    setRevealed(false)
  }, [fixture?.id])

  if (!fixture) return null

  const { home, away, score, live, unplayed } = fixture
  // In spoiler-free mode `hide` stays true until the viewer reveals THIS match's score.
  const hide = hideScores && !revealed
  const showScore = score && !hide
  const upcoming = !score && !unplayed

  // Goals, cards and substitutions merged into one oldest-first timeline, the
  // same shape the tournament siblings show. Each event already carries the abbr
  // of the side it belongs to, so the crest identifies the team and the icon the
  // kind of event.
  const timeline = [
    ...(fixture.goals ?? []).map((g) => ({ type: 'goal', ...g })),
    ...(fixture.cards ?? []).map((c) => ({ type: 'card', ...c })),
    ...(fixture.subs ?? []).map((s) => ({ type: 'sub', ...s })),
  ].sort((a, b) => minSort(a.min) - minSort(b.min))

  // Earlier meetings this season between the same two clubs, either way round.
  const h2h = fixtures.filter(
    (f) =>
      f.id !== fixture.id &&
      f.score &&
      ((f.home === home && f.away === away) || (f.home === away && f.away === home))
  )

  return (
    <Modal label={`${nameOf(home)} versus ${nameOf(away)}`} className="game-modal" onClose={onClose}>

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
              <strong className="md-vs">{LEAGUE.homeAwaySep}</strong>
            )}
            {live && <span className="md-live">{fixture.clock || 'Live'}</span>}
            {unplayed && <span className="md-off">{unplayed}</span>}
            {score && !live && !unplayed && <span className="md-ft">Full time</span>}
            {score && hideScores && (
              <button
                type="button"
                className="md-reveal"
                onClick={() => setRevealed((v) => !v)}
                aria-pressed={revealed}
              >
                {revealed ? 'Hide score' : 'Reveal score'}
              </button>
            )}
          </div>

          <button type="button" className="md-team" onClick={() => onPickTeam?.(away)}>
            <TeamLogo abbr={away} size={44} />
            <span>{nameOf(away)}</span>
          </button>
        </div>

        {/* The match timeline, oldest event first. Gated on showScore so it stays
            hidden in spoiler-free mode until the viewer reveals this match. */}
        {showScore && timeline.length > 0 && (
          <ul className="md-scorers">
            {timeline.map((e, i) => (
              <li className={`md-scorer md-scorer-${e.type}`} key={`${e.type}-${e.min}-${i}`}>
                <span className="md-scorer-min">{e.min}</span>
                <TeamLogo abbr={e.team} size={16} />
                <span className="md-scorer-icon" aria-hidden="true">{eventIcon(e)}</span>
                <span className="md-scorer-name">
                  {e.type === 'goal' && (
                    <>
                      {e.scorer}
                      {e.kind === 'pen' && <span className="md-scorer-note"> (pen)</span>}
                      {e.kind === 'og' && <span className="md-scorer-note"> (OG)</span>}
                    </>
                  )}
                  {e.type === 'card' && e.player}
                  {e.type === 'sub' && (
                    <>
                      {e.on}
                      <span className="md-scorer-note"> for {e.off}</span>
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}

        <dl className="md-facts">
          <div>
            <dt>{LEAGUE.kickoffLabel}</dt>
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
                    {nameOf(f.home)} {hide ? '·' : `${f.score[0]}–${f.score[1]}`}{' '}
                    {nameOf(f.away)}
                  </div>
                ))}
              </dd>
            </div>
          )}
        </dl>

        <Lineups fixture={fixture} />
    </Modal>
  )
}
