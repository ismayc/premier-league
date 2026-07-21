import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { SERVICE_CATALOG } from '../utils/watch.js'

/**
 * The streaming services and TV packages this viewer says they subscribe to,
 * stored by catalog key.
 *
 * Kept per-device in localStorage and deliberately out of the shareable URL:
 * a link carrying someone else's subscriptions would filter the recipient's
 * fixture list by channels they may not have.
 */

const KEY = 'pl:services'
const VALID = new Set(SERVICE_CATALOG.map((s) => s.key))
const ServicesCtx = createContext(null)

// Inert fallback so a component (or a test) renders standalone without a
// provider — the same contract the follow context uses.
const FALLBACK = {
  services: [],
  has: () => false,
  toggle: () => {},
  clear: () => {},
  count: 0,
}

export function ServicesProvider({ children }) {
  const [services, setServices] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || '[]')
      // Drop keys the catalog no longer defines, so a stale saved value cannot
      // linger and silently filter against a service that no longer exists.
      return Array.isArray(saved) ? saved.filter((k) => VALID.has(k)) : []
    } catch {
      return []
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(services))
    } catch {
      // Private mode: the choice just will not outlive the session.
    }
  }, [services])

  const toggle = useCallback((key) => {
    if (!VALID.has(key)) return
    setServices((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))
  }, [])

  const value = useMemo(
    () => ({
      services,
      has: (key) => services.includes(key),
      toggle,
      clear: () => setServices([]),
      count: services.length,
    }),
    [services, toggle]
  )

  return <ServicesCtx.Provider value={value}>{children}</ServicesCtx.Provider>
}

export const useServices = () => useContext(ServicesCtx) || FALLBACK
