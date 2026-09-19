import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'

const abs = (rel) => fileURLToPath(new URL(rel, import.meta.url))

// The modules the refresh workflow rewrites, each mapped to a frozen stand-in.
// test/guards.test.js asserts every file the fetch scripts write is listed here.
const FROZEN = new Map([
  [abs('./src/data/fixtures.js'), abs('./test/fixtures/frozen/fixtures.js')],
  [abs('./src/data/players.js'), abs('./test/fixtures/frozen/players.js')],
  [abs('./src/data/teams.js'), abs('./test/fixtures/frozen/teams.js')],
  [abs('./src/data/history.js'), abs('./test/fixtures/frozen/history.js')],
])

// `LIVE_DATA=1` (npm run test:data) runs only test/live/ and reads the real modules.
const LIVE = Boolean(process.env.LIVE_DATA)

// Under vitest, every import of a refreshed data module resolves to its frozen stand-in,
// whoever the importer is: a test, a vi.mock of the module, or src/config/league.js two
// imports down. The coverage gate therefore cannot be moved by a refresh, by
// construction. Ported from the WNBA, NBA, and NFL siblings, where a refresh reddened
// the gate by moving a season fact or drying up a covered branch. Frozen here on
// September 19, 2026, in matchweek 5 (41 of 380 played), from the committed tree the
// whole suite passed against. history.js is frozen too: unlike the basketball siblings,
// this repo's refresh re-runs fetch-history.mjs every time.
//
// Matching is on the RESOLVED path, so the spelling of the import does not matter.
// `apply` keeps this out of `vite build` and `vite dev`; vitest runs in mode "test". The
// config stays a plain object because sports-viewer-meta's rehearse-clock.mjs imports
// and extends it.
const frozenData = () => ({
  name: 'frozen-data',
  enforce: 'pre',
  apply: (_config, { mode }) => mode === 'test' && !LIVE,
  async resolveId(source, importer, options) {
    if (!/data\/\w+\.js$/.test(source)) return null
    const resolved = await this.resolve(source, importer, { ...options, skipSelf: true })
    return (resolved && FROZEN.get(resolved.id)) ?? null
  },
})

// base: './' so the same dist/ works at a domain root (Netlify) and under a
// project subpath (GitHub Pages) without a second build.
export default defineConfig({
  base: './',
  plugins: [react(), frozenData()],
  test: {
    environment: 'jsdom',
    globals: true,
    // Two suites, never mixed. The default run is everything except test/live/, against
    // frozen data, under the 100% gate. `LIVE_DATA=1` is only test/live/: invariants and
    // smoke renders against the real refreshed modules, with no coverage threshold. That
    // second suite is what a refresh has to pass.
    include: [LIVE ? 'test/live/**/*.test.{js,jsx}' : 'test/**/*.test.{js,jsx}'],
    exclude: [...configDefaults.exclude, ...(LIVE ? [] : ['test/live/**'])],
    setupFiles: ['./test/setup.js'],
    // Test files run one at a time. Vitest's v8 coverage provider races when
    // several workers finish together — it tries to read a worker's temp
    // coverage JSON after that file has gone, and the whole run dies with an
    // ENOENT that has nothing to do with the tests. Every file passes in
    // isolation; only the parallel coverage merge is unsafe. The suite takes
    // about a minute serialised, which is a fair price for a report that is
    // actually produced.
    fileParallelism: false,
    // Pin the suite's timezone so any test asserting a day heading, or what counts
    // as "today", is runner-independent. UTC is what these tests were already
    // written against: CI's runners sit in UTC, so this changes nothing there. What
    // it fixes is the LOCAL run, which until now needed an explicit `TZ=UTC` prefix
    // and failed in a confusing way without one. test/guards.test.js asserts the pin
    // so it cannot be dropped unnoticed on an already-UTC runner.
    env: { TZ: 'UTC' },
    coverage: {
      provider: 'v8',
      all: true,
      // netlify/functions is inside the gate as well as src. The subscription
      // endpoint is real shipped code that a subscriber's calendar hits directly,
      // and it sat outside coverage.include with no tests at all while the badge
      // read 100%. See sports-viewer-meta/docs/LINEAGES.md section 5.
      include: ['src/**/*.{js,jsx}', 'netlify/functions/**/*.mjs'],
      // Generated data modules and the DOM entry point carry no logic to cover.
      exclude: ['src/main.jsx', 'src/data/**', 'src/**/*.test.{js,jsx}'],
      reporter: ['text', 'text-summary', 'json-summary', 'json'],
      // The suite is held at full coverage, so a new branch arrives with the
      // test that exercises it rather than as a number to chase later.
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
})
