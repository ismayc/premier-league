#!/usr/bin/env node
/**
 * Builds src/data/players.js — season leaderboards for every stat ESPN
 * publishes, across the last several seasons, to back the Stats view's season
 * switcher.
 *
 * Source: ESPN's core API leaders endpoint. Unlike the basketball
 * `byathlete` endpoint (which returns a flat table and is what the WNBA
 * viewer uses), the soccer feed has no per-athlete equivalent — it returns
 * ranked lists per category with the athlete and team as `$ref` links. So
 * each unique athlete costs one extra request. Refs are resolved once and
 * memoised across categories and seasons, which cuts roughly 300 lookups per
 * season down to about 150.
 *
 * Uses Node built-ins only, so the refresh workflow can run without npm ci.
 */

import { existsSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CORE = 'https://sports.core.api.espn.com/v2/sports/soccer/leagues/eng.1'

/**
 * The categories worth surfacing, in display order. ESPN also returns
 * `goalsLeaders` and `assistsLeaders`, which duplicate `goals` and `assists`
 * — they are deliberately omitted.
 *
 * `lowerIsBetter` marks the disciplinary categories: topping the yellow-card
 * chart is not an achievement, and the UI labels them accordingly rather than
 * dressing them up as leaderboards.
 */
const CATEGORIES = [
  { key: 'goals', label: 'Goals', short: 'G' },
  { key: 'assists', label: 'Assists', short: 'A' },
  { key: 'totalShots', label: 'Shots', short: 'SH' },
  { key: 'shotsOnTarget', label: 'Shots on target', short: 'SOT' },
  { key: 'accuratePasses', label: 'Accurate passes', short: 'PASS' },
  { key: 'saves', label: 'Saves', short: 'SV' },
  { key: 'foulsSuffered', label: 'Fouls suffered', short: 'FS' },
  { key: 'foulsCommitted', label: 'Fouls committed', short: 'FC', lowerIsBetter: true },
  { key: 'yellowCards', label: 'Yellow cards', short: 'YC', lowerIsBetter: true },
  { key: 'redCards', label: 'Red cards', short: 'RC', lowerIsBetter: true },
]

const arg = (flag, fallback) => {
  const i = process.argv.indexOf(flag)
  return i > -1 ? Number(process.argv[i + 1]) : fallback
}

async function getJson(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.json()
    } catch (err) {
      if (i === tries - 1) throw new Error(`${url}\n  ${err.message}`)
      await new Promise((r) => setTimeout(r, 500 * (i + 1)))
    }
  }
}

/** Memoised `$ref` resolution — the same striker tops several categories. */
const refCache = new Map()
function resolveRef(url) {
  if (!refCache.has(url)) refCache.set(url, getJson(url).catch(() => null))
  return refCache.get(url)
}

/**
 * Clubs seen anywhere in the leaderboards, keyed by abbreviation.
 *
 * A leaderboard reaches back years, so it names clubs that have since been
 * relegated — Burnley, Leicester, West Ham, Wolves and ten others. The app's
 * club lookup only holds the *current* twenty, so without capturing the name
 * and crest here those rows rendered as a bare "BUR" beside an empty circle.
 */
const clubs = new Map()

/** "Matches: 35, Goals: 27" -> 35. Appearances aren't a field of their own. */
function matchesFrom(displayValue) {
  const m = /Matches:\s*(\d+)/.exec(displayValue || '')
  return m ? Number(m[1]) : null
}

async function fetchSeason(season) {
  let data
  try {
    data = await getJson(`${CORE}/seasons/${season}/types/1/leaders`)
  } catch {
    return null
  }

  const byKey = new Map((data.categories || []).map((c) => [c.name, c]))
  const out = {}
  let resolved = 0

  for (const cat of CATEGORIES) {
    const raw = byKey.get(cat.key)
    if (!raw?.leaders?.length) continue

    const rows = await Promise.all(
      raw.leaders.map(async (l) => {
        const [athlete, team] = await Promise.all([
          l.athlete?.$ref ? resolveRef(l.athlete.$ref) : null,
          l.team?.$ref ? resolveRef(l.team.$ref) : null,
        ])
        if (!athlete) return null
        resolved++

        if (team?.abbreviation && !clubs.has(team.abbreviation)) {
          clubs.set(team.abbreviation, {
            abbr: team.abbreviation,
            name: team.shortDisplayName ?? team.displayName,
            slug: team.slug,
            logos: team.logos ?? [],
          })
        }

        return {
          id: athlete.id,
          name: athlete.displayName,
          short: athlete.shortName,
          pos: athlete.position?.abbreviation ?? null,
          team: team?.abbreviation ?? null,
          // Carried per row so a leaderboard never depends on the club still
          // being in the league.
          teamName: team?.shortDisplayName ?? team?.displayName ?? null,
          teamSlug: team?.slug ?? null,
          value: l.value,
          matches: matchesFrom(l.displayValue),
        }
      })
    )

    const clean = rows.filter(Boolean)
    if (clean.length) out[cat.key] = clean
  }

  return Object.keys(out).length ? { season, categories: out, resolved } : null
}

