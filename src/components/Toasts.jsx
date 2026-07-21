import { TEAM_BY_ABBR } from '../data/teams.js'
import TeamLogo from './TeamLogo.jsx'

/**
 * The live-alert stack. Each toast names a moment and opens the match it came
 * from, so an alert is a way into the detail rather than a dead end.
 */

const nick = (abbr) => TEAM_BY_ABBR[abbr]?.name || abbr

function describe(e) {
  const f = e.fixture
  switch (e.kind) {
    case 'kickoff':
      return { icon: '⏱', label: 'Kick-off', text: `${nick(f.home)} v ${nick(f.away)}` }
    case 'goal': {
      const [h, a] = e.score
      return { icon: '⚽', label: 'Goal', text: `${nick(e.scorer)} — ${h}–${a}` }
    }
    case 'red': {
      const abbr = e.red.side === 'home' ? f.home : f.away
      // The feed sometimes names the match but not the player; the club and
      // the minute are still worth showing on their own.
      const who = e.red.player ? `${e.red.player} (${nick(abbr)})` : nick(abbr)
      return { icon: '🟥', label: 'Red card', text: e.red.clock ? `${who} ${e.red.clock}` : who }
    }
    default: {
      const [h, a] = e.score
      return { icon: '✅', label: 'Full time', text: `${nick(f.home)} ${h}–${a} ${nick(f.away)}` }
    }
  }
}

export default function Toasts({ events, onOpen, onDismiss }) {
  if (!events.length) return null

  return (
    // aria-live so a screen reader announces a moment as it lands, without
    // pulling focus away from whatever the viewer is already doing.
    <div className="toasts" role="status" aria-live="polite">
      {events.map((e) => {
        const { icon, label, text } = describe(e)
        return (
          <div className={`toast toast-${e.kind}`} key={e.key}>
            <button type="button" className="toast-body" onClick={() => onOpen?.(e.fixture)}>
              <span className="toast-icon" aria-hidden="true">
                {icon}
              </span>
              <span className="toast-text">
                <span className="toast-label">{label}</span>
                <span className="toast-teams">
                  <TeamLogo abbr={e.fixture.home} size={15} />
                  <TeamLogo abbr={e.fixture.away} size={15} />
                  {text}
                </span>
              </span>
            </button>
            <button
              type="button"
              className="toast-x"
              onClick={() => onDismiss?.(e.key)}
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        )
      })}
    </div>
  )
}
