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

export function clearAthleteCache() {
  cache.clear()
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
