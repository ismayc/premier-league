/**
 * Calendar export.
 *
 * Builds an RFC 5545 file in the browser — no server, no subscription URL to
 * keep alive. The tradeoff is that the file is a snapshot: if a fixture moves
 * for television, the viewer re-exports. That is the honest behaviour for a
 * static site, and the alternative (a hosted feed) would mean running a
 * backend purely to serve a text file.
 *
 * Times are written as UTC instants (the trailing Z), so the calendar app
 * shows each kickoff in whatever zone the device is in — which is the correct
 * behaviour for someone who exports in London and travels.
 */

import { TEAM_BY_ABBR } from '../data/teams.js'

const stamp = (iso) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

/** Long lines must be folded at 75 octets; calendar apps reject unfolded ones. */
function fold(line) {
  if (line.length <= 75) return line
  const parts = [line.slice(0, 75)]
  let rest = line.slice(75)
  while (rest.length > 74) {
    parts.push(` ${rest.slice(0, 74)}`)
    rest = rest.slice(74)
  }
  if (rest) parts.push(` ${rest}`)
  return parts.join('\r\n')
}

const escape = (s = '') => String(s).replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n')

const nameOf = (abbr) => TEAM_BY_ABBR[abbr]?.name ?? abbr

export function buildCalendar(fixtures, { name = 'Premier League' } = {}) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//premier-league-viewer//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escape(name)}`,
  ]

  for (const f of fixtures) {
    const start = new Date(f.ko)
    // Premier League matches run 90 minutes plus a half-time break and added
    // time; two hours is the block a calendar should reserve.
    const end = new Date(start.getTime() + 2 * 60 * 60 * 1000)
    const title = `${nameOf(f.home)} v ${nameOf(f.away)}`
    const score = f.score ? ` (${f.score[0]}-${f.score[1]})` : ''

    lines.push(
      'BEGIN:VEVENT',
      `UID:${f.id}@premier-league-viewer`,
      `DTSTAMP:${stamp(new Date().toISOString())}`,
      `DTSTART:${stamp(start.toISOString())}`,
      `DTEND:${stamp(end.toISOString())}`,
      fold(`SUMMARY:${escape(title + score)}`),
      fold(`LOCATION:${escape([f.venue, f.city].filter(Boolean).join(', '))}`),
      fold(`DESCRIPTION:${escape(f.tv?.length ? `TV: ${f.tv.join(', ')}` : 'Premier League')}`),
      'END:VEVENT'
    )
  }

  lines.push('END:VCALENDAR')
  return lines.join('\r\n')
}

export function downloadCalendar(fixtures, filename = 'premier-league.ics', options) {
  const blob = new Blob([buildCalendar(fixtures, options)], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

// Turn an http(s) feed URL into a webcal:// subscription URL — what a calendar app
// expects when *registering a live subscription* (an https link only downloads a
// one-time snapshot). Non-http schemes pass through unchanged.
export const webcalUrl = (httpsUrl) => httpsUrl.replace(/^https?:/, 'webcal:')

// A "subscribe in Google Calendar" deep link. Google's `cid` must be a RAW webcal://
// URL — an https:// or percent-encoded one is rejected with "check the URL". Our feed
// uses "," (not "&") to separate clubs, so the query string survives inside `cid`.
export const googleCalendarUrl = (httpsUrl) =>
  `https://www.google.com/calendar/render?cid=${webcalUrl(httpsUrl)}`
