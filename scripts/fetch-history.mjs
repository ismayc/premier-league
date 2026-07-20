#!/usr/bin/env node
/**
 * Builds src/data/history.js — the final league table for every completed
 * Premier League season, 1992/93 to the present.
 *
 * Source: openfootball/england, which publishes every season's results as a
 * plain-text file. We parse the *match results* and compute each table
 * ourselves rather than trusting a published table, for two reasons:
 *
 *   1. It is verifiable. A table derived from 380 results can be checked
 *      against the invariant that every match contributes exactly 2 played,
 *      3 points, and a zero-sum goal difference to the league as a whole.
 *   2. ESPN's standings archive only reaches 2002-03. openfootball reaches
 *      1992-93, which is the whole point of this file.
 *
 * Ordering follows the actual Premier League rule: points, then goal
 * difference, then goals scored. The League has never used head-to-head to
 * break a tie for a placing (unlike most European leagues) — where teams are
 * still level, they genuinely share a rank, and a play-off is only staged for
 * the title or relegation, which has never happened.
 *
 * Uses Node built-ins only, so the refresh workflow can run without npm ci.
 */

import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const RAW = 'https://raw.githubusercontent.com/openfootball/england/master'

// The first three seasons ran with 22 clubs before the League cut to 20.
const EXPECTED_TEAMS = (year) => (year <= 1994 ? 22 : 20)
const EXPECTED_MATCHES = (year) => {
  const n = EXPECTED_TEAMS(year)
  return n * (n - 1)
}

/** Seasons live under archive/1990s/ up to 1999-00, then at the repo root. */
function seasonPath(year) {
  const label = seasonLabel(year)
  return year <= 1999 ? `archive/1990s/${label}/1-premierleague.txt` : `${label}/1-premierleague.txt`
}

/** 1992 -> "1992-93"; 1999 -> "1999-00" */
function seasonLabel(year) {
  return `${year}-${String((year + 1) % 100).padStart(2, '0')}`
}

async function getText(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.text()
    } catch (err) {
      if (i === tries - 1) throw new Error(`${url}\n  ${err.message}`)
      await new Promise((r) => setTimeout(r, 500 * (i + 1)))
    }
  }
}

/**
 * openfootball uses two result layouts across its history, and both may carry
 * a leading kickoff time and a trailing half-time score in parentheses. All
 * four combinations appear verbatim in the archive:
 *
 *   1992-93   "  Arsenal FC               2-4  Norwich City FC"
 *   2010-11   "  15:00  Wigan Athletic    0-4 (0-3)  Blackpool FC"
 *   2024-25   "  20:00  Manchester United FC  v Fulham FC   1-0 (0-0)"
 *
 * The kickoff time is stripped first so the two layouts reduce to one regex
 * each. The distinguishing feature is where the score sits: between the clubs
 * (older) or after them, with a bare "v" separator (newer).
 */
const TIME = /^\d{1,2}:\d{2}\s+/
const HALFTIME = /\s*\([^)]*\)\s*/
const SCORE_AFTER = /^(.+?)\s+v\s+(.+?)\s+(\d+)\s*-\s*(\d+)$/
const SCORE_BETWEEN = /^(.+?)\s{2,}(\d+)\s*-\s*(\d+)\s{2,}(.+?)$/

function parseMatches(text) {
  const matches = []
  const unparsedLines = []

  for (const raw of text.split('\n')) {
    let line = raw.trim()
    // Headers, comments, blank lines, matchday and date markers carry no result.
    if (!line || line.startsWith('#') || line.startsWith('=') || line.startsWith('▪')) continue

    // A fixture with no score yet (current season) is not an error — skip it.
    if (!/\d\s*-\s*\d/.test(line)) continue

    // Normalise away the two optional decorations before matching. The
    // half-time score is replaced with padding rather than removed so the
    // two-space gap separating score from club name survives.
    line = line.replace(TIME, '').replace(HALFTIME, '  ').trim()

    const after = line.match(SCORE_AFTER)
    if (after) {
      matches.push({ home: clean(after[1]), away: clean(after[2]), hg: +after[3], ag: +after[4] })
      continue
    }
    const between = line.match(SCORE_BETWEEN)
    if (between) {
      matches.push({ home: clean(between[1]), away: clean(between[4]), hg: +between[2], ag: +between[3] })
      continue
    }
    unparsedLines.push(raw.trim())
  }
  return { matches, unparsedLines }
}

