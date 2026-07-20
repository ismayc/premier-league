import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'

// The app polls a live feed on mount. Tests assert on committed data, so the
// network is stubbed out globally rather than mocked per test — a test that
// wants live behaviour overrides this itself.
beforeEach(() => {
  global.fetch = vi.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve({ events: [] }) })
  )

  // jsdom has no matchMedia; the pre-paint theme script and any responsive
  // hooks need it. Defaulting `matches` to false selects the desktop branch.
  if (!window.matchMedia) {
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
  }
})

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.restoreAllMocks()

  // restoreAllMocks does not touch timers. A file that installs fake timers
  // and does not put them back leaks into whatever runs next in the same
  // worker, which shows up as failures that only appear in the full suite and
  // move around between runs.
  vi.useRealTimers()

  // The theme is written to the document element, which outlives cleanup().
  delete document.documentElement.dataset.theme
})
