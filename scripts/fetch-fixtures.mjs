#!/usr/bin/env node
/**
 * Builds src/data/teams.js and src/data/fixtures.js for the current season,
 * and mirrors each club's crest into public/logos/.
 *
 * Source: ESPN's public scoreboard feed, which is keyless and CORS-open. The
 * same feed backs the live overlay in src/services/espn.js, so a fixture
 * fetched here and a fixture polled at runtime share an id and merge cleanly.
 *
 * The scoreboard returns at most 50 events per request regardless of the
 * `limit` parameter, so the season is walked in date windows and de-duplicated
 * by event id. The run asserts a full 380-match season before writing; a
 * partial fetch is a failure, not a smaller file.
 *
 * Uses Node built-ins only, so the refresh workflow can run without npm ci.
 */

import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SITE = 'https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1'

const arg = (flag, fallback) => {
  const i = process.argv.indexOf(flag)
  return i > -1 ? process.argv[i + 1] : fallback
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

const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, '')

/**
 * ESPN publishes the season's matchday dates in the scoreboard's `calendar`.
 * Walking those rather than every day of the year keeps the fetch to a couple
 * of dozen requests and tells us up front how long the season runs.
 */
async function fetchCalendar(season) {
  const data = await getJson(`${SITE}/scoreboard?dates=${season}0801`)
  const league = data.leagues?.[0]
  const calendar = (league?.calendar || []).map((c) => new Date(c))
  if (!calendar.length) throw new Error(`no calendar published for season ${season}`)
  return { calendar, displayName: league.season?.displayName ?? String(season) }
}

/** Split the matchday list into windows small enough to stay under the 50-event cap. */
function windows(calendar, size = 8) {
  const out = []
  for (let i = 0; i < calendar.length; i += size) {
    const chunk = calendar.slice(i, i + size)
    out.push([chunk[0], chunk[chunk.length - 1]])
  }
  return out
}

function normalizeEvent(ev) {
  const comp = ev.competitions?.[0]
  if (!comp) return null

  const home = comp.competitors?.find((c) => c.homeAway === 'home')
  const away = comp.competitors?.find((c) => c.homeAway === 'away')
  if (!home || !away) return null

  const state = comp.status?.type?.state // 'pre' | 'in' | 'post'
  const played = state === 'post' && comp.status?.type?.completed

  const fixture = {
    id: ev.id,
    ko: new Date(ev.date).toISOString(),
    home: home.team.abbreviation,
    away: away.team.abbreviation,
    venue: comp.venue?.fullName,
    city: comp.venue?.address?.city,
  }

  // A score is written only for a completed match. An in-progress score is
  // transient and belongs to the live overlay, not the committed snapshot.
  if (played) {
    fixture.score = [Number(home.score), Number(away.score)]
  }
  if (state === 'post' && !comp.status?.type?.completed) {
    fixture.unplayed = comp.status?.type?.description // postponed, cancelled, abandoned
  }

  const tv = comp.broadcasts?.flatMap((b) => b.names || []) ?? []
  if (tv.length) fixture.tv = [...new Set(tv)]

  return fixture
}

async function fetchTeams() {
  const data = await getJson(`${SITE}/teams`)
  const entries = data.sports?.[0]?.leagues?.[0]?.teams ?? []
  return entries.map(({ team }) => ({
    id: team.id,
    abbr: team.abbreviation,
    slug: team.slug,
    name: team.shortDisplayName,
    displayName: team.displayName,
    color: team.color,
    altColor: team.alternateColor,
    // Kept only to drive the logo mirror below; stripped before writing.
    _logos: team.logos ?? [],
  }))
}

/**
 * Mirror crests locally. ESPN's image combiner resizes on their side, so we
 * store an ~8 KB file rather than the ~40 KB original, and the app never
 * depends on ESPN being reachable to render.
 */
