import { describe, it, expect } from 'vitest'
import { FIXTURES } from '../../src/data/fixtures.js'
import { ALL_ABBRS } from '../../src/data/teams.js'
import { buildTable, positionRanges, relegationSafe } from '../../src/utils/table.js'

// LIVE suite (npm run test:data): the league table the site derives from the refreshed
// scores. Invariants only; see test/live/fixtures.test.js for why. Each holds on the
// opening day, when every club is on zero, and on the final day alike.

const table = buildTable(FIXTURES, ALL_ABBRS)
const scored = FIXTURES.filter((f) => f.score && !f.unplayed)

describe('the table derived from the refreshed fixtures', () => {
  it('has every club exactly once', () => {
    expect(table).toHaveLength(ALL_ABBRS.length)
    expect(new Set(table.map((r) => r.abbr))).toEqual(new Set(ALL_ABBRS))
  })

  it('gives every club a record that independently recounts the committed results', () => {
    // A different code path than buildTable: catches a miscounted or home/away-swapped
    // record without naming a number the refresh moves.
    for (const row of table) {
      let won = 0
      let drawn = 0
      let lost = 0
      let gf = 0
      let ga = 0
      for (const f of scored) {
        if (f.home !== row.abbr && f.away !== row.abbr) continue
        const [mine, theirs] = f.home === row.abbr ? f.score : [f.score[1], f.score[0]]
        gf += mine
        ga += theirs
        if (mine > theirs) won++
        else if (mine < theirs) lost++
        else drawn++
      }
      expect({ abbr: row.abbr, won, drawn, lost, gf, ga }).toEqual({
        abbr: row.abbr,
        won: row.won,
        drawn: row.drawn,
        lost: row.lost,
        gf: row.gf,
        ga: row.ga,
      })
      expect(row.points, row.abbr).toBe(won * 3 + drawn)
      expect(row.played, row.abbr).toBeLessThanOrEqual(38)
    }
  })

  it('balances across the league', () => {
    const sum = (k) => table.reduce((t, r) => t + r[k], 0)
    expect(sum('played')).toBe(scored.length * 2)
    expect(sum('gf')).toBe(sum('ga'))
    expect(sum('gd')).toBe(0)
  })

  it('orders by points, then goal difference, then goals, with shared places only on a full tie', () => {
    for (let i = 1; i < table.length; i++) {
      const a = table[i - 1]
      const b = table[i]
      const key = (r) => [r.points, r.gd, r.gf]
      const [ap, ag, af] = key(a)
      const [bp, bg, bf] = key(b)
      expect(ap > bp || (ap === bp && (ag > bg || (ag === bg && af >= bf))), `${a.abbr} over ${b.abbr}`).toBe(true)
      const level = ap === bp && ag === bg && af === bf
      expect(b.pos, b.abbr).toBe(level ? a.pos : i + 1)
    }
    expect(table[0].pos).toBe(1)
  })

  it('gives every club a finishing window that contains where it stands', () => {
    const ranges = positionRanges(table)
    for (const r of table) {
      const { best, worst } = ranges[r.abbr]
      expect(best, r.abbr).toBeGreaterThanOrEqual(1)
      expect(worst, r.abbr).toBeLessThanOrEqual(table.length)
      expect(best, r.abbr).toBeLessThanOrEqual(worst)
      expect(r.pos >= best && r.pos <= worst, `${r.abbr} pos ${r.pos} in ${best}-${worst}`).toBe(true)
    }
  })

  it('never calls more clubs safe than there are places above the drop', () => {
    expect(relegationSafe(table).size).toBeLessThanOrEqual(table.length - 3)
  })
})
