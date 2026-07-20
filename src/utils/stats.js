/**
 * Season-level aggregates and leaderboard shaping.
 *
 * Team stats are derived from results (via buildTable) rather than fetched, so
 * they hold for any season the app can build a table for — including the 34
 * historical seasons, which carry no player data at all.
 *
 * Naming is deliberately literal: "goals per game", not "attacking rating".
 * The public feeds expose no possession or expected-goals data, so anything
 * dressed up as an efficiency metric would be inventing precision.
 */

import { buildTable } from './table.js'

export function seasonTotals(fixtures) {
  const played = fixtures.filter((f) => f.score && !f.unplayed)
  const scheduled = fixtures.filter((f) => !f.score && !f.unplayed)

  const goals = played.reduce((t, f) => t + f.score[0] + f.score[1], 0)
  const homeWins = played.filter((f) => f.score[0] > f.score[1]).length
  const draws = played.filter((f) => f.score[0] === f.score[1]).length
  const awayWins = played.length - homeWins - draws

  const withMargin = played.map((f) => ({ ...f, margin: Math.abs(f.score[0] - f.score[1]) }))
  const withTotal = played.map((f) => ({ ...f, total: f.score[0] + f.score[1] }))

  return {
    played: played.length,
    remaining: scheduled.length,
    goals,
    gpg: played.length ? goals / played.length : 0,
    homeWins,
    awayWins,
    draws,
    homeWinPct: played.length ? homeWins / played.length : 0,
    drawPct: played.length ? draws / played.length : 0,
    cleanSheets: played.reduce((t, f) => t + (f.score[0] === 0 ? 1 : 0) + (f.score[1] === 0 ? 1 : 0), 0),
    goalless: played.filter((f) => f.score[0] === 0 && f.score[1] === 0).length,
    // "Thrashing" is a judgement call; four clear goals is the usual threshold.
    thrashings: withMargin.filter((f) => f.margin >= 4).sort((a, b) => b.margin - a.margin),
    highestScoring: [...withTotal].sort((a, b) => b.total - a.total).slice(0, 5),
  }
}

/**
 * Rank a set of clubs on attack and defence and order them by goal
 * difference. Shared by the current season and by any past one, so the two
 * are ranked identically rather than by two similar-looking implementations.
 *
 * Each row arrives with `key`, `played`, `gf` and `ga`; the per-match rates
 * and ranks are derived here so a tooltip and a bar cannot disagree.
 */
function rankScoring(rows) {
  const scored = rows
    .filter((r) => r.played)
    .map((r) => ({
      ...r,
      gd: r.gf - r.ga,
      gfpg: r.gf / r.played,
      gapg: r.ga / r.played,
      gdpg: (r.gf - r.ga) / r.played,
    }))

  const rank = (field, dir = -1) => {
    const sorted = [...scored].sort((a, b) => (a[field] - b[field]) * dir)
    return Object.fromEntries(sorted.map((r, i) => [r.key, i + 1]))
  }
  const attack = rank('gfpg')
  const defence = rank('gapg', 1) // conceding fewer is better

  return scored
    .map((r) => ({ ...r, attackRank: attack[r.key], defenceRank: defence[r.key] }))
    .sort((a, b) => b.gdpg - a.gdpg)
}

/** Attack and defence for the season in progress, derived from its fixtures. */
export function teamScoring(fixtures, abbrs) {
  const table = buildTable(fixtures, abbrs)

  return rankScoring(
    table.map((r) => ({
      key: r.abbr,
      abbr: r.abbr,
      name: null, // resolved from the club lookup at render time
      played: r.played,
      points: r.points,
      gf: r.gf,
      ga: r.ga,
      homePpg: r.home.played ? (r.home.won * 3 + r.home.drawn) / r.home.played : 0,
      awayPpg: r.away.played ? (r.away.won * 3 + r.away.drawn) / r.away.played : 0,
    }))
  )
}

/**
 * The same view for a completed season, taken from its final table.
 *
 * Historical rows name clubs in full and carry no abbreviation, because the
 * table was computed from match results rather than from a club list. The
 * name is therefore the key, and the caller resolves a crest from it where
 * the club still exists.
 */
export function seasonScoring(season) {
  return rankScoring(
    season.table.map((r) => ({
      key: r.team,
      abbr: null,
      name: r.team,
      played: r.played,
      points: r.points,
      gf: r.gf,
      ga: r.ga,
    }))
  )
}

/**
 * Competition-style ranking: clubs level on the value share a rank and consume
 * the slots below it (1, 2, 2, 4). The cutoff is never applied mid-tie — if
 * three players tie for tenth, all three are shown.
 */
export function leaderboard(rows, { limit = 10 } = {}) {
  if (!rows?.length) return []

  const sorted = [...rows].sort((a, b) => b.value - a.value)
  const ranked = []
  let rank = 0
  let prev = null

  sorted.forEach((r, i) => {
    if (r.value !== prev) {
      rank = i + 1
      prev = r.value
    }
    ranked.push({ ...r, rank })
  })

  const cut = ranked[limit - 1]
  return cut ? ranked.filter((r) => r.rank <= cut.rank) : ranked
}

/** Every club's all-time record across the committed historical tables. */
export function allTimeRecord(history) {
  const clubs = new Map()

  for (const season of history) {
    for (const r of season.table) {
      if (!clubs.has(r.team)) {
        clubs.set(r.team, {
          team: r.team,
          seasons: 0,
          played: 0,
          won: 0,
          drawn: 0,
          lost: 0,
          gf: 0,
          ga: 0,
          points: 0,
          titles: 0,
          top4: 0,
          relegations: 0,
          best: Infinity,
          worst: 0,
        })
      }
      const c = clubs.get(r.team)
      c.seasons++
      c.played += r.played
      c.won += r.won
      c.drawn += r.drawn
      c.lost += r.lost
      c.gf += r.gf
      c.ga += r.ga
      c.points += r.points
      if (r.pos === 1) c.titles++
      if (r.pos <= 4) c.top4++
      // Three clubs go down in a normal season. The exception is 1994-95,
      // when four were relegated against two promoted to cut the League from
      // 22 clubs to 20.
      const goingDown = season.year === 1994 ? 4 : 3
      if (r.pos > season.teams - goingDown) c.relegations++
      c.best = Math.min(c.best, r.pos)
      c.worst = Math.max(c.worst, r.pos)
    }
  }

  return [...clubs.values()]
    .map((c) => ({ ...c, gd: c.gf - c.ga, ppg: c.played ? c.points / c.played : 0 }))
    .sort((a, b) => b.points - a.points || b.gd - a.gd)
}

/** One club's season-by-season finishing positions, for a sparkline. */
export function clubHistory(history, team) {
  return history
    .map((s) => {
      const row = s.table.find((r) => r.team === team)
      return row ? { year: s.year, label: s.label, pos: row.pos, points: row.points, teams: s.teams } : null
    })
    .filter(Boolean)
}
