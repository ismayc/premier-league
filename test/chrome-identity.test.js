import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { LEAGUE } from '../src/config/league.js'

// index.html, public/manifest.webmanifest and package.json state this app's identity in
// files no ES module can import, so src/config/league.js cannot be their source. The
// pre-paint theme script in particular MUST stay a blocking classic script: a
// `type="module"` script is deferred by spec, and the flash of the wrong palette it
// exists to prevent would come straight back.
//
// So the duplication stays, and this file makes it a CHECKED duplicate. It earned its
// place here immediately: the browser chrome shipped #12121a against a page painting
// #15171b, the same class of drift as the-nfl-schedule's unnoticed themeColor and the
// hub's manifest.
//
// The storage prefix has a second reason to be here. test/guards.test.js matches storage
// keys with a single-quoted-literal regex, so it can only see the one in index.html, and
// it checks that against the family registry. Tying the config to index.html closes the
// chain: registry <- index.html <- LEAGUE.storageKey.
const ROOT = join(import.meta.dirname, '..')
const read = (p) => readFileSync(join(ROOT, p), 'utf8')

describe('the browser chrome agrees with src/config/league.js', () => {
  const html = read('index.html')

  it('titles the page with the app title', () => {
    // No tagline half here, unlike the US-sport siblings whose <title> reads
    // "The NFL Schedule — every game in your timezone".
    expect(html.match(/<title>([^<]+)<\/title>/)[1]).toBe(LEAGUE.title)
  })

  it('paints one background color across the page, the browser UI and the manifest', () => {
    // Dark is the family default, so the bare :root block carries the shipped color.
    const cssBg = read('src/index.css').match(/--bg:\s*(#[0-9a-f]{6})/i)[1].toLowerCase()
    const meta = html.match(/<meta\s+name="theme-color"\s+content="(#[0-9a-f]{6})"/i)[1]
    const manifest = JSON.parse(read('public/manifest.webmanifest'))

    expect(cssBg).toBe(LEAGUE.themeColor.toLowerCase())
    expect(meta.toLowerCase()).toBe(LEAGUE.themeColor.toLowerCase())
    expect(manifest.theme_color.toLowerCase()).toBe(LEAGUE.themeColor.toLowerCase())
    expect(manifest.background_color.toLowerCase()).toBe(LEAGUE.themeColor.toLowerCase())
  })

  it('reads the theme from this app own storage prefix before paint', () => {
    expect(html.match(/localStorage\.getItem\('([^']+)'\)/)[1]).toBe(`${LEAGUE.storageKey}:theme`)
  })

  it('names the installed app with the full product title', () => {
    expect(JSON.parse(read('public/manifest.webmanifest')).name).toBe(LEAGUE.title)
  })

  it('keeps the two deploy slugs apart on purpose', () => {
    // This app is `premier-league` on GitHub, on Pages and in package.json, but
    // `premier-league-viewer` on Netlify. The .ics identity follows Netlify, because
    // that is the host a subscriber's calendar actually polls; the download filename
    // follows the repo. Asserting both means the pair can neither drift further nor
    // quietly collapse into one.
    const slug = JSON.parse(read('package.json')).name
    expect(slug).toBe('premier-league')
    expect(LEAGUE.ics.filenameBase).toBe(slug)
    expect(LEAGUE.ics.domain).toBe('premier-league-viewer')
    expect(LEAGUE.ics.prodId).toBe(`-//${LEAGUE.ics.domain}//EN`)
    expect(LEAGUE.feedHost).toBe(`https://${LEAGUE.ics.domain}.netlify.app`)
  })

  it('shows the season as a bare span of years', () => {
    // The header renders this in a space sized for five characters. It used to strip
    // the competition name out of ESPN's own SEASON_LABEL with a .replace(), which
    // would have left the whole sentence there the moment upstream renamed anything.
    expect(LEAGUE.seasonLabel).toMatch(/^\d{4}-\d{2}$/)
    expect(LEAGUE.seasonLabel).not.toContain(LEAGUE.name)
    expect(LEAGUE.seasonLabel.startsWith(String(LEAGUE.season))).toBe(true)
  })
})
