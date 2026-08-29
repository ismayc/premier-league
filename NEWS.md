# NEWS

A dated changelog for the Premier League Fixtures viewer. Each heading is a calendar
day; bullet points capture every change made that day (features, fixes,
data/source updates, deployment). Newest day on top.

## 2026-08-29

- **Repo-level guards now run in the test suite.** New `test/guards.test.js`, ported from
  the FIBA viewer, which was the only repo that had one. It pins the invariants that have
  already broken a viewer in this family. The ESPN host must be `site.web.api` everywhere it
  appears: `site.api` serves the same routes but 403s on a browser User-Agent with no CORS
  headers, so it reads as healthy from curl while every deployed page loses live scores. The
  data scripts must import only Node built-ins and in-repo source, because they run in CI
  with no `npm install` of the app dependencies. Every localStorage key must carry this
  app's `pl:` prefix and never a sibling's, because the hub and all eleven viewers are
  served from one origin and therefore share localStorage. Finally, the generated data files
  must keep their do-not-edit banner, since a hand edit to one is silently reverted by the
  next refresh run. Each guard was checked by reintroducing the bug it describes and
  confirming it fails.
- **Fixed: a concurrent push to main threw away the whole nightly refresh.** The refresh
  job checks main out, spends a couple of minutes rebuilding its committed data from ESPN,
  tests the result, then pushes. The push was a bare `git push`, so if anything else landed
  on main in that window it died with `! [rejected] main -> main (fetch first)` and the
  freshly fetched data was discarded until the next scheduled run. It happened to the WNBA
  viewer today, where a hand push landed one second ahead of the bot. Every refresh workflow
  in the family had the same bare push. The step now rebases its single data commit onto
  whatever arrived and retries, up to three times. A genuine content conflict still fails
  the run rather than force-pushing over someone's work.

## 2026-08-22

- **A club's "Leading scorers" no longer lists players who have not scored.** Once
  2026-27 kicked off, ESPN's goals board started carrying every player who had
  appeared, on zero goals, alongside the three who had actually scored. The panel
  took any row for the club as a scorer, so newly promoted Coventry were billed
  with five leading scorers on nil goals apiece, and Arsenal's three real scorers
  were padded out to five. The panel now counts only players with a goal to their
  name, and a club with none falls back, as before, to the most recent season in
  which it had one.
- **Two panel tests no longer pin themselves to a passing season.** One asserted
  the literal label `2025-26`, and the other relied on Coventry having never had a
  Premier League scorer, which promotion ended. Both now run against a decided
  snapshot, so a new season cannot break them. The guard they carried, that every
  committed scorer row keeps its appearance count, is kept as its own check that
  names no season.
- The daily data refresh had been failing on those two tests since the new season
  began, which also blocked it from publishing fresh fixtures and stats.
- **The Stats leaderboards drop the same padding.** The 2026-27 goals board is 25
  rows, of which only three are goals, so the table was showing 22 non-scorers tied
  beneath the leaders. A statistic where a higher number is the better one now
  counts only players with something on the board: Goals shows 3 rows instead of
  25, Assists 2, Saves 2. A season made up entirely of padding is no longer offered
  in the season picker, and a statistic nobody has registered yet no longer gets a
  pill, so neither can open an empty table.
- The three disciplinary tallies (fouls committed, yellow and red cards) are left
  whole. They are captioned as a count rather than a ranking, and a player on no
  cards is a real reading of the season rather than padding.

## 2026-08-16

- **The data scripts now fetch from `site.web.api.espn.com`.** ESPN's edge started
  refusing `site.api.espn.com` for requests coming from datacenter IPs, which is
  every unattended refresh — the sibling WNBA viewer's had been failing with
  `HTTP 403` all day before the cause was found. The same URLs answer normally from
  a home connection, so the block is on the host, not on us. Its sibling
  `site.web.api` carries the identical routes with identical payloads and no block,
  verified route by route.
- Nothing about the app changed — same data, same tests. The live score overlay was
  never affected, because it runs in your browser rather than in a datacenter.

- **The new-season watch can no longer report success while it fails.** Its check
  step piped the script through `tee`, and the exit status of a pipe is the last
  command's — `tee` always succeeds — so when the script crashed the run still went
  green, the outputs came back empty, and every step behind them skipped quietly.
  Today's outage was hiding there. The step now runs under `pipefail`.

## 2026-08-14

- **A New season watch now guards the rollover.** Ported from nba-schedule
  after its 2026-27 release: a daily workflow asks ESPN whether the NEXT
  season (committed season + 1) has been published; the day it lands it files
  a one-time issue and drafts the mechanical half of the rollover as a draft
  PR. The detector was re-derived for this league and verified against the
  live scoreboard (the current season detects as complete; the next reports
  not-yet). The season-<label> branch it creates must never be deleted — its
  existence is the once-per-season guard.

