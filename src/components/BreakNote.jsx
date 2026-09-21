import { countdown, longDayOf } from '../utils/time.js'
import { LEAGUE } from '../config/league.js'

/**
 * The gap in the calendar, named.
 *
 * A fortnight with no fixtures looks the same as a bug: the list jumps from one
 * weekend to a date three weeks later with nothing in between, and the viewer
 * is left to work out whether the app has lost the matches or the league has
 * stopped. One line in the hole answers that, and it goes everywhere the hole
 * is visible — the fixture list, the week grid, a club's next fixtures, the
 * match popout — rather than only on the page it was first noticed on.
 *
 * `active` marks the break the viewer is actually sitting in, which is the one
 * case where a countdown is worth showing: the wait is the news.
 */
export default function BreakNote({ gap, tz, active = false }) {
  return (
    <aside className={`break-note${active ? ' is-active' : ''}`}>
      <span className="bn-label">
        <span aria-hidden="true">🌍</span> International break
      </span>
      <span className="bn-text">
        {gap.days} days without a {LEAGUE.name} match · back on {longDayOf(gap.resumeKo, tz)}
      </span>
      {active && <span className="bn-countdown">{countdown(gap.resumeKo)}</span>}
    </aside>
  )
}
