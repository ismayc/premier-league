import { describe, expect, it } from 'vitest'
import { allTimeRecord, clubHistory, leaderboard, seasonTotals, teamScoring } from '../src/utils/stats.js'

const match = (home, away, hg, ag) => ({
  id: `${home}${away}${hg}${ag}`,
  ko: '2026-08-21T19:00:00.000Z',
  home,
  away,
  score: [hg, ag],
})

describe('seasonTotals', () => {
  it('counts results, goals and outcome splits', () => {
    const t = seasonTotals([
      match('ARS', 'CHE', 2, 1), // home win
      match('LIV', 'MCI', 0, 0), // goalless draw, two clean sheets
      match('TOT', 'EVE', 1, 4), // away win, thrashing by 3? no — margin 3
      { id: 'x', ko: '2027-01-01T15:00:00.000Z', home: 'ARS', away: 'LIV' }, // unplayed
    ])

    expect(t.played).toBe(3)
    expect(t.remaining).toBe(1)
    expect(t.goals).toBe(8)
    expect(t.homeWins).toBe(1)
    expect(t.draws).toBe(1)
    expect(t.awayWins).toBe(1)
    expect(t.goalless).toBe(1)
    expect(t.cleanSheets).toBe(2)
    expect(t.gpg).toBeCloseTo(8 / 3)
  })

  it('counts a four-goal margin as a thrashing but not a three-goal one', () => {
    const t = seasonTotals([match('ARS', 'CHE', 4, 1), match('LIV', 'MCI', 4, 0)])
    expect(t.thrashings).toHaveLength(1)
    expect(t.thrashings[0].home).toBe('LIV')
  })

  it('reports zeroes rather than dividing by zero before any match', () => {
    const t = seasonTotals([])
    expect(t.played).toBe(0)
    expect(t.gpg).toBe(0)
    expect(t.homeWinPct).toBe(0)
  })
})

describe('teamScoring', () => {
  it('ranks attack by goals scored and defence by fewest conceded', () => {
    const rows = teamScoring(
      [match('ARS', 'CHE', 3, 0), match('LIV', 'MCI', 1, 0)],
      ['ARS', 'CHE', 'LIV', 'MCI']
    )
    const row = (a) => rows.find((r) => r.abbr === a)

    expect(row('ARS').attackRank).toBe(1) // 3 scored
    expect(row('CHE').attackRank).toBe(4) // 0 scored
    // ARS, LIV and MCI all conceded nothing; CHE conceded three.
    expect(row('CHE').defenceRank).toBe(4)
    expect(row('ARS').gdpg).toBe(3)
  })

  it('excludes clubs that have not played', () => {
    const rows = teamScoring([match('ARS', 'CHE', 1, 0)], ['ARS', 'CHE', 'LIV'])
    expect(rows.map((r) => r.abbr).sort()).toEqual(['ARS', 'CHE'])
  })
})

describe('leaderboard', () => {
  const rows = [
    { id: 'a', value: 20 },
    { id: 'b', value: 15 },
    { id: 'c', value: 15 },
    { id: 'd', value: 10 },
  ]

  it('gives tied entries the same rank and skips the consumed places', () => {
    const out = leaderboard(rows, { limit: 10 })
    expect(out.map((r) => r.rank)).toEqual([1, 2, 2, 4])
  })

  it('does not cut a tie in half at the limit', () => {
    // Limit of 2 lands mid-tie; both second-placed entries must survive.
    const out = leaderboard(rows, { limit: 2 })
    expect(out.map((r) => r.id)).toEqual(['a', 'b', 'c'])
  })

  it('returns an empty array for missing data', () => {
    expect(leaderboard(undefined)).toEqual([])
    expect(leaderboard([])).toEqual([])
  })
})

describe('allTimeRecord', () => {
  const history = [
    {
      year: 1992,
      teams: 22,
      table: [
        { team: 'Alpha', pos: 1, played: 42, won: 24, drawn: 12, lost: 6, gf: 67, ga: 31, points: 84 },
        { team: 'Beta', pos: 20, played: 42, won: 10, drawn: 10, lost: 22, gf: 40, ga: 70, points: 40 },
      ],
    },
    {
      year: 1993,
      teams: 20,
      table: [
        { team: 'Alpha', pos: 2, played: 38, won: 20, drawn: 10, lost: 8, gf: 60, ga: 40, points: 70 },
        { team: 'Beta', pos: 19, played: 38, won: 5, drawn: 5, lost: 28, gf: 25, ga: 80, points: 20 },
      ],
    },
  ]

  it('accumulates points, titles and top-four finishes across seasons', () => {
    const [alpha] = allTimeRecord(history)
    expect(alpha.team).toBe('Alpha')
    expect(alpha.seasons).toBe(2)
    expect(alpha.points).toBe(154)
    expect(alpha.titles).toBe(1)
    expect(alpha.top4).toBe(2)
    expect(alpha.best).toBe(1)
  })

  it('counts the bottom three as relegated, whatever the league size', () => {
    const beta = allTimeRecord(history).find((c) => c.team === 'Beta')
    // 20th of 22 and 19th of 20 are both relegation places.
    expect(beta.relegations).toBe(2)
  })

  it('counts four relegations in 1994-95, when the League cut to 20 clubs', () => {
    const cutSeason = [
      {
        year: 1994,
        teams: 22,
        table: [
          // 19th of 22 survived in a normal season but went down in this one.
          { team: 'Gamma', pos: 19, played: 42, won: 8, drawn: 10, lost: 24, gf: 30, ga: 60, points: 34 },
        ],
      },
    ]
    expect(allTimeRecord(cutSeason)[0].relegations).toBe(1)

    // The same finishing position in the season before was survival.
    const normalSeason = [{ ...cutSeason[0], year: 1993 }]
    expect(allTimeRecord(normalSeason)[0].relegations).toBe(0)
  })
})

describe('clubHistory', () => {
  it('returns only the seasons the club appeared in', () => {
    const history = [
      { year: 1992, label: '1992-93', teams: 22, table: [{ team: 'Alpha', pos: 1, points: 84 }] },
      { year: 1993, label: '1993-94', teams: 20, table: [{ team: 'Beta', pos: 4, points: 70 }] },
    ]
    expect(clubHistory(history, 'Alpha')).toEqual([
      { year: 1992, label: '1992-93', pos: 1, points: 84, teams: 22 },
    ])
    expect(clubHistory(history, 'Nobody')).toEqual([])
  })
})
