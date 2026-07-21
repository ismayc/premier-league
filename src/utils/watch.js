/**
 * The streaming services and TV packages a viewer can say they have, so the
 * fixture list can be filtered to matches they can actually watch.
 *
 * A fixture's `tv` is a flat list of network names exactly as ESPN emits them.
 * The feed is US-region, so these are US carriers — the same reason the match
 * cards name NBC and Peacock rather than Sky and TNT.
 *
 * Peacock carries the bulk of the season and is matched by its own name. The
 * rest go out on NBCUniversal's linear channels, and because several matches
 * kick off at once the overflow lands on whichever network is free — USA, CNBC,
 * even SYFY. A live-TV *bundle* (YouTube TV, Fubo, Sling, cable) never appears
 * in the broadcast list at all: it carries a match whenever that match is on a
 * linear network the bundle includes, so each bundle is defined by the networks
 * it carries. Carriage varies by package, market and over time, so these are
 * the national defaults and are deliberately approximate.
 */

// Exactly as ESPN spells them. NBCSN closed in 2021 but still appears against
// older fixtures, so it stays in the NBC family for the historical seasons.
const NBC = 'NBC'
const USA = 'USA Net'
const CNBC = 'CNBC'
const SYFY = 'SYFY'
const NBCSN = 'NBCSN'
const TELEMUNDO = 'Tele'
const UNIVERSO = 'Universo'

const NBC_FAMILY = [NBC, USA, CNBC, SYFY, NBCSN]
const SPANISH = [TELEMUNDO, UNIVERSO]

// carries(...names) → a matcher that is true when a fixture's tv list names any
// of them.
const carries = (...names) => {
  const set = new Set(names)
  return (tv) => tv.some((n) => set.has(n))
}

// Streaming first, then the live-TV bundles. This is also the display order in
// the picker. `kind` only labels the group.
export const SERVICE_CATALOG = [
  { key: 'peacock', label: 'Peacock', kind: 'stream', match: carries('Peacock') },
  {
    key: 'telemundo',
    label: 'Telemundo / Universo',
    kind: 'stream',
    match: carries(...SPANISH),
  },
  { key: 'youtubetv', label: 'YouTube TV', kind: 'bundle', match: carries(...NBC_FAMILY, ...SPANISH) },
  { key: 'hulu', label: 'Hulu + Live TV', kind: 'bundle', match: carries(...NBC_FAMILY, ...SPANISH) },
  { key: 'fubo', label: 'Fubo', kind: 'bundle', match: carries(...NBC_FAMILY, ...SPANISH) },
  { key: 'sling', label: 'Sling TV', kind: 'bundle', match: carries(NBC, USA, CNBC, SYFY) },
  { key: 'cable', label: 'Cable / Satellite', kind: 'bundle', match: carries(...NBC_FAMILY, ...SPANISH) },
]

export const SERVICE_BY_KEY = Object.fromEntries(SERVICE_CATALOG.map((s) => [s.key, s]))

/**
 * The viewer's chosen services that carry this fixture, in catalog order.
 *
 * Empty when nothing is chosen or the broadcast is unknown. Broadcasters are
 * assigned only weeks ahead, so most of a freshly-fetched season has no `tv`
 * at all — which is exactly why the filter treats "unknown" as "cannot say"
 * rather than "cannot watch".
 */
export function watchableServices(tv, selectedKeys) {
  if (!tv?.length || !selectedKeys?.length) return []
  const selected = new Set(selectedKeys)
  return SERVICE_CATALOG.filter((s) => selected.has(s.key) && s.match(tv))
}