async function mirrorLogos(teams) {
  const resized = (href) =>
    `https://a.espncdn.com/combiner/i?img=${encodeURIComponent(new URL(href).pathname)}&w=160&h=160`

  const grab = async (href) => {
    try {
      const res = await fetch(resized(href))
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return Buffer.from(await res.arrayBuffer())
    } catch (err) {
      console.log(`  ⚠ logo ${href}: ${err.message}`)
      return null
    }
  }

  let saved = 0
  for (const t of teams) {
    const lightLogo = t._logos.find((l) => l.rel?.includes('default')) || t._logos[0]
    if (!lightLogo) continue
    const light = await grab(lightLogo.href)
    if (!light) continue
    writeFileSync(join(ROOT, 'public/logos', `${t.slug}.png`), light)
    saved++
    // Some clubs (e.g. newly promoted) have no ESPN "dark" crest, but the app's dark
    // theme renders `${slug}-dark.png` — fall back to the light crest so it never shows
    // an invisible (missing) logo. A full-colour crest reads fine on the dark ground.
    const darkLogo = t._logos.find((l) => l.rel?.includes('dark'))
    const dark = (darkLogo && (await grab(darkLogo.href))) || light
    writeFileSync(join(ROOT, 'public/logos', `${t.slug}-dark.png`), dark)
    saved++
  }
  return saved
}

async function main() {
  const season = Number(arg('--season', new Date().getUTCMonth() >= 5 ? new Date().getUTCFullYear() : new Date().getUTCFullYear() - 1))

  console.log(`Fetching Premier League ${season} season\n`)

  const teams = await fetchTeams()
  console.log(`  ${teams.length} clubs`)

  const { calendar, displayName } = await fetchCalendar(season)
  console.log(`  ${calendar.length} matchdays: ${ymd(calendar[0])} to ${ymd(calendar.at(-1))}`)

  const byId = new Map()
  for (const [from, to] of windows(calendar)) {
    const data = await getJson(`${SITE}/scoreboard?dates=${ymd(from)}-${ymd(to)}`)
    for (const ev of data.events ?? []) {
      const fixture = normalizeEvent(ev)
      if (fixture) byId.set(fixture.id, fixture)
    }
  }

  const fixtures = [...byId.values()].sort((a, b) => a.ko.localeCompare(b.ko) || a.id.localeCompare(b.id))
  const played = fixtures.filter((f) => f.score).length
  console.log(`  ${fixtures.length} fixtures (${played} played)`)

  // A 20-club double round-robin is exactly 380 matches. Anything else means
  // a window came back short and the snapshot would silently omit fixtures.
  const expected = teams.length * (teams.length - 1)
  if (fixtures.length !== expected) {
    throw new Error(
      `expected ${expected} fixtures for ${teams.length} clubs, got ${fixtures.length}. ` +
        `A date window likely hit the 50-event cap — reduce the window size.`
    )
  }

  const abbrs = new Set(teams.map((t) => t.abbr))
  const unknown = [...new Set(fixtures.flatMap((f) => [f.home, f.away]))].filter((a) => !abbrs.has(a))
  if (unknown.length) throw new Error(`fixtures reference unknown clubs: ${unknown.join(', ')}`)

  const logos = await mirrorLogos(teams)
  console.log(`  ${logos} crests mirrored`)

  for (const t of teams) delete t._logos

  writeFileSync(
    join(ROOT, 'src/data/teams.js'),
    [
      '// GENERATED by scripts/fetch-fixtures.mjs — do not edit by hand.',
      `export const SEASON = ${season}`,
      `export const SEASON_LABEL = ${JSON.stringify(displayName)}`,
      '',
      'export const TEAMS = [',
      ...teams.sort((a, b) => a.name.localeCompare(b.name)).map((t) => `  ${JSON.stringify(t)},`),
      ']',
      '',
      'export const TEAM_BY_ABBR = Object.fromEntries(TEAMS.map((t) => [t.abbr, t]))',
      'export const ALL_ABBRS = TEAMS.map((t) => t.abbr)',
      '',
    ].join('\n')
  )

  writeFileSync(
    join(ROOT, 'src/data/fixtures.js'),
    [
      '// GENERATED by scripts/fetch-fixtures.mjs — do not edit by hand.',
      '// Kickoffs are ISO instants in UTC; the app reformats them into the',
      '// viewer\'s timezone. `score` is present only for completed matches.',
      `export const SEASON = ${season}`,
      '',
      'export const FIXTURES = [',
      ...fixtures.map((f) => `  ${JSON.stringify(f)},`),
      ']',
      '',
    ].join('\n')
  )

  console.log(`\nWrote src/data/teams.js and src/data/fixtures.js`)
}

main().catch((err) => {
  console.error(`\n✗ ${err.message}`)
  process.exit(1)
})
