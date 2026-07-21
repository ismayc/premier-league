import { useModalA11y } from '../hooks/useModalA11y.js'

// Copied from sports-viewer-meta core/components/Modal.jsx — the family's one dialog
// shell. Do not edit locally; fix it there and re-copy.
//
// Backdrop closes on a true outside PRESS (mousedown on the wrap), not on click —
// so a text-selection drag that ends on the backdrop no longer dismisses the dialog,
// which the hand-rolled onClick shells got wrong. role=dialog with aria-modal, the
// a11y hook (escape, focus trap, focus restore), and the ✕ button. Content is
// entirely the caller's; pass className for the per-modal sizing class.
//
// Styling contract: .modal-wrap is the fixed backdrop, .modal the sheet, .modal-x
// the close button.
export default function Modal({ label, className = '', onClose, children }) {
  const ref = useModalA11y(onClose)
  return (
    <div className="modal-wrap" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className={className ? `modal ${className}` : 'modal'}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        ref={ref}
        tabIndex={-1}
      >
        <button className="modal-x" onClick={onClose} aria-label="Close">
          ✕
        </button>
        {children}
      </div>
    </div>
  )
}
