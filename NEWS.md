# NEWS

A dated changelog for the Premier League Fixtures viewer. Each heading is a calendar
day; bullet points capture every change made that day (features, fixes,
data/source updates, deployment). Newest day on top.

## 2026-09-10

- **Fixed: the match-detail popup could not be closed on mobile.** The modal was sized and
  centered with `100vh`, which on iOS Safari is the large viewport (as if the toolbars were
  hidden), so its top, and the close button with it, sat behind the address bar out of
  reach. The overlay, modal, and drawer now size with `100dvh` (the visible viewport
  height), falling back to `100vh` on browsers without `dvh`.

## 2026-09-06

- **Every league fact now lives in one file, `src/config/league.js`.** Fifth of ten repos,
  and the one that had to settle a disagreement rather than just move strings. 13 files
  import it. `src/utils/timeCore.js` is the only piece of `sports-viewer-meta` any
  deployed app actually uses and it already takes an adapter, so its contract wins over
  the NFL viewer's config where the two differ: `weekStart: 0|1` rather than
  `weekStartsMonday`, and **no** `hour12` field, because `timeCore` derives the hour cycle
  from the locale and gets something a boolean cannot (12-hour locales drop the leading
  zero, 24-hour locales keep it).
- **`gameLengthMs` was never being passed to `createTimeUtils`.** The factory silently
  fell back to its 2.25h basketball default while `src/utils/time.js` declared a second
  copy of the same number beside it. One value now, passed in.
- **`services/athlete.js` had its own `const LEAGUE = 'English Premier League'`**, which
  collided with the config the moment the file imported it and broke thirteen tests. That
  string is the feed's name for this competition, used to tell a league match from a cup
  one, so it is now `LEAGUE.espnLeagueName`. It is a different string from `LEAGUE.name`
  and not ours to choose, which is why it deserves a field.
- **The browser chrome shipped `#12121a` while the page painted `#15171b`.** `index.html`
  and the manifest now say what `index.css` paints. `public/icon.svg` keeps its own value:
  that is artwork, not chrome.
- **The season badge did string surgery on a feed value.** It rendered
  `SEASON_LABEL.replace(' English Premier League', '')`, one upstream rename away from
  printing the whole sentence into a span sized for five characters. It now takes
  `LEAGUE.seasonLabel`, derived from `SEASON`.
- **Two more sites had drifted out of reach of the time factory**: `WeekView.jsx` formatted
  its month heading with a second `en-GB` literal, and `ics.js` and `TeamPanel.jsx` each
  spelled the competition name by hand.
- **New `test/chrome-identity.test.js`** holds `index.html`, the manifest and
  `package.json` to the config, and pins the two deploy slugs apart on purpose: this app is
  `premier-league` on GitHub and Pages but `premier-league-viewer` on Netlify, and the
  `.ics` identity follows Netlify because that is the host a subscriber's calendar polls.
- **A red refresh now says which of three things it means.** Fourteen days of Refresh
  data failures across the family sorted into a fetch that did not land (ESPN 5xx, or a
  guard correctly refusing bad data; the site is fine), a red gate (a test asserted a
  season state the data moved past; the site is stale), and a push race. All three used
  to send the same email. The fetch now retries the whole run three times, five then ten
  minutes apart, and a fetch that still fails is a warning on a green job rather than a
  failure, unless no data has landed for 72 hours, in which case one issue opens. A red
  gate stays red but files one deduped issue naming the failing tests. Both issues close
  themselves on the next successful commit. Proven on the NFL viewer first.
- **Two rehearsals now run in CI on every push.** `Gate against the next refresh` fetches
  what the next refresh would fetch and runs the coverage gate against it, at the keyboard
  instead of on the cron. `Rehearse the clock` runs the suite at seven future instants
  with the data untouched, using the meta repo's tool. Both go red on the run and neither
  blocks the deploy, so a calendar rollover cannot hold a hotfix hostage.
