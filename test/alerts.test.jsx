import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { detectEvents, eventKey, EVENT_KINDS } from '../src/services/alerts.js'
import Toasts from '../src/components/Toasts.jsx'

/**
 * Alerts are a diff of two poll snapshots, so every case here is a pair of
 * fixture lists. The interesting cases are the ones that must NOT fire: a
 * first load, a match nobody follows, and a moment already reported.
 */

const fx = (over = {}) => ({
  id: '1',
  ko: '2026-09-12T14:00:00.000Z',
  home: 'ARS',
  away: 'CHE',
  ...over,
})

const pre = (over) => fx({ live: false, ...over })
const live = (score, over) => fx({ live: true, score, ...over })

describe('detectEvents', () => {
  it('reports nothing on first load, so an in-progress match is not replayed', () => {
    expect(detectEvents(null, [live([1, 0])])).toEqual([])
  })

  it('ignores a fixture the previous snapshot had never seen', () => {
    expect(detectEvents([], [live([1, 0])])).toEqual([])
  })

  it('reports kick-off when a match goes live', () => {
    const [e] = detectEvents([pre()], [live([0, 0])])
    expect(e).toMatchObject({ kind: 'kickoff', id: '1' })
  })

  it('reports a goal for whichever side scored', () => {
    const home = detectEvents([live([0, 0])], [live([1, 0])])
    expect(home).toHaveLength(1)
    expect(home[0]).toMatchObject({ kind: 'goal', scorer: 'ARS', score: [1, 0] })

    const away = detectEvents([live([1, 0])], [live([1, 1])])
    expect(away[0]).toMatchObject({ kind: 'goal', scorer: 'CHE', score: [1, 1] })
  })

  it('reports both goals when two land between polls', () => {
    const found = detectEvents([live([0, 0])], [live([1, 1])])
    expect(found.map((e) => e.scorer)).toEqual(['ARS', 'CHE'])
  })

  it('reports a dismissal once per new card', () => {
    const before = live([1, 0], { reds: [{ side: 'home', player: 'A. One', clock: "20'" }] })
    const after = live([1, 0], {
      reds: [
        { side: 'home', player: 'A. One', clock: "20'" },
        { side: 'away', player: 'B. Two', clock: "44'" },
      ],
    })
    const found = detectEvents([before], [after])
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ kind: 'red', index: 1 })
    expect(found[0].red.player).toBe('B. Two')
  })

  it('counts a first dismissal against a match that had none', () => {
    const found = detectEvents([live([0, 0])], [live([0, 0], { reds: [{ side: 'home' }] })])
    expect(found[0]).toMatchObject({ kind: 'red', index: 0 })
  })

  it('reports full time and nothing else, so a late winner is one moment', () => {
    const before = live([1, 1])
    const after = fx({ live: false, final: true, score: [2, 1] })
    const found = detectEvents([before], [after])
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ kind: 'final', score: [2, 1] })
  })

  it('stays quiet while a match has not started or has long finished', () => {
    expect(detectEvents([pre()], [pre()])).toEqual([])
  })

  it('ignores a match abandoned or postponed between polls', () => {
    const found = detectEvents([live([1, 0])], [fx({ live: false, unplayed: 'Postponed' })])
    expect(found).toEqual([])
  })

  it('needs a score on both sides of the diff before it claims a goal', () => {
    // A live match whose score the feed has not published yet must not read as
    // a goal the moment the score first appears.
    const found = detectEvents([fx({ live: true })], [live([1, 0])])
    expect(found).toEqual([])
  })

  it('narrows to followed clubs when any are followed', () => {
    const teams = new Set(['LIV'])
    expect(detectEvents([pre()], [live([0, 0])], { teams })).toEqual([])

    const mine = new Set(['ARS'])
    expect(detectEvents([pre()], [live([0, 0])], { teams: mine })).toHaveLength(1)
  })

  it('does not filter when nothing is followed', () => {
    expect(detectEvents([pre()], [live([0, 0])], { teams: new Set() })).toHaveLength(1)
  })

  it('exposes the kinds it can produce', () => {
    expect(EVENT_KINDS).toEqual(['kickoff', 'goal', 'red', 'final'])
  })
})

