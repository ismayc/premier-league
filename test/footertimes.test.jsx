import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'

// The live poll is the app's only network call; mocking the module keeps applyLive real.
const fetchLive = vi.fn()
vi.mock('../src/services/espn.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, fetchLive: (...args) => fetchLive(...args) }
})
vi.setConfig({ testTimeout: 90_000 })

import App from '../src/App.jsx'
import FooterTimes from '../src/components/FooterTimes.jsx'
import { FollowProvider } from '../src/context/follow.jsx'
import { ServicesProvider } from '../src/context/services.jsx'
import { formatStamp } from '../src/utils/time.js'
import { DATA_UPDATED_AT } from './fixtures/frozen/meta.js'

// Every render here pins the clock: the frozen board read at the real clock is what
// reddened a WNBA test on October 2, 2026. Only Date is faked, so promises still settle.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-05T18:00:00.000Z'))
  fetchLive.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  window.history.replaceState(null, '', '/')
})

describe('formatStamp', () => {
  // The league's own locale (en-GB): day first, 24-hour, like every other time on the page.
  it('formats an instant in the given zone', () => {
    expect(formatStamp('2026-09-28T23:49:35.000Z', 'America/Los_Angeles')).toBe('28 Sept, 16:49')
    expect(formatStamp('2026-09-28T23:49:35.000Z', 'America/New_York')).toBe('28 Sept, 19:49')
    expect(formatStamp('2026-09-28T23:49:35.000Z', 'Europe/London')).toBe('29 Sept, 00:49')
  })

  // new Date(null) is the epoch, and new Date('') or garbage is Invalid Date. Neither
  // may reach the page.
  it('gives null for a missing or unparseable stamp', () => {
    for (const bad of [undefined, null, '', 'not a date']) expect(formatStamp(bad, 'UTC')).toBeNull()
  })
})

describe('FooterTimes', () => {
  const at = new Date('2026-09-29T17:32:00.000Z')

  it('labels both clocks, in the selected zone', () => {
    const { container } = render(
      <FooterTimes dataAt="2026-09-28T23:49:35.000Z" checkedAt={at} tz="America/Los_Angeles" />
    )
    expect(container.textContent).toBe('Data as of 28 Sept, 16:49 · Live scores checked 10:32')
    expect(container.querySelector('span.dim')).not.toBeNull()
  })

  it('shows the data stamp alone before the first live poll lands', () => {
    const { container } = render(<FooterTimes dataAt="2026-09-28T23:49:35.000Z" checkedAt={null} tz="UTC" />)
    expect(container.textContent).toBe('Data as of 28 Sept, 23:49')
  })

  it('drops a missing or unparseable stamp rather than printing a wrong date', () => {
    for (const bad of [undefined, null, 'garbage']) {
      const { container, unmount } = render(<FooterTimes dataAt={bad} checkedAt={at} tz="UTC" />)
      expect(container.textContent).toBe('Live scores checked 17:32')
      expect(container.textContent).not.toMatch(/Invalid|1969|1970|Data as of/)
      unmount()
    }
  })

  it('renders nothing when neither time is known', () => {
    const { container } = render(<FooterTimes dataAt={null} checkedAt={null} tz="UTC" />)
    expect(container.innerHTML).toBe('')
  })
})

describe('the app footer', () => {
  function renderApp() {
    Element.prototype.scrollIntoView = vi.fn()
    localStorage.clear()
    window.history.replaceState(null, '', '/?tz=America/New_York')
    return render(
      <FollowProvider>
        <ServicesProvider>
          <App />
        </ServicesProvider>
      </FollowProvider>
    )
  }
  const stamp = `Data as of ${formatStamp(DATA_UPDATED_AT, 'America/New_York')}`

  it('shows the snapshot time alone before the first poll, then adds the poll time', async () => {
    let resolvePoll
    fetchLive.mockReturnValue(new Promise((resolve) => (resolvePoll = resolve)))
    renderApp()
    await act(async () => {})
    expect(stamp).toBe('Data as of 4 Sept, 09:05')
    expect(screen.getByText(stamp)).toHaveClass('dim')
    expect(screen.queryByText(/Live scores checked/)).toBeNull()

    await act(async () => resolvePoll(new Map()))
    // The pinned clock, 18:00 UTC, is 14:00 in New York.
    expect(screen.getByText(`${stamp} · Live scores checked 14:00`)).toHaveClass('dim')
  })

  it('never claims a live check when the poll failed', async () => {
    fetchLive.mockRejectedValue(new Error('offline'))
    renderApp()
    await act(async () => {})
    expect(screen.getByText(stamp)).toBeInTheDocument()
    expect(screen.queryByText(/Live scores checked/)).toBeNull()
  })
})
