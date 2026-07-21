/**
 * Notable-moment detection.
 *
 * Everything is derived by diffing two poll snapshots, so it needs no
 * play-by-play feed. That constrains what is detectable: anything that happens
 * and reverses inside one poll interval is invisible. For football that is an
 * easy trade — a goal stands, and the four moments below are exactly the ones
 * worth interrupting someone for.
 *
 * Unlike basketball, where a viewer would be toasted every thirty seconds, a
 * Premier League match averages under three goals, so every goal can fire.
 */

const byId = (fixtures) => new Map(fixtures.map((f) => [f.id, f]))

const scoreOf = (f) => (Array.isArray(f?.score) ? f.score : null)
const redCount = (f) => f?.reds?.length ?? 0

export const EVENT_KINDS = ['kickoff', 'goal', 'red', 'final']

/**
 * Diff two snapshots of the fixture list and return the notable moments.
 *
 * `prev` of null means first load: nothing is notable yet, because every match
 * already in progress would look like it had just started.
 *
 * `teams` narrows to the clubs a viewer follows. An empty or absent set means
 * no filtering, so alerts work before anyone has followed a club.
 */
export function detectEvents(prev, next, { teams = null } = {}) {
  if (!prev) return []

  const before = byId(prev)
  const events = []

  for (const f of next) {
    const was = before.get(f.id)
    if (!was) continue
    if (f.unplayed) continue
    if (teams?.size && !teams.has(f.home) && !teams.has(f.away)) continue

    // A finished match is reported as full time and nothing else. A goal in
    // the last seconds that also ends the match is one moment, not two.
    if (was.live && !f.live && scoreOf(f)) {
      events.push({ id: f.id, kind: 'final', fixture: f, score: scoreOf(f) })
      continue
    }

    if (!was.live && f.live) {
      events.push({ id: f.id, kind: 'kickoff', fixture: f })
      continue
    }

    if (!f.live) continue

    // Goals. Both sides can score between two polls, so each side is checked
    // rather than reporting a single "the score changed".
    const now = scoreOf(f)
    const then = scoreOf(was)
    if (now && then) {
      for (const [i, side] of [f.home, f.away].entries()) {
        if (now[i] > then[i]) {
          events.push({ id: f.id, kind: 'goal', fixture: f, scorer: side, score: now })
        }
      }
    }

    // Dismissals, one event per new card so a double sending-off is two.
    const reds = redCount(f)
    for (let i = redCount(was); i < reds; i++) {
      events.push({ id: f.id, kind: 'red', fixture: f, red: f.reds[i], index: i })
    }
  }

  return events
}

/**
 * Stable identity for a moment, so a re-render or an overlapping poll cannot
 * show the same one twice. The score is part of a goal's key because two goals
 * in one match are two moments; the card index does the same for dismissals.
 */
export const eventKey = (e) => {
  if (e.kind === 'goal') return `${e.id}:goal:${e.score.join('-')}:${e.scorer}`
  if (e.kind === 'red') return `${e.id}:red:${e.index}`
  return `${e.id}:${e.kind}`
}
