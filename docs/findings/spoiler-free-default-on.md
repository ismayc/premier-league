# Flipping a URL flag's default inverts which value must be written

*Recorded 2026-07-26, when spoiler-free mode became the default.*

Spoiler-free mode is now **on by default** (commit `00cbb7c`; the-wnba-schedule got
the same change the same day). The behaviour change is one line —
`DEFAULTS.hide: false → true` — but two others have to move with it, and neither
failure is loud.

## Only non-default values are written — so the *opt-out* now travels

`writeState` keeps a shared link clean by omitting anything at its default. With
`hide` defaulting to **on**, the value that must appear in a link is the **opt-out**:

```js
// before — writes the opt-in
if (state.hide) q.set('hide', '1')

// after — writes the opt-out
if (state.hide === false) q.set('hide', '0')
```

Keep the old line and a sender who deliberately turned scores **on** shares a URL
with no `hide` param at all. The recipient's default then hides everything: the
sender's choice isn't merely dropped, it arrives **inverted**. Nothing errors, and
no test that only checks "hidden state round-trips" will catch it.

## `readState` must tell an absent param from an explicit `0`

```js
// before — an absent param and hide=0 are indistinguishable, both false
hide: q.get('hide') === '1',

// after
hide: q.has('hide') ? q.get('hide') === '1' : DEFAULTS.hide,
```

The old form silently pins the default to `false` no matter what `DEFAULTS` says.

## Don't write the ternary

```js
if (state.hide !== DEFAULTS.hide) q.set('hide', state.hide ? '1' : '0')
```

This looks more general, but with the default at `true` the `'1'` arm is
**unreachable** — `state.hide` truthy and `!== true` can't both hold for a boolean.
The 100% branch gate fails on it (it did, at 96.29% on that line in the WNBA repo
before it was simplified to `state.hide === false`).

## Related

- [Where preferences are persisted, and why](preference-persistence-model.md) — why
  `hide` is URL state here and not a `pl:` localStorage key. The WNBA fork does
  both: link > `wnba:spoilerFree` > default, with the stored read as `!== '0'` so
  an absent key means "never chose".
