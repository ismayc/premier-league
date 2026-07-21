import { useMemo } from 'react'
import MatchCard from './MatchCard.jsx'
import { groupByDay, longDayOf, countdown, dateKey } from '../utils/time.js'
import { TEAM_BY_ABBR } from '../data/teams.js'
import { useFollow } from '../context/follow.jsx'
import { useServices } from '../context/services.jsx'
import { watchableServices } from '../utils/watch.js'

/**
 * The season as a chronological list, grouped by day.
 *
 * The default scroll position is the next fixture rather than the top of the
 * season — in August that is matchweek one, and in April it is whatever is on
 * this weekend, which is what someone opening the page actually wants.
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

  const visible = useMemo(() => {
    let list = fixtures
    if (onlyFollowed && followed.size) {
      list = list.filter((f) => followed.has(f.home) || followed.has(f.away))
    }
    if (!showPast) {
      list = list.filter((f) => f.live || dateKey(f.ko, tz) >= todayKey)
    }
    // A no-op until services are chosen, so clearing them all cannot empty the
    // list. A fixture with no listing yet is kept: broadcasters are assigned
    // only weeks ahead, and "not announced" is not "you cannot watch it".
    if (watchOnly && serviceCount) {
      list = list.filter((f) => !f.tv?.length || watchableServices(f.tv, services).length > 0)
    }
    return list
  }, [
    fixtures,
    onlyFollowed,
    followed,
    showPast,
    watchOnly,
    services,
    serviceCount,
    tz,
    todayKey,
  ])

  const days = useMemo(() => groupByDay(visible, tz), [visible, tz])

  // Deliberately not memoised on [fixtures]. `now` is rebuilt every render, so
  // a memo keyed only on the fixture list would pin the banner to a kickoff
  // that has since passed: countdown() then returns null and the banner reads
  // a bare "now" forever, only correcting when the fixture list itself
  // changes. A find over one season is far cheaper than that bug.
  const next = fixtures.find((f) => !f.score && !f.unplayed && new Date(f.ko) > now)

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

      {days.map((day) => (
        <section key={day.key} className="day">
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
      ))}
    </main>
  )
}
