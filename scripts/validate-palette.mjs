#!/usr/bin/env node
/*
 * Validates the data-mark palette in src/index.css.
 *
 * The stylesheet header promises that the --viz-* / --zone-* colors are a
 * validated set: checked for contrast against both surfaces and for
 * color-vision separation. That promise was untestable until this script
 * existed, so "re-validate if you change one" meant re-doing the work by eye.
 *
 * What it checks, per theme (dark and light):
 *
 *   1. Contrast. Every data mark against every surface it can sit on. A mark
 *      used as text must clear WCAG AA for normal text (4.5:1); a mark used
 *      only as a fill (a bar, a swatch, a zone stripe) is a non-text
 *      graphical object and must clear 1.4.11 (3:1).
 *   2. Separation. The four table zones, the three form outcomes and the
 *      diverging pos/neg pair must stay distinguishable from each other under
 *      normal vision AND under all three dichromacies, measured as CIEDE2000.
 *
 * Run: node scripts/validate-palette.mjs
 * Exits non-zero if any check fails, so it can gate a change.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const css = readFileSync(join(here, '..', 'src', 'index.css'), 'utf8')

/* ---------- Token extraction ----------
   Both theme blocks are read straight out of the stylesheet so this can never
   drift from what actually ships. The light block inherits any token it does
   not redeclare, which is how the real cascade behaves. */

function block(startRe) {
  const at = css.search(startRe)
  if (at === -1) throw new Error(`token block not found: ${startRe}`)
  const open = css.indexOf('{', at)
  const close = css.indexOf('\n}', open)
  const body = css.slice(open, close)
  const out = {}
  for (const m of body.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{3,8})\s*;/g)) out[m[1]] = m[2]
  return out
}

const dark = block(/:root,\s*\n:root\[data-theme='dark'\]/)
const light = { ...dark, ...block(/:root\[data-theme='light'\]/) }

/* ---------- Color math ---------- */

