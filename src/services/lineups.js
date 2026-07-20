/**
 * Team sheets, fetched per match rather than committed.
 *
 * Lineups are the one part of this app that cannot be a build-time snapshot:
 * they are published about an hour before kickoff and are meaningless before
 * that, so a nightly refresh would commit 380 empty squads and still be wrong
 * an hour before every match. Fetching when a match is actually opened costs
 * one request, works retroactively for any past fixture, and keeps the
 * committed data set to things that do not change.
 *
 * Keyless and CORS-open, like the live overlay. A failure here is not an
 * error state worth shouting about — the match detail simply says it has no
 * team sheet yet.
 */

const SUMMARY = 'https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/summary'

/**
 * ESPN's positional abbreviations are granular and side-suffixed. Sampled
 * across a run of matches, the starting-XI codes are:
 *
 *   G                          goalkeeper
 *   CD, CD-L, CD-R, LB, RB     defenders
 *   LM, RM, CM-L, CM-R, AM,
 *   AM-L, AM-R                 midfielders
 *   F, CF-L, CF-R              forwards
 *
 * The leading letter alone will not do the job: CD, CM and CF all begin with
 * C, and LB/RB begin with neither D nor B. Prefixes are therefore matched
 * two characters first, so CD is never mistaken for CM.
 */
const LINE = {
  G: 'Goalkeepers',
  D: 'Defenders',
  M: 'Midfielders',
  F: 'Forwards',
}

/**
 * Group a starting XI into the four lines. `formationPlace` orders players
 * within the team sheet, and position abbreviations start with the line's
 * letter for every outfield role ESPN publishes.
 */
export function groupByLine(players) {
  const groups = new Map()
  for (const p of players) {
    const key = lineOf(p.pos)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(p)
  }
  return [...groups.entries()].map(([line, squad]) => ({ line, players: squad }))
}

export function lineOf(pos) {
  if (!pos) return 'Other'
  const p = pos.toUpperCase()

  if (p.startsWith('G')) return LINE.G
  // Wing-backs and full-backs before the midfield check, so LWB is not read
  // as a left midfielder.
  if (p.startsWith('CD') || p.startsWith('SW') || /^[LR]W?B/.test(p) || p === 'D') return LINE.D
  if (/^(CM|AM|DM|LM|RM)/.test(p) || p === 'M') return LINE.M
  if (/^(CF|ST|LW|RW|F)/.test(p)) return LINE.F

  return 'Other'
}

/**
 * Stats worth showing for a player's match, in display order. The feed
 * returns fourteen, most of them zero for most players; these are the ones
 * that say something about what a player actually did.
 *
 * Goalkeeping figures come first because they are the whole story for a
 * keeper and always zero for everyone else — the UI drops zeroes, so an
 * outfielder never shows a saves column.
 */
const MATCH_STATS = [
  ['saves', 'Saves'],
  ['goalsConceded', 'Conceded'],
  ['shotsFaced', 'Shots faced'],
  ['totalGoals', 'Goals'],
  ['goalAssists', 'Assists'],
  ['totalShots', 'Shots'],
  ['shotsOnTarget', 'On target'],
  ['foulsCommitted', 'Fouls'],
  ['foulsSuffered', 'Fouled'],
  ['yellowCards', 'Yellow'],
  ['redCards', 'Red'],
  ['ownGoals', 'Own goals'],
]

function readStats(stats) {
  const byName = new Map((stats ?? []).map((s) => [s.name, s]))
  return MATCH_STATS.map(([name, label]) => {
    const stat = byName.get(name)
    if (!stat) return null
    const value = Number(stat.displayValue)
    return { name, label, value: Number.isNaN(value) ? stat.displayValue : value }
  }).filter(Boolean)
}

function readPlayer(entry) {
  return {
    id: entry.athlete?.id,
    name: entry.athlete?.displayName ?? 'Unknown',
    jersey: entry.jersey ?? null,
    pos: entry.position?.abbreviation ?? null,
    place: entry.formationPlace ? Number(entry.formationPlace) : null,
    subbedIn: entry.subbedIn === true,
    subbedOut: entry.subbedOut === true,
    stats: readStats(entry.stats),
  }
}

function readSide(side) {
  const squad = (side.roster ?? []).map(readPlayer)
  // Formation place orders the sheet from the goalkeeper outwards. Bench
  // players have none, so they fall to the end in the order the feed gave.
  const place = (p) => p.place ?? 99
  const byPlace = (a, b) => place(a) - place(b)

  return {
    homeAway: side.homeAway,
    name: side.team?.displayName ?? side.team?.shortDisplayName ?? null,
    formation: side.formation ?? null,
    starters: squad.filter((p, i) => (side.roster[i].starter === true)).sort(byPlace),
    bench: squad.filter((p, i) => side.roster[i].starter !== true).sort(byPlace),
  }
}

/**
 * Substitutions in the order they happened. ESPN lists the player coming on
 * first and the player going off second, and also writes a readable sentence
 * we do not need to reconstruct.
 */
function readSubs(events) {
  return (events ?? [])
    .filter((e) => e.type?.type === 'substitution')
    .map((e) => ({
      minute: e.clock?.displayValue ?? null,
      team: e.team?.displayName ?? null,
      on: e.participants?.[0]?.athlete?.displayName ?? null,
      off: e.participants?.[1]?.athlete?.displayName ?? null,
    }))
    .filter((s) => s.on || s.off)
}

/**
 * @returns null when no team sheet has been published yet, which is the
 *   normal state for any fixture more than about an hour away.
 */
export async function fetchLineup(eventId, { signal } = {}) {
  let data
  try {
    const res = await fetch(`${SUMMARY}?event=${eventId}`, { signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    data = await res.json()
  } catch {
    return null
  }

  const sides = (data.rosters ?? []).map(readSide)
  const home = sides.find((s) => s.homeAway === 'home')
  const away = sides.find((s) => s.homeAway === 'away')

  // A fixture with no lineup published still returns both sides, with no
  // formation and an empty squad. That is "not yet", not a failure.
  if (!home?.starters.length && !away?.starters.length) return null

  return { home, away, subs: readSubs(data.keyEvents) }
}
