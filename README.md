# Premier League fixture viewer

**[premier-league-viewer.netlify.app](https://premier-league-viewer.netlify.app)**
· also on [GitHub Pages](https://ismayc.github.io/premier-league/)

An unofficial, timezone-aware Premier League viewer: fixtures in your own
timezone, the live table, season statistics, and every final table since the
competition began in 1992-93.

Not affiliated with the Premier League. Fixtures and player statistics come
from ESPN's public feeds; historical tables are computed from
[openfootball/england](https://github.com/openfootball/england) results.

## Views

| View | What it shows |
|---|---|
| **Fixtures** | The season as a chronological list, grouped by day, with a next-kickoff countdown. Filter to followed clubs, show or hide played matches, export to calendar. |
| **Week** | A Monday-to-Sunday grid. Makes an empty midweek and a congested festive period legible at a glance. |
| **Table** | The live league table, with home/away splits, recent form, and European / relegation bands. |
| **Stats** | League totals, player leaderboards across ten categories with a season switcher, and a per-club goal-difference chart. |
| **History** | Every final table since 1992-93, an all-time table, and any club's finishing position season by season. |

Clicking a club anywhere opens a drawer with its form, home and away records,
upcoming fixtures, leading scorers, and full season-by-season history.

Opening a match shows both **team sheets** — formation, starting XI by line,
bench, and the substitutions with the minute each was made. Clicking a player
expands their match: goals, assists, shots, fouls and cards, alongside their
position, age, nationality and height.

Team sheets are the one thing fetched per match rather than committed, because
a lineup does not exist until about an hour before kickoff — a nightly refresh
would commit 380 empty squads and still be wrong an hour before every match.
Until then the panel says so rather than showing an error.

## Running it

```sh
npm install
npm run dev
```

`npm test` runs the suite; `npm run test:coverage` adds the coverage report;
`npm run build` produces a static `dist/`.

The suite is held at **100% coverage** — statements, branches, functions and
lines — and `vite.config.js` sets thresholds so CI fails if anything ships
untested. Test files run serially (`fileParallelism: false`) because Vitest's
v8 coverage provider races when several workers finish at once and dies trying
to read a temp file that has already been cleaned up.

## How the data works

The entire season, every historical table, and the player leaderboards are
**committed to the repository as generated JavaScript modules**. The app
therefore renders completely with no network request at all. A small live
overlay polls ESPN's scoreboard for matches in progress and patches scores in
on top; if that fetch fails, the app is stale rather than broken.

```
scripts/fetch-fixtures.mjs   → src/data/teams.js, src/data/fixtures.js, public/logos/
scripts/fetch-stats.mjs      → src/data/players.js
scripts/fetch-history.mjs    → src/data/history.js
```

Refresh everything with `npm run fetch:all`. The scripts use **Node built-ins
only** — no imports from `node_modules` — so a scheduled refresh can run
without an `npm ci` first.

### Why historical tables are computed, not fetched

ESPN's standings archive only reaches 2002-03. openfootball publishes match
results back to 1992-93, so `fetch-history.mjs` parses those results and
computes each table itself, applying the same ordering rules the live table
uses — points, then goal difference, then goals scored. The Premier League has
never used head-to-head to separate clubs for a placing.

That makes the tables verifiable rather than merely copied. Before writing,
every season is checked against invariants that must hold for any correct
parse: total appearances equal twice the match count, goal difference across
the league sums to zero, and points equal three per decisive match plus two
per draw. A season that fails is reported rather than silently written. Those
same invariants run again in `test/history-data.test.js` over the committed
data, so a bad refresh fails the build instead of shipping a wrong table.

### Known data caveats

- **The 2026-27 season has not kicked off**, so the table is empty and the
  Stats view's player leaderboards default to the most recent season that has
  data. They switch over automatically once matches are played.
- **ESPN publishes no player leaders for 2020-21.** That season is absent from
  the Stats switcher rather than shown as zeroes.
- **The first three seasons had 22 clubs and 42 matches.** Point totals from
  1992-93 to 1994-95 are not comparable with later seasons, and the History
  view says so. Four clubs were relegated in 1994-95 to cut the League to 20.
- **Conference League qualification** is usually decided by domestic cup
  results, which this app does not track, so the sixth-place band is
  indicative only.

## Design notes

**No router, no state library.** The set of things a viewer can choose — view,
timezone, club, whether scores are hidden — is small enough to live in
`useState` and serialise into the query string, which has the useful property
that any state worth reaching is shareable. Only non-default values are
written, so a first-time URL stays clean.

**One impure boundary.** `App.jsx` fetches and merges; everything downstream is
a pure function of the merged fixture list. That is why nearly all the logic is
testable without a DOM.

**Data-mark colours are separate from UI colours.** The accent never encodes
data, so a coloured mark is never mistaken for a control. The chart and
league-zone palettes were checked for colour-vision separation and contrast
against both the light and dark surfaces, and colour never carries meaning
alone — positions are always printed, zones are named in a legend, and every
bar is labelled with its value.

**Kickoffs are stored as UTC instants**, never as wall-clock strings. Premier
League times are published in UK time, which is exactly what a naive "3pm
Saturday" gets wrong for anyone outside Britain twice a year when the clocks
shift. The detail view shows both your local time and UK time so the app can be
checked against any published fixture list.