describe('eventKey', () => {
  it('separates two goals in the same match', () => {
    const first = eventKey({ id: '1', kind: 'goal', score: [1, 0], scorer: 'ARS' })
    const second = eventKey({ id: '1', kind: 'goal', score: [2, 0], scorer: 'ARS' })
    expect(first).not.toBe(second)
  })

  it('separates two dismissals in the same match', () => {
    expect(eventKey({ id: '1', kind: 'red', index: 0 })).not.toBe(
      eventKey({ id: '1', kind: 'red', index: 1 })
    )
  })

  it('is stable for kick-off and full time', () => {
    expect(eventKey({ id: '1', kind: 'kickoff' })).toBe('1:kickoff')
    expect(eventKey({ id: '1', kind: 'final' })).toBe('1:final')
  })
})

describe('Toasts', () => {
  const withKey = (e) => ({ ...e, key: eventKey(e) })

  it('renders nothing when there is nothing to say', () => {
    const { container } = render(<Toasts events={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('describes each kind of moment', () => {
    const f = fx()
    render(
      <Toasts
        events={[
          withKey({ id: '1', kind: 'kickoff', fixture: f }),
          withKey({ id: '2', kind: 'goal', fixture: f, scorer: 'ARS', score: [1, 0] }),
          withKey({
            id: '3',
            kind: 'red',
            fixture: f,
            index: 0,
            red: { side: 'away', player: 'B. Two', clock: "44'" },
          }),
          withKey({ id: '4', kind: 'final', fixture: f, score: [2, 1] }),
        ]}
      />
    )

    expect(screen.getByText('Kick-off')).toBeInTheDocument()
    expect(screen.getByText(/Arsenal v Chelsea/)).toBeInTheDocument()
    expect(screen.getByText(/Arsenal — 1–0/)).toBeInTheDocument()
    expect(screen.getByText(/B\. Two \(Chelsea\) 44'/)).toBeInTheDocument()
    expect(screen.getByText(/Arsenal 2–1 Chelsea/)).toBeInTheDocument()
  })

  it('names the home club for a dismissal on that side', () => {
    render(
      <Toasts
        events={[
          withKey({
            id: '1',
            kind: 'red',
            fixture: fx(),
            index: 0,
            red: { side: 'home', player: 'A. One', clock: "20'" },
          }),
        ]}
      />
    )
    expect(screen.getByText(/A\. One \(Arsenal\)/)).toBeInTheDocument()
  })

  it('falls back to the club alone when the feed names no player or minute', () => {
    render(
      <Toasts
        events={[withKey({ id: '1', kind: 'red', fixture: fx(), index: 0, red: { side: 'home' } })]}
      />
    )
    // No trailing minute, and the club stands in for the missing name.
    expect(screen.getByText('Arsenal')).toBeInTheDocument()
  })

  it("falls back to the abbreviation for a club it has no record of", () => {
    // A fixture list reaching outside the current league (or a feed naming an
    // unfamiliar side) still has to render something readable.
    render(
      <Toasts events={[withKey({ id: "1", kind: "kickoff", fixture: fx({ home: "ZZZ" }) })]} />
    )
    expect(screen.getByText(/ZZZ v Chelsea/)).toBeInTheDocument()
  })

  it('opens the match it came from, and dismisses on request', () => {
    const onOpen = vi.fn()
    const onDismiss = vi.fn()
    const f = fx()
    const event = withKey({ id: '1', kind: 'kickoff', fixture: f })

    render(<Toasts events={[event]} onOpen={onOpen} onDismiss={onDismiss} />)

    fireEvent.click(screen.getByText('Kick-off'))
    expect(onOpen).toHaveBeenCalledWith(f)

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(onDismiss).toHaveBeenCalledWith(event.key)
  })

  it('survives a toast rendered without handlers', () => {
    render(<Toasts events={[withKey({ id: '1', kind: 'kickoff', fixture: fx() })]} />)
    fireEvent.click(screen.getByText('Kick-off'))
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.getByText('Kick-off')).toBeInTheDocument()
  })
})
