/**
 * The URL is the app's shared state. There is no router — a handful of query
 * parameters is a truer description of what a viewer wants to share ("the
 * table, in my timezone") than a route hierarchy would be.
 *
 * Only non-default values are written, so a first-time visitor's URL stays
 * clean and a shared link carries exactly the choices its sender made.
 */

import { detectZone, isValidZone } from './time.js'

export const VIEWS = ['fixtures', 'week', 'table', 'stats', 'history']

const DEFAULTS = {
  view: 'fixtures',
  team: null,
  hide: false, // hide scores (spoiler-free)
  mine: false, // fixtures view: only followed clubs
  past: false, // fixtures view: include days already played
  season: null, // history/stats season override
}

export function readState(search = window.location.search) {
  const q = new URLSearchParams(search)
  const detected = detectZone()

  const view = q.get('view')
  const tz = q.get('tz')
  const season = q.get('season')

  return {
    view: VIEWS.includes(view) ? view : DEFAULTS.view,
    tz: isValidZone(tz) ? tz : detected,
    team: q.get('team') || DEFAULTS.team,
    // A one-shot deep link (the family hub sends these): open straight onto this
    // match's detail. Read-only — toSearch never emits it, so the first state
    // write returns the URL to plain shareable filter state.
    game: q.get('game') || '',
    hide: q.get('hide') === '1',
    mine: q.get('mine') === '1',
    past: q.get('past') === '1',
    season: season && /^\d{4}$/.test(season) ? Number(season) : DEFAULTS.season,
  }
}

export function writeState(state, detected = detectZone()) {
  const q = new URLSearchParams()
  if (state.view !== DEFAULTS.view) q.set('view', state.view)
  if (state.tz && state.tz !== detected) q.set('tz', state.tz)
  if (state.team) q.set('team', state.team)
  if (state.hide) q.set('hide', '1')
  if (state.mine) q.set('mine', '1')
  if (state.past) q.set('past', '1')
  if (state.season) q.set('season', String(state.season))

  const qs = q.toString()
  const url = qs ? `${window.location.pathname}?${qs}` : window.location.pathname
  // replaceState, not pushState: switching views shouldn't stack up history
  // entries that make the browser back button feel broken.
  window.history.replaceState(null, '', url)
}
