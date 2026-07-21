import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import App from '../src/App.jsx'
import { FollowProvider, useFollow } from '../src/context/follow.jsx'
import { useModalA11y } from '../src/hooks/useModalA11y.js'
import { FIXTURES } from '../src/data/fixtures.js'

/**
 * The shell, the one context, and the shared modal behaviour.
 *
 * App renders the whole committed season, so these tests assert on specific
 * landmarks rather than snapshots — the point is which view is mounted and
 * what the shell did to the URL, storage and the poll, not the 380 cards.
 */

// The live poll is the app's only network call. Mocking the module (rather
// than fetch) keeps applyLive real, so the merge is still exercised.
const fetchLive = vi.fn()
vi.mock('../src/services/espn.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, fetchLive: (...args) => fetchLive(...args) }
})

// App renders the full 380-fixture season on every interaction, which under
// coverage instrumentation outruns the 5s default.
vi.setConfig({ testTimeout: 30_000 })

const LIVE_REFRESH_MS = 30_000
const IDLE_REFRESH_MS = 120_000

/** Force a deterministic detected zone; the picker's contents depend on it. */
function stubZone(tz) {
  vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({ timeZone: tz })
}

const setSearch = (search) => window.history.replaceState(null, '', `/${search}`)

/** Render and let the first poll settle, so no state lands outside act(). */
async function renderApp() {
  const result = render(<App />)
  await act(async () => {})
  return result
}

beforeEach(() => {
  fetchLive.mockReset()
  fetchLive.mockResolvedValue(new Map())
  setSearch('')
  // The theme is read off the documentElement, which jsdom keeps between tests.
  delete document.documentElement.dataset.theme
})

afterEach(() => {
  setSearch('')
})

/* ── App: views and shell state ──────────────────────────────────────────── */

