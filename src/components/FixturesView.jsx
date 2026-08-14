import { useMemo, useRef, useEffect, useState } from 'react'
import MatchCard from './MatchCard.jsx'
import NextMatch from './NextMatch.jsx'
import { groupByDay, longDayOf, dateKey, whenBucket } from '../utils/time.js'
import { assignMatchweeks, groupByMatchweek } from '../utils/matchweek.js'
import { useFollow } from '../context/follow.jsx'
import { useServices } from '../context/services.jsx'
import { watchableServices } from '../utils/watch.js'
import { parseQuery, matchesSearch } from '../utils/search.js'

// The tail of the season the default view falls back to when nothing is left to
// come — an off-season page shows the last week of results rather than blank.
const OFFSEASON_TAIL_DAYS = 7

// How many upcoming match-DAYS the default view shows before folding the rest
// behind the "Later fixtures" toggle. Counted in match-days (not calendar days)
// so a pre-season landing still shows the fortnight around opening weekend
// rather than an empty window. Without this cap a fresh rollover renders the
// entire 380-fixture season on load — heavy on a phone.
export const UPCOMING_LOOKAHEAD_DAYS = 14

// One-click examples that demonstrate the scoped-search syntax, each matched to
// something that really appears in the committed fixture list.
const SEARCH_EXAMPLES = ['team: Arsenal', 'city: London', 'venue: Anfield', 'tv: Peacock']

// The "When" quick filter. Exclusive — a fixture is in exactly one of these at a
// time — so clicking the active chip clears it rather than stacking a second bucket.
const WHEN_FILTERS = [
  { id: 'live', label: '🔴 Live' },
  { id: 'upcoming', label: '⏱ Upcoming' },
  { id: 'final', label: '✓ Finished' },
]

