/**
 * Modal keyboard behaviour: Escape closes, Tab is trapped inside, and focus
 * returns to whatever opened the dialog when it closes.
 *
 * Shared by every overlay in the app so the behaviour can't drift between
 * them — a fixture detail and a team panel should feel identical.
 */

import { useEffect, useRef } from 'react'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function useModalA11y(onClose) {
  const ref = useRef(null)

  useEffect(() => {
    const node = ref.current
    if (!node) return

    const opener = document.activeElement
    const focusables = () => [...node.querySelectorAll(FOCUSABLE)]

    // Focus the panel itself rather than its first control, so a screen reader
    // announces the dialog before its buttons.
    ;(node.querySelector('[data-autofocus]') || node).focus?.()

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose?.()
        return
      }
      if (e.key !== 'Tab') return

      const items = focusables()
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    node.addEventListener('keydown', onKeyDown)
    return () => {
      node.removeEventListener('keydown', onKeyDown)
      opener?.focus?.()
    }
  }, [onClose])

  return ref
}
