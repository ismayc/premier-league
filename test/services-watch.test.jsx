import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { SERVICE_BY_KEY, SERVICE_CATALOG, watchableServices } from '../src/utils/watch.js'
import { ServicesProvider, useServices } from '../src/context/services.jsx'
import ServicesModal from '../src/components/ServicesModal.jsx'

/**
 * The watch catalog, the per-device store behind it, and the picker.
 *
 * The broadcast strings here are the ones ESPN actually emits for this feed
 * ("USA Net", "Tele"), not tidied-up channel names — matching the tidied
 * version would mean the filter silently never fires.
 */

describe('watchableServices', () => {
  it('matches a streaming service by its own name', () => {
    const found = watchableServices(['Peacock'], ['peacock'])
    expect(found.map((s) => s.key)).toEqual(['peacock'])
  })

  it('matches a bundle by the networks it carries, not by name', () => {
    // "YouTube TV" never appears in a listing; USA Net does.
    const found = watchableServices(['USA Net'], ['youtubetv'])
    expect(found.map((s) => s.key)).toEqual(['youtubetv'])
  })

  it('follows an overflow match onto whichever NBC channel took it', () => {
    for (const net of ['NBC', 'USA Net', 'CNBC', 'SYFY', 'NBCSN']) {
      expect(watchableServices([net], ['cable'])).toHaveLength(1)
    }
  })

  it('treats the Spanish-language channels as one choice', () => {
    expect(watchableServices(['Tele'], ['telemundo'])).toHaveLength(1)
    expect(watchableServices(['Universo'], ['telemundo'])).toHaveLength(1)
  })

  it('does not match a service that carries none of the listed channels', () => {
    // Sling is defined without the Spanish channels.
    expect(watchableServices(['Tele'], ['sling'])).toEqual([])
    expect(watchableServices(['Peacock'], ['cable'])).toEqual([])
  })

  it('returns nothing when the listing or the selection is empty', () => {
    expect(watchableServices([], ['peacock'])).toEqual([])
    expect(watchableServices(undefined, ['peacock'])).toEqual([])
    expect(watchableServices(['Peacock'], [])).toEqual([])
    expect(watchableServices(['Peacock'], undefined)).toEqual([])
  })

  it('reports every matching service, in catalog order', () => {
    const found = watchableServices(['USA Net'], ['cable', 'youtubetv'])
    expect(found.map((s) => s.key)).toEqual(['youtubetv', 'cable'])
  })

  it('indexes the catalog by key', () => {
    expect(SERVICE_BY_KEY.peacock.label).toBe('Peacock')
    expect(Object.keys(SERVICE_BY_KEY)).toHaveLength(SERVICE_CATALOG.length)
  })
})

/* ── The per-device store ────────────────────────────────────────────────── */

function Probe() {
  const { services, has, toggle, clear, count } = useServices()
  return (
    <div>
      <span data-testid="list">{services.join(',')}</span>
      <span data-testid="count">{count}</span>
      <span data-testid="has">{String(has('peacock'))}</span>
      <button onClick={() => toggle('peacock')}>toggle peacock</button>
      <button onClick={() => toggle('nonsense')}>toggle nonsense</button>
      <button onClick={clear}>clear</button>
    </div>
  )
}

const renderProbe = () =>
  render(
    <ServicesProvider>
      <Probe />
    </ServicesProvider>
  )

