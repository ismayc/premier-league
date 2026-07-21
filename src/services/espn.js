/**
 * The live overlay.
 *
 * The committed fixture list renders the whole season with no network at all;
 * this fetches only the current window and patches in anything that has moved
 * since the last data refresh — in-progress scores, clocks, finals, and
 * postponements. If it fails, the app is not broken, it is merely as current
 * as its last commit. That is why every failure path here is silent.
 *
 * Keyless and CORS-open, so there is no backend and no secret to leak.
 */

const SCOREBOARD = 'https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard'

const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, '')

/**
 * A three-day window around now. Yesterday is included because a match that
 * kicked off at 20:00 UK on Saturday is still "yesterday" for a viewer in
 * Sydney refreshing on Sunday morning, and we want its final score.
 */
function windowDates(now) {
  return [-1, 0, 1].map((offset) => {
    const d = new Date(now)
    d.setUTCDate(d.getUTCDate() + offset)
    return ymd(d)
  })
}

function readEvent(ev) {
  const comp = ev.competitions?.[0]
  if (!comp) return null

  const home = comp.competitors?.find((c) => c.homeAway === 'home')
  const away = comp.competitors?.find((c) => c.homeAway === 'away')
  if (!home || !away) return null

  const type = comp.status?.type ?? {}
  const state = type.state
  const live = state === 'in'
  const final = state === 'post' && type.completed === true

  const out = {
    id: ev.id,
    live,
    final,
    status: type.shortDetail || type.description,
    clock: comp.status?.displayClock,
  }

  if (live || final) out.score = [Number(home.score), Number(away.score)]
  // A match ESPN has stopped without completing is postponed or abandoned.
  if (state === 'post' && !type.completed) out.unplayed = type.description

  // Broadcasters are assigned only a few weeks out, so the committed fixtures
  // carry none until a refresh close to matchday. Picking them up here means
  // an imminent match shows where to watch as soon as the assignment lands,
  // without waiting for the next data refresh.
  const tv = comp.broadcasts?.flatMap((b) => b.names || []) ?? []
  if (tv.length) out.tv = [...new Set(tv)]

  // ESPN lists a match's incidents in `details`. Only dismissals are lifted:
  // a goal already shows up in the score, but a red card reshapes a match and
  // appears nowhere else in this feed. `side` rather than an abbreviation
  // because the committed fixture already knows who is home and away.
  const reds = (comp.details ?? [])
    .filter((d) => d.redCard)
    .map((d) => ({
      side: d.team?.id === home.team?.id ? 'home' : 'away',
      player: d.athletesInvolved?.[0]?.shortName,
      clock: d.clock?.displayValue,
    }))
  if (reds.length) out.reds = reds

  return out
}

export async function fetchLive({ signal, now = new Date() } = {}) {
  const results = await Promise.allSettled(
    windowDates(now).map((date) =>
      fetch(`${SCOREBOARD}?dates=${date}`, { signal }).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
    )
  )

  const map = new Map()
  for (const r of results) {
    // allSettled, so one bad day doesn't discard the other two.
    if (r.status !== 'fulfilled') continue
    for (const ev of r.value.events ?? []) {
      const read = readEvent(ev)
      if (read) map.set(read.id, read)
    }
  }
  return map
}

/**
 * Patch live readings over the committed fixtures. Only defined values are
 * copied, so a feed that omits a field can never blank one we already hold.
 */
export function applyLive(fixtures, live) {
  if (!live?.size) return fixtures
  return fixtures.map((f) => {
    const l = live.get(f.id)
    if (!l) return f
    const merged = { ...f }
    for (const [k, v] of Object.entries(l)) {
      if (k === 'id' || v === undefined || v === null) continue
      merged[k] = v
    }
    return merged
  })
}
