import { useState } from 'react'
import Modal from './Modal.jsx'
import { useFollow } from '../context/follow.jsx'
import { downloadCalendar, webcalUrl, googleCalendarUrl } from '../utils/ics.js'
import { TEAM_BY_ABBR } from '../data/teams.js'

// A subscription must point at the DEPLOYED feed — a localhost URL can't be subscribed
// to, and only Netlify serves the function (GitHub Pages ships the static download only).
// So the webcal/Google links always use the production Netlify origin.
const PROD = 'https://premier-league-viewer.netlify.app'
const FEED = `${PROD}/calendar.ics`

// One subscribe row: open-in-app (webcal), a Google Calendar deep link, and copy-the-URL.
function SubRow({ label, httpsUrl }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(httpsUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard unavailable (insecure context / denied) — the visible URL still works */
    }
  }
  return (
    <div className="cal-sub-row">
      <span className="cal-sub-label">{label}</span>
      <div className="cal-sub-actions">
        <a className="cal-sub-primary" href={webcalUrl(httpsUrl)}>
          Subscribe
        </a>
        <a
          className="cal-sub-ghost"
          href={googleCalendarUrl(httpsUrl)}
          target="_blank"
          rel="noopener noreferrer"
        >
          Google
        </a>
        <button type="button" className="cal-sub-ghost" onClick={copy}>
          {copied ? 'Copied!' : 'Copy URL'}
        </button>
      </div>
    </div>
  )
}

/**
 * Calendar. Two ways to get fixtures into a calendar: a live webcal://
 * subscription (auto-updates as scores go final) and a one-time .ics download
 * (a snapshot — stated plainly, because a calendar that silently goes stale is
 * worse than no calendar).
 */
export default function CalendarModal({ fixtures, onClose }) {
  const { followed } = useFollow()
  const [scope, setScope] = useState(followed.size ? 'followed' : 'all')
  const [skipPast, setSkipPast] = useState(true)

  const teamsParam = [...followed].join(',')
  const myFeed = `${FEED}?teams=${teamsParam}`

  const now = new Date()
  let selected = fixtures
  if (scope === 'followed' && followed.size) {
    selected = selected.filter((f) => followed.has(f.home) || followed.has(f.away))
  }
  if (skipPast) selected = selected.filter((f) => new Date(f.ko) >= now)

  const clubs = [...followed].map((a) => TEAM_BY_ABBR[a]?.name ?? a)

  return (
    <Modal label="Export fixtures to calendar" onClose={onClose}>
        <h2>Add to calendar</h2>

        <div className="cal-sub">
          <h3 className="cal-sub-head">
            Subscribe <span className="cal-sub-hint">live — auto-updates as scores go final</span>
          </h3>
          <SubRow label="All clubs" httpsUrl={FEED} />
          {followed.size > 0 && <SubRow label={`Followed (${followed.size})`} httpsUrl={myFeed} />}
          <p className="note small">
            “Subscribe” opens your calendar app. On Google Calendar, use the Google button. The
            feed refreshes about every half hour.
          </p>
        </div>

        <h3 className="cal-sub-head">
          One-time download <span className="cal-sub-hint">snapshot, won’t update</span>
        </h3>

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
    </Modal>
  )
}
