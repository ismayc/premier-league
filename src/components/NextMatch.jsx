import { useEffect, useMemo, useState } from 'react'
import { TEAM_BY_ABBR } from '../data/teams.js'
import { countdown, dateKey, timeOf, zoneAbbr, whenBucket } from '../utils/time.js'
import { useFollow } from '../context/follow.jsx'
import TeamLogo from './TeamLogo.jsx'

const clubName = (abbr) => TEAM_BY_ABBR[abbr]?.name || abbr

function Side({ abbr }) {
  return (
    <>
      <TeamLogo abbr={abbr} size={24} />
      <span className="nm-name">{clubName(abbr)}</span>
    </>
  )
}

// How often the banner refreshes. Also the memo's granularity: `now` is read fresh
// on every render, but the selection is keyed on this bucket so a re-render caused by
// something else (a filter click) doesn't re-scan the season.
const TICK_MS = 30000

/**
 * The banner above the fixture list: whatever is being played right now, or the
 * next kickoff due. A followed club wins outright over both, so the card answers
 * "when are MY team next on" without touching a filter.
 *
 * The countdown reuses the app's own `countdown()` rather than counting seconds
 * itself. It resolves to at most two units (2d 3h / 3h 5m / 12m), so there is no
 * seconds digit to keep live and the banner can re-render every half-minute
 * instead of every second.
 */
export default function NextMatch({ fixtures, tz, onJump }) {
  const { isFollowed } = useFollow()
  const [, setTick] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), TICK_MS)
    return () => clearInterval(id)
  }, [])

  // Read on every render rather than held in state. A banner pinned to a `now` from
  // mount keeps showing a kickoff that has already passed until its own timer happens
  // to fire — the bug the one-line strip this replaced was written to avoid.
  const now = Date.now()
  const bucket = Math.floor(now / TICK_MS)

  const { mode, list, followed } = useMemo(() => {
    const mine = (f) => isFollowed(f.home) || isFollowed(f.away)
    // A Saturday 3pm slate runs several matches at once, so live is a list, not a
    // single fixture; a followed club playing takes the card over entirely.
    const live = fixtures.filter((f) => whenBucket(f, now) === 'live')
    if (live.length) {
      const ours = live.filter(mine)
      return { mode: 'live', list: ours.length ? ours : live, followed: ours.length > 0 }
    }
    const upcoming = fixtures
      .filter((f) => whenBucket(f, now) === 'upcoming')
      .sort((a, b) => new Date(a.ko) - new Date(b.ko))
    if (!upcoming.length) return { mode: 'next', list: [], followed: false }
    const ourNext = upcoming.find(mine)
    if (ourNext) return { mode: 'next', list: [ourNext], followed: true }
    const first = new Date(upcoming[0].ko).getTime()
    return {
      mode: 'next',
      list: upcoming.filter((f) => new Date(f.ko).getTime() === first),
      followed: false,
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `now` is intentionally
  // read through `bucket`, which is what bounds how often this recomputes.
  }, [fixtures, bucket, isFollowed])

  if (!list.length) {
    return <div className="nextmatch done">⚽ No fixtures left — see you next season!</div>
  }

  const live = mode === 'live'
  const lead = list[0]
  // Null once the clock passes kickoff, which the live branch already covers.
  const left = countdown(lead.ko, now)

  if (list.length > 1) {
    return (
      <div className={`nextmatch nextmatch-stack${live ? ' is-live' : ''}`}>
        <div className="nm-label">
          {live ? '🔴 Live now' : '⏱ Next up'}
          <span className="nm-stage">{list.length} matches{live ? '' : ' at once'}</span>
        </div>
        {list.map((f) => (
          <button key={f.id} className="nm-live-row" onClick={() => onJump?.(dateKey(f.ko, tz))}>
            <Side abbr={f.home} />
            <span className="nm-v">v</span>
            <Side abbr={f.away} />
            <span className="nm-when">{f.city}</span>
          </button>
        ))}
        {!live && left && (
          <div className="nm-bottom nm-stack-bottom">
            <span className="nm-countdown">{left}</span>
            <span className="nm-when">
              {timeOf(lead.ko, tz)} {zoneAbbr(lead.ko, tz)}
            </span>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className={`nextmatch${live ? ' is-live' : ''}`}>
      <div className="nm-label">
        {live ? '🔴 Live now' : followed ? '⭐ Your next match' : '⏱ Next match'}
      </div>

      <div className="nm-teams">
        <Side abbr={lead.home} />
        <span className="nm-v">v</span>
        <Side abbr={lead.away} />
      </div>

      <div className="nm-bottom">
        {live ? (
          <span className="nm-countdown live">● in progress</span>
        ) : (
          left && <span className="nm-countdown">{left}</span>
        )}
        <span className="nm-when">
          {timeOf(lead.ko, tz)} {zoneAbbr(lead.ko, tz)} · {lead.city}
        </span>
        <button className="nm-jump" onClick={() => onJump?.(dateKey(lead.ko, tz))}>
          Jump to it ↓
        </button>
      </div>
    </div>
  )
}
