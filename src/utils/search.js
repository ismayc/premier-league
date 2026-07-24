// Scoped free-text search over Premier League fixtures. A query like
// `team: Arsenal city: London` parses into field tokens plus any leftover free
// text. Plain queries ("Liverpool", "Emirates", "Peacock") still do a broad
// substring match, so nothing has to be scoped. Scoped fields: team, city,
// venue (aliases arena/stadium), tv (aliases broadcast/network/watch).
//
// Kept pure and data-only (no React, no DOM) so it's fully unit-testable:
// parseQuery turns a string into { free, tokens }, and matchesSearch(fixture,
// parsed) is the predicate the fixtures filter runs on.

import { TEAM_BY_ABBR } from '../data/teams.js'

// Accepted field names (and synonyms) -> canonical field. The broadcast column
// is called `tv` in the fixture data, so `tv:` is the canonical name here and
// broadcast/network/watch are the aliases (the reverse of the WNBA app).
const FIELD_ALIASES = {
  team: 'team', teams: 'team', t: 'team',
  city: 'city',
  venue: 'venue', arena: 'venue', stadium: 'venue',
  tv: 'tv', broadcast: 'tv', network: 'tv', watch: 'tv',
}

export function parseQuery(input) {
  const q = (input || '').trim()
  const re = /(\w+):\s*/g
  const marks = []
  let m
  while ((m = re.exec(q))) {
    marks.push({ key: m[1].toLowerCase(), start: m.index, valStart: m.index + m[0].length })
  }

  if (marks.length === 0) return { free: q, tokens: [] }

  const tokens = []
  let free = q.slice(0, marks[0].start).trim()
  for (let i = 0; i < marks.length; i++) {
    const end = i + 1 < marks.length ? marks[i + 1].start : q.length
    const value = q.slice(marks[i].valStart, end).trim()
    const field = FIELD_ALIASES[marks[i].key]
    if (field && value) tokens.push({ field, value })
    else if (value) free = `${free} ${value}`.trim() // unknown field -> free text
  }
  return { free, tokens }
}

// Everything searchable about a club: its abbreviation, short name, and full
// display name, so `team: Arsenal`, `team: Manchester City`, and `team: MNC`
// all hit. PL clubs carry no separate location/nickname, so name/displayName
// are all there is beyond the abbreviation.
function teamText(abbr) {
  const t = TEAM_BY_ABBR[abbr]
  if (!t) return (abbr || '').toLowerCase()
  return `${t.abbr} ${t.name} ${t.displayName}`.toLowerCase()
}

function teamMatches(abbr, v) {
  return teamText(abbr).includes(v)
}

// A fixture's broadcasters are a flat list of network names; join them so a
// token matches any single network on the match ("Peacock", "NBC", "USA Net").
function tvText(fixture) {
  return (fixture.tv || []).join(' ').toLowerCase()
}

function tokenMatch(fixture, { field, value }) {
  const v = value.toLowerCase()
  if (field === 'team') return teamMatches(fixture.home, v) || teamMatches(fixture.away, v)
  if (field === 'city') return (fixture.city || '').toLowerCase().includes(v)
  if (field === 'tv') return tvText(fixture).includes(v)
  return (fixture.venue || '').toLowerCase().includes(v) // field === 'venue'
}

export function matchesSearch(fixture, parsed) {
  for (const t of parsed.tokens) {
    if (!tokenMatch(fixture, t)) return false
  }
  if (parsed.free) {
    const hay = `${teamText(fixture.home)} ${teamText(fixture.away)} ${(
      fixture.city || ''
    ).toLowerCase()} ${(fixture.venue || '').toLowerCase()} ${tvText(fixture)}`
    if (!hay.includes(parsed.free.toLowerCase())) return false
  }
  return true
}
