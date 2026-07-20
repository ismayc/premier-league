import { describe, expect, it } from 'vitest'
import { HISTORY, HISTORY_BY_YEAR } from '../src/data/history.js'

/**
 * These assert against the committed historical data rather than against a
 * function, which makes them regression tests for the ETL: if a future refresh
 * misparses openfootball's format, the champion roll or the arithmetic
 * invariants break here rather than silently shipping a wrong table.
 *
 * The invariants hold for any correctly parsed season, so they run over all of
 * them. The named results are checks against the record books.
 */

describe('committed history', () => {
  it('covers every season from 1992-93 with no gaps', () => {
    const years = HISTORY.map((s) => s.year)
    expect(years[0]).toBe(1992)
    for (let i = 1; i < years.length; i++) {
      expect(years[i]).toBe(years[i - 1] + 1)
    }
  })

  it.each(HISTORY)('$label is internally consistent', (season) => {
    const sum = (k) => season.table.reduce((t, r) => t + r[k], 0)

    // Every match contributes two appearances and a zero-sum goal difference.
    expect(sum('played')).toBe(season.matches * 2)
    expect(sum('gd')).toBe(0)
    expect(sum('gf')).toBe(sum('ga'))
    expect(season.table).toHaveLength(season.teams)

    // Points must equal three per decisive match plus two per draw. Draws are
    // counted from the clubs' own records, so this cross-checks both.
    const draws = sum('drawn') / 2
    expect(sum('points')).toBe((season.matches - draws) * 3 + draws * 2)

    for (const r of season.table) {
      expect(r.won + r.drawn + r.lost).toBe(r.played)
      expect(r.points).toBe(r.won * 3 + r.drawn)
      expect(r.gd).toBe(r.gf - r.ga)
    }
  })

  it.each(HISTORY)('$label is ordered by points, then goal difference, then goals', (season) => {
    for (let i = 1; i < season.table.length; i++) {
      const a = season.table[i - 1]
      const b = season.table[i]
      const ordered =
        a.points > b.points ||
        (a.points === b.points && a.gd > b.gd) ||
        (a.points === b.points && a.gd === b.gd && a.gf >= b.gf)
      expect(ordered).toBe(true)
    }
  })

  it('records the right champions', () => {
    // A spread across the era, including the two famous outliers.
    expect(HISTORY_BY_YEAR[1992].champion).toBe('Manchester United')
    expect(HISTORY_BY_YEAR[1994].champion).toBe('Blackburn Rovers')
    expect(HISTORY_BY_YEAR[2003].champion).toBe('Arsenal')
    expect(HISTORY_BY_YEAR[2015].champion).toBe('Leicester City')
    expect(HISTORY_BY_YEAR[2019].champion).toBe('Liverpool')
  })

  it('has Arsenal going unbeaten in 2003-04', () => {
    const arsenal = HISTORY_BY_YEAR[2003].table[0]
    expect(arsenal).toMatchObject({ team: 'Arsenal', played: 38, won: 26, drawn: 12, lost: 0, points: 90 })
  })

  it('separates Manchester City and United on goal difference in 2011-12', () => {
    const [first, second] = HISTORY_BY_YEAR[2011].table
    expect(first.team).toBe('Manchester City')
    expect(second.team).toBe('Manchester United')
    expect(first.points).toBe(second.points)
    expect(first.gd).toBeGreaterThan(second.gd)
  })

  it('spells each club the same way in every season', () => {
    // openfootball's 1999-00 file uses short club names where every other
    // season uses full ones. Unmapped, a club's record splits in two and it
    // quietly loses seasons from the all-time table. The shape to catch is a
    // rarely-seen name that prefixes a commonly-seen one.
    const counts = new Map()
    for (const season of HISTORY) {
      for (const r of season.table) counts.set(r.team, (counts.get(r.team) ?? 0) + 1)
    }

    const variants = []
    for (const [short, shortCount] of counts) {
      for (const [long, longCount] of counts) {
        if (short !== long && long.startsWith(`${short} `) && shortCount <= 2 && longCount > shortCount) {
          variants.push(`${short} (${shortCount}) vs ${long} (${longCount})`)
        }
      }
    }
    expect(variants).toEqual([])
  })

  it('has exactly the six ever-present clubs', () => {
    const counts = new Map()
    for (const season of HISTORY) {
      for (const r of season.table) counts.set(r.team, (counts.get(r.team) ?? 0) + 1)
    }
    const everPresent = [...counts.entries()]
      .filter(([, n]) => n === HISTORY.length)
      .map(([team]) => team)
      .sort()

    expect(everPresent).toEqual([
      'Arsenal',
      'Chelsea',
      'Everton',
      'Liverpool',
      'Manchester United',
      'Tottenham Hotspur',
    ])
  })

  it('runs 22 clubs and 42 matches for the first three seasons only', () => {
    for (const year of [1992, 1993, 1994]) {
      expect(HISTORY_BY_YEAR[year].teams).toBe(22)
      expect(HISTORY_BY_YEAR[year].table[0].played).toBe(42)
    }
    expect(HISTORY_BY_YEAR[1995].teams).toBe(20)
    expect(HISTORY_BY_YEAR[1995].table[0].played).toBe(38)
  })
})
