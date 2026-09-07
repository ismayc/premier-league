// The single source of this competition's identity, vocabulary, and display rules.
//
// Everything a component or util would otherwise hardcode inline lives here: the ESPN
// path, the storage prefix, the match vocabulary, the live window, the .ics identity,
// the deploy host, the locale. The pattern comes from the-nfl-schedule; this is the
// fifth repo in the family to get it.
//
// Two rules this file is written to:
//
//   1. Every field below has a real consumer in src/. A field only a config reader
//      touches is a shallow module pretending to be a seam, and the NFL original grew
//      seven of them.
//
//   2. Structure stays out. The table's ordering, the matchweek reconstruction and the
//      qualification zones live in src/utils/table.js and src/utils/matchweek.js.
//      This file owns facts, not rules.
//
// ── Time: this repo settles a family-wide disagreement ────────────────────────
//
// src/utils/timeCore.js is the one piece of sports-viewer-meta any deployed app
// actually uses, and it already takes an adapter: createTimeUtils({locale, weekStart,
// gameLengthMs, timezones}). Its contract disagrees with the NFL config in two places,
// and here the factory wins, because it is the code that runs:
//
//   • `weekStart: 0 | 1`, not `weekStartsMonday: boolean`. Numeric matches what
//     createTimeUtils already accepts, and 0/1 says which day rather than asking a
//     reader to negate a boolean.
//
//   • There is NO `hour12` field. timeCore derives the hour cycle from the locale
//     (timeCore.js:50-55) and gets something a boolean cannot: 12-hour locales drop the
//     leading zero ("7:05 PM") while 24-hour locales keep it ("09:05"). A separate
//     switch would let the two drift.
//
//     The NFL's `hour12: true` IS consumed, at that repo's src/utils/time.js:44, but
//     redundantly: it sits beside `locale: 'en-US'`, which already resolves to a
//     12-hour cycle. So it is not free to delete, unlike its `weekStartsMonday`, which
//     has no consumer at all. Reconciling the two repos is its own piece of work.
import { SEASON } from '../data/teams.js'

export const LEAGUE = {
  id: 'pl',
  name: 'Premier League',
  // index.html's <title> is the bare title; unlike the US-sport siblings there is no
  // "— every game in your timezone" half, so there is no `tagline` field to carry.
  title: 'Premier League Fixtures',
  season: SEASON,
  // Derived from SEASON, not from the generated SEASON_LABEL. That value is ESPN's own
  // phrasing ("2026-27 English Premier League"), and App.jsx used to strip the
  // competition name back out of it with a .replace() on a feed string. Upstream
  // renames a competition often enough in this family that the surgery would fail
  // silently, leaving the full sentence in a space sized for five characters.
  seasonLabel: `${SEASON}-${String(SEASON + 1).slice(-2)}`,
  espnPath: 'soccer/eng.1',
  // What the ESPN feed calls this competition in a player's match log, used to tell a
  // league match from a cup one. Not the same string as `name`, and not ours to choose.
  // It lived in services/athlete.js as a second `const LEAGUE`, which collided with this
  // module the moment the file imported it.
  espnLeagueName: 'English Premier League',
  storageKey: 'pl', // 'pl:theme', 'pl:followed', 'pl:alerts', …
  // UI chrome only. Matches --bg in index.css, <meta name="theme-color">, and the
  // manifest. The chrome shipped #12121a against a page painting #15171b until today.
  themeColor: '#15171b',

  // ── Vocabulary ──────────────────────────────────────────────────────────────
  // Football says "v", not "@" or "vs", and the away side is named second.
  homeAwaySep: 'v',
  kickoffLabel: 'Kickoff',

  // ── Time ────────────────────────────────────────────────────────────────────
  // Passed straight into createTimeUtils. en-GB renders 24-hour with the leading zero;
  // the football week starts Monday.
  locale: 'en-GB',
  weekStart: 1,
  // The window in which a match with no live feed should still count as possibly in
  // progress. Named gameLengthMs to match the rest of the family and because that is
  // what createTimeUtils calls it, even though this competition plays matches.
  //
  // It was NOT being passed to createTimeUtils, so the factory fell back to its 2.25h
  // basketball default and src/utils/time.js declared a second copy of the same number
  // beside it. One value now, passed in.
  gameLengthMs: 2.25 * 60 * 60 * 1000,

  // ── Calendar export ─────────────────────────────────────────────────────────
  // Note the slug: this app is `premier-league` on GitHub and Pages but
  // `premier-league-viewer` on Netlify, and the .ics identity follows Netlify because
  // that is the host a subscriber's calendar actually polls. The download filename
  // follows the repo. Both are asserted in test/chrome-identity.test.js so the pair
  // cannot silently converge or drift further.
  ics: {
    // A match is 90 minutes plus half time and added time; two hours is the block a
    // calendar should reserve. Deliberately shorter than gameLengthMs, which asks a
    // different question: how long before a scoreless feed stops meaning "live".
    durationMs: 2 * 60 * 60 * 1000,
    prodId: '-//premier-league-viewer//EN',
    domain: 'premier-league-viewer',
    filenameBase: 'premier-league',
  },

  // Netlify serves /calendar.ics; GitHub Pages cannot run the function.
  feedHost: 'https://premier-league-viewer.netlify.app',
}

export { SEASON }
