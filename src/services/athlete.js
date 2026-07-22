/**
 * Player biography, fetched when a player is opened from a team sheet.
 *
 * The match statistics already arrive with the lineup, so this only supplies
 * the things a squad list cannot: age, nationality, the full position name
 * and a headshot. It is a nicety — a failure returns null and the player's
 * match figures are shown on their own.
 *
 * Responses are memoised for the page's lifetime because the same player
 * appears in both a lineup and the substitution list, and reopening a player
 * should not refetch a birthday.
 *
 * Deliberately not cancellable. The cache is shared, so letting one caller
 * abort the request poisons the entry for every later one: the aborted
 * rejection is what gets memoised, and the player's biography never loads
 * again. This is not hypothetical — React's development double-mount aborts
 * the first request every time, and closing a match quickly does the same in
 * production. Callers that no longer care simply ignore the result.
 */

const ATHLETE = 'https://site.web.api.espn.com/apis/common/v3/sports/soccer/eng.1/athletes'

const cache = new Map()
const logCache = new Map()

export function clearAthleteCache() {
  cache.clear()
  logCache.clear()
}

export async function fetchAthlete(id) {
  if (!id) return null
  if (cache.has(id)) return cache.get(id)

  const pending = (async () => {
    try {
      const res = await fetch(`${ATHLETE}/${id}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const a = data.athlete ?? data

      return {
        id: a.id,
        name: a.displayName ?? a.fullName ?? null,
        position: a.position?.displayName ?? null,
        team: a.team?.displayName ?? null,
        age: a.age ?? null,
        dob: a.displayDOB ?? null,
        height: a.displayHeight ?? null,
        weight: a.displayWeight ?? null,
        citizenship: a.citizenship ?? null,
        // The soccer feed ships the country flag alongside citizenship, so the
        // nationality line gets a flag for free — no country-code mapping.
        flag: a.flag?.href ?? null,
        headshot: a.headshot?.href ?? null,
      }
    } catch {
      // Cached as null so a player whose record is missing is not refetched
      // every time the row is reopened.
      return null
    }
  })()

  cache.set(id, pending)
  return pending
}

/**
 * The player's last few matches.
 *
 * The `/gamelog` endpoint the basketball feeds use answers 500 for soccer, and
 * `/stats` and `/splits` are 404 — the log lives inside `/overview` instead,
 * already trimmed to the most recent handful.
 *
 * Two things about the payload are worth stating, because both would pass
 * silently if got wrong:
 *
 *   1. `stats` is a bare positional array. Its order is described by the
 *      block's own `labels`, so the columns are resolved by name rather than
 *      by a hardcoded index — the same trap that put the wrong figures on the
 *      NBA leaderboards.
 *   2. The matches arrive in no particular order, so they are sorted here.
 *
 * The log is not league-only: internationals and cup ties are in it, and in
 * the close season they are usually all of it. Every row therefore carries the
 * competition it came from, and `isLeague` marks the ones this app is actually
 * about — the caller filters, because filtering here would leave a caller no
 * way to offer the rest.
 *
 * Nothing is truncated for the same reason: the caller trims to what it shows,
 * after it has decided what counts.
 *
 * Memoised and non-cancellable for the same reasons as `fetchAthlete` above.
 */
/** The feed's own name for the competition this app covers. */
const LEAGUE = 'English Premier League'

/**
 * The score, read from the player's side.
 *
 * `score` in the payload is written **winner first**, not home first and not
 * the player's side first — so a 0-3 defeat arrives as "3-0" and, printed
 * beside an "L", reads as though the player's team scored three. The two team
 * scores are unambiguous, so the line is rebuilt from those and only falls back
 * to the feed's string when a match is missing them.
 */
function scoreFor(m) {
  const own = m.team?.id
  const { homeTeamId: home, homeTeamScore: homeScore, awayTeamScore: awayScore } = m
  if (own == null || home == null || homeScore == null || awayScore == null) {
    return m.score ?? null
  }
  return String(own) === String(home) ? `${homeScore}-${awayScore}` : `${awayScore}-${homeScore}`
}

export async function fetchRecentMatches(id) {
  if (!id) return []
  if (logCache.has(id)) return logCache.get(id)

  const pending = (async () => {
    try {
      const res = await fetch(`${ATHLETE}/${id}/overview`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const log = (await res.json())?.gameLog
      const block = log?.statistics?.[0]
      if (!block) return []

      const labels = block.labels ?? []
      const meta = log.events ?? {}

      return (block.events ?? [])
        .map((e) => {
          const at = (label) => {
            const i = labels.indexOf(label)
            return i === -1 ? null : e.stats?.[i] ?? null
          }
          // Whatever the feed sent, keyed by its own label. Goalkeepers get a
          // different set from outfielders — saves, goals against and clean
          // sheets in place of shots and offsides — so picking the columns
          // here would silently blank every keeper's log.
          const stats = Object.fromEntries(labels.map((l, i) => [l, e.stats?.[i] ?? null]))
          const m = meta[e.eventId] ?? {}
          return {
            id: e.eventId,
            date: m.gameDate ?? null,
            // 'vs' or '@'; the feed omits it rather than guessing, and so do we.
            atVs: m.atVs ?? null,
            opponent: m.opponent?.abbreviation ?? m.opponent?.displayName ?? null,
            result: m.gameResult ?? null,
            score: scoreFor(m),
            competition: m.leagueAbbreviation ?? m.leagueName ?? null,
            isLeague: m.leagueName === LEAGUE,
            appearance: at('APP'),
            stats,
          }
        })
        // A match with no date cannot be placed in the list, and an undated
        // row would sort arbitrarily against the rest.
        .filter((m) => m.date)
        .sort((a, b) => b.date.localeCompare(a.date))
    } catch {
      return []
    }
  })()

  logCache.set(id, pending)
  return pending
}
