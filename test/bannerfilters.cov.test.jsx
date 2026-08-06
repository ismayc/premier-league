import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'

// The live poll is the app's only network call; mocking the module keeps applyLive
// real, exactly as the App suite does.
vi.mock('../src/services/espn.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, fetchLive: vi.fn().mockResolvedValue([]) }
})

// A three-fixture season, so the assertion is about the WIRING (FixturesView ->
// baseList -> NextMatch) and not about whatever the refresh has left in the committed
// fixture list. Everything else the data module exports is kept.
vi.mock('../src/data/fixtures.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    FIXTURES: [
      {
        id: 'unwatchable',
        ko: '2026-08-21T19:00:00.000Z',
        home: 'ARS',
        away: 'COV',
        venue: 'Emirates Stadium',
        city: 'London',
        tv: ['USA Net'],
      },
      {
        id: 'watchable',
        ko: '2026-08-22T14:00:00.000Z',
        home: 'LIV',
        away: 'EVE',
        venue: 'Anfield',
        city: 'Liverpool',
        tv: ['Peacock'],
      },
      {
        id: 'unannounced',
        ko: '2026-08-23T14:00:00.000Z',
        home: 'CHE',
        away: 'FUL',
        venue: 'Stamford Bridge',
        city: 'London',
        tv: [],
      },
    ],
  }
})

import App from '../src/App.jsx'
import { FollowProvider } from '../src/context/follow.jsx'
import { ServicesProvider } from '../src/context/services.jsx'

// Before every kickoff, so each fixture is genuinely upcoming and the banner has a
// choice to make.
const NOW = new Date('2026-08-21T12:00:00.000Z')

const mount = async () => {
  const utils = render(
    <FollowProvider>
      <ServicesProvider>
        <App />
      </ServicesProvider>
    </FollowProvider>
  )
  await act(async () => {})
  return utils
}

const banner = () => document.querySelector('.nextmatch')

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(NOW)
  Element.prototype.scrollIntoView = vi.fn()
  localStorage.clear()
  window.history.replaceState(null, '', '/')
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const chooseServices = (keys) => {
  localStorage.setItem('pl:services', JSON.stringify(keys))
  localStorage.setItem('pl:watchOnly', '1')
}

describe('the Next match banner and the services filter', () => {
  it('counts down to the true next match when no services filter is on', async () => {
    await mount()
    // Scoped to the banner: both clubs are also named on the cards below, so an
    // unscoped query matches twice.
    expect(banner().textContent).toContain('Arsenal')
    expect(banner().textContent).not.toContain('Liverpool')
  })

  it('skips a match the viewer cannot watch and counts down to the next one they can', async () => {
    // Peacock only — the earlier match is on USA Net, which no chosen service carries.
    chooseServices(['peacock'])
    await mount()

    // The banner advertises the LATER match, because it is the next one actually
    // watchable. A banner fed the unfiltered season would still be showing Arsenal
    // here — which the list below no longer carries either, so the jump would have
    // nowhere to land.
    expect(banner()).not.toBeNull()
    expect(banner().textContent).toContain('Liverpool')
    expect(banner().textContent).not.toContain('Arsenal')
  })

  it('leaves the banner alone when the watch filter is on but no service is chosen', async () => {
    // Deliberate carve-out: clearing every service must not empty the list, so the
    // filter is a no-op and the true next match is back.
    chooseServices([])
    await mount()
    expect(banner().textContent).toContain('Arsenal')
  })

  it('still offers a fixture with no announced broadcaster', async () => {
    // The PL-only carve-out, and the reason this viewer diverges from the American
    // ones: broadcasters are assigned only weeks ahead here, so "not announced yet"
    // must not be read as "you cannot watch it". Telemundo carries neither USA Net
    // nor Peacock, so the two listed matches drop out and only the unlisted one is
    // left — which the banner must still offer rather than declaring the season over.
    chooseServices(['telemundo'])
    await mount()

    expect(banner().textContent).toContain('Chelsea')
    expect(document.querySelector('.nextmatch.done')).toBeNull()
  })
})
