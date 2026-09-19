// LIVE suite (npm run test:data): the refreshed fixture list.
//
// Only INVARIANTS belong here: things true of any correct Premier League season in every
// state it passes through, from the day the fixtures are published to the final day.
// A fact about the current season (who leads, how many have been played) does not
// belong, because the day it stops being true it blocks a refresh that did nothing
// wrong. Nothing here may assume how much has been played.

import { describe, it, expect } from 'vitest'
import { FIXTURES, SEASON } from '../../src/data/fixtures.js'
import { ALL_ABBRS } from '../../src/data/teams.js'

const clubs = new Set(ALL_ABBRS)

describe('season shape', () => {
  // 20 clubs, each playing every other home and away: 20 x 19 = 380.
  it('has 20 clubs and all 380 fixtures', () => {
    expect(clubs.size).toBe(20)
    expect(FIXTURES).toHaveLength(380)
  })

  it('gives every fixture two different, real clubs', () => {
    for (const f of FIXTURES) {
      expect(clubs.has(f.home), `${f.id} home=${f.home}`).toBe(true)
      expect(clubs.has(f.away), `${f.id} away=${f.away}`).toBe(true)
      expect(f.home, f.id).not.toBe(f.away)
    }
  })

  // A double round robin: every ordered pair exactly once, so 19 home and 19 away each.
  // A pair seen twice or never means the merge dropped or duplicated a match.
  it('plays every pairing once at each ground', () => {
    const pairs = new Set(FIXTURES.map((f) => `${f.home}-${f.away}`))
    expect(pairs.size).toBe(FIXTURES.length)
    for (const abbr of clubs) {
      expect(FIXTURES.filter((f) => f.home === abbr), `${abbr} home`).toHaveLength(19)
      expect(FIXTURES.filter((f) => f.away === abbr), `${abbr} away`).toHaveLength(19)
    }
  })

  it('gives every fixture a unique id and a real UTC kickoff', () => {
    const ids = FIXTURES.map((f) => f.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const f of FIXTURES) {
      expect(Number.isNaN(new Date(f.ko).getTime()), f.id).toBe(false)
      // The builder writes UTC; a local offset would render into the wrong day for
      // viewers far from London.
      expect(f.ko, f.id).toMatch(/Z$/)
    }
  })

  // A season runs August to May. The window is wide on purpose: a match postponed late
  // in the season can be rearranged into June, and the fixtures publish in June.
  it('keeps every kickoff inside the season it claims', () => {
    for (const f of FIXTURES) {
      const t = new Date(f.ko)
      expect(t >= new Date(`${SEASON}-07-01T00:00:00Z`), `${f.id} ${f.ko}`).toBe(true)
      expect(t <= new Date(`${SEASON + 1}-07-01T00:00:00Z`), `${f.id} ${f.ko}`).toBe(true)
    }
  })

  it('lists broadcasters as strings, when it lists any', () => {
    for (const f of FIXTURES) {
      if (f.tv === undefined) continue
      expect(Array.isArray(f.tv), f.id).toBe(true)
      for (const s of f.tv) expect(typeof s === 'string' && s.length > 0, `${f.id} tv=${s}`).toBe(true)
    }
  })
})

describe('results, as they land', () => {
  const scored = FIXTURES.filter((f) => f.score)

  it('writes a score as two non-negative whole numbers, or not at all', () => {
    for (const f of scored) {
      expect(f.score, f.id).toHaveLength(2)
      for (const n of f.score) expect(Number.isInteger(n) && n >= 0, `${f.id} ${f.score}`).toBe(true)
    }
  })

  // Each event names the side it belongs to, and the crest in the match dialog is drawn
  // from that, so a club that is not in the match would show a stranger's badge.
  it('files every goal, card, and substitution under one of the two sides', () => {
    for (const f of FIXTURES) {
      for (const e of [...(f.goals ?? []), ...(f.cards ?? []), ...(f.subs ?? [])]) {
        expect([f.home, f.away], f.id).toContain(e.team)
      }
    }
  })

  // ESPN's event detail can lag its score, so a side may list FEWER goals than it
  // scored for a while. More than it scored is never a lag: it is a bad merge.
  it('never lists more goals for a side than it scored', () => {
    for (const f of scored) {
      const listed = (abbr) => (f.goals ?? []).filter((g) => g.team === abbr).length
      expect(listed(f.home), `${f.id} home`).toBeLessThanOrEqual(f.score[0])
      expect(listed(f.away), `${f.id} away`).toBeLessThanOrEqual(f.score[1])
    }
  })

  it('shows only yellow and red cards', () => {
    for (const f of FIXTURES) {
      for (const c of f.cards ?? []) expect(['yellow', 'red'], f.id).toContain(c.color)
    }
  })

  // A match that never kicked off has no result, and a dead slot left with a score would
  // be counted into the table twice alongside its rearranged date.
  it('leaves an unplayed fixture unscored', () => {
    for (const f of FIXTURES) {
      if (f.unplayed) expect(f.score, f.id).toBeUndefined()
    }
  })
})