- **The stats and fixtures fetch scripts now default to the committed season.**
  Both derived "the current season" from the calendar (roll forward June 1);
  between that flip and the actual rollover commit the refresh bot would target
  a different season than the site shows — the class that bit the NBA viewer
  the morning after its rollover. The default is now `SEASON` from
  `src/data/teams.js`, which the fixtures fetch itself rewrites on a rollover.

- **The default Fixtures view now folds the far future behind "Later fixtures".**
  With the 2026-27 season not yet under way nothing is in the past, so the
  default view was rendering all 380 fixtures on load — heavy on a phone. It now
  shows the next fortnight of match-days, with the rest of the upcoming season
  behind a "Later fixtures" toggle (count badge included). Counted in match-days,
  so a pre-season landing shows the fortnight around opening weekend rather than
  an empty window. The off-season last-week fallback is unchanged (ported from
  nba-schedule).
- **A PR branch can no longer cancel main's CI or deploy.** The whole CI
  workflow (pull-request runs included) and the refresh workflow shared one
  static `pages` concurrency group; GitHub keeps one running + one pending run
  per group and each new arrival cancels the previous pending one, so a busy PR
  branch could kill main's queued runs — this bit the NBA viewer during its
  2026-08-13 rollover PR. CI now groups per ref, the refresh has its own group,
  and only the Pages deploy keeps a shared job-level `pages` lock (ported from
  nba-schedule).

## 2026-08-10

- **The refresh gate is now CI's own gate.** The twice-daily refresh ran plain
  `npm test` before committing, but a bot push triggers no CI — so refreshed
  data could break the 100% coverage invariant invisibly until the next human
  push (exactly what happened with the WNBA race engine this morning). The
  refresh workflow now runs the same coverage command CI runs.
- **The ESPN fetch layer is now vendored, not copy-pasted.** The hardened
  transport (5 retries with exponential backoff + jitter, retry only on
  5xx/429/network errors, a 6-request concurrency cap) previously lived as an
  inline copy in each data script; it now lives in `scripts/lib/fetch.mjs`,
  vendored byte-for-byte from the canonical copy in `sports-viewer-meta`
  (which diffs every repo's copy via `check-fetch-sync`). No behavior change
  to the refresh pipeline.
- **Logo mirroring now retries too.** The crest/logo downloads previously used a
  bare `fetch` with no retry — a lone transient ESPN 500 could skip a logo (or
  fail the run). They now go through the same `fetchRetry` policy as the data
  fetches, with the concurrency cap applied.

## 2026-08-09

- **Finish column in the table.** The overall table now ends with a Finish
  column — the final league positions still arithmetically possible for each
  club (e.g. `4–9`), collapsing to a single bold number once the position is
  locked. Bounds are pure points arithmetic (floor = take nothing more,
  ceiling = win out; a points tie is charged against the club while games
  remain), with one exact refinement: once both clubs are done, the real
  ordering key — goal difference, then goals scored — decides, so a settled
  season locks every position and clubs level on all three share one, exactly
  as the table itself does. Withheld pre-season alongside positions, and
  absent from the home/away splits like Form — a split position is not a
  league finish. New `positionRanges` export in `table.js`, built on the
  existing `maxPoints`. Completes the family-wide Finish rollout (all eight
  race-bearing viewers).

## 2026-08-09

- **Player pop-outs show appearance counts.** Every committed leaderboard row
  had `matches: null` — the stats fetch parsed "Matches: N" out of a
  displayValue that, for the bare categories it reads, is just the number.
  The counts live only in the `goalsLeaders`/`assistsLeaders` categories, so
  the fetch now harvests them per athlete from there (Salah's 2017-18 shows
  36 matches, Vardy's 2019-20 shows 35 — both verified). 964 of 2000 rows
  now carry a count; players on none of those two boards have no source.
- **1994-95 shows all FOUR relegated clubs.** The season-table stripe and the
  club-chart bars hardcoded a bottom-three zone, so Crystal Palace (19th of
  22, relegated when the League cut to 20 clubs) rendered as safe. The
  all-time counter already knew the exception; the rule now lives in one
  exported `relegatedCount(year)` used by every surface, with a 1994-95
  regression test.

## 2026-08-08

- **Condensed view strip.** Once the tab nav scrolls out of view, a slim fixed
  strip pins to the top showing the current view; tapping it drops down the
  full tab set, so switching views never means scrolling back to the top.
  The sticky filter bar and month jump-bar offset beneath it, and jump/landing scrolls reserve for its height.
  Rolled out family-wide.
- **Changelog started.** Earlier history lives in the git log.
