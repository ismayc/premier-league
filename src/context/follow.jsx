/**
 * Followed clubs.
 *
 * The one piece of state that is genuinely cross-cutting — the fixture list,
 * the table, and the calendar export all care about it — so it is the one
 * piece that gets a context instead of a prop.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

const KEY = 'pl:followed'
const FollowCtx = createContext(null)

// An inert fallback lets any component render standalone in a test without
// being wrapped in a provider.
const FALLBACK = {
  followed: new Set(),
  isFollowed: () => false,
  toggle: () => {},
  clear: () => {},
}

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]')
    return new Set(Array.isArray(raw) ? raw : [])
  } catch {
    return new Set()
  }
}

export function FollowProvider({ children }) {
  const [followed, setFollowed] = useState(load)

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify([...followed]))
    } catch {
      // Private browsing, quota, or a disabled store — following still works
      // for this session, it just won't survive a reload.
    }
  }, [followed])

  const toggle = useCallback((abbr) => {
    setFollowed((prev) => {
      const next = new Set(prev)
      next.has(abbr) ? next.delete(abbr) : next.add(abbr)
      return next
    })
  }, [])

  const clear = useCallback(() => setFollowed(new Set()), [])

  const value = useMemo(
    () => ({ followed, isFollowed: (a) => followed.has(a), toggle, clear }),
    [followed, toggle, clear]
  )

  return <FollowCtx.Provider value={value}>{children}</FollowCtx.Provider>
}

export function useFollow() {
  return useContext(FollowCtx) || FALLBACK
}