- **Finished the design pass: the fixture list is now a results board.** A day is a
  block, not a stack of floating cards: a band naming the day over a rule, then its
  fixtures as ruled rows sharing one left edge, each led by an 88px scoreboard rail
  holding the kickoff time. Kickoffs, scores, points and stat tiles are set in the
  display voice (Archivo pushed to 118% width and weight 800), and every figure in a
  column is tabular. The app also takes the family's cool neutral ground in place of
  its tinted near-black, and the last rounded corners and drop shadows are gone;
  shadows now belong only to things that genuinely float, like a modal.
- **The data-mark palette is validated for the first time, by a script rather than by
  eye.** The stylesheet header has always promised that the `--viz-*` / `--zone-*`
  colors were checked for contrast and color-vision separation. The separation half was
  true. The contrast half was not: measured against the surfaces they actually sit on,
  16 checks failed, most of them in light mode, where Conference amber sat at 1.96:1 and
  the white letter on a form pill reached only 2.82:1. `scripts/validate-palette.mjs`
  now checks every mark against every surface at the bar its real role earns, checks the
  letter on each form pill, and checks that the zones, the form outcomes and the
  diverging chart stay separable under normal vision and all three dichromacies. The
  palette was re-derived to pass all of it while staying as close to the previous colors
  as the constraints allow, so Champions blue is still blue and relegation red still red.
- **Form pills no longer hardcode a white letter.** The marks are bright on the dark
  theme and deep on the light one, so the letter is now `--mark-ink` and flips with them.
- Fixed in passing: a tab left with `border-radius: 2px 6px 0 0` by the previous squaring
  pass, and diverging chart bars that were rounded at the data end while their own
  comment said the baseline end must stay square.

## 2026-09-05 (later)

- **Adopted the family's typeface and squared chrome.** The app is now set in Archivo,
  loaded as a variable font on both axes, matching every other viewer in the family, and
  the grab-bag of corner radii collapsed to one. The color system here is deliberately
  untouched: the data-mark palette is a validated set (see the stylesheet header), and
  re-pointing it at another app's tokens would mean re-validating the whole thing.

## 2026-08-30

- **Production is now checked after every deploy.** Nothing in this repo ever fetched an
  absolute production URL: the build, the tests and CI all work on local files, so a host
  that was never created, a URL quietly pointing at a sibling app's site, or a broken
  calendar feed were invisible to the whole gate. A new `smoke` job runs
  `scripts/smoke-prod.mjs` after the deploy and checks the deployed site itself: every
  link-preview tag present and answering 200, the social image actually an image rather
  than the single-page-app catch-all, `coverage.json` readable, and the calendar feed real
  iCalendar with events in it. It reports rather than blocks, because Netlify publishes on
  its own trigger and a red run can just mean "not published yet".
- **Added a `<link rel="canonical">`.** Every other viewer in the family declares one and
  this app did not, leaving crawlers to infer it from `og:url`. It names the same host.
- **The calendar function is inside the coverage gate now.** `coverage.include` was
  `src/**`, so the `webcal://` subscription endpoint, real shipped code that a
  subscriber's calendar hits directly, was measured by nothing while the badge read
  100%. It is now covered, and at 100% like everything else.
- It had **no tests at all** before today. The new ones cover what actually matters
  there: that the endpoint still serves a valid calendar when the live feed is
  unreachable, rather than failing the whole subscription.

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
- **The test suite now pins its timezone, so `npm test` works without a `TZ=UTC` prefix.**
  Nothing pinned the zone, so the suite ran in whatever zone the machine was in. CI's
  runners sit in UTC and the tests were written against that, so CI was always fine, but a
  local run in a US zone failed on any assertion about a day heading or what counts as
  "today" until you remembered to type `TZ=UTC` in front of it. `vite.config.js` now sets
  `env: { TZ: 'UTC' }`, which is exactly what CI has always done: the full suite passes at
  100% locally in an ambient MST with no prefix. A new guard in `test/guards.test.js`
  asserts both that the pin is in the config and that it took effect in the running
  process, since a dropped pin is invisible on an already-UTC CI runner. Verified by
  deleting the pin and watching both assertions fail. Four repos in the family already had
  a pin, each set to the zone its own content needs; these eight were the ones without.

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
