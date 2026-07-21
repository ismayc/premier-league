# Testing traps

*Recorded 2026-07-21.*

The suite is held at 100% coverage — statements, branches, functions and lines —
with thresholds in `vite.config.js`. Two things about that are easy to get wrong.

## `npm test` does not check coverage

`npm test` runs the suite only. The 100% thresholds are enforced **solely** by
`npm run test:coverage`, which is what CI runs.

A change can pass `npm test` locally and still fail CI. This happened at 99.31%
functions — a single uncovered inline arrow handler that the suite never
clicked. Run `npm run test:coverage` before pushing.

## Context providers live in `main.jsx`, not `App.jsx`

`FollowProvider` and `ServicesProvider` are both mounted in `src/main.jsx`. A
test that renders a bare `<App />` therefore gets each context's inert fallback:
an empty follow set, no selected services.

The symptom is confusing. Controls that depend on a provider render with the
correct `aria-pressed` state but are **disabled**, so clicking them does
nothing and the assertion fails for a reason that has nothing to do with the
behaviour under test.

Wrap explicitly when a test needs real context:

```jsx
render(
  <FollowProvider>
    <ServicesProvider>
      <App />
    </ServicesProvider>
  </FollowProvider>
)
```

## Private-browsing paths need cases too

Every `localStorage` read and write is wrapped in `try`/`catch`. Both throwing
branches need a test to hold 100%:

```js
vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
  throw new DOMException('SecurityError')
})
```

## Coverage runs serially on purpose

`vite.config.js` sets `fileParallelism: false`. Vitest's v8 coverage provider
races when several workers finish together and dies with an `ENOENT` reading a
temp file that has already been cleaned up. Serial execution fixes it; the
suite takes about a minute.
