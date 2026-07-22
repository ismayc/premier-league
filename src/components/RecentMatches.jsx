import { useEffect, useState } from 'react'
import { fetchRecentMatches } from '../services/athlete.js'
import { SEASON } from '../data/teams.js'
import { dayOf } from '../utils/time.js'

/**
 * A player's last few matches, shown inside a pop-out beneath their biography.
 *
 * Dates are formatted in UTC rather than the viewer's zone. Every other date in
 * the app belongs to a fixture the viewer might attend or watch, so it is shown
 * where they are; these are finished matches being listed for their result, and
 * a kickoff already hours in the past does not benefit from being shifted. It
 * also keeps this out of the timezone plumbing, which neither the leaderboards
 * nor the team sheets otherwise need.
 *
 * The feed's log is not league-only: internationals and cup ties are in it, and
 * through the close season they are usually all of it. This is a Premier League
 * app, so league matches are what it shows — a World Cup run is a fine thing to
 * read about somewhere, but it is not what a Premier League leaderboard is
 * asking about. The rest stay one click away rather than being thrown out,
 * because "what has he been doing since May" is a reasonable question too.
 *
 * Which league matches, though, depends on where in the calendar we are. Once
 * the player has kicked a ball in the current season, that is their form and
 * nothing earlier belongs beside it — two matches into August beats five from
 * last May, even though it is a shorter list. Before then, the most recent
 * league matches are the best answer available, and they are labelled with the
 * season they come from so nobody reads a May result as a fresh one.
 */

/** "Jul 19" — the weekday the shared formatter defaults to is noise in a list. */
const matchDay = (iso) => dayOf(iso, 'UTC', { weekday: undefined })

/**
 * The season a match belongs to, named by the year it began.
 *
 * The league runs August to May, so a match in the first half of the year
 * belongs to the season that started the previous August. Nothing is played in
 * June or July, which leaves the boundary free to sit anywhere in the summer.
 */
const seasonOf = (iso) => {
  const at = new Date(iso)
  return at.getUTCMonth() >= 6 ? at.getUTCFullYear() : at.getUTCFullYear() - 1
}

const seasonLabel = (year) => `${year}-${String((year + 1) % 100).padStart(2, '0')}`

const SHOWN = 5

export default function RecentMatches({ playerId }) {
  const [matches, setMatches] = useState(null)
  const [everything, setEverything] = useState(false)

  useEffect(() => {
    // Not cancellable, and a late answer is ignored — the same shared-cache
    // reasoning as the biography beside it. See services/athlete.js.
    let cancelled = false
    fetchRecentMatches(playerId).then((data) => {
      if (!cancelled) setMatches(data)
    })
    return () => {
      cancelled = true
    }
  }, [playerId])

  // Nothing at all until the answer lands: an empty log and a pending one look
  // identical, and a "loading" line that usually resolves to nothing is worse
  // than the section simply appearing when it has something to say.
  if (!matches?.length) return null

  const league = matches.filter((m) => m.isLeague)
  const current = league.filter((m) => seasonOf(m.date) === SEASON)

  // Anything this season wins outright, however short the list. Only when the
  // player has not yet played does the previous season stand in for it.
  const pool = current.length ? current : league
  const shown = (everything ? matches : pool).slice(0, SHOWN)
  const others = matches.length - league.length

  // Named only when it is not the season the rest of the app is showing —
  // otherwise the label is noise on every pop-out.
  const past = !current.length && shown.length ? seasonLabel(seasonOf(shown[0].date)) : null

  return (
    <section className="recent">
      <div className="recent-head">
        <h4>
          {everything ? 'Recent matches' : 'Recent league matches'}
          {!everything && past && <span className="rm-season">{past}</span>}
        </h4>
        {others > 0 && (
          <button type="button" className="rm-toggle" onClick={() => setEverything((v) => !v)}>
            {everything ? 'Premier League only' : `All competitions (${others} more)`}
          </button>
        )}
      </div>

      {!shown.length && (
        // Reached through most of the summer: the season is over, the player's
        // last matches were all internationals, and saying so is better than a
        // section that silently disappears while the button offers "5 more".
        <p className="rm-none">No Premier League matches in the player's last few.</p>
      )}

      <ol className="recent-list">
        {shown.map((m) => (
          <li key={m.id}>
            <span className="rm-date">{matchDay(m.date)}</span>

            <span className="rm-opp">
              {m.atVs && <span className="rm-atvs">{m.atVs}</span>}
              {m.opponent ?? '—'}
            </span>

            {m.result && (
              <span className={`rm-result rm-${m.result.toLowerCase()}`}>
                {m.result}
                {m.score && <span className="rm-score">{m.score}</span>}
              </span>
            )}

            <span className="rm-line">
              <Figures stats={m.stats} appearance={m.appearance} />
            </span>

            {/* Redundant while the list is league-only — every row would say
                the same thing. It earns its place once the others are in. */}
            {everything && m.competition && <span className="rm-comp">{m.competition}</span>}
          </li>
        ))}
      </ol>
    </section>
  )
}

/**
 * The match figures worth a line of their own.
 *
 * The feed sends ten columns per match, but most of them are zero for most
 * players, and a row of zeroes says nothing. Only what happened is written out.
 *
 * Goalkeepers are sent a different set of columns entirely — clean sheets,
 * saves and goals against instead of shots and offsides — so their line is
 * built from those. Reading the outfield columns for a keeper is not an error
 * the feed reports; it just quietly produces a blank.
 *
 * Cards are drawn rather than counted: a "0" beside a red-card column is a fact
 * nobody needs.
 */
function Figures({ stats, appearance }) {
  const num = (v) => (v == null || v === '' ? 0 : Number(v))
  const count = (k, one, many) => `${stats[k]} ${num(stats[k]) === 1 ? one : many}`
  const parts = []

  const keeper = stats.SV != null || stats.CS != null

  if (keeper) {
    if (num(stats.SV)) parts.push(count('SV', 'save', 'saves'))
    // A clean sheet is the fact; "0 conceded" is the same fact worse told.
    if (num(stats.CS)) parts.push('clean sheet')
    else if (num(stats.GA)) parts.push(`${stats.GA} conceded`)
  }

  // A keeper who scores or assists is rare enough to be the story of the row.
  if (num(stats.G)) parts.push(count('G', 'goal', 'goals'))
  if (num(stats.A)) parts.push(count('A', 'assist', 'assists'))
  if (!keeper && num(stats.SHOT)) parts.push(count('SHOT', 'shot', 'shots'))

  return (
    <>
      {appearance && <span className="rm-app">{appearance}</span>}
      {parts.length ? (
        <span className="rm-figs">{parts.join(' · ')}</span>
      ) : (
        appearance == null && <span className="rm-figs rm-quiet">No figures</span>
      )}
      {num(stats.YC) > 0 && <span className="rm-card rm-yc" title="Yellow card" aria-label="Yellow card" />}
      {num(stats.RC) > 0 && <span className="rm-card rm-rc" title="Red card" aria-label="Red card" />}
    </>
  )
}
