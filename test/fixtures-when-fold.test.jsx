import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import FixturesView from '../src/components/FixturesView.jsx'
import { FollowProvider } from '../src/context/follow.jsx'
import { ServicesProvider } from '../src/context/services.jsx'
import { whenBucket } from '../src/utils/time.js'

// Same anchor the sibling suite uses: a mid-season Saturday, so "today", the
// countdown and the initial matchweek are all deterministic.
const NOW = new Date('2026-09-12T09:00:00.000Z')
const TZ = 'Europe/London'

const fx = (id, ko, home, away, extra = {}) => ({
  id,
  ko,
  home,
  away,
  venue: 'Ground',
  city: 'Town',
  ...extra,
})

const LAST_WEEK = '2026-09-05T14:00:00.000Z'
const TODAY = '2026-09-12T14:00:00.000Z'
const NEXT_WEEK = '2026-09-19T14:00:00.000Z'

function Fixtures(props) {
  const [onlyFollowed, setOnlyFollowed] = useState(false)
  const [showPast, setShowPast] = useState(true)
  return (
    <FollowProvider>
      <ServicesProvider>
        <FixturesView
          onlyFollowed={onlyFollowed}
          onToggleFollowed={() => setOnlyFollowed((v) => !v)}
          showPast={showPast}
          onTogglePast={() => setShowPast((v) => !v)}
          tz={TZ}
          {...props}
        />
      </ServicesProvider>
    </FollowProvider>
  )
}

const days = () => [...document.querySelectorAll('.day')]
const openFilters = () => userEvent.click(screen.getByRole('button', { name: /Filters/ }))

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(NOW)
  Element.prototype.scrollIntoView = vi.fn()
  localStorage.clear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('whenBucket', () => {
  const ko = '2026-09-12T14:00:00.000Z'
  const at = (iso) => new Date(iso).getTime()

  it('is upcoming before kickoff', () => {
    expect(whenBucket({ ko }, at('2026-09-12T13:59:00.000Z'))).toBe('upcoming')
  })

  it('is live from kickoff, feed or no feed', () => {
    expect(whenBucket({ ko }, at('2026-09-12T14:01:00.000Z'))).toBe('live')
    expect(whenBucket({ ko, live: true }, at('2026-09-12T13:00:00.000Z'))).toBe('live')
  })

  it('is final once played, or once the match window has closed', () => {
    expect(whenBucket({ ko, score: [1, 0] }, at('2026-09-12T14:01:00.000Z'))).toBe('final')
    expect(whenBucket({ ko }, at('2026-09-12T17:00:00.000Z'))).toBe('final')
  })

  it('keeps a postponed fixture out of all three buckets', () => {
    expect(whenBucket({ ko, unplayed: 'Postponed' }, at('2026-09-12T14:01:00.000Z'))).toBe('void')
  })
})

describe('the When filter', () => {
  const list = [
    fx('played', LAST_WEEK, 'ARS', 'CHE', { score: [2, 1] }),
    fx('soon', NEXT_WEEK, 'TOT', 'EVE'),
    fx('later', '2026-09-26T14:00:00.000Z', 'LIV', 'MNC'),
  ]

  it('selects strictly different sets for finished and upcoming', async () => {
    render(<Fixtures fixtures={list} />)
    await openFilters()

    await userEvent.click(screen.getByRole('button', { name: '✓ Finished' }))
    const finished = days().length
    expect(finished).toBe(1)
    expect(within(days()[0]).getByText('Arsenal')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '⏱ Upcoming' }))
    // Two upcoming fixtures on two different days — a strictly different set, which
    // is what proves the chip filters rather than the season merely looking that way.
    expect(days().length).toBe(2)
    expect(within(days()[0]).queryByText('Arsenal')).toBeNull()
  })

  it('counts on the badge and is cleared by Clear all', async () => {
    render(<Fixtures fixtures={list} />)
    await openFilters()
    await userEvent.click(screen.getByRole('button', { name: '✓ Finished' }))
    expect(screen.getByRole('button', { name: /Filters/ })).toHaveTextContent('1')

    await userEvent.click(screen.getByRole('button', { name: /Clear all/ }))
    expect(screen.getByRole('button', { name: '✓ Finished' })).toHaveAttribute(
      'aria-pressed',
      'false'
    )
    expect(days().length).toBe(3)
  })

  it('clicking the active chip clears it', async () => {
    render(<Fixtures fixtures={list} />)
    await openFilters()
    const chip = screen.getByRole('button', { name: '⏱ Upcoming' })
    await userEvent.click(chip)
    expect(chip).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(chip)
    expect(chip).toHaveAttribute('aria-pressed', 'false')
    expect(days().length).toBe(3)
  })
})

