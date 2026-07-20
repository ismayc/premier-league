import { useMemo, useState } from 'react'
import TeamLogo from './TeamLogo.jsx'
import { TEAM_BY_ABBR, ALL_ABBRS } from '../data/teams.js'
import { buildTable } from '../utils/table.js'

/**
 * The league table.
 *
 * Zone colouring is a left border plus a named legend below the table — the
 * colour alone never carries the meaning, because the position number is right
 * there and the legend says what each band is. This matters more than usual
 * here: the difference between fourth and fifth is a colour band to a sighted
 * reader and nothing at all to anyone else.
 *
 * Split (home/away) is offered because it is the one cut of the table that
 * regularly overturns the headline one.
 */

const ZONE_LABELS = {
  champions: 'Champions League',
  europa: 'Europa League',
  conference: 'Conference League',
  relegation: 'Relegation',
}

const SPLITS = [
  { key: 'all', label: 'Overall' },
  { key: 'home', label: 'Home' },
  { key: 'away', label: 'Away' },
]

export default function TableView({ fixtures, onPickTeam }) {
  const [split, setSplit] = useState('all')

  const table = useMemo(() => buildTable(fixtures, ALL_ABBRS), [fixtures])
  const anyPlayed = table.some((r) => r.played)

  // The split view re-sorts on the split's own points, but keeps the overall
  // position visible so the two readings can be compared rather than confused.
  const rows = useMemo(() => {
    if (split === 'all') {
      // With nothing to rank by, fall back to alphabetical by club name —
      // the points-then-abbreviation order would otherwise put Brighton
      // above Bournemouth for reasons invisible to the reader.
      if (!anyPlayed) {
        return [...table].sort((a, b) =>
          (TEAM_BY_ABBR[a.abbr]?.name ?? a.abbr).localeCompare(TEAM_BY_ABBR[b.abbr]?.name ?? b.abbr)
        )
      }
      return table
    }
    return [...table]
      .map((r) => {
        const s = r[split]
        return {
          ...r,
          overallPos: r.pos,
          played: s.played,
          won: s.won,
          drawn: s.drawn,
          lost: s.lost,
          gf: s.gf,
          ga: s.ga,
          gd: s.gf - s.ga,
          points: s.won * 3 + s.drawn,
        }
      })
      .sort((a, b) => b.points - a.points || b.gd - a.gd || b.gf - a.gf)
      .map((r, i) => ({ ...r, pos: i + 1 }))
  }, [table, split, anyPlayed])

  return (
    <main className="view">
      <div className="view-head">
        <h2>Table</h2>
        <div className="view-tools" role="group" aria-label="Table split">
          {SPLITS.map((s) => (
            <button
              key={s.key}
              type="button"
              className={`chip ${split === s.key ? 'on' : ''}`}
              onClick={() => setSplit(s.key)}
              aria-pressed={split === s.key}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {!anyPlayed && (
        <p className="note">
          The season hasn’t kicked off yet — every club starts on zero. The table fills in as
          results land.
        </p>
      )}

      <div className="table-wrap">
        <table className="league">
          <thead>
            <tr>
              <th className="col-pos" scope="col">#</th>
              <th className="col-club" scope="col">Club</th>
              <th scope="col" title="Played">P</th>
              <th scope="col" title="Won">W</th>
              <th scope="col" title="Drawn">D</th>
              <th scope="col" title="Lost">L</th>
              <th className="hide-sm" scope="col" title="Goals for">GF</th>
              <th className="hide-sm" scope="col" title="Goals against">GA</th>
              <th scope="col" title="Goal difference">GD</th>
              <th scope="col" title="Points">Pts</th>
              {split === 'all' && (
                <th className="hide-sm col-form" scope="col">Form</th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.abbr}
                className={r.zone && split === 'all' && anyPlayed ? `zone-${r.zone}` : ''}
              >
                {/* Before a ball is kicked every club is level, so the ranking
                    rules put all twenty in first place. That is arithmetically
                    right and useless to read, so positions and zone stripes are
                    withheld until there is something to separate clubs by. */}
                <td className="col-pos">{anyPlayed ? r.pos : '—'}</td>
                <td className="col-club">
                  <button type="button" className="club-btn" onClick={() => onPickTeam?.(r.abbr)}>
                    <TeamLogo abbr={r.abbr} size={20} />
                    <span>{TEAM_BY_ABBR[r.abbr]?.name ?? r.abbr}</span>
                  </button>
                </td>
                <td>{r.played}</td>
                <td>{r.won}</td>
                <td>{r.drawn}</td>
                <td>{r.lost}</td>
                <td className="hide-sm">{r.gf}</td>
                <td className="hide-sm">{r.ga}</td>
                <td className={r.gd > 0 ? 'pos' : r.gd < 0 ? 'neg' : ''}>
                  {r.gd > 0 ? `+${r.gd}` : r.gd}
                </td>
                <td className="col-pts">{r.points}</td>
                {split === 'all' && (
                  <td className="hide-sm col-form">
                    {r.form.length ? (
                      <span className="form-strip">
                        {r.form.map((f, i) => (
                          <i key={i} className={`form-${f}`} title={{ W: 'Won', D: 'Drawn', L: 'Lost' }[f]}>
                            {f}
                          </i>
                        ))}
                      </span>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {split === 'all' && anyPlayed && (
        <ul className="zone-key">
          {Object.entries(ZONE_LABELS).map(([key, label]) => (
            <li key={key}>
              <span className={`zone-swatch zone-${key}`} aria-hidden="true" />
              {label}
            </li>
          ))}
        </ul>
      )}

      <p className="note small">
        Clubs level on points are separated by goal difference, then goals scored — the Premier
        League does not use head-to-head. Conference League qualification is usually decided by
        domestic cup results, so the sixth-place band is indicative only.
      </p>
    </main>
  )
}
