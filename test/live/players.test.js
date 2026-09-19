import { describe, it, expect } from 'vitest'
import { PLAYER_STATS, STAT_CATEGORIES, STAT_SEASONS } from '../../src/data/players.js'
import { leaderboard } from '../../src/utils/stats.js'

// LIVE suite (npm run test:data): the refreshed leaderboards, every season the file
// carries.
//
// Only INVARIANTS belong here; see test/live/fixtures.test.js for why. Every check below
// loops over the rows, so an empty board (a new season before its first match) passes
// them all vacuously. A player's club is checked as present, not as one of this
// season's 20: a player sold abroad mid-season keeps their goals on the board, and ESPN
// may file them under the new club.

const keys = new Set(STAT_CATEGORIES.map((c) => c.key))

describe('the refreshed leaderboards', () => {
  it('lists seasons newest first, each a board of known categories', () => {
    expect(STAT_SEASONS).toEqual([...STAT_SEASONS].sort((a, b) => b - a))
    for (const s of STAT_SEASONS) {
      for (const k of Object.keys(PLAYER_STATS[s])) expect(keys.has(k), `${s}.${k}`).toBe(true)
    }
  })

  it.each(STAT_SEASONS)('%s gives every row a name, a club, and numbers where numbers go', (s) => {
    for (const [cat, rows] of Object.entries(PLAYER_STATS[s])) {
      const ids = rows.map((r) => r.id)
      expect(new Set(ids).size, `${s}.${cat} duplicate player`).toBe(ids.length)
      for (const r of rows) {
        const where = `${s}.${cat} ${r.name}`
        expect(r.name, where).toBeTruthy()
        expect(r.team, where).toBeTruthy()
        expect(Number.isFinite(r.value) && r.value >= 0, `${where} value=${r.value}`).toBe(true)
        if (r.matches !== undefined) {
          expect(r.matches === null || Number.isFinite(r.matches), `${where} matches=${r.matches}`).toBe(true)
        }
      }
    }
  })

  it('ranks every board in order without throwing', () => {
    for (const s of STAT_SEASONS) {
      for (const [cat, rows] of Object.entries(PLAYER_STATS[s])) {
        const ranked = leaderboard(rows, { limit: 10 })
        for (let i = 1; i < ranked.length; i++) {
          expect(ranked[i - 1].value, `${s}.${cat}`).toBeGreaterThanOrEqual(ranked[i].value)
          expect(ranked[i - 1].rank, `${s}.${cat}`).toBeLessThanOrEqual(ranked[i].rank)
        }
      }
    }
  })
})