/**
 * Club names are not spelled consistently across the archive. The 1999-00
 * file in particular uses short forms throughout ("Tottenham", "West Ham",
 * "Newcastle Utd") where every other season uses the full name.
 *
 * Left unmapped, a club's record silently splits in two: Tottenham, ever
 * present since 1992, showed 33 seasons in the all-time table instead of 34,
 * with a phantom one-season "Tottenham" alongside it. The consistency check
 * in `verifyClubNames` guards against a future refresh reintroducing this.
 */
const CANONICAL = {
  Bradford: 'Bradford City',
  Coventry: 'Coventry City',
  Derby: 'Derby County',
  Leeds: 'Leeds United',
  Leicester: 'Leicester City',
  'Newcastle Utd': 'Newcastle United',
  'Sheffield Wed': 'Sheffield Wednesday',
  Tottenham: 'Tottenham Hotspur',
  'West Ham': 'West Ham United',
}

/** Strip the club-type suffix openfootball appends, then canonicalise. */
function clean(name) {
  const stripped = name
    .replace(/\s+\((?:aet|awarded|abandoned)\)$/i, '')
    .replace(/\s+(?:FC|AFC)$/i, '')
    .trim()
  return CANONICAL[stripped] ?? stripped
}

/**
 * Flags club names that look like unmapped variants of one another. A real
 * variant shows up as a name that appears in very few seasons and is a prefix
 * of a name that appears in many — exactly the shape the 1999-00 short names
 * had. This runs across all seasons, so it catches a spelling that only one
 * file uses.
 */
function verifyClubNames(seasons) {
  const counts = new Map()
  for (const s of seasons) {
    for (const r of s.table) counts.set(r.team, (counts.get(r.team) ?? 0) + 1)
  }

  const names = [...counts.keys()]
  const suspects = []
  for (const a of names) {
    for (const b of names) {
      if (a === b) continue
      // A short name that prefixes a much more common longer name.
      if (b.startsWith(`${a} `) && counts.get(a) <= 2 && counts.get(b) > counts.get(a)) {
        suspects.push(`"${a}" (${counts.get(a)}) may be "${b}" (${counts.get(b)})`)
      }
    }
  }
  return suspects
}

/** Reduce a season's results into a sorted, ranked final table. */
function buildTable(matches) {
  const rows = new Map()
  const row = (team) => {
    if (!rows.has(team)) {
      rows.set(team, { team, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0 })
    }
    return rows.get(team)
  }

  for (const m of matches) {
    const h = row(m.home)
    const a = row(m.away)
    h.played++, a.played++
    h.gf += m.hg, h.ga += m.ag
    a.gf += m.ag, a.ga += m.hg
    if (m.hg > m.ag) h.won++, a.lost++
    else if (m.hg < m.ag) a.won++, h.lost++
    else h.drawn++, a.drawn++
  }

  const table = [...rows.values()].map((r) => ({
    ...r,
    gd: r.gf - r.ga,
    points: r.won * 3 + r.drawn,
  }))

  // Premier League order: points, goal difference, goals scored.
  table.sort((a, b) => b.points - a.points || b.gd - a.gd || b.gf - a.gf || a.team.localeCompare(b.team))

  // Competition ranking: clubs level on all three tiebreakers share a position.
  let pos = 0
  let prev = null
  table.forEach((r, i) => {
    const key = `${r.points}:${r.gd}:${r.gf}`
    if (key !== prev) {
      pos = i + 1
      prev = key
    }
    r.pos = pos
  })

  return table
}

/**
 * Every match adds 2 to total played, 3 points if decisive or 2 if drawn, and
 * nets zero goal difference across the league. If any of those fail, the parse
 * dropped or double-counted a line and the table is not trustworthy.
 */
