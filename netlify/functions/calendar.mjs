// Auto-updating iCalendar feed for calendar subscriptions (webcal://).
//
// Unlike the in-app download (a one-time snapshot), a subscribed calendar re-fetches
// this endpoint periodically, so newly-final scores show up on their own. Each request
// serves the committed season and best-effort overlays the live ESPN scoreboard on top
// — the same merge the app does — falling back to the committed snapshot if ESPN is down.
//
// This file lives OUTSIDE scripts/, so the "Node built-ins only" refresh-workflow guard
// does not apply: it may import from src/. It reuses the exact same buildCalendar/
// applyLive/fetchLive the browser uses, so the subscription and the app can't drift apart.
//
// Netlify Functions v2 (ESM default export). Query: ?teams=ARS,LIV filters to those clubs.
import { FIXTURES, SEASON } from '../../src/data/fixtures.js'
import { buildCalendar } from '../../src/utils/ics.js'
import { fetchLive, applyLive } from '../../src/services/espn.js'

export default async (req) => {
  const params = new URL(req.url).searchParams
  const teamsParam = params.get('teams') || ''

  // Best-effort live overlay. A feed hiccup must never fail the whole calendar, so any
  // error here silently falls back to the committed fixtures.
  let fixtures = FIXTURES
  try {
    const live = await fetchLive()
    fixtures = applyLive(FIXTURES, live)
  } catch {
    /* ESPN unreachable — the committed snapshot still makes a valid calendar */
  }

  let name = 'Premier League'
  if (teamsParam) {
    const want = new Set(
      teamsParam
        .split(',')
        .map((t) => t.trim().toUpperCase())
        .filter(Boolean)
    )
    fixtures = fixtures.filter((f) => want.has(f.home) || want.has(f.away))
    name = 'Premier League — Followed'
  }

  const body = buildCalendar(fixtures, { name })

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `inline; filename="premier-league-${SEASON}.ics"`,
      // Subscribers poll on their own cadence; 30 min keeps scores fresh without
      // hammering ESPN through Netlify's edge cache.
      'Cache-Control': 'public, max-age=1800',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
