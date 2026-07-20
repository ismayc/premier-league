import { describe, expect, it } from 'vitest'
import { buildTable, maxPoints, relegationSafe, zoneFor } from '../src/utils/table.js'

/**
 * The table is the piece of logic most worth testing: every other view leans
 * on it, and the historical ETL runs the same rules over 34 past seasons. The
 * cases below are the ones that actually go wrong — tie-breaking order,
 * shared positions, and home/away accounting.
 */

const match = (home, away, hg, ag, ko = '2026-08-21T19:00:00.000Z') => ({
  id: `${home}-${away}-${ko}`,
  ko,
  home,
  away,
  score: [hg, ag],
})

describe('buildTable', () => {
  it('awards three points for a win and one for a draw', () => {
    const table = buildTable([match('ARS', 'CHE', 2, 0), match('LIV', 'MCI', 1, 1)], [
      'ARS',
      'CHE',
      'LIV',
      'MCI',
    ])
    const row = (a) => table.find((r) => r.abbr === a)

    expect(row('ARS').points).toBe(3)
    expect(row('CHE').points).toBe(0)
    expect(row('LIV').points).toBe(1)
    expect(row('MCI').points).toBe(1)
  })

  it('includes clubs that have not played, on zero', () => {
    const table = buildTable([], ['ARS', 'CHE'])
    expect(table).toHaveLength(2)
    expect(table.every((r) => r.played === 0 && r.points === 0)).toBe(true)
  })

  it('separates clubs level on points by goal difference, then goals scored', () => {
    // All three win once. Goal difference then goals scored must decide.
    const table = buildTable(
      [
        match('AAA', 'XXX', 5, 0), // +5, 5 scored
        match('BBB', 'YYY', 3, 0), // +3, 3 scored
        match('CCC', 'ZZZ', 3, 0), // +3, 3 scored — level with BBB on both
      ],
      ['AAA', 'BBB', 'CCC', 'XXX', 'YYY', 'ZZZ']
    )

    expect(table.slice(0, 3).map((r) => r.abbr)).toEqual(['AAA', 'BBB', 'CCC'])
    expect(table[0].pos).toBe(1)
    // BBB and CCC are level on points, difference and goals — they share 2nd.
    expect(table[1].pos).toBe(2)
    expect(table[2].pos).toBe(2)
  })

  it('gives the next club the position the shared rank consumed', () => {
    // Three identical 1-0 wins and three identical 1-0 defeats: the winners
    // are indistinguishable, and so are the losers.
    const table = buildTable(
      [match('AAA', 'XXX', 1, 0), match('BBB', 'YYY', 1, 0), match('ZZZ', 'CCC', 1, 0)],
      ['AAA', 'BBB', 'CCC', 'XXX', 'YYY', 'ZZZ']
    )
    // Three clubs share first, so second and third do not exist — the next
    // group starts at fourth.
    expect(table.slice(0, 3).map((r) => r.pos)).toEqual([1, 1, 1])
    expect(table.slice(3).map((r) => r.pos)).toEqual([4, 4, 4])
  })

  it('tracks home and away records separately', () => {
    const table = buildTable(
      [match('ARS', 'CHE', 3, 0), match('CHE', 'ARS', 1, 0, '2027-01-10T15:00:00.000Z')],
      ['ARS', 'CHE']
    )
    const ars = table.find((r) => r.abbr === 'ARS')

    expect(ars.home).toMatchObject({ played: 1, won: 1, gf: 3, ga: 0 })
    expect(ars.away).toMatchObject({ played: 1, lost: 1, gf: 0, ga: 1 })
    expect(ars.points).toBe(3)
  })

  it('reads form oldest to newest and keeps only the last five', () => {
    const games = [1, 2, 3, 4, 5, 6].map((n) =>
      // ARS loses the first, wins the rest — the oldest result should drop out.
      match(n === 1 ? 'XXX' : 'ARS', n === 1 ? 'ARS' : 'XXX', n === 1 ? 1 : 1, 0, `2026-08-0${n}T12:00:00.000Z`)
    )
    const ars = buildTable(games, ['ARS', 'XXX']).find((r) => r.abbr === 'ARS')

    expect(ars.form).toHaveLength(5)
    expect(ars.form).toEqual(['W', 'W', 'W', 'W', 'W'])
  })

  it('ignores fixtures with no score and matches marked unplayed', () => {
    const table = buildTable(
      [
        { id: '1', ko: '2026-08-21T19:00:00.000Z', home: 'ARS', away: 'CHE' },
        { ...match('ARS', 'LIV', 9, 0), unplayed: 'Postponed' },
      ],
      ['ARS', 'CHE', 'LIV']
    )
    expect(table.every((r) => r.played === 0)).toBe(true)
  })
})

describe('zoneFor', () => {
  it('maps positions to the European and relegation bands', () => {
    expect(zoneFor(1)).toBe('champions')
    expect(zoneFor(4)).toBe('champions')
    expect(zoneFor(5)).toBe('europa')
    expect(zoneFor(6)).toBe('conference')
    expect(zoneFor(7)).toBe(null)
    expect(zoneFor(17)).toBe(null)
    expect(zoneFor(18)).toBe('relegation')
    expect(zoneFor(20)).toBe('relegation')
  })
})

describe('maxPoints', () => {
  it('is the club’s current points plus three for every remaining match', () => {
    expect(maxPoints({ points: 40, played: 30 }, 38)).toBe(40 + 8 * 3)
  })
})

describe('relegationSafe', () => {
  // A full-size league, so the bottom-three rule means what it means.
  const twenty = Array.from({ length: 20 }, (_, i) => `T${String(i).padStart(2, '0')}`)

  it('declares nobody safe on the opening weekend', () => {
    // One match played; every club can still reach almost any total.
    const table = buildTable([match('T00', 'T01', 1, 0)], twenty)
    expect(relegationSafe(table, 38).size).toBe(0)
  })

  it('declares exactly the surviving clubs safe once the season is over', () => {
    // Points descend by club index, and nothing is left to play.
    const table = twenty.map((abbr, i) => ({ abbr, played: 38, points: 100 - i * 3 }))
    const safe = relegationSafe(table, 38)

    expect(safe.size).toBe(17)
    expect(safe.has('T00')).toBe(true) // champions
    expect(safe.has('T16')).toBe(true) // 17th, the last safe place
    expect(safe.has('T17')).toBe(false) // relegated
    expect(safe.has('T19')).toBe(false)
  })

  it('does not count a club as a threat to itself', () => {
    // Every club level and nothing played: with 20 clubs and 19 possible
    // threats each, nobody can be safe — but the club itself must not inflate
    // that count.
    const table = twenty.map((abbr) => ({ abbr, played: 38, points: 50 }))
    expect(relegationSafe(table, 38).size).toBe(0)
  })

  it('respects a different number of relegation places', () => {
    const table = twenty.map((abbr, i) => ({ abbr, played: 38, points: 100 - i * 3 }))
    expect(relegationSafe(table, 38, 1).size).toBe(19)
  })
})