describe('App views', () => {
  it('opens on fixtures and switches to each of the other views', async () => {
    stubZone('Europe/London')
    const user = userEvent.setup()
    await renderApp()

    expect(screen.getByRole('heading', { name: 'Fixtures', level: 2 })).toBeInTheDocument()

    for (const label of ['Week', 'Table', 'Stats', 'History']) {
      await user.click(screen.getByRole('button', { name: label }))
      expect(screen.getByRole('heading', { name: label, level: 2 })).toBeInTheDocument()
      // Only one view is mounted at a time.
      expect(screen.queryByRole('heading', { name: 'Fixtures', level: 2 })).toBeNull()
    }

    await user.click(screen.getByRole('button', { name: 'Fixtures' }))
    expect(screen.getByRole('heading', { name: 'Fixtures', level: 2 })).toBeInTheDocument()
  })

  it('marks the active view for assistive tech and writes it to the URL', async () => {
    stubZone('Europe/London')
    const user = userEvent.setup()
    await renderApp()

    await user.click(screen.getByRole('button', { name: 'Table' }))
    expect(screen.getByRole('button', { name: 'Table' })).toHaveAttribute('aria-current', 'page')
    // The URL is the shareable state — "the table" must survive a copy-paste.
    expect(window.location.search).toBe('?view=table')
  })

  it('restores view, timezone, hidden scores and the open club from the URL', async () => {
    stubZone('Europe/London')
    setSearch('?view=table&tz=Asia/Tokyo&hide=1&team=ARS')
    await renderApp()

    expect(screen.getByRole('heading', { name: 'Table', level: 2 })).toBeInTheDocument()
    expect(screen.getByRole('combobox')).toHaveValue('Asia/Tokyo')
    expect(screen.getByRole('button', { name: /Scores hidden/ })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    // `team` opens the club drawer, so a shared link can point at one club.
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  // The fixtures filters used to be FixturesView's own useState, so a reload
  // reset them and a shared link silently dropped them. They now live in the
  // shell alongside every other choice; this holds both halves of that.
  it('restores the fixtures filters from the URL and writes them back', async () => {
    stubZone('Europe/London')
    // FollowProvider lives in main.jsx, so App on its own sees an empty
    // follow set and the Followed chip stays disabled. This case needs the
    // real provider to click it.
    localStorage.setItem('pl:followed', JSON.stringify(['ARS']))
    setSearch('?past=1&mine=1')
    const user = userEvent.setup()
    render(
      <FollowProvider>
        <App />
      </FollowProvider>
    )
    await act(async () => {})

    expect(screen.getByRole('button', { name: 'Played' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /Followed/ })).toHaveAttribute(
      'aria-pressed',
      'true'
    )

    // Switching one off has to leave the URL, not just the chip.
    await user.click(screen.getByRole('button', { name: 'Played' }))
    expect(window.location.search).toBe('?mine=1')

    // And with both off the URL is clean again, rather than carrying mine=0.
    await user.click(screen.getByRole('button', { name: /Followed/ }))
    expect(window.location.search).toBe('')
  })
})

describe('App shell controls', () => {
  // These controls live in the header and are view-independent; starting on
  // the table keeps each render to twenty rows instead of 380 cards.
  beforeEach(() => setSearch('?view=table'))

  it('offers the common zones and switches the rendered timezone', async () => {
    stubZone('Europe/London')
    const user = userEvent.setup()
    await renderApp()

    const select = screen.getByRole('combobox')
    expect(select).toHaveValue('Europe/London')

    await user.selectOptions(select, 'Asia/Tokyo')
    expect(select).toHaveValue('Asia/Tokyo')
    expect(window.location.search).toBe('?view=table&tz=Asia%2FTokyo')
  })

  it('prepends an unusual detected zone to the picker', async () => {
    // Someone in the Chathams is not served by the seventeen common zones, so
    // their own zone is added rather than silently swapped for London.
    stubZone('Pacific/Chatham')
    await renderApp()

    const options = within(screen.getByRole('combobox')).getAllByRole('option')
    expect(options[0]).toHaveValue('Pacific/Chatham')
    expect(options.filter((o) => o.value === 'Pacific/Chatham')).toHaveLength(1)
    // A detected zone that is already common is not duplicated at the top.
    expect(options.map((o) => o.value)).toContain('Europe/London')
  })

  it('does not duplicate a detected zone that is already common', async () => {
    stubZone('America/New_York')
    await renderApp()

    const values = within(screen.getByRole('combobox'))
      .getAllByRole('option')
      .map((o) => o.value)
    expect(values.filter((v) => v === 'America/New_York')).toHaveLength(1)
    expect(values[0]).toBe('Europe/London')
  })

  it('toggles spoiler-free mode and records it in the URL', async () => {
    stubZone('Europe/London')
    const user = userEvent.setup()
    await renderApp()

    await user.click(screen.getByRole('button', { name: /Scores shown/ }))
    expect(screen.getByRole('button', { name: /Scores hidden/ })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    expect(window.location.search).toBe('?view=table&hide=1')

    await user.click(screen.getByRole('button', { name: /Scores hidden/ }))
    expect(screen.getByRole('button', { name: /Scores shown/ })).toBeInTheDocument()
    expect(window.location.search).toBe('?view=table')
  })

  it('toggles the theme both ways and persists it', async () => {
    stubZone('Europe/London')
    const user = userEvent.setup()
    await renderApp()

    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(localStorage.getItem('pl:theme')).toBe('dark')

    await user.click(screen.getByRole('button', { name: 'Switch to light theme' }))
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(localStorage.getItem('pl:theme')).toBe('light')

    await user.click(screen.getByRole('button', { name: 'Switch to dark theme' }))
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(localStorage.getItem('pl:theme')).toBe('dark')
  })

  it('still applies the theme when storage refuses to persist it', async () => {
    // Private browsing throws on write. Losing the preference across reloads
    // is acceptable; throwing during render is not.
    stubZone('Europe/London')
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError')
    })
    const user = userEvent.setup()
    await renderApp()

    await user.click(screen.getByRole('button', { name: 'Switch to light theme' }))
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('adopts a theme already applied by the pre-paint script', async () => {
    stubZone('Europe/London')
    document.documentElement.dataset.theme = 'light'
    await renderApp()
    // The button offers the *other* theme, so it must have read the current one.
    expect(screen.getByRole('button', { name: 'Switch to dark theme' })).toBeInTheDocument()
  })
})

/* ── App: overlays ───────────────────────────────────────────────────────── */

describe('App overlays', () => {
  it('opens and closes a fixture detail', async () => {
    stubZone('Europe/London')
    const user = userEvent.setup()
    await renderApp()

    const first = screen.getAllByRole('button', { name: /versus .*, details$/ })[0]
    const label = first.getAttribute('aria-label').replace(', details', '')
    await user.click(first)

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAccessibleName(label)

    await user.click(within(dialog).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('replaces an open fixture detail with the club drawer', async () => {
    // Two stacked dialogs would trap focus in both; picking a club from a
    // match detail must swap the overlay, not add one.
    stubZone('Europe/London')
    const user = userEvent.setup()
    await renderApp()

    await user.click(screen.getAllByRole('button', { name: /versus .*, details$/ })[0])
    const detail = screen.getByRole('dialog')

    await user.click(within(detail).getAllByRole('button', { name: /Arsenal/ })[0])

    const drawers = screen.getAllByRole('dialog')
    expect(drawers).toHaveLength(1)
    expect(within(drawers[0]).getByRole('heading', { level: 2 })).toHaveTextContent('Arsenal')
    expect(window.location.search).toBe('?team=ARS')

    await user.click(within(drawers[0]).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(window.location.search).toBe('')
  })

  it('opens a fixture from inside the club drawer', async () => {
    stubZone('Europe/London')
    setSearch('?team=ARS')
    const user = userEvent.setup()
    await renderApp()

    const drawer = screen.getByRole('dialog')
    // Arsenal's opening fixture, listed under "Next fixtures" in the drawer.
    await user.click(within(drawer).getAllByRole('button', { name: /^H\s*Coventry/ })[0])

    // The drawer closed and the detail took its place.
    const dialogs = screen.getAllByRole('dialog')
    expect(dialogs).toHaveLength(1)
    expect(dialogs[0]).toHaveAccessibleName(/versus/)
  })

  it('opens the calendar export from the fixtures view and closes it', async () => {
    stubZone('Europe/London')
    const user = userEvent.setup()
    await renderApp()

    await user.click(screen.getByRole('button', { name: 'Export' }))
    const modal = screen.getByRole('dialog', { name: /Export fixtures to calendar/ })
    expect(within(modal).getByRole('heading', { name: 'Add to calendar' })).toBeInTheDocument()

    await user.click(within(modal).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('changes the season from the history view', async () => {
    stubZone('Europe/London')
    setSearch('?view=history')
    const user = userEvent.setup()
    await renderApp()

    const seasons = screen.getAllByRole('combobox')
    // The last combobox on the page belongs to the history view, not the shell.
    await user.selectOptions(seasons[seasons.length - 1], '2015')

    expect(window.location.search).toContain('season=2015')
  })
})

/* ── App: the live poll ──────────────────────────────────────────────────── */

describe('App live polling', () => {
  const liveMap = () =>
    new Map([[FIXTURES[0].id, { id: FIXTURES[0].id, live: true, score: [1, 0], clock: "12'" }]])

  it('shows a live pill and polls faster while a match is in progress', async () => {
    vi.useFakeTimers()
    try {
      stubZone('Europe/London')
      fetchLive.mockResolvedValue(liveMap())
      await renderApp()

      await act(async () => {})
      expect(screen.getByText('1 live')).toBeInTheDocument()
      // The first reading flips liveCount, which re-arms the poll on the fast
      // interval — hence two calls before any timer has fired.
      expect(fetchLive).toHaveBeenCalledTimes(2)

      // A live match refreshes every 30s, not every two minutes.
      await act(async () => {
        vi.advanceTimersByTime(LIVE_REFRESH_MS)
      })
      expect(fetchLive).toHaveBeenCalledTimes(3)
    } finally {
      vi.useRealTimers()
    }
  })

  it('polls on the idle interval when nothing is live', async () => {
    vi.useFakeTimers()
    try {
      stubZone('Europe/London')
      await renderApp()

      await act(async () => {})
      expect(screen.queryByText(/live$/)).toBeNull()
      expect(fetchLive).toHaveBeenCalledTimes(1)

      await act(async () => {
        vi.advanceTimersByTime(LIVE_REFRESH_MS)
      })
      expect(fetchLive).toHaveBeenCalledTimes(1)

      await act(async () => {
        vi.advanceTimersByTime(IDLE_REFRESH_MS - LIVE_REFRESH_MS)
      })
      expect(fetchLive).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('aborts the in-flight request when it unmounts', async () => {
    stubZone('Europe/London')
    const { unmount } = render(<App />)

    await waitFor(() => expect(fetchLive).toHaveBeenCalled())
    const { signal } = fetchLive.mock.calls[0][0]
    expect(signal.aborted).toBe(false)

    unmount()
    expect(signal.aborted).toBe(true)
  })

  it('stops polling once every fixture is settled', async () => {
    vi.useFakeTimers()
    try {
      stubZone('Europe/London')
      // Every fixture postponed is the degenerate "season over" case: nothing
      // left to poll for, so the app should stop calling the feed entirely.
      fetchLive.mockResolvedValue(
        new Map(FIXTURES.map((f) => [f.id, { id: f.id, unplayed: 'Postponed' }]))
      )
      await renderApp()

      await act(async () => {})
      expect(fetchLive).toHaveBeenCalledTimes(1)

      await act(async () => {
        vi.advanceTimersByTime(IDLE_REFRESH_MS * 3)
      })
      expect(fetchLive).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps rendering the committed season when the feed fails', async () => {
    stubZone('Europe/London')
    fetchLive.mockRejectedValue(new Error('offline'))
    await renderApp()

    await waitFor(() => expect(fetchLive).toHaveBeenCalled())
    // Stale, not broken: the fixture list is still on screen.
    expect(screen.getByRole('heading', { name: 'Fixtures', level: 2 })).toBeInTheDocument()
    expect(screen.queryByText(/live$/)).toBeNull()
  })
})

/* ── Follow context ──────────────────────────────────────────────────────── */

function FollowProbe() {
  const { followed, isFollowed, toggle, clear } = useFollow()
  return (
    <div>
      <span data-testid="list">{[...followed].join(',')}</span>
      <span data-testid="ars">{String(isFollowed('ARS'))}</span>
      <button type="button" onClick={() => toggle('ARS')}>
        toggle ARS
      </button>
      <button type="button" onClick={() => toggle('CHE')}>
        toggle CHE
      </button>
      <button type="button" onClick={clear}>
        clear
      </button>
    </div>
  )
}

describe('follow context', () => {
  const list = () => screen.getByTestId('list').textContent

  it('restores followed clubs from storage', () => {
    localStorage.setItem('pl:followed', JSON.stringify(['ARS', 'CHE']))
    render(
      <FollowProvider>
        <FollowProbe />
      </FollowProvider>
    )
    expect(list()).toBe('ARS,CHE')
    expect(screen.getByTestId('ars')).toHaveTextContent('true')
  })

  it('ignores stored data that is not an array of clubs', () => {
    // A hand-edited or half-written value must not take the app down.
    localStorage.setItem('pl:followed', JSON.stringify({ ARS: true }))
    render(
      <FollowProvider>
        <FollowProbe />
      </FollowProvider>
    )
    expect(list()).toBe('')
  })

  it('ignores unparseable stored data', () => {
    localStorage.setItem('pl:followed', 'not json{')
    render(
      <FollowProvider>
        <FollowProbe />
      </FollowProvider>
    )
    expect(list()).toBe('')
  })

  it('starts empty when reading storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('SecurityError')
    })
    render(
      <FollowProvider>
        <FollowProbe />
      </FollowProvider>
    )
    expect(list()).toBe('')
  })

  it('adds, removes and clears clubs, persisting each change', async () => {
    const user = userEvent.setup()
    render(
      <FollowProvider>
        <FollowProbe />
      </FollowProvider>
    )

    await user.click(screen.getByRole('button', { name: 'toggle ARS' }))
    await user.click(screen.getByRole('button', { name: 'toggle CHE' }))
    expect(list()).toBe('ARS,CHE')
    expect(JSON.parse(localStorage.getItem('pl:followed'))).toEqual(['ARS', 'CHE'])

    await user.click(screen.getByRole('button', { name: 'toggle ARS' }))
    expect(list()).toBe('CHE')

    await user.click(screen.getByRole('button', { name: 'clear' }))
    expect(list()).toBe('')
    expect(JSON.parse(localStorage.getItem('pl:followed'))).toEqual([])
  })

  it('keeps working for the session when storage refuses writes', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError')
    })
    const user = userEvent.setup()
    render(
      <FollowProvider>
        <FollowProbe />
      </FollowProvider>
    )

    await user.click(screen.getByRole('button', { name: 'toggle ARS' }))
    expect(list()).toBe('ARS')
  })

  it('falls back to inert behaviour with no provider', async () => {
    // Every component can be rendered standalone; the fallback must be a
    // no-op rather than a crash on a missing context.
    const user = userEvent.setup()
    render(<FollowProbe />)

    expect(list()).toBe('')
    expect(screen.getByTestId('ars')).toHaveTextContent('false')

    await user.click(screen.getByRole('button', { name: 'toggle ARS' }))
    await user.click(screen.getByRole('button', { name: 'clear' }))
    expect(list()).toBe('')
  })
})

/* ── useModalA11y ────────────────────────────────────────────────────────── */

function Modal({ onClose, children }) {
  const ref = useModalA11y(onClose)
  return (
    <div ref={ref} tabIndex={-1} data-testid="modal" role="dialog">
      {children}
    </div>
  )
}

function Harness({ onClose, children, autoOpen = true }) {
  const [open, setOpen] = useState(autoOpen)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        opener
      </button>
      {open && (
        <Modal
          onClose={() => {
            onClose?.()
            setOpen(false)
          }}
        >
          {children}
        </Modal>
      )}
    </>
  )
}

describe('useModalA11y', () => {
  const buttons = (
    <>
      <button type="button">first</button>
      <button type="button" disabled>
        skipped
      </button>
      <button type="button">last</button>
    </>
  )

  it('focuses the panel itself so the dialog is announced first', () => {
    render(<Harness>{buttons}</Harness>)
    expect(screen.getByTestId('modal')).toHaveFocus()
  })

  it('prefers an element that asks for focus', () => {
    render(
      <Harness>
        <button type="button">first</button>
        <button type="button" data-autofocus>
          search
        </button>
      </Harness>
    )
    expect(screen.getByRole('button', { name: 'search' })).toHaveFocus()
  })

  it('closes on Escape without letting the key reach anything outside', () => {
    const onClose = vi.fn()
    const outer = vi.fn()
    render(
      <div onKeyDown={outer}>
        <Harness onClose={onClose}>{buttons}</Harness>
      </div>
    )

    fireEvent.keyDown(screen.getByTestId('modal'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(outer).not.toHaveBeenCalled()
  })

  it('ignores keys that are neither Escape nor Tab', () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose}>{buttons}</Harness>)

    fireEvent.keyDown(screen.getByTestId('modal'), { key: 'a' })
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByTestId('modal')).toHaveFocus()
  })

  it('wraps Tab from the last focusable back to the first', () => {
    render(<Harness>{buttons}</Harness>)
    const last = screen.getByRole('button', { name: 'last' })
    last.focus()

    fireEvent.keyDown(screen.getByTestId('modal'), { key: 'Tab' })
    // The disabled button is not a stop, so "last" really is the end.
    expect(screen.getByRole('button', { name: 'first' })).toHaveFocus()
  })

  it('wraps Shift+Tab from the first focusable back to the last', () => {
    render(<Harness>{buttons}</Harness>)
    screen.getByRole('button', { name: 'first' }).focus()

    fireEvent.keyDown(screen.getByTestId('modal'), { key: 'Tab', shiftKey: true })
    expect(screen.getByRole('button', { name: 'last' })).toHaveFocus()
  })

  it('leaves Tab alone in the middle of the list', () => {
    render(
      <Harness>
        <button type="button">first</button>
        <button type="button">middle</button>
        <button type="button">last</button>
      </Harness>
    )
    const middle = screen.getByRole('button', { name: 'middle' })
    middle.focus()

    fireEvent.keyDown(screen.getByTestId('modal'), { key: 'Tab' })
    // The browser's own tab order handles this case; the trap must not fight it.
    expect(middle).toHaveFocus()
  })

  it('does nothing on Tab when the dialog has no focusable content', () => {
    render(
      <Harness>
        <p>nothing to focus</p>
      </Harness>
    )
    const modal = screen.getByTestId('modal')
    fireEvent.keyDown(modal, { key: 'Tab' })
    expect(modal).toHaveFocus()
  })

  it('does nothing when the ref was never attached to a node', () => {
    // A caller that returns null before rendering the panel (MatchDetail does
    // exactly this for a missing fixture) still runs the hook.
    const Unattached = () => {
      useModalA11y(vi.fn())
      return <button type="button">outside</button>
    }
    render(<Unattached />)

    // No listener anywhere, so a stray Escape does nothing at all.
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(screen.getByRole('button', { name: 'outside' })).toBeInTheDocument()
  })

  it('returns focus to whatever opened it', async () => {
    const user = userEvent.setup()
    render(<Harness autoOpen={false}>{buttons}</Harness>)

    const opener = screen.getByRole('button', { name: 'opener' })
    opener.focus()
    await user.click(opener)
    expect(screen.getByTestId('modal')).toHaveFocus()

    fireEvent.keyDown(screen.getByTestId('modal'), { key: 'Escape' })
    // Without this the viewer is dumped at the top of the document.
    expect(opener).toHaveFocus()
  })
})
