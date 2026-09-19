import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { CLUB_CREST_SLUGS } from '../src/data/club-crests.js'
import { HISTORY } from '../src/data/history.js'
import { crestSlugForName } from '../src/utils/crests.js'

/**
 * The historical crest map is kept by hand (see src/data/club-crests.js), so
 * this is what keeps it whole: every club the history names must resolve to a
 * crest that is actually committed, both variants. The same check runs in the
 * live suite against a freshly refreshed history.
 */

const logo = (file) => existsSync(join(__dirname, '../public/logos', file))

describe('historical club crests', () => {
  it('resolves every club in the history to a committed crest, bar Wimbledon', () => {
    const clubs = [...new Set(HISTORY.flatMap((s) => s.table.map((r) => r.team)))]
    const missing = clubs.filter((c) => {
      const slug = crestSlugForName(c)
      return !slug || !logo(`${slug}.png`) || !logo(`${slug}-dark.png`)
    })
    // Add a club named here to CLUB_CREST_SLUGS, with its crest in public/logos.
    expect(missing).toEqual(['Wimbledon'])
  })

  it('lists no club the history never names', () => {
    // A stale or misspelled key would never be looked up, and would hide the
    // name the history actually uses.
    const clubs = new Set(HISTORY.flatMap((s) => s.table.map((r) => r.team)))
    expect(Object.keys(CLUB_CREST_SLUGS).filter((k) => !clubs.has(k))).toEqual([])
  })

  it('falls back to the current season for a club the map does not list', () => {
    // The short name is not a history key, so this exercises the fallback.
    expect(CLUB_CREST_SLUGS['Man City']).toBeUndefined()
    expect(crestSlugForName('Man City')).toBe('eng.man_city')
    expect(crestSlugForName('Nowhere Rovers')).toBeUndefined()
  })
})
