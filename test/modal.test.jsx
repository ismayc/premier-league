import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import Modal from '../src/components/Modal.jsx'

/**
 * The shared dialog shell (vendored from sports-viewer-meta). The app's modals
 * cover the common path through their own tests; this covers the shell's own
 * contract — including the sizing-class seam none of them currently use.
 */
describe('Modal', () => {
  it('applies the per-modal sizing class alongside the base class', () => {
    const { container } = render(
      <Modal label="Sized" className="cal-modal" onClose={() => {}}>
        <p>content</p>
      </Modal>
    )
    expect(container.querySelector('.modal.cal-modal')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Sized' })).toBeInTheDocument()
  })

  it('closes on a backdrop press but not on a press inside the sheet', () => {
    const onClose = vi.fn()
    const { container } = render(
      <Modal label="Pressable" onClose={onClose}>
        <p>content</p>
      </Modal>
    )
    fireEvent.mouseDown(screen.getByRole('dialog'))
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.mouseDown(container.querySelector('.modal-wrap'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
