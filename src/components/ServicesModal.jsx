import Modal from './Modal.jsx'
import { useServices } from '../context/services.jsx'
import { SERVICE_CATALOG } from '../utils/watch.js'

/**
 * The subscription picker. Choosing services is what makes "on my services"
 * mean anything, so this is the only place the catalog is presented.
 */

const GROUPS = [
  { kind: 'stream', title: 'Streaming', hint: 'Matched by name in the listings' },
  { kind: 'bundle', title: 'Live TV', hint: 'Matched by the channels the package carries' },
]

export default function ServicesModal({ onClose }) {
  const { has, toggle, clear, count } = useServices()

  return (
    <Modal label="Choose your services" onClose={onClose}>
        <h2>My services</h2>
        <p className="modal-note">
          Pick what you subscribe to and the fixture list can be narrowed to matches you can
          actually watch. Listings are US broadcasters, and are only published a few weeks
          before kick-off.
        </p>

        {GROUPS.map((g) => (
          <div className="svc-group" key={g.kind}>
            <h3>
              {g.title} <span className="svc-hint">{g.hint}</span>
            </h3>
            <div className="pills" role="group" aria-label={g.title}>
              {SERVICE_CATALOG.filter((s) => s.kind === g.kind).map((s) => (
                <button
                  type="button"
                  key={s.key}
                  className={`pill ${has(s.key) ? 'on' : ''}`}
                  onClick={() => toggle(s.key)}
                  aria-pressed={has(s.key)}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        ))}

        <div className="svc-foot">
          <span className="svc-count">
            {count === 0 ? 'Nothing selected' : `${count} selected`}
          </span>
          {count > 0 && (
            <button type="button" className="chip" onClick={clear}>
              Clear all
            </button>
          )}
        </div>
    </Modal>
  )
}
