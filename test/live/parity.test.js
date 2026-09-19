import { describe, it, expect } from 'vitest'
import * as liveFixtures from '../../src/data/fixtures.js'
import * as livePlayers from '../../src/data/players.js'
import * as liveTeams from '../../src/data/teams.js'
import * as liveHistory from '../../src/data/history.js'
import * as frozenFixtures from '../fixtures/frozen/fixtures.js'
import * as frozenPlayers from '../fixtures/frozen/players.js'
import * as frozenTeams from '../fixtures/frozen/teams.js'
import * as frozenHistory from '../fixtures/frozen/history.js'

// LIVE suite (npm run test:data). The main suite never sees the real data modules: the
// frozenData plugin in vite.config.js swaps each for a stand-in. That is only safe while
// a stand-in has the same SHAPE as the module it replaces. If a fetch script starts
// writing a new export or a new field and the stand-in lacks it, the main suite would go
// on passing against a shape the site no longer has. This is the check.

const PAIRS = [
  ['fixtures.js', liveFixtures, frozenFixtures],
  ['players.js', livePlayers, frozenPlayers],
  ['teams.js', liveTeams, frozenTeams],
  ['history.js', liveHistory, frozenHistory],
]

// Every key seen on any row, so an optional field present on one row still counts.
const fieldsOf = (rows) => [...new Set(rows.flatMap((r) => Object.keys(r)))].sort()

describe('frozen stand-ins keep the shape of the live modules', () => {
  it.each(PAIRS)('%s exports the same names', (_name, live, frozen) => {
    expect(Object.keys(frozen).sort()).toEqual(Object.keys(live).sort())
  })

  // The category list is written by fetch-stats.mjs from its own table, so it only
  // changes when that script does. SEASON is deliberately not compared with the frozen
  // copy: the rollover PR moves it, and the frozen board stays on the season it froze.
  it('players.js carries the same stat categories', () => {
    expect(frozenPlayers.STAT_CATEGORIES).toEqual(livePlayers.STAT_CATEGORIES)
  })

  it('fixtures.js and teams.js name the same season', () => {
    expect(liveFixtures.SEASON).toBe(liveTeams.SEASON)
  })

  // Deliberately NOT checked: row fields in general. Rows gain fields for reasons that are
  // not mistakes (the first postponed match carries a flag no played match has), and a
  // check on them would block a correct refresh. Only the fields the code reads by name.
  it('keeps the club fields the code reads by name', () => {
    for (const k of ['abbr', 'slug', 'name', 'displayName', 'color']) {
      expect(fieldsOf(liveTeams.TEAMS), k).toContain(k)
    }
  })

  it('keeps the fixture fields the code reads by name', () => {
    for (const k of ['id', 'ko', 'home', 'away']) expect(fieldsOf(liveFixtures.FIXTURES), k).toContain(k)
  })

  // Only once a board has rows: every board of a new season is empty until its first
  // match, and an empty board has no fields to check.
  const rows = Object.values(livePlayers.PLAYER_STATS).flatMap((s) => Object.values(s).flat())
  it.runIf(rows.length > 0)('keeps the player fields the code reads by name', () => {
    for (const k of ['id', 'name', 'short', 'team', 'value']) expect(fieldsOf(rows), k).toContain(k)
  })

  it('keeps the historical table fields the code reads by name', () => {
    const table = liveHistory.HISTORY.flatMap((s) => s.table)
    for (const k of ['team', 'pos', 'played', 'won', 'drawn', 'lost', 'gf', 'ga', 'gd', 'points']) {
      expect(fieldsOf(table), k).toContain(k)
    }
  })
})
