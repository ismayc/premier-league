import { useState } from 'react'
import { useModalA11y } from '../hooks/useModalA11y.js'
import { useFollow } from '../context/follow.jsx'
import { downloadCalendar } from '../utils/ics.js'
import { TEAM_BY_ABBR } from '../data/teams.js'

/**
 * Calendar export. The file is generated in the browser and downloaded — a
 * snapshot rather than a live subscription, which is stated plainly here
 * because a calendar that silently goes stale is worse than no calendar.
 */
export default function CalendarModal({ fixtures, onClose }) {
  const ref = useModalA11y(onClose)
  const { followed } = useFollow()
  const [scope, setScope] = useState(followed.size ? 'followed' : 'all')
  const [skipPast, setSkipPast] = useState(true)

  const now = new Date()
  let selected = fixtures
  if (scope === 'followed' && followed.size) {
    selected = selected.filter((f) => followed.has(f.home) || followed.has(f.away))
  }
  if (skipPast) selected = selected.filter((f) => new Date(f.ko) >= now)

  const clubs = [...followed].map((a) => TEAM_BY_ABBR[a]?.name ?? a)

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal"
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Export fixtures to calendar"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>

        <h2>Add to calendar</h2>

        <div className="pills" role="group" aria-label="Which fixtures">
          <button
            type="button"
            className={`pill ${scope === 'all' ? 'on' : ''}`}
            onClick={() => setScope('all')}
            aria-pressed={scope === 'all'}
          >
            Every club
          </button>
          <button
            type="button"
            className={`pill ${scope === 'followed' ? 'on' : ''}`}
            onClick={() => setScope('followed')}
            aria-pressed={scope === 'followed'}
            disabled={!followed.size}
          >
            Followed only
          </button>
        </div>

        {scope === 'followed' && clubs.length > 0 && <p className="muted small">{clubs.join(', ')}</p>}

        <label className="check">
          <input type="checkbox" checked={skipPast} onChange={(e) => setSkipPast(e.target.checked)} />
          Upcoming fixtures only
        </label>

        <p className="note small">
          Downloads a file of {selected.length} fixture{selected.length === 1 ? '' : 's'}. Kickoffs
          are stored as exact instants, so your calendar shows them in whatever timezone your device
          is in. It is a snapshot — if fixtures move for television, export again.
        </p>

        <button
          type="button"
          className="primary"
          disabled={!selected.length}
          onClick={() => {
            downloadCalendar(selected, 'premier-league.ics', {
              name: scope === 'followed' ? `Premier League — ${clubs.join(', ')}` : 'Premier League',
            })
            onClose?.()
          }}
        >
          Download .ics
        </button>
      </div>
    </div>
  )
}
