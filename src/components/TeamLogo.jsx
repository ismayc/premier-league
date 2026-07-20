import { TEAM_BY_ABBR } from '../data/teams.js'

/**
 * Both crest variants are rendered and CSS picks one based on the theme.
 * Swapping a `src` on theme change would re-request the image and flicker;
 * this way the switch is instant and causes no re-render at all.
 *
 * Crests are decorative here — the club name is always adjacent in text — so
 * the images are hidden from assistive technology rather than duplicating it.
 */
export default function TeamLogo({ abbr, size = 22 }) {
  const team = TEAM_BY_ABBR[abbr]
  if (!team) return <span className="logo logo-missing" style={{ width: size, height: size }} />

  const base = `${import.meta.env.BASE_URL}logos/${team.slug}`
  return (
    <span className="logo" style={{ width: size, height: size }}>
      <img className="logo-light" src={`${base}.png`} alt="" aria-hidden="true" loading="lazy" />
      <img className="logo-dark" src={`${base}-dark.png`} alt="" aria-hidden="true" loading="lazy" />
    </span>
  )
}
