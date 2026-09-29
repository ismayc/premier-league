import { formatStamp, timeOf } from '../utils/time.js'

// The footer's two clocks, which answer different questions:
//
//   "Data as of"           when the committed snapshot (fixtures, results, statistics,
//                          history) last changed. It comes from src/data/meta.js, which
//                          the refresh rewrites only when the data changes, so an old
//                          date here means the refresh pipeline has stalled.
//   "Live scores checked"  when the browser's live ESPN poll last succeeded. It overlays
//                          current matches only.
//
// Both render in the viewer's selected zone. Either one is left out when it is unknown.
export default function FooterTimes({ dataAt, checkedAt, tz }) {
  const data = formatStamp(dataAt, tz)
  const parts = []
  if (data) parts.push(`Data as of ${data}`)
  if (checkedAt) parts.push(`Live scores checked ${timeOf(checkedAt.toISOString(), tz)}`)
  if (!parts.length) return null
  return <span className="dim">{parts.join(' · ')}</span>
}