describe('ServicesProvider', () => {
  beforeEach(() => localStorage.clear())

  it('starts empty and records a choice', () => {
    renderProbe()
    expect(screen.getByTestId('count')).toHaveTextContent('0')

    fireEvent.click(screen.getByText('toggle peacock'))
    expect(screen.getByTestId('list')).toHaveTextContent('peacock')
    expect(screen.getByTestId('has')).toHaveTextContent('true')
    expect(JSON.parse(localStorage.getItem('pl:services'))).toEqual(['peacock'])
  })

  it('toggles a choice back off, and clears them all', () => {
    renderProbe()
    fireEvent.click(screen.getByText('toggle peacock'))
    fireEvent.click(screen.getByText('toggle peacock'))
    expect(screen.getByTestId('count')).toHaveTextContent('0')

    fireEvent.click(screen.getByText('toggle peacock'))
    fireEvent.click(screen.getByText('clear'))
    expect(screen.getByTestId('count')).toHaveTextContent('0')
  })

  it('refuses a key the catalog does not define', () => {
    renderProbe()
    fireEvent.click(screen.getByText('toggle nonsense'))
    expect(screen.getByTestId('count')).toHaveTextContent('0')
  })

  it('restores a saved choice', () => {
    localStorage.setItem('pl:services', JSON.stringify(['peacock', 'fubo']))
    renderProbe()
    expect(screen.getByTestId('count')).toHaveTextContent('2')
  })

  it('drops saved keys the catalog no longer defines', () => {
    localStorage.setItem('pl:services', JSON.stringify(['peacock', 'nbcsports-gold']))
    renderProbe()
    expect(screen.getByTestId('list')).toHaveTextContent('peacock')
    expect(screen.getByTestId('count')).toHaveTextContent('1')
  })

  it('ignores a saved value that is not a list', () => {
    localStorage.setItem('pl:services', JSON.stringify({ peacock: true }))
    renderProbe()
    expect(screen.getByTestId('count')).toHaveTextContent('0')
  })

  it('survives unreadable storage', () => {
    localStorage.setItem('pl:services', 'not json')
    renderProbe()
    expect(screen.getByTestId('count')).toHaveTextContent('0')
  })

  it('still works when storage refuses the write', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError')
    })
    renderProbe()
    fireEvent.click(screen.getByText('toggle peacock'))
    expect(screen.getByTestId('count')).toHaveTextContent('1')
  })

  it('renders inert without a provider, rather than throwing', () => {
    render(<Probe />)
    expect(screen.getByTestId('count')).toHaveTextContent('0')
    expect(screen.getByTestId('has')).toHaveTextContent('false')
    // The no-op handlers must be callable.
    fireEvent.click(screen.getByText('toggle peacock'))
    fireEvent.click(screen.getByText('clear'))
    expect(screen.getByTestId('count')).toHaveTextContent('0')
  })
})

/* ── The picker ──────────────────────────────────────────────────────────── */

describe('ServicesModal', () => {
  beforeEach(() => localStorage.clear())

  const open = (onClose = () => {}) =>
    render(
      <ServicesProvider>
        <ServicesModal onClose={onClose} />
      </ServicesProvider>
    )

  it('groups streaming apart from live TV packages', () => {
    open()
    const streaming = screen.getByRole('group', { name: 'Streaming' })
    expect(within(streaming).getByRole('button', { name: 'Peacock' })).toBeInTheDocument()

    const liveTv = screen.getByRole('group', { name: 'Live TV' })
    expect(within(liveTv).getByRole('button', { name: 'Fubo' })).toBeInTheDocument()
  })

  it('records a pick and reports how many are selected', () => {
    open()
    expect(screen.getByText('Nothing selected')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Peacock' }))
    expect(screen.getByRole('button', { name: 'Peacock' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('1 selected')).toBeInTheDocument()
  })

  it('offers Clear all only once something is selected', () => {
    open()
    expect(screen.queryByRole('button', { name: 'Clear all' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Peacock' }))
    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }))
    expect(screen.getByText('Nothing selected')).toBeInTheDocument()
  })

  it('closes from the button and from the backdrop', () => {
    const onClose = vi.fn()
    open(onClose)

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalled()

    fireEvent.click(screen.getByRole('presentation'))
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('does not close when the dialog itself is clicked', () => {
    const onClose = vi.fn()
    open(onClose)
    fireEvent.click(screen.getByRole('dialog'))
    expect(onClose).not.toHaveBeenCalled()
  })
})
