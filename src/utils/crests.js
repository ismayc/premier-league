import { CLUB_CREST_SLUGS } from '../data/club-crests.js'
import { TEAMS } from '../data/teams.js'

/**
 * Current clubs by either of their names, for a club new enough to the League
 * that the hand-kept crest map does not list it yet.
 */
const CURRENT_SLUG_BY_NAME = Object.fromEntries(
  TEAMS.flatMap((t) => [t.name, t.displayName].map((n) => [n, t.slug]))
)

/**
 * The crest slug for a club named in full, as the historical tables name them.
 * Undefined when there is no crest, which TeamLogo draws as an empty circle.
 */
export const crestSlugForName = (name) => CLUB_CREST_SLUGS[name] ?? CURRENT_SLUG_BY_NAME[name]
