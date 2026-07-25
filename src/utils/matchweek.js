// Premier League matchweeks, reconstructed from the fixture list.
//
// ESPN publishes no gameweek number for the Premier League — verified against
// the scoreboard event, the core event API, and the core season "weeks"
// collection, all of which omit it. So we rebuild the matchweeks ourselves.
//
// A season is a double round-robin: 38 rounds, each a full slate in which all 20
// clubs play exactly once. Walking fixtures in kickoff order and dropping each
// into the earliest round where neither club has appeared yet — and which still
// has room for another match — reproduces those rounds. For a season played as
// scheduled this yields the official Matchweek 1..38 exactly. The one case it can
// misnumber is a match postponed and replayed weeks later: it lands in whichever
// round still had room when it was finally played rather than its original one.
// The group still shows the real dates either way, so the drift is self-evident.
export function assignMatchweeks(fixtures) {
  const sorted = [...fixtures].sort(
    (a, b) => a.ko.localeCompare(b.ko) || a.id.localeCompare(b.id)
  )
  // A round is one full slate: half the participating clubs. 10 for a 20-club
  // league; derived so a short test list (or a smaller competition) still splits.
  const perRound = new Set(sorted.flatMap((f) => [f.home, f.away])).size / 2
  const rounds = [] // [{ teams: Set<abbr>, size: number }]
  const byId = new Map()
  for (const f of sorted) {
    let i = rounds.findIndex(
      (r) => r.size < perRound && !r.teams.has(f.home) && !r.teams.has(f.away)
    )
    if (i === -1) {
      i = rounds.length
      rounds.push({ teams: new Set(), size: 0 })
    }
    rounds[i].teams.add(f.home)
    rounds[i].teams.add(f.away)
    rounds[i].size++
    byId.set(f.id, i + 1)
  }
  return byId
}

// Group already day-bucketed fixtures into ordered matchweeks, keeping the day
// sub-structure each section renders. `byId` is built from the FULL fixture list
// (via assignMatchweeks), so the numbering is stable no matter how the day list
// passed here has been filtered down.
export function groupByMatchweek(days, byId) {
  const map = new Map() // mw -> Map(dayKey -> { key, fixtures })
  for (const day of days) {
    for (const f of day.fixtures) {
      const mw = byId.get(f.id)
      if (!map.has(mw)) map.set(mw, new Map())
      const byDay = map.get(mw)
      if (!byDay.has(day.key)) byDay.set(day.key, { key: day.key, fixtures: [] })
      byDay.get(day.key).fixtures.push(f)
    }
  }
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([mw, byDay]) => {
      const mwDays = [...byDay.values()].sort((a, b) => a.key.localeCompare(b.key))
      return { mw, days: mwDays, count: mwDays.reduce((n, d) => n + d.fixtures.length, 0) }
    })
}