/**
 * Download crests for any club in the leaderboards that fetch-fixtures.mjs
 * did not already mirror. Files are keyed by slug, exactly as that script
 * names them, so the two sets sit side by side and the app needs no special
 * case for a club that has since gone down.
 */
async function mirrorMissingCrests() {
  const resized = (href) =>
    `https://a.espncdn.com/combiner/i?img=${encodeURIComponent(new URL(href).pathname)}&w=160&h=160`

  let saved = 0
  for (const club of clubs.values()) {
    if (!club.slug) continue
    for (const variant of ['default', 'dark']) {
      const file = variant === 'dark' ? `${club.slug}-dark.png` : `${club.slug}.png`
      const path = join(ROOT, 'public/logos', file)
      if (existsSync(path)) continue

      // Fall back to the default crest for a dark variant ESPN doesn't provide, so a
      // club is never left without a `${slug}-dark.png` (invisible in the dark theme).
      const logo =
        club.logos.find((l) => l.rel?.includes(variant)) ||
        (variant === 'dark' ? club.logos.find((l) => l.rel?.includes('default')) : null)
      if (!logo) continue
      try {
        const res = await fetch(resized(logo.href))
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        writeFileSync(path, Buffer.from(await res.arrayBuffer()))
        saved++
      } catch (err) {
        console.log(`  ⚠ crest ${file}: ${err.message}`)
      }
    }
  }
  return saved
}

async function main() {
  const now = new Date()
  // ESPN labels a season by the calendar year it starts in: 2025 is 2025-26.
  const current = now.getUTCMonth() >= 5 ? now.getUTCFullYear() : now.getUTCFullYear() - 1
  const count = arg('--seasons', 10)
  const first = current - count + 1

  console.log(`Fetching player stats for seasons ${first}-${current}\n`)

  const seasons = []
  for (let season = current; season >= first; season--) {
    const result = await fetchSeason(season)
    const label = `${season}-${String((season + 1) % 100).padStart(2, '0')}`
    if (!result) {
      console.log(`  ${label}  no data published`)
      continue
    }
    const cats = Object.keys(result.categories)
    const top = result.categories.goals?.[0]
    console.log(
      `  ${label}  ${String(cats.length).padStart(2)} categories` +
        (top ? `  top scorer: ${top.name} (${top.value})` : '')
    )
    seasons.push(result)
  }

  if (!seasons.length) throw new Error('no season returned any leader data')

  const mirrored = await mirrorMissingCrests()
  if (mirrored) console.log(`\n  ${mirrored} crest(s) mirrored for clubs no longer in the league`)

  // Newest first, so the UI's default selection is the head of the list.
  seasons.sort((a, b) => b.season - a.season)

  const out = [
    '// GENERATED by scripts/fetch-stats.mjs — do not edit by hand.',
    '// Per-season player leaderboards from ESPN. Seasons are keyed by the',
    '// calendar year they begin in: 2025 is the 2025-26 season.',
    '',
    'export const STAT_CATEGORIES = [',
    ...CATEGORIES.map((c) => `  ${JSON.stringify(c)},`),
    ']',
    '',
    'export const PLAYER_STATS = {',
    ...seasons.map(
      (s) =>
        `  ${s.season}: {\n` +
        Object.entries(s.categories)
          .map(
            (entry) =>
              `    ${entry[0]}: [\n` + entry[1].map((r) => `      ${JSON.stringify(r)},`).join('\n') + '\n    ],'
          )
          .join('\n') +
        '\n  },'
    ),
    '}',
    '',
    'export const STAT_SEASONS = Object.keys(PLAYER_STATS).map(Number).sort((a, b) => b - a)',
    '',
    '/** Seasons that actually carry data for a category — drives the switcher. */',
    'export const seasonsWith = (key) => STAT_SEASONS.filter((s) => PLAYER_STATS[s][key]?.length)',
    '',
  ].join('\n')

  writeFileSync(join(ROOT, 'src/data/players.js'), out)
  console.log(`\nWrote src/data/players.js — ${seasons.length} seasons, ${refCache.size} athletes/clubs resolved`)
}

main().catch((err) => {
  console.error(`\n✗ ${err.message}`)
  process.exit(1)
})
