import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

vi.mock('../src/components/Lineups.jsx', () => ({ default: () => null }))
import MatchCard from '../src/components/MatchCard.jsx'
import MatchDetail from '../src/components/MatchDetail.jsx'
import { FollowProvider } from '../src/context/follow.jsx'

// ESPN lists no channel until a few days before a match. Only a match still to come may
// say so: on a kickoff already past, the tag would read as a channel still to come.
afterEach(cleanup)

const TZ = 'America/New_York'
const DAY = 86400e3
const fixture = (o = {}) => ({
  id: '1',
  ko: new Date(Date.now() + 2 * DAY).toISOString(),
  home: 'ARS',
  away: 'LIV',
  round: 1,
  ...o,
})
const card = (f) => render(<FollowProvider><MatchCard fixture={f} tz={TZ} /></FollowProvider>)
const detail = (f) =>
  render(<FollowProvider><MatchDetail fixture={f} fixtures={[f]} tz={TZ} onClose={() => {}} /></FollowProvider>)
const past = new Date(Date.now() - 2 * DAY).toISOString()

describe('Channel TBA', () => {
  it('tags a match still to come with no channel, on the card and in the detail', () => {
    card(fixture())
    expect(screen.getByText('Channel TBA')).toHaveClass('net-tba')
    cleanup()
    detail(fixture())
    expect(screen.getByText('Channel TBA')).toBeInTheDocument()
  })

  it('drops the tag once a channel is listed', () => {
    card(fixture({ tv: ['NBC'] }))
    expect(screen.queryByText('Channel TBA')).toBeNull()
    cleanup()
    detail(fixture({ tv: ['NBC'] }))
    expect(screen.queryByText('Channel TBA')).toBeNull()
  })

  it('never tags a kickoff already past, scored or not', () => {
    for (const f of [fixture({ ko: past }), fixture({ ko: past, score: [1, 0] })]) {
      card(f)
      expect(screen.queryByText('Channel TBA')).toBeNull()
      cleanup()
      detail(f)
      expect(screen.queryByText('Channel TBA')).toBeNull()
      cleanup()
    }
  })
})