describe('per-day folding and spoiler override', () => {
  const played = [
    fx('a', LAST_WEEK, 'ARS', 'CHE', { score: [2, 1] }),
    fx('b', TODAY, 'LIV', 'MNC', { score: [3, 0] }),
  ]

  it('folds one day and leaves the other alone', () => {
    render(<Fixtures fixtures={played} />)
    const [first, second] = days()
    expect(first.querySelector('.day-list')).not.toBeNull()

    fireEvent.click(within(first).getByRole('button', { name: /^Hide fixtures on/ }))

    expect(first.querySelector('.day-list')).toBeNull()
    expect(first.querySelector('.day-caret').textContent).toBe('▸')
    expect(second.querySelector('.day-list')).not.toBeNull()
  })

  it('unfolds again', () => {
    render(<Fixtures fixtures={played} />)
    const first = days()[0]
    const fold = () => within(first).getByRole('button', { name: /fixtures on/ })
    fireEvent.click(fold())
    expect(first.querySelector('.day-list')).toBeNull()
    fireEvent.click(fold())
    expect(first.querySelector('.day-list')).not.toBeNull()
  })

  const scoresOn = (day) => day.querySelectorAll('.mc-score').length > 0

  it('reveals one day while spoiler-free mode stays on elsewhere', () => {
    render(<Fixtures fixtures={played} hideScores />)
    const [first, second] = days()
    expect(scoresOn(first)).toBe(false)

    fireEvent.click(within(first).getByTitle('Show scores for this day'))

    expect(scoresOn(first)).toBe(true)
    expect(scoresOn(second)).toBe(false)
  })

  it('hides one day while the rest show', () => {
    render(<Fixtures fixtures={played} />)
    const [first, second] = days()
    expect(scoresOn(first)).toBe(true)

    fireEvent.click(within(first).getByTitle('Hide scores for this day'))

    expect(scoresOn(first)).toBe(false)
    expect(scoresOn(second)).toBe(true)
  })

  it('toggles back to the global default', () => {
    render(<Fixtures fixtures={played} hideScores />)
    const first = days()[0]
    fireEvent.click(within(first).getByTitle('Show scores for this day'))
    expect(scoresOn(first)).toBe(true)
    fireEvent.click(within(first).getByTitle('Hide scores for this day'))
    expect(scoresOn(first)).toBe(false)
  })
})

describe('the banner jump', () => {
  it('scrolls to the day holding the next fixture', () => {
    render(<Fixtures fixtures={[fx('c', NEXT_WEEK, 'TOT', 'EVE')]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Jump to it ↓' }))
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
  })

  it('stacks simultaneous kickoffs and jumps from a row', () => {
    render(
      <Fixtures
        fixtures={[
          fx('c', NEXT_WEEK, 'TOT', 'EVE'),
          fx('d', NEXT_WEEK, 'ARS', 'CHE'),
        ]}
      />
    )
    const banner = document.querySelector('.nextmatch-stack')
    expect(banner).not.toBeNull()
    expect(within(banner).getByText('2 matches at once')).toBeInTheDocument()
    fireEvent.click(banner.querySelector('.nm-live-row'))
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
  })

  it('stacks several live matches under one live header', () => {
    render(
      <Fixtures
        fixtures={[
          fx('c', TODAY, 'TOT', 'EVE', { live: true }),
          fx('d', TODAY, 'ARS', 'CHE', { live: true }),
        ]}
      />
    )
    const banner = document.querySelector('.nextmatch.is-live')
    expect(banner).not.toBeNull()
    expect(within(banner).getByText('🔴 Live now')).toBeInTheDocument()
    expect(within(banner).getByText('2 matches')).toBeInTheDocument()
  })

  it('a followed club playing live wins outright over the other live matches', () => {
    localStorage.setItem('pl:followed', JSON.stringify(['ARS']))
    render(
      <Fixtures
        fixtures={[
          fx('c', TODAY, 'TOT', 'EVE', { live: true }),
          fx('d', TODAY, 'ARS', 'CHE', { live: true }),
        ]}
      />
    )
    const banner = document.querySelector('.nextmatch.is-live')
    // Both are live, but only the followed one is on the card — and because it is a
    // single match it is the full card, not a stacked row.
    expect(within(banner).getByText('Arsenal')).toBeInTheDocument()
    expect(within(banner).queryByText('Spurs')).toBeNull()
    expect(banner.classList.contains('nextmatch-stack')).toBe(false)
  })

  it('a followed club takes the banner over from an earlier kickoff', () => {
    localStorage.setItem('pl:followed', JSON.stringify(['LIV']))
    render(
      <Fixtures
        fixtures={[
          fx('c', NEXT_WEEK, 'TOT', 'EVE'),
          fx('d', '2026-09-26T14:00:00.000Z', 'LIV', 'MNC'),
        ]}
      />
    )
    const banner = document.querySelector('.nextmatch')
    expect(within(banner).getByText('⭐ Your next match')).toBeInTheDocument()
    expect(within(banner).getByText('Liverpool')).toBeInTheDocument()
  })
})
