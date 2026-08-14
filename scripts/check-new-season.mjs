#!/usr/bin/env node
// Has the Premier League published the NEXT season's fixtures yet?
//
// The league releases all 380 fixtures in mid-June, two months before kickoff.
// Nothing rolls over on its own — the refresh follows the committed teams.js season —
// so this tells us the day the fixtures land and the rollover becomes a decision
// rather than a discovery. Ported from the-nba-schedule's watch after its 2026-27
// release; the league specifics below were re-derived for the PL, not copied.
//
// ESPN names a soccer season for its STARTING year: 2027-28 is season=2027. The
// target defaults to the season AFTER the committed one, so the watch can never
// re-detect the season the site already shows.
//
// Soccer has no 1/2/3 season-type ids, so release detection works the way
// fetch-fixtures does: ask the scoreboard for a date inside the target season and
// read the league's published match-day CALENDAR, then count the fixtures across it.
//
// TRAP (verified live 2026-08-14): asking for a date in an UNRELEASED season returns
// HTTP 200 with the CURRENT season's context — dates=20270801 answered season.year
// 2026 and the 2026-27 calendar. The season.year check below is load-bearing.
//
// Node built-ins only, like every script here, so CI can run it on a bare checkout.
//
//   node scripts/check-new-season.mjs [--season 2027]
//
// Exit 0 always — "not yet" is a normal answer, not a failure. The workflow reads the
// `released` line from stdout rather than an exit code.

import { getJson } from './lib/fetch.mjs'
import { SEASON as COMMITTED_SEASON } from '../src/data/teams.js'

const SITE = 'https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1'

const args = process.argv.slice(2)
const SEASON = Number(args[args.indexOf('--season') + 1]) || COMMITTED_SEASON + 1

// 20 clubs, double round-robin: a complete release is exactly 380. The slack only
// absorbs a couple of postponed-at-release oddities, not a format change.
const INITIAL_RELEASE_FLOOR = 370

const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, '')

const label = `${SEASON}-${String(SEASON + 1).slice(2)}`

// The season's match-day calendar, via a date inside the season — the same call
// fetch-fixtures.mjs opens with. An unreleased season answers with the CURRENT
// season's context (see TRAP above), which the year check turns into "not yet".
const opening = await getJson(`${SITE}/scoreboard?dates=${SEASON}0801`)
const league = opening.leagues?.[0]
const seasonYear = Number(league?.season?.year ?? 0)
const calendar = (league?.calendar || []).map((c) => new Date(c))

let count = 0
let first = null
let last = null
if (seasonYear === SEASON && calendar.length) {
  // Count fixtures across the calendar in windows of 8 match-days, like
  // fetch-fixtures — each stays well under the scoreboard's silent ~50-event cap.
  const seen = new Set()
  for (let i = 0; i < calendar.length; i += 8) {
    const chunk = calendar.slice(i, i + 8)
    const from = ymd(chunk[0])
    const to = ymd(chunk[chunk.length - 1])
    const d = await getJson(`${SITE}/scoreboard?dates=${from}-${to}&limit=100`)
    for (const ev of d.events || []) {
      if (seen.has(ev.id)) continue
      seen.add(ev.id)
      count++
      if (!first || ev.date < first.date) first = ev
      if (!last || ev.date > last.date) last = ev
    }
  }
}

const released = seasonYear === SEASON && count > 0
const partial = released && count < INITIAL_RELEASE_FLOOR

// Consumed by the workflow via $GITHUB_OUTPUT, so keep these keys stable and single-line.
console.log(`released=${released}`)
console.log(`season=${label}`)
console.log(`year=${SEASON}`)
console.log(`count=${count}`)
console.log(`partial=${partial}`)

if (!released) {
  const why =
    seasonYear === SEASON
      ? 'the calendar is up but no fixtures are posted yet'
      : `ESPN still answers with the ${seasonYear}-${String(seasonYear + 1).slice(2)} season`
  console.log(`summary=Not yet — no ${label} fixtures posted (${why}).`)
} else {
  const when = (ev) => ev.date.slice(0, 10)
  console.log(
    `summary=${label} fixtures are OUT: ${count} fixtures` +
      `${partial ? ` (PARTIAL — a complete release is 380)` : ''}, ` +
      `opening ${when(first)} ${first.name}, through ${when(last)}.`
  )
}
