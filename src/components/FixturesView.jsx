import { useMemo, useRef, useEffect, useState } from 'react'
import MatchCard from './MatchCard.jsx'
import { groupByDay, longDayOf, countdown, dateKey } from '../utils/time.js'
import { assignMatchweeks, groupByMatchweek } from '../utils/matchweek.js'
import { TEAM_BY_ABBR } from '../data/teams.js'
import { useFollow } from '../context/follow.jsx'
import { useServices } from '../context/services.jsx'
import { watchableServices } from '../utils/watch.js'
import { parseQuery, matchesSearch } from '../utils/search.js'

// The tail of the season the default view falls back to when nothing is left to
// come — an off-season page shows the last week of results rather than blank.
const OFFSEASON_TAIL_DAYS = 7

// One-click examples that demonstrate the scoped-search syntax, each matched to
// something that really appears in the committed fixture list.
const SEARCH_EXAMPLES = ['team: Arsenal', 'city: London', 'venue: Anfield', 'tv: Peacock']

/**
 * The season as a chronological list, grouped by day.
 *
 * The default (upcoming) view is a plain flat list — it is short by design, the
 * next fixture through the end of the season. "Played" (showPast) opens the
 * whole 38-matchweek season, which is a lot to scroll, so it is grouped into
 * collapsible matchweek sections under a sticky jump-bar. (The `.month-*` class
 * names and the --month-jump-h sticky var are the family's shared collapse
 * styling, used here for matchweeks and by the sibling viewers for months.) An
 * off-season with nothing upcoming falls back to the last week of results
 * instead of an empty page.
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

  // Free-text / scoped search over the fixtures. Deliberately component-local —
  // it is never written to the URL or localStorage, so it can't add a persisted
  // key or change any shared link (which would break the deep-link tests).
  const [search, setSearch] = useState('')
  // Parse the search box once per keystroke, not once per fixture.
  const parsedSearch = useMemo(() => parseQuery(search), [search])
  // The filter panel is collapsed by default, but opens on load if a shared link
  // already applies "followed", or the device remembers a watch-only filter — so
  // an active filter is never hidden behind a closed panel. (Search starts empty.)
  const [filtersOpen, setFiltersOpen] = useState(() => Boolean(onlyFollowed) || Boolean(watchOnly))
  const filterBarRef = useRef(null)
  const monthJumpRef = useRef(null)

  const now = new Date()
  const todayKey = dateKey(now.toISOString(), tz)

  // The followed, watch and search filters apply in every mode; the past cut is
  // layered on top for the default view only, so this base list can also feed
  // the tail.
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
    // An empty query matches everything, so this is a no-op until something is typed.
    return list.filter((f) => matchesSearch(f, parsedSearch))
  }, [fixtures, onlyFollowed, followed, watchOnly, services, serviceCount, parsedSearch])

  // How many filters are actively narrowing the list — drives the toggle badge
  // and the auto-open. A followed/service toggle only counts once there are
  // clubs/services for it to act on, mirroring what baseList applies.
  const activeFilterCount = useMemo(() => {
    let n = 0
    if (search.trim()) n++
    if (onlyFollowed && followed.size) n++
    if (watchOnly && serviceCount) n++
    return n
  }, [search, onlyFollowed, followed, watchOnly, serviceCount])

  // Clears everything the badge counts. The followed/watch toggles are the
  // shell's, so flip them off only when they're on (they're plain toggles).
  const clearAllFilters = () => {
    setSearch('')
    if (onlyFollowed) onToggleFollowed()
    if (watchOnly) onToggleWatch()
  }

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

  // Matchweek numbers keyed by fixture id, reconstructed from the FULL fixture
  // list so the numbering is stable however the filters narrow the list below.
  const mwById = useMemo(() => assignMatchweeks(fixtures), [fixtures])

  // Full-season grouping: [ { mw, days:[day,...], count }, ... ] in matchweek order.
  const weeks = useMemo(() => groupByMatchweek(allDays, mwById), [allDays, mwById])

  // Where a "Today" jump (and the full-season landing) goes: today if it has
  // fixtures, else the NEXT fixture-day, else (the whole season already past)
  // the most recent one.
  const nowKey = useMemo(() => {
    const upcoming = allDays.find((d) => d.key >= todayKey)
    return (upcoming || allDays[allDays.length - 1])?.key ?? null
  }, [allDays, todayKey])

  // The matchweek holding the landing day (opens on load) and the one holding
  // today (flagged in the jump-bar — null when today itself has no fixture).
  const nowMw = weeks.find((w) => w.days.some((d) => d.key === nowKey))?.mw ?? null
  const currentMw = weeks.find((w) => w.days.some((d) => d.key === todayKey))?.mw ?? null

  // The matchweek holding that landing day opens to start; the rest collapse the
  // season to a row of headers.
  const [expanded, setExpanded] = useState(() => new Set([nowMw]))
  const weekRefs = useRef({})
  const dayRefs = useRef({})
  const [pendingScroll, setPendingScroll] = useState(null)

  const toggleWeek = (mw) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(mw)) next.delete(mw)
      else next.add(mw)
      return next
    })
  const jumpToWeek = (mw) => {
    setExpanded((prev) => new Set(prev).add(mw))
    setPendingScroll(mw)
  }
  // "Today" jump: open the matchweek holding the landing day and scroll to that
  // day itself (today, or the next fixture-day when today is idle) — never just
  // the matchweek header.
  const jumpToToday = () => {
    setExpanded((prev) => new Set(prev).add(nowMw))
    setPendingScroll(nowKey)
  }
  // "Top" jump: back to the very top of the page — where the settings toolbar
  // lives, which the landing scroll otherwise leaves above the fold.
  const jumpToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' })

  // Landing scroll (full season only): the "now" day (today / next fixture-day),
  // which its open month renders.
  useEffect(() => {
    if (!showPast) return
    dayRefs.current[nowKey]?.scrollIntoView({ block: 'start' })
  }, [showPast, nowKey])

  // Jump-bar scroll: after a chip or "Today" expands its target, scroll it into
  // view — a day key resolves via dayRefs, a matchweek key via weekRefs. Clearing
  // pendingScroll re-runs this, but the guard makes the second pass a no-op.
  useEffect(() => {
    if (pendingScroll == null) return
    const el = dayRefs.current[pendingScroll] || weekRefs.current[pendingScroll]
    el?.scrollIntoView({ block: 'start' })
    setPendingScroll(null)
  }, [pendingScroll])

  // Publish the sticky filter bar's height as --filter-bar-h so the sticky
  // month jump-bar can pin directly beneath it, not behind it. The bar is always
  // rendered here, so its ref is set by the time this runs. Re-measured whenever
  // the bar's height can change (panel open/close, an active-filter chip
  // appearing) and on resize (it wraps on narrow screens).
  useEffect(() => {
    const publish = () =>
      document.documentElement.style.setProperty(
        '--filter-bar-h',
        `${filterBarRef.current.offsetHeight}px`
      )
    publish()
    window.addEventListener('resize', publish)
    return () => window.removeEventListener('resize', publish)
  }, [filtersOpen, activeFilterCount, showPast, serviceCount])

  // Publish the sticky matchweek jump-bar's height as --month-jump-h so a
  // day/matchweek scrolled to `block: 'start'` clears BOTH sticky bars (filter
  // bar + this one) instead of landing behind them. 0 in the default view, where
  // the bar isn't rendered. Re-measured when the mode or matchweek set changes
  // and on resize.
  useEffect(() => {
    const publish = () =>
      document.documentElement.style.setProperty(
        '--month-jump-h',
        `${monthJumpRef.current?.offsetHeight ?? 0}px`
      )
    publish()
    window.addEventListener('resize', publish)
    return () => window.removeEventListener('resize', publish)
  }, [showPast, weeks.length])

  // Deliberately not memoised on [fixtures]. `now` is rebuilt every render, so
  // a memo keyed only on the fixture list would pin the banner to a kickoff
  // that has since passed: countdown() then returns null and the banner reads
  // a bare "now" forever, only correcting when the fixture list itself
  // changes. A find over one season is far cheaper than that bug.
  const next = fixtures.find((f) => !f.score && !f.unplayed && new Date(f.ko) > now)

  const renderDay = (day) => (
    <section
      key={day.key}
      className={`day ${day.key === todayKey ? 'is-today' : ''}`}
      ref={(el) => {
        dayRefs.current[day.key] = el
      }}
    >
      <h3 className="day-head">
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
      </div>

      <div className="filter-bar" ref={filterBarRef}>
        <div className="filter-controls">
          <button
            type="button"
            className={`chip filter-toggle ${filtersOpen ? 'on' : ''}`}
            onClick={() => setFiltersOpen((o) => !o)}
            aria-expanded={filtersOpen}
            aria-controls="filters-panel"
          >
            ⚙ Filters
            {activeFilterCount > 0 && <span className="filter-badge">{activeFilterCount}</span>}
            <span className="chev" aria-hidden="true">
              {filtersOpen ? '▲' : '▼'}
            </span>
          </button>
          {activeFilterCount > 0 && (
            <button type="button" className="chip filter-clear" onClick={clearAllFilters}>
              Clear all
            </button>
          )}
          <button
            type="button"
            className={`chip ${showPast ? 'on' : ''}`}
            onClick={onTogglePast}
            aria-pressed={showPast}
          >
            Played
          </button>
          <button type="button" className="chip" onClick={() => onExport?.(visible)}>
            Export
          </button>
        </div>

        {filtersOpen && (
          <div className="filters-panel" id="filters-panel">
            <div className="filters">
              <label className="field search-field">
                <span className="sr-only">Search fixtures</span>
                <input
                  className="search"
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder='Search — try "team: Arsenal" or "city: London"'
                />
              </label>
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
            </div>
            <div className="search-hints">
              <span className="hint-label">Try:</span>
              {SEARCH_EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  className="hint-chip"
                  onClick={() => setSearch(ex)}
                >
                  {ex}
                </button>
              ))}
              <span className="hint-note">fields: team · city · venue · tv</span>
            </div>
          </div>
        )}
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
          <nav className="month-jump" aria-label="Jump to matchweek" ref={monthJumpRef}>
            {weeks.map(({ mw }) => (
              <button
                key={mw}
                type="button"
                className={`chip month-chip ${mw === currentMw ? 'is-current' : ''}`}
                onClick={() => jumpToWeek(mw)}
              >
                MW{mw}
              </button>
            ))}
            <button
              type="button"
              className="chip month-chip month-top"
              onClick={jumpToTop}
            >
              ↑ Top
            </button>
            <button
              type="button"
              className="chip month-chip month-today"
              onClick={jumpToToday}
            >
              Today
            </button>
          </nav>
          {weeks.map(({ mw, days: weekDays, count }) => {
            const open = expanded.has(mw)
            return (
              <div className="month" key={mw} ref={(el) => (weekRefs.current[mw] = el)}>
                <button
                  type="button"
                  className={`month-head ${open ? 'open' : ''}`}
                  onClick={() => toggleWeek(mw)}
                  aria-expanded={open}
                >
                  <span aria-hidden="true">{open ? '▾' : '▸'}</span> <span>Matchweek {mw}</span>
                  <span className="month-count">
                    {count} {count === 1 ? 'match' : 'matches'}
                  </span>
                </button>
                {open && <div className="month-days">{weekDays.map(renderDay)}</div>}
              </div>
            )
          })}
        </>
      )}
    </main>
  )
}
