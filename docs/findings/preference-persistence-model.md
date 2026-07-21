# Where preferences are persisted, and why

*Recorded 2026-07-21, after auditing persistence across the sibling viewers.*

Three mechanisms, chosen deliberately rather than by accident.

## URL query string — `src/utils/urlState.js`

Anything that should survive a reload **and** travel in a shared link:

| Param | Meaning |
|---|---|
| `view` | which of the five views |
| `tz` | timezone override |
| `team` | club drawer |
| `hide` | spoiler-free (scores hidden) |
| `mine` | only followed clubs |
| `past` | include days already played |
| `season` | history/stats season override |

Only non-default values are written, so a first-time visitor's URL stays clean.

## localStorage — everything under a `pl:` prefix

Anything per-device that must **not** travel in a link:

`pl:theme`, `pl:followed`, `pl:alerts`, `pl:services`, `pl:watchOnly`

## Component state — nothing user-facing

`mine` and `past` were component-local inside `FixturesView` until this audit.
They reset on every reload, and a shared link silently dropped them — the only
two choices in the app that did not persist. They are now lifted into `App.jsx`
alongside every other choice.

## The rule

> Would a stranger opening this link want this applied to them?

**Yes** → URL. Add it to `DEFAULTS`, `readState` and `writeState` in
`urlState.js`, and hold the state in `App.jsx`.

**No** → localStorage under `pl:`.

The distinction that matters: anything describing *what you are looking at*
belongs in the URL; anything describing *who you are or what you own* stays on
the device. A shared link carrying the sender's streaming subscriptions would
filter the recipient's fixture list by channels they may not have — which is
why `pl:services` and `pl:watchOnly` are deliberately **not** URL state, even
though they are filters and the two beside them are.

## Implementation note

Every `localStorage` access is wrapped in `try`/`catch` — private browsing
throws on both read and write. Both throwing paths need a test case, because
the suite is held at 100% coverage.
