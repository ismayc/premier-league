import { describe, it, expect } from 'vitest'
import { parseQuery, matchesSearch } from '../src/utils/search.js'
import { FIXTURES } from '../src/data/fixtures.js'

const count = (q) => {
  const p = parseQuery(q)
  return FIXTURES.filter((f) => matchesSearch(f, p)).length
}

// A fixture whose abbreviations aren't in TEAM_BY_ABBR — exercises the
// unknown-team and missing-field fallbacks without depending on the committed
// snapshot.
const bogus = { home: 'ZZZ', away: 'YYY' }

describe('parseQuery', () => {
  it('treats bare text as free text', () => {
    expect(parseQuery('Arsenal')).toEqual({ free: 'Arsenal', tokens: [] })
  })

  it('returns an empty query for empty input', () => {
    expect(parseQuery('')).toEqual({ free: '', tokens: [] })
    expect(parseQuery()).toEqual({ free: '', tokens: [] })
  })

  it('parses a single scoped token', () => {
    expect(parseQuery('team: Arsenal')).toEqual({
      free: '',
      tokens: [{ field: 'team', value: 'Arsenal' }],
    })
  })

  it('parses multiple tokens, with or without a space after the colon', () => {
    expect(parseQuery('team:ARS city:London')).toEqual({
      free: '',
      tokens: [
        { field: 'team', value: 'ARS' },
        { field: 'city', value: 'London' },
      ],
    })
  })

  it('maps venue aliases (arena / stadium) to venue', () => {
    expect(parseQuery('venue: Emirates').tokens[0].field).toBe('venue')
    expect(parseQuery('arena: Emirates').tokens[0].field).toBe('venue')
    expect(parseQuery('stadium: Emirates').tokens[0].field).toBe('venue')
  })

  it('maps tv aliases (broadcast / network / watch) to tv', () => {
    expect(parseQuery('tv: Peacock').tokens[0].field).toBe('tv')
    expect(parseQuery('broadcast: Peacock').tokens[0].field).toBe('tv')
    expect(parseQuery('network: Peacock').tokens[0].field).toBe('tv')
    expect(parseQuery('watch: Peacock').tokens[0].field).toBe('tv')
  })

  it('keeps leading bare text as free text alongside tokens', () => {
    expect(parseQuery('Arsenal team: ARS')).toEqual({
      free: 'Arsenal',
      tokens: [{ field: 'team', value: 'ARS' }],
    })
  })

  it('treats an unknown field as free text', () => {
    expect(parseQuery('manager: Someone')).toEqual({ free: 'Someone', tokens: [] })
  })

  it('drops a scoped field with no value', () => {
    expect(parseQuery('team:')).toEqual({ free: '', tokens: [] })
  })
})

describe('matchesSearch', () => {
  it('matches a club by short name, abbreviation, and full display name', () => {
    // Man City: name "Man City", displayName "Manchester City", abbr MNC.
    expect(count('team: Man City')).toBeGreaterThan(0)
    expect(count('team: Man City')).toBe(count('team: MNC'))
    expect(count('team: Man City')).toBe(count('team: Manchester City'))
  })

  it('matches either side of the match', () => {
    // Every Liverpool fixture, home or away, counts.
    const liv = FIXTURES.filter((f) => f.home === 'LIV' || f.away === 'LIV').length
    expect(count('team: Liverpool')).toBe(liv)
    expect(count('team: Liverpool')).toBe(count('team: LIV'))
    expect(liv).toBeGreaterThan(0)
  })

  it('scopes by city', () => {
    const london = FIXTURES.filter((f) => (f.city || '').toLowerCase().includes('london')).length
    expect(count('city: London')).toBe(london)
    expect(london).toBeGreaterThan(0)
  })

  it('scopes by venue (and its aliases)', () => {
    const emirates = FIXTURES.filter((f) => /emirates/i.test(f.venue)).length
    expect(count('venue: Emirates')).toBe(emirates)
    expect(count('arena: Emirates')).toBe(emirates)
    expect(count('stadium: Emirates')).toBe(emirates)
    expect(emirates).toBeGreaterThan(0)
  })

  it('scopes by tv (and its aliases)', () => {
    const peacock = FIXTURES.filter((f) => (f.tv || []).some((b) => /peacock/i.test(b))).length
    expect(count('tv: Peacock')).toBe(peacock)
    expect(count('broadcast: Peacock')).toBe(peacock)
    expect(count('network: Peacock')).toBe(peacock)
    expect(count('watch: Peacock')).toBe(peacock)
    expect(peacock).toBeGreaterThan(0)
  })

  it('matches a broadcaster in unscoped free text', () => {
    // A network name with no scope still hits via the broad substring match.
    expect(count('Peacock')).toBeGreaterThan(0)
  })

  it('handles a fixture with no tv list', () => {
    const noTv = { home: 'ZZZ', away: 'YYY' }
    expect(matchesSearch(noTv, parseQuery('tv: Peacock'))).toBe(false)
    expect(matchesSearch(noTv, parseQuery('broadcast: anything'))).toBe(false)
  })

  it('combines tokens (AND semantics)', () => {
    // An Arsenal fixture played in London is a subset of all Arsenal fixtures.
    expect(count('team: Arsenal city: London')).toBeLessThanOrEqual(count('team: Arsenal'))
    expect(count('team: Arsenal city: London')).toBeGreaterThan(0)
  })

  it('does a broad substring match on unscoped free text', () => {
    // Free text hits club names, city, and venue alike.
    expect(count('London')).toBeGreaterThan(0)
    expect(count('Emirates')).toBeGreaterThan(0)
  })

  it('returns everything for an empty query', () => {
    expect(count('')).toBe(FIXTURES.length)
  })

  it('returns nothing when nothing matches', () => {
    expect(count('team: Nonexistent')).toBe(0)
    expect(count('zzzznope')).toBe(0)
  })

  it('handles fixtures with unknown clubs and missing fields', () => {
    // Unknown abbr falls back to the raw string; missing city/venue don't throw.
    expect(matchesSearch(bogus, parseQuery('team: zzz'))).toBe(true)
    expect(matchesSearch(bogus, parseQuery('zzz'))).toBe(true)
    expect(matchesSearch(bogus, parseQuery('city: nowhere'))).toBe(false)
    expect(matchesSearch(bogus, parseQuery('venue: nowhere'))).toBe(false)
  })

  it('handles a fixture with empty club abbreviations', () => {
    // An empty abbr resolves to no club and an empty search string, matching
    // nothing specific but never throwing.
    const blank = { home: '', away: '', city: '', venue: '' }
    expect(matchesSearch(blank, parseQuery('team: anything'))).toBe(false)
    expect(matchesSearch(blank, parseQuery(''))).toBe(true)
  })
})