/**
 * The season as a chronological list, grouped by day.
 *
 * The default (upcoming) view is a plain flat list — it is short by design, the
 * next fortnight of match-days, with the rest of the upcoming season folded
 * behind a "Later fixtures" toggle. "Played" (showPast) opens the
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
  // The "When" quick filter — exclusive, so clicking the active chip clears it.
  const [when, setWhen] = useState('')
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
    // Empty = any time; otherwise live / upcoming / finished as the card reads now.
    if (when) list = list.filter((f) => whenBucket(f) === when)
    // An empty query matches everything, so this is a no-op until something is typed.
    return list.filter((f) => matchesSearch(f, parsedSearch))
  }, [fixtures, onlyFollowed, followed, watchOnly, services, serviceCount, when, parsedSearch])

  // How many filters are actively narrowing the list — drives the toggle badge
  // and the auto-open. A followed/service toggle only counts once there are
  // clubs/services for it to act on, mirroring what baseList applies.
  const activeFilterCount = useMemo(() => {
    let n = 0
    if (search.trim()) n++
    if (onlyFollowed && followed.size) n++
    if (watchOnly && serviceCount) n++
    if (when) n++
    return n
  }, [search, onlyFollowed, followed, watchOnly, serviceCount, when])

  // Clears everything the badge counts. The followed/watch toggles are the
  // shell's, so flip them off only when they're on (they're plain toggles).
  const clearAllFilters = () => {
    setSearch('')
    setWhen('')
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

  // The "Later fixtures" collapse is deliberately component-local, like the
  // search box: it is never written to the URL or localStorage, so it can't add
  // a persisted key (which would break the family's deep-link tests).
  const [showLater, setShowLater] = useState(false)

  // Default = the next fortnight of match-days, with the rest of the upcoming
  // season behind "Later fixtures"; off-season falls back to the last week of
  // results instead of an empty page; "Played" shows everything, grouped into
  // collapsible matchweeks.
  const { days, laterCount } = useMemo(() => {
    if (showPast) return { days: allDays, laterCount: 0 }
    if (!upcomingDays.length) {
      return { days: allDays.slice(-OFFSEASON_TAIL_DAYS), laterCount: 0 }
    }
    // Only days from today onward count toward the fortnight; a past day kept
    // alive by a live fixture stays on screen regardless.
    const future = upcomingDays.filter((d) => d.key >= todayKey)
    const hidden = showLater ? [] : future.slice(UPCOMING_LOOKAHEAD_DAYS)
    const shown = hidden.length ? upcomingDays.slice(0, upcomingDays.length - hidden.length) : upcomingDays
    return { days: shown, laterCount: hidden.reduce((n, d) => n + d.fixtures.length, 0) }
  }, [allDays, upcomingDays, showPast, showLater, todayKey])

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
  // Per-day folding and per-day spoiler overrides. Component-local like the search
  // box above: a folded day is a reading position, not a shareable preference.
  const [foldedDays, setFoldedDays] = useState(() => new Set())
  const [dayOverrides, setDayOverrides] = useState({})

  const toggleDay = (key) =>
    setFoldedDays((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  // An override is sticky per day and beats the global spoiler toggle, so a result
  // can be revealed without leaving spoiler-free mode for the rest of the page.
  const scoresHidden = (key) => (key in dayOverrides ? dayOverrides[key] : hideScores)
  const toggleReveal = (key) =>
    setDayOverrides((prev) => ({ ...prev, [key]: !scoresHidden(key) }))

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

  const renderDay = (day) => {
    const folded = foldedDays.has(day.key)
    const hidden = scoresHidden(day.key)
    return (
      <section
        key={day.key}
        className={`day ${day.key === todayKey ? 'is-today' : ''}`}
        ref={(el) => {
          dayRefs.current[day.key] = el
        }}
      >
        <h3 className="day-head">
          <button
            type="button"
            className="day-fold"
            onClick={() => toggleDay(day.key)}
            aria-expanded={!folded}
            aria-label={`${folded ? 'Show' : 'Hide'} fixtures on ${longDayOf(day.fixtures[0].ko, tz)}`}
          >
            <span className="day-caret" aria-hidden="true">
              {folded ? '▸' : '▾'}
            </span>
            <span className="day-name">{longDayOf(day.fixtures[0].ko, tz)}</span>
          </button>
          {day.key === todayKey && <span className="today-tag">Today</span>}
          <span className="day-count">{day.fixtures.length}</span>
          <button
            type="button"
            className="day-eye"
            onClick={() => toggleReveal(day.key)}
            aria-pressed={hidden}
            title={hidden ? 'Show scores for this day' : 'Hide scores for this day'}
          >
            {hidden ? '🙈' : '👁'}
          </button>
        </h3>
        {!folded && (
          <div className="day-list">
            {day.fixtures.map((f) => (
              <MatchCard
                key={f.id}
                fixture={f}
                tz={tz}
                hideScores={hidden}
                onOpen={onOpen}
                onPickTeam={onPickTeam}
              />
            ))}
          </div>
        )}
      </section>
    )
  }

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
            <div className="when-chips">
              <span className="hint-label">When:</span>
              {WHEN_FILTERS.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  className={`hint-chip${when === w.id ? ' active' : ''}`}
                  onClick={() => setWhen((cur) => (cur === w.id ? '' : w.id))}
                  aria-pressed={when === w.id}
                >
                  {w.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <NextMatch fixtures={baseList} tz={tz} onJump={(key) => setPendingScroll(key)} />

      {!days.length && (
        <p className="empty">
          {onlyFollowed
            ? 'No fixtures for the clubs you follow. Try turning off the followed filter.'
            : 'No fixtures to show. Turn on “Played” to see results so far.'}
        </p>
      )}

      {days.length > 0 && !showPast && days.map(renderDay)}

      {!showPast && laterCount > 0 && (
        <button
          type="button"
          className="chip later-toggle"
          onClick={() => setShowLater(true)}
          title="Show the rest of the upcoming season"
        >
          <span aria-hidden="true">▸</span> Later fixtures
          <span className="chip-count">{laterCount}</span>
        </button>
      )}
      {!showPast && showLater && (
        <button
          type="button"
          className="chip later-toggle"
          onClick={() => setShowLater(false)}
          title="Collapse back to the next two weeks"
        >
          <span aria-hidden="true">▾</span> Later fixtures
        </button>
      )}

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
