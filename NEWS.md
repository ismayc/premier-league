# NEWS

A dated changelog for the Premier League Fixtures viewer. Each heading is a calendar
day; bullet points capture every change made that day (features, fixes,
data/source updates, deployment). Newest day on top.

## 2026-08-10

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
