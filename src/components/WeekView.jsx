import { useMemo, useState } from 'react'
import TeamLogo from './TeamLogo.jsx'
import { TEAM_BY_ABBR } from '../data/teams.js'
import { dateKey, startOfWeek, timeOf } from '../utils/time.js'

/**
 * A week at a time, laid out Monday to Sunday.
 *
 * A league season is a rhythm — Saturday 15:00, the Sunday afternoon game, the
 * Tuesday night rearrangement — and a flat list flattens that away. The grid
 * makes an empty midweek and a congested festive period legible at a glance.
 */

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export default function WeekView({ fixtures, tz, hideScores, onOpen }) {
  const weeks = useMemo(() => {
    const map = new Map()
    for (const f of fixtures) {
      const key = startOfWeek(f.ko, tz)
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(f)
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [fixtures, tz])

  const todayWeek = startOfWeek(new Date().toISOString(), tz)
  const initial = Math.max(
    0,
    weeks.findIndex(([k]) => k >= todayWeek)
  )
  const [index, setIndex] = useState(initial)

  if (!weeks.length) return <main className="view"><p className="empty">No fixtures.</p></main>

  const clamped = Math.min(index, weeks.length - 1)
  const [weekStart, weekFixtures] = weeks[clamped]

  // Bucket by weekday so every column renders, including the empty ones —
  // an empty Wednesday is information.
  const columns = DAYS.map((label, i) => {
    const d = new Date(`${weekStart}T12:00:00Z`)
    d.setUTCDate(d.getUTCDate() + i)
    const key = d.toISOString().slice(0, 10)
    return {
      label,
      key,
      date: d.getUTCDate(),
      fixtures: weekFixtures
        .filter((f) => dateKey(f.ko, tz) === key)
        .sort((a, b) => a.ko.localeCompare(b.ko)),
    }
  })

  const monthLabel = new Intl.DateTimeFormat('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${weekStart}T12:00:00Z`))

  return (
    <main className="view">
      <div className="view-head">
        <h2>Week</h2>
        <div className="view-tools">
          <button
            type="button"
            className="chip"
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
            disabled={clamped === 0}
            aria-label="Previous week"
          >
            ‹
          </button>
          <span className="week-label">{monthLabel}</span>
          <button
            type="button"
            className="chip"
            onClick={() => setIndex((i) => Math.min(weeks.length - 1, i + 1))}
            disabled={clamped === weeks.length - 1}
            aria-label="Next week"
          >
            ›
          </button>
        </div>
      </div>

      <div className="week-grid">
        {columns.map((col) => (
          <div key={col.key} className={`week-col ${col.fixtures.length ? '' : 'is-empty'}`}>
            <div className="week-col-head">
              <span className="week-dow">{col.label}</span>
              <span className="week-date">{col.date}</span>
            </div>
            {col.fixtures.map((f) => (
              <button key={f.id} type="button" className="week-cell" onClick={() => onOpen?.(f)}>
                <span className="week-time">{f.live ? 'LIVE' : timeOf(f.ko, tz)}</span>
                <span className="week-side">
                  <TeamLogo abbr={f.home} size={16} />
                  <span className="week-abbr">{TEAM_BY_ABBR[f.home]?.abbr ?? f.home}</span>
                  {f.score && !hideScores && <b>{f.score[0]}</b>}
                </span>
                <span className="week-side">
                  <TeamLogo abbr={f.away} size={16} />
                  <span className="week-abbr">{TEAM_BY_ABBR[f.away]?.abbr ?? f.away}</span>
                  {f.score && !hideScores && <b>{f.score[1]}</b>}
                </span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </main>
  )
}
