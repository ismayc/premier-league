import { useMemo, useRef, useEffect, useState } from 'react'
import MatchCard from './MatchCard.jsx'
import { groupByDay, longDayOf, countdown, dateKey } from '../utils/time.js'
import { TEAM_BY_ABBR } from '../data/teams.js'
import { useFollow } from '../context/follow.jsx'
import { useServices } from '../context/services.jsx'
import { watchableServices } from '../utils/watch.js'

// The tail of the season the default view falls back to when nothing is left to
// come — an off-season page shows the last week of results rather than blank.
const OFFSEASON_TAIL_DAYS = 7

// Month labels derived from a 'YYYY-MM' key itself (UTC so the month never
// shifts across a zone boundary).
const monthLabel = (mk) =>
  new Date(`${mk}-01T12:00:00.000Z`).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
const monthShort = (mk) =>
  new Date(`${mk}-01T12:00:00.000Z`).toLocaleDateString('en-GB', {
    month: 'short',
    timeZone: 'UTC',
  })

/**
 * The season as a chronological list, grouped by day.
 *
 * The default (upcoming) view is a plain flat list — it is short by design, the
 * next fixture through the end of the season. "Played" (showPast) opens the
 * whole ~10-month season, which is a lot to scroll, so it is grouped into
 * collapsible month sections under a sticky jump-bar. An off-season with
 * nothing upcoming falls back to the last week of results instead of an empty
 * page.
 */
