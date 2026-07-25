import { describe, expect, it } from 'vitest'
import { assignMatchweeks, groupByMatchweek } from '../src/utils/matchweek.js'
import { FIXTURES } from '../src/data/fixtures.js'

const fx = (id, ko, home, away) => ({ id, ko, home, away })

describe('assignMatchweeks', () => {
  it('rebuilds the committed season as 38 rounds of 10, every club once per round', () => {
    const byId = assignMatchweeks(FIXTURES)
    // 380 fixtures all numbered.
    expect(byId.size).toBe(FIXTURES.length)

    const rounds = new Map() // mw -> Set(clubs)
    const sizes = new Map() // mw -> count
    for (const f of FIXTURES) {
      const mw = byId.get(f.id)
      sizes.set(mw, (sizes.get(mw) ?? 0) + 1)
      const clubs = rounds.get(mw) ?? new Set()
      clubs.add(f.home)
      clubs.add(f.away)
      rounds.set(mw, clubs)
    }

    expect([...sizes.keys()].sort((a, b) => a - b)).toEqual(
      Array.from({ length: 38 }, (_, i) => i + 1)
    )
    expect([...sizes.values()].every((n) => n === 10)).toBe(true)
    expect([...rounds.values()].every((clubs) => clubs.size === 20)).toBe(true)
  })

  it('walks kickoffs in order, opening a new round only when the current one is full or blocked', () => {
    // Four clubs -> rounds of two. The fifth game reuses ARS/CHE, so it cannot
    // join round 1 and starts round 2 even though round 1 is not yet full.
    const byId = assignMatchweeks([
      fx('a', '2026-08-15T14:00:00.000Z', 'ARS', 'CHE'),
      fx('b', '2026-08-16T14:00:00.000Z', 'LIV', 'MNC'), // fills round 1
      fx('c', '2026-08-22T14:00:00.000Z', 'ARS', 'LIV'), // round 2
      fx('d', '2026-08-29T14:00:00.000Z', 'ARS', 'MNC'), // ARS busy in r2 -> round 3
    ])
    expect([byId.get('a'), byId.get('b'), byId.get('c'), byId.get('d')]).toEqual([1, 1, 2, 3])
  })

  it('is stable regardless of the order fixtures arrive in', () => {
    const games = [
      fx('a', '2026-08-15T14:00:00.000Z', 'ARS', 'CHE'),
      fx('b', '2026-08-16T14:00:00.000Z', 'LIV', 'MNC'),
      fx('c', '2026-08-22T14:00:00.000Z', 'ARS', 'LIV'),
    ]
    const forward = assignMatchweeks(games)
    const shuffled = assignMatchweeks([games[2], games[0], games[1]])
    for (const g of games) expect(shuffled.get(g.id)).toBe(forward.get(g.id))
  })
})

describe('groupByMatchweek', () => {
  it('keeps the day sub-structure and orders matchweeks ascending', () => {
    const byId = new Map([
      ['a', 2],
      ['b', 1],
      ['c', 1],
    ])
    const days = [
      { key: '2026-08-15', fixtures: [{ id: 'b' }] },
      { key: '2026-08-16', fixtures: [{ id: 'c' }] },
      { key: '2026-08-22', fixtures: [{ id: 'a' }] },
    ]
    const weeks = groupByMatchweek(days, byId)
    expect(weeks.map((w) => w.mw)).toEqual([1, 2])
    // MW1 spans two days; MW2 one. Counts sum the fixtures.
    expect(weeks[0].days.map((d) => d.key)).toEqual(['2026-08-15', '2026-08-16'])
    expect(weeks[0].count).toBe(2)
    expect(weeks[1].count).toBe(1)
  })
})
