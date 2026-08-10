/**
 * The league table, derived from results rather than fetched.
 *
 * Keeping this a pure function of the fixture list means the table always
 * agrees with the fixtures on screen — including mid-poll, when a live score
 * has landed but no feed has published a new table yet. It is also the same
 * computation scripts/fetch-history.mjs runs over past seasons, so a current
 * table and a 1994-95 table are ordered by identical rules.
 *
 * Premier League ordering is points, then goal difference, then goals scored.
 * The League has never used head-to-head to separate clubs for a placing;
 * clubs level on all three genuinely share a position, and a play-off is
 * staged only for the title or relegation, which has never been needed.
 */

/** Clubs finishing here qualify for Europe / go down. Used for row striping.
 *
 * CL is the GUARANTEED four. England has also earned UEFA's extra European
 * Performance Spot in every recent cycle (five CL entrants in 24-25, 25-26 and
 * 26-27 — verified against UEFA 2026-08-09), but that fifth spot depends on the
 * coefficient race decided each spring, so an in-progress table stripes only
 * what is certain. If England repeats, 5th is CL rather than Europa — a
 * season-end fact, not a mid-season one. */
export const ZONES = {
  champions: [1, 4], // Champions League
  europa: [5, 5], // Europa League
  conference: [6, 6], // Conference League — actually decided by cup results
  relegation: [18, 20],
}

export function zoneFor(pos) {
  if (pos >= ZONES.champions[0] && pos <= ZONES.champions[1]) return 'champions'
  if (pos === ZONES.europa[0]) return 'europa'
  if (pos === ZONES.conference[0]) return 'conference'
  if (pos >= ZONES.relegation[0]) return 'relegation'
  return null
}

const blank = (abbr) => ({
  abbr,
  played: 0,
  won: 0,
  drawn: 0,
  lost: 0,
  gf: 0,
  ga: 0,
  home: { played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0 },
  away: { played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0 },
  form: [],
})

function record(row, split, scored, conceded) {
  for (const t of [row, row[split]]) {
    t.played++
    t.gf += scored
    t.ga += conceded
    if (scored > conceded) t.won++
    else if (scored < conceded) t.lost++
    else t.drawn++
  }
}

/**
 * @param fixtures the season's fixtures, live overlay already applied
 * @param abbrs    every club in the league, so clubs yet to play still appear
 */
export function buildTable(fixtures, abbrs = []) {
  const rows = new Map(abbrs.map((a) => [a, blank(a)]))
  const row = (abbr) => {
    if (!rows.has(abbr)) rows.set(abbr, blank(abbr))
    return rows.get(abbr)
  }

  // Chronological, so `form` reads oldest-to-newest for each club.
  const decided = fixtures
    .filter((f) => f.score && !f.unplayed)
    .sort((a, b) => a.ko.localeCompare(b.ko))

  for (const f of decided) {
    const [hg, ag] = f.score
    const h = row(f.home)
    const a = row(f.away)
    record(h, 'home', hg, ag)
    record(a, 'away', ag, hg)
    h.form.push(hg > ag ? 'W' : hg < ag ? 'L' : 'D')
    a.form.push(ag > hg ? 'W' : ag < hg ? 'L' : 'D')
  }

  const table = [...rows.values()].map((r) => ({
    ...r,
    gd: r.gf - r.ga,
    points: r.won * 3 + r.drawn,
    // Points per game, so a club with a game in hand is comparable.
    ppg: r.played ? (r.won * 3 + r.drawn) / r.played : 0,
    form: r.form.slice(-5),
  }))

  table.sort(
    (a, b) => b.points - a.points || b.gd - a.gd || b.gf - a.gf || a.abbr.localeCompare(b.abbr)
  )

  let pos = 0
  let prev = null
  table.forEach((r, i) => {
    const key = `${r.points}:${r.gd}:${r.gf}`
    if (key !== prev) {
      pos = i + 1
      prev = key
    }
    r.pos = pos
    r.zone = zoneFor(pos)
  })

  return table
}

/** Points still available to a club — the ceiling on what it can finish with. */
export function maxPoints(row, totalMatches = 38) {
  return row.points + (totalMatches - row.played) * 3
}

/**
 * Clubs that cannot mathematically be relegated, however the rest of the
 * season goes. Deliberately conservative: it reports certainty, never
 * likelihood, so a club appears here only when the arithmetic is settled.
 *
 * A club goes down if at least `places` clubs finish above it, so it is safe
 * once at most `survivors - 1` clubs can still reach or pass it. Two details
 * matter and both were wrong in an earlier version:
 *
 *   - The comparison must be against every other club, not only those
 *     currently below. Clubs tied on the same position are threats too, and
 *     ranking them by position silently excluded them.
 *   - The threat test assumes the club itself takes nothing from its
 *     remaining fixtures, which is the only assumption that yields certainty.
 */
export function relegationSafe(table, totalMatches = 38, places = 3) {
  const survivors = table.length - places
  const safe = new Set()
  if (survivors <= 0) return safe

  for (const r of table) {
    const threats = table.filter(
      (o) => o.abbr !== r.abbr && maxPoints(o, totalMatches) >= r.points
    ).length
    if (threats <= survivors - 1) safe.add(r.abbr)
  }
  return safe
}

/**
 * The window of final league positions still arithmetically open to each club —
 * the Finish column. Points bounds: floor = current points (the club takes
 * nothing more), ceiling = maxPoints (it wins out). A rival is guaranteed
 * ahead only when its floor beats the club's ceiling, and still a threat when
 * its ceiling reaches the club's floor. A points tie is charged against the
 * club — goal difference can swing any way while either side still plays — so
 * the range is conservative, never wrong. The one exact case: when BOTH clubs
 * have finished, the full ordering key (goal difference, then goals scored) is
 * settled and decides; clubs level on all three genuinely share a position,
 * exactly as buildTable assigns one. best === worst means the position is
 * locked.
 */
export function positionRanges(table, totalMatches = 38) {
  const done = (r) => r.played >= totalMatches
  // Settled strictly ahead on the full key — meaningful only once both clubs
  // have nothing left to play.
  const keyAhead = (o, r) => o.gd > r.gd || (o.gd === r.gd && o.gf > r.gf)
  const out = {}
  for (const r of table) {
    const ceiling = maxPoints(r, totalMatches)
    let ahead = 0
    let threats = 0
    for (const o of table) {
      if (o.abbr === r.abbr) continue
      const bothDone = done(o) && done(r)
      if (o.points > ceiling || (o.points === ceiling && bothDone && keyAhead(o, r))) ahead++
      const oCeiling = maxPoints(o, totalMatches)
      if (oCeiling > r.points || (oCeiling === r.points && (!bothDone || keyAhead(o, r)))) threats++
    }
    out[r.abbr] = { best: 1 + ahead, worst: 1 + threats }
  }
  return out
}

export const tableByAbbr = (table) => Object.fromEntries(table.map((r) => [r.abbr, r]))