export default function FixturesView({
  fixtures,
  tz,
  hideScores,
  onlyFollowed,
  onToggleFollowed,
  showPast,
  onTogglePast,
  watchOnly,
  onToggleWatch,
  onEditServices,
  onOpen,
  onPickTeam,
  onExport,
}) {
  const { followed } = useFollow()
  const { services, count: serviceCount } = useServices()

  const now = new Date()
  const todayKey = dateKey(now.toISOString(), tz)
  const thisMonth = todayKey.slice(0, 7)

  // The followed and watch filters apply in every mode; the past cut is layered
  // on top for the default view only, so this base list can also feed the tail.
  const baseList = useMemo(() => {
    let list = fixtures
    if (onlyFollowed && followed.size) {
      list = list.filter((f) => followed.has(f.home) || followed.has(f.away))
    }
    // A no-op until services are chosen, so clearing them all cannot empty the
    // list. A fixture with no listing yet is kept: broadcasters are assigned
    // only weeks ahead, and "not announced" is not "you cannot watch it".
    if (watchOnly && serviceCount) {
      list = list.filter((f) => !f.tv?.length || watchableServices(f.tv, services).length > 0)
    }
    return list
  }, [fixtures, onlyFollowed, followed, watchOnly, services, serviceCount])

  // The whole season as day buckets (all filters bar the past cut) — what
  // "Played" shows, and the pool the off-season tail is drawn from.
  const allDays = useMemo(() => groupByDay(baseList, tz), [baseList, tz])

  // The default view: today onward plus any live match. Filtered at fixture
  // level so a live game on a past day survives while its finished siblings go.
  const upcomingDays = useMemo(() => {
    const list = baseList.filter((f) => f.live || dateKey(f.ko, tz) >= todayKey)
    return groupByDay(list, tz)
  }, [baseList, tz, todayKey])

  // Off-season fallback: nothing upcoming -> the last week of the season.
  const defaultDays = upcomingDays.length ? upcomingDays : allDays.slice(-OFFSEASON_TAIL_DAYS)

  const days = showPast ? allDays : defaultDays

  // Export reads the fixtures actually on screen.
  const visible = useMemo(() => days.flatMap((d) => d.fixtures), [days])

  // Full-season grouping: [ [monthKey, [day, ...]], ... ] in order.
  const months = useMemo(() => {
    const map = new Map()
    for (const day of allDays) {
      const mk = day.key.slice(0, 7)
      if (!map.has(mk)) map.set(mk, [])
      map.get(mk).push(day)
    }
    return [...map.entries()]
  }, [allDays])

  // Only the current month opens to start; the rest collapse the season to a
  // row of headers.
  const [expanded, setExpanded] = useState(() => new Set([thisMonth]))
  const monthRefs = useRef({})
  const todayRef = useRef(null)
  const [pendingScroll, setPendingScroll] = useState(null)

  const toggleMonth = (mk) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(mk)) next.delete(mk)
      else next.add(mk)
      return next
    })
  const jumpToMonth = (mk) => {
    setExpanded((prev) => new Set(prev).add(mk))
    setPendingScroll(mk)
  }
  // "Today" jump: open the current month and scroll to today itself.
  const jumpToToday = () => {
    setExpanded((prev) => new Set(prev).add(thisMonth))
    setPendingScroll('today')
  }

  // Landing scroll (full season only): today within its open month, falling
  // back to the month header when today has no fixture.
  useEffect(() => {
    if (!showPast) return
    const target = todayRef.current || monthRefs.current[thisMonth]
    target?.scrollIntoView({ block: 'start' })
  }, [showPast, thisMonth])

  // Jump-bar scroll: after a chip (or "Today") opens its month, scroll the
  // target into view. Clearing pendingScroll re-runs this, but the guard makes
  // the second pass a no-op.
  useEffect(() => {
    if (pendingScroll == null) return
    const el =
      pendingScroll === 'today'
        ? todayRef.current || monthRefs.current[thisMonth]
        : monthRefs.current[pendingScroll]
    el?.scrollIntoView({ block: 'start' })
    setPendingScroll(null)
  }, [pendingScroll, thisMonth])

  // Deliberately not memoised on [fixtures]. `now` is rebuilt every render, so
  // a memo keyed only on the fixture list would pin the banner to a kickoff
  // that has since passed: countdown() then returns null and the banner reads
  // a bare "now" forever, only correcting when the fixture list itself
  // changes. A find over one season is far cheaper than that bug.
  const next = fixtures.find((f) => !f.score && !f.unplayed && new Date(f.ko) > now)

  const renderDay = (day) => (
    <section
      key={day.key}
      className="day"
      ref={(el) => {
        if (day.key === todayKey) todayRef.current = el
      }}
    >
      <h3 className={`day-head ${day.key === todayKey ? 'is-today' : ''}`}>
        {longDayOf(day.fixtures[0].ko, tz)}
        {day.key === todayKey && <span className="today-tag">Today</span>}
        <span className="day-count">{day.fixtures.length}</span>
      </h3>
      <div className="day-list">
        {day.fixtures.map((f) => (
          <MatchCard
            key={f.id}
            fixture={f}
            tz={tz}
            hideScores={hideScores}
            onOpen={onOpen}
            onPickTeam={onPickTeam}
          />
        ))}
      </div>
    </section>
  )

  return (
    <main className="view">
      <div className="view-head">
        <h2>Fixtures</h2>
        <div className="view-tools">
          <button
            type="button"
            className={`chip ${showPast ? 'on' : ''}`}
            onClick={onTogglePast}
            aria-pressed={showPast}
          >
            Played
          </button>
          <button
            type="button"
            className={`chip ${onlyFollowed ? 'on' : ''}`}
            onClick={onToggleFollowed}
            aria-pressed={onlyFollowed}
            disabled={!followed.size}
            title={followed.size ? 'Only followed clubs' : 'Follow a club first'}
          >
            ★ Followed
          </button>
          {serviceCount ? (
            <button
              type="button"
              className={`chip ${watchOnly ? 'on' : ''}`}
              onClick={onToggleWatch}
              aria-pressed={watchOnly}
              title="Only matches on the services you have"
            >
              📺 On my services ({serviceCount})
            </button>
          ) : null}
          <button
            type="button"
            className="chip"
            onClick={onEditServices}
            title="Pick the streaming services and TV packages you have"
          >
            {serviceCount ? 'Edit services' : '📺 My services'}
          </button>
          <button type="button" className="chip" onClick={() => onExport?.(visible)}>
            Export
          </button>
        </div>
      </div>

      {next && (
        <div className="next-up">
          <span className="next-label">Next kickoff</span>
          <strong>
            {TEAM_BY_ABBR[next.home]?.name} v {TEAM_BY_ABBR[next.away]?.name}
          </strong>
          {/* No null fallback needed: `next` is selected with the same `now`
              the countdown uses, so its kickoff is always still ahead. */}
          <span className="next-when">{countdown(next.ko, now)}</span>
        </div>
      )}

      {!days.length && (
        <p className="empty">
          {onlyFollowed
            ? 'No fixtures for the clubs you follow. Try turning off the followed filter.'
            : 'No fixtures to show. Turn on “Played” to see results so far.'}
        </p>
      )}

      {days.length > 0 && !showPast && days.map(renderDay)}

      {days.length > 0 && showPast && (
        <>
          <nav className="month-jump" aria-label="Jump to month">
            {months.map(([mk]) => (
              <button
                key={mk}
                type="button"
                className={`chip month-chip ${mk === thisMonth ? 'is-current' : ''}`}
                onClick={() => jumpToMonth(mk)}
              >
                {monthShort(mk)}
              </button>
            ))}
            <button
              type="button"
              className="chip month-chip month-today"
              onClick={jumpToToday}
            >
              Today
            </button>
          </nav>
          {months.map(([mk, monthDays]) => {
            const open = expanded.has(mk)
            const count = monthDays.reduce((n, d) => n + d.fixtures.length, 0)
            return (
              <div className="month" key={mk} ref={(el) => (monthRefs.current[mk] = el)}>
                <button
                  type="button"
                  className={`month-head ${open ? 'open' : ''}`}
                  onClick={() => toggleMonth(mk)}
                  aria-expanded={open}
                >
                  <span aria-hidden="true">{open ? '▾' : '▸'}</span> <span>{monthLabel(mk)}</span>
                  <span className="month-count">
                    {count} {count === 1 ? 'match' : 'matches'}
                  </span>
                </button>
                {open && <div className="month-days">{monthDays.map(renderDay)}</div>}
              </div>
            )
          })}
        </>
      )}
    </main>
  )
}
