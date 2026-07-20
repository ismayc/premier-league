import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base: './' so the same dist/ works at a domain root (Netlify) and under a
// project subpath (GitHub Pages) without a second build.
export default defineConfig({
  base: './',
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test/setup.js'],
    // Test files run one at a time. Vitest's v8 coverage provider races when
    // several workers finish together — it tries to read a worker's temp
    // coverage JSON after that file has gone, and the whole run dies with an
    // ENOENT that has nothing to do with the tests. Every file passes in
    // isolation; only the parallel coverage merge is unsafe. The suite takes
    // about a minute serialised, which is a fair price for a report that is
    // actually produced.
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      all: true,
      include: ['src/**/*.{js,jsx}'],
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