function verify(table, matches, year) {
  const problems = []
  const sum = (k) => table.reduce((t, r) => t + r[k], 0)
  const draws = matches.filter((m) => m.hg === m.ag).length
  const expectedPoints = (matches.length - draws) * 3 + draws * 2

  if (sum('played') !== matches.length * 2) {
    problems.push(`played ${sum('played')} != ${matches.length * 2}`)
  }
  if (sum('points') !== expectedPoints) {
    problems.push(`points ${sum('points')} != ${expectedPoints}`)
  }
  if (sum('gd') !== 0) problems.push(`goal difference sums to ${sum('gd')}, not 0`)
  if (sum('gf') !== sum('ga')) problems.push(`goals for ${sum('gf')} != goals against ${sum('ga')}`)

  const teams = EXPECTED_TEAMS(year)
  if (table.length !== teams) problems.push(`${table.length} clubs, expected ${teams}`)

  return problems
}

async function main() {
  const now = new Date()
  // A season is "completed" once the following June has arrived; before that
  // the current campaign is still being played and belongs in the live view.
  const latestCompleted = now.getUTCMonth() >= 5 ? now.getUTCFullYear() - 1 : now.getUTCFullYear() - 2

  const years = []
  for (let y = 1992; y <= latestCompleted; y++) years.push(y)

  console.log(`Fetching ${years.length} seasons: ${seasonLabel(years[0])} to ${seasonLabel(latestCompleted)}\n`)

  const seasons = []
  const warnings = []

  for (const year of years) {
    const url = `${RAW}/${seasonPath(year)}`
    let text
    try {
      text = await getText(url)
    } catch (err) {
      warnings.push(`${seasonLabel(year)}: FETCH FAILED — ${err.message}`)
      continue
    }

    const { matches, unparsedLines } = parseMatches(text)
    const table = buildTable(matches)
    const problems = verify(table, matches, year)

    if (unparsedLines.length) {
      problems.push(`${unparsedLines.length} unparsed line(s), e.g. ${JSON.stringify(unparsedLines[0])}`)
    }
    if (matches.length !== EXPECTED_MATCHES(year)) {
      problems.push(`${matches.length} matches, expected ${EXPECTED_MATCHES(year)}`)
    }

    const champion = table[0]?.team ?? '???'
    if (problems.length) {
      warnings.push(`${seasonLabel(year)}: ${problems.join('; ')}`)
      console.log(`  ${seasonLabel(year)}  ${champion.padEnd(22)} ⚠ ${problems.join('; ')}`)
    } else {
      console.log(`  ${seasonLabel(year)}  ${champion.padEnd(22)} ${matches.length} matches ✓`)
    }

    seasons.push({
      year,
      label: seasonLabel(year),
      teams: table.length,
      matches: matches.length,
      champion,
      table,
    })
  }

  // A club whose name is spelled two ways loses seasons from its all-time
  // record, and nothing in the per-season checks above would notice.
  const nameIssues = verifyClubNames(seasons)
  if (nameIssues.length) {
    warnings.push(`unmapped club-name variants — add them to CANONICAL:`)
    for (const issue of nameIssues) warnings.push(`  ${issue}`)
  }

  const out = [
    '// GENERATED by scripts/fetch-history.mjs — do not edit by hand.',
    '// Final Premier League tables, computed from openfootball/england results.',
    '// Order: points, then goal difference, then goals scored (the actual PL rule).',
    '',
    'export const HISTORY = [',
    ...seasons.map((s) => {
      const head = `  { year: ${s.year}, label: ${JSON.stringify(s.label)}, champion: ${JSON.stringify(s.champion)}, teams: ${s.teams}, matches: ${s.matches},`
      const rows = s.table.map((r) => `      ${JSON.stringify(r)},`).join('\n')
      return `${head}\n    table: [\n${rows}\n    ] },`
    }),
    ']',
    '',
    'export const HISTORY_BY_YEAR = Object.fromEntries(HISTORY.map((s) => [s.year, s]))',
    'export const HISTORY_YEARS = HISTORY.map((s) => s.year)',
    '',
  ].join('\n')

  writeFileSync(join(ROOT, 'src/data/history.js'), out)

  console.log(`\nWrote src/data/history.js — ${seasons.length} seasons`)
  if (warnings.length) {
    console.log(`\n⚠ ${warnings.length} season(s) need review:`)
    for (const w of warnings) console.log(`  ${w}`)
    process.exitCode = 1
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