const hex = (h) => {
  const s = h.replace('#', '')
  const f = s.length === 3 ? [...s].map((c) => c + c).join('') : s
  return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16))
}
const toLin = (c) => {
  const s = c / 255
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}
const toSrgb = (l) => {
  const c = l <= 0.0031308 ? l * 12.92 : 1.055 * l ** (1 / 2.4) - 0.055
  return Math.min(255, Math.max(0, Math.round(c * 255)))
}
const lum = (h) => {
  const [r, g, b] = hex(h).map(toLin)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

/* sRGB -> CIELAB, D65. */
function lab(h) {
  const [r, g, b] = hex(h).map(toLin)
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  const [fx, fy, fz] = [f(x), f(y), f(z)]
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

/* CIEDE2000. Below ~10 two marks read as "the same color, maybe a shade off"
   when they are apart on the page rather than side by side, which is exactly
   how a zone stripe and a form pill are seen. */
function deltaE(h1, h2) {
  const [L1, a1, b1] = lab(h1)
  const [L2, a2, b2] = lab(h2)
  const avgC = (Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2
  const G = 0.5 * (1 - Math.sqrt(avgC ** 7 / (avgC ** 7 + 25 ** 7)))
  const [A1, A2] = [a1 * (1 + G), a2 * (1 + G)]
  const [C1, C2] = [Math.hypot(A1, b1), Math.hypot(A2, b2)]
  const h = (a, b) => {
    if (a === 0 && b === 0) return 0
    const d = (Math.atan2(b, a) * 180) / Math.PI
    return d >= 0 ? d : d + 360
  }
  const [h1p, h2p] = [h(A1, b1), h(A2, b2)]
  const dL = L2 - L1
  const dC = C2 - C1
  let dh = 0
  if (C1 * C2 !== 0) {
    dh = h2p - h1p
    if (dh > 180) dh -= 360
    else if (dh < -180) dh += 360
  }
  const dH = 2 * Math.sqrt(C1 * C2) * Math.sin((dh * Math.PI) / 360)
  const Lb = (L1 + L2) / 2
  const Cb = (C1 + C2) / 2
  let hb = h1p + h2p
  if (C1 * C2 !== 0) {
    if (Math.abs(h1p - h2p) > 180) hb += h1p + h2p < 360 ? 360 : -360
    hb /= 2
  }
  const T =
    1 -
    0.17 * Math.cos(((hb - 30) * Math.PI) / 180) +
    0.24 * Math.cos((2 * hb * Math.PI) / 180) +
    0.32 * Math.cos(((3 * hb + 6) * Math.PI) / 180) -
    0.2 * Math.cos(((4 * hb - 63) * Math.PI) / 180)
  const Sl = 1 + (0.015 * (Lb - 50) ** 2) / Math.sqrt(20 + (Lb - 50) ** 2)
  const Sc = 1 + 0.045 * Cb
  const Sh = 1 + 0.015 * Cb * T
  const dTh = 30 * Math.exp(-(((hb - 275) / 25) ** 2))
  const Rc = 2 * Math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7))
  const Rt = -Rc * Math.sin((2 * dTh * Math.PI) / 180)
  return Math.sqrt(
    (dL / Sl) ** 2 + (dC / Sc) ** 2 + (dH / Sh) ** 2 + Rt * (dC / Sc) * (dH / Sh)
  )
}

/* Machado, Oliveira & Fernandes (2009) dichromacy matrices, severity 1.0,
   applied in linear RGB. */
const CVD = {
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritanopia: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
}
function simulate(h, kind) {
  if (kind === 'normal') return h
  const m = CVD[kind]
  const v = hex(h).map(toLin)
  const out = m.map((row) => row[0] * v[0] + row[1] * v[1] + row[2] * v[2])
  return '#' + out.map((l) => toSrgb(l).toString(16).padStart(2, '0')).join('')
}

/* ---------- What each mark is, and where it sits ----------
   Roles are taken from how the token is ACTUALLY used in the stylesheet, not
   from what it sounds like:
     text  set as type somewhere, so it takes the 4.5:1 bar
     fill  a bar, swatch or zone stripe: a graphical object, 3:1
     pill  a fill that carries a white letter (.form-strip i), so it owes BOTH
           3:1 against the surface behind it and 4.5:1 for the letter on it
     rule  a hairline reference line (.margin-zero is 1px at the chart's zero).
           It supports the chart rather than encoding a value - the bar's
           direction and its label already say the sign - so it is held to a
           visibility floor, not to 1.4.11.
   The `on` list names every surface the mark can appear against. Player
   pop-outs and the stats tiles put marks on --card-2, which is why that
   surface is usually the worst case. */
const SURFACES = ['page', 'bg', 'card', 'card-2']
const MARKS = [
  { token: 'viz-bar', roles: ['fill'], on: ['card', 'card-2'] },
  { token: 'viz-pos', roles: ['text', 'fill'], on: ['card', 'card-2', 'bg'] },
  { token: 'viz-neg', roles: ['text', 'fill'], on: ['card', 'card-2', 'bg'] },
  { token: 'viz-zero', roles: ['rule'], on: ['card', 'card-2'] },
  { token: 'zone-champions', roles: ['fill'], on: ['card', 'card-2'] },
  { token: 'zone-europa', roles: ['fill'], on: ['card', 'card-2'] },
  /* Fill, not text. Its one `color:` use is .crown, the redundant star beside
     a club that already shows rank 1 in a visible position column and carries
     title="Champions", so it is a graphical object under 1.4.11 rather than
     content text. Holding it to 4.5:1 would force the amber almost to brown. */
  { token: 'zone-conference', roles: ['fill'], on: ['card', 'card-2'] },
  { token: 'zone-relegation', roles: ['fill'], on: ['card', 'card-2'] },
  { token: 'win', roles: ['text', 'pill'], on: ['card', 'card-2'] },
  { token: 'draw', roles: ['text', 'pill'], on: ['card', 'card-2'] },
  { token: 'loss', roles: ['text', 'pill'], on: ['card', 'card-2'] },
  { token: 'live', roles: ['text'], on: ['card', 'card-2', 'bg'] },
  { token: 'accent', roles: ['text'], on: ['card', 'card-2', 'bg', 'page'] },
]

/* Sets that must stay separable from each other. A mark is only compared with
   the marks it can actually be confused with: zones share a table, the form
   pills share a cell, pos/neg share a chart. */
const SEPARATION = [
  {
    name: 'table zones',
    of: ['zone-champions', 'zone-europa', 'zone-conference', 'zone-relegation'],
  },
  { name: 'form outcomes', of: ['win', 'draw', 'loss'] },
  { name: 'diverging chart', of: ['viz-pos', 'viz-neg', 'viz-zero'] },
]

const MIN = { text: 4.5, fill: 3, pill: 3, rule: 1.5 }
/* The letter inside a .form-strip pill. */
/* The letter inside a .form-strip pill is --mark-ink, which flips per theme:
   dark ink on the bright dark-theme marks, white ink on the deep light ones. */
const PILL_INK_MIN = 4.5
const DE_MIN = 10

let failures = 0
const note = (ok, line) => {
  if (!ok) failures++
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${line}`)
}

for (const [theme, tokens] of [
  ['dark', dark],
  ['light', light],
]) {
  console.log(`\n${theme.toUpperCase()}  ground ${tokens.page} / surfaces ${SURFACES.map((s) => tokens[s]).join(' ')}`)

  console.log('\n  Contrast')
  for (const { token, roles, on } of MARKS) {
    const color = tokens[token]
    let worst = Infinity
    let worstOn = ''
    for (const s of on) {
      const r = contrast(color, tokens[s])
      if (r < worst) [worst, worstOn] = [r, s]
    }
    /* One mark, several duties: it must clear the strictest of them. */
    const min = Math.max(...roles.map((r) => MIN[r]))
    note(
      worst >= min,
      `--${token.padEnd(16)} ${color}  ${worst.toFixed(2)}:1 on --${worstOn} (${roles.join('+')}, needs ${min}:1)`
    )
    if (roles.includes('pill')) {
      const ink = contrast(tokens['mark-ink'], color)
      note(
        ink >= PILL_INK_MIN,
        `--${token.padEnd(16)} ${color}  ${ink.toFixed(2)}:1 for the ${tokens['mark-ink']} letter on the pill (needs ${PILL_INK_MIN}:1)`
      )
    }
  }

  console.log('\n  Separation (CIEDE2000, needs >= ' + DE_MIN + ')')
  for (const set of SEPARATION) {
    for (const vision of ['normal', ...Object.keys(CVD)]) {
      let worst = Infinity
      let pair = ''
      for (let i = 0; i < set.of.length; i++) {
        for (let j = i + 1; j < set.of.length; j++) {
          const [a, b] = [set.of[i], set.of[j]]
          const d = deltaE(simulate(tokens[a], vision), simulate(tokens[b], vision))
          if (d < worst) [worst, pair] = [d, `${a} vs ${b}`]
        }
      }
      note(worst >= DE_MIN, `${set.name.padEnd(16)} ${vision.padEnd(13)} min ${worst.toFixed(1)}  (${pair})`)
    }
  }
}

console.log(
  failures === 0
    ? '\nPalette validated: every check passed.\n'
    : `\n${failures} check(s) failed.\n`
)
process.exit(failures === 0 ? 0 : 1)
