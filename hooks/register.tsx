import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderChildren } from 'claude-code'

import type { Sample, Today, BarLayout, BarLength, BarMode, BarStyle, CatSkin, Mood, Vibe, SaberTheme, CatSettings, Stats, Usage, UsageSource } from '../types'


// The SVG namespace: a fixed name every SVG drawing declares so it renders as SVG.
// It is an identifier, not an address: catbar never connects to it or anywhere else.
const SVG_NS = 'http://www.w3.org/2000/svg'
const PANE = 'catbar'
const TITLE = 'Dancing Cat'
const SETTINGS_PANE = 'cat-settings'
const SETTINGS_TITLE = 'Cat CatSettings'
const STORE_KEY = 'settings'

const DANCES: Mood[] = ['chill', 'vibe', 'headbang', 'spin', 'shuffle']
// The gentle ones, all the relaxed vibe ever picks.
const CALM: Mood[] = ['chill', 'vibe']
const MOODS: Mood[] = [...DANCES, 'play', 'sleep']
// How often the mood may change; each change redraws the strip, so keep it calm.
const TICK_MS = 45000
const IDLE_MS = 3 * 60 * 1000

const CAPTION: Record<Mood, string> = {
  chill: 'chillin~',
  vibe: 'just vibin',
  headbang: 'HEADBANG MODE',
  spin: 'weeeeeee',
  shuffle: 'shuffle shuffle',
  play: 'zoomies! yarn time',
  sleep: 'zzz... napping',
}

const DEFAULTS: CatSettings = {
  showCat: true,
  showUsage: true,
  showPercent: true,
  redAlert: true,
  usageSource: 'five_hour',
  saberTheme: 'auto',
  mood: 'random',
  catSkin: 'gray',
  vibe: 'relaxed',
  barStyle: 'saber',
  barMode: 'simple',
  layout: 'tiles',
  barLength: 'fill',
  sleepWhenIdle: true,
  turbo: true,
  openPaneOnStart: false,
  showSecondLimit: true,
  showReset: true,
  showContext: true,
  showCost: true,
  showTurnTimer: true,
  showTools: true,
  showModel: true,
  showClock: true,
  showForecast: true,
  smartAlerts: true,
}

const move = atom({ plugin: 'catbar', key: 'move' } as const, 'vibe' as Mood, { shape: 'move-2' })
// How many tool calls are running right now.
const busy = atom({ plugin: 'catbar', key: 'busy' } as const, 0, { shape: 'busy-1' })
// Whether the strip above the chat input shows at all (/cat-band).
const showBand = atom({ plugin: 'catbar', key: 'showBand' } as const, true, { shape: 'showBand-1' })
// The latest usage figures the session reported.
const usage = atom({ plugin: 'catbar', key: 'usage' } as const, null as Usage | null, { shape: 'usage-2' })
// Session figures for the info row.
const stats = atom({ plugin: 'catbar', key: 'stats' } as const, { model: null, startedAt: 0, turnStartedAt: null, lastTurnMs: null, toolsTurn: 0, toolsTotal: 0 } as Stats, { shape: 'stats-1' })
// Recent readings of the main limit, for the forecast.
const history = atom({ plugin: 'catbar', key: 'history' } as const, [] as Sample[], { shape: 'history-1' })
// Today's tally, kept in $.store across sessions.
const today = atom({ plugin: 'catbar', key: 'today' } as const, null as Today | null, { shape: 'today-1' })
// The time the info row reads, moved on every few seconds.
const now = atom({ plugin: 'catbar', key: 'now' } as const, 0, { shape: 'now-1' })
// The widget's settings; kept in $.store too so they outlive the session.
const settings = atom({ plugin: 'catbar', key: 'settings' } as const, DEFAULTS, { shape: 'settings-1' })

function sanitize(raw: unknown): CatSettings {
  const s: CatSettings = { ...DEFAULTS }
  if (!raw || typeof raw !== 'object') return s
  const r = raw as Record<string, unknown>
  for (const k of ['showForecast', 'smartAlerts', 'showSecondLimit', 'showReset', 'showContext', 'showCost', 'showTurnTimer', 'showTools', 'showModel', 'showClock', 'showCat', 'showUsage', 'showPercent', 'redAlert', 'sleepWhenIdle', 'turbo', 'openPaneOnStart'] as const) {
    if (typeof r[k] === 'boolean') s[k] = r[k] as boolean
  }
  if (['five_hour', 'seven_day', 'context'].includes(r.usageSource as string)) s.usageSource = r.usageSource as UsageSource
  if (Object.keys(SABERS).includes(r.saberTheme as string)) s.saberTheme = r.saberTheme as SaberTheme
  if (['relaxed', 'normal', 'party'].includes(r.vibe as string)) s.vibe = r.vibe as Vibe
  if (['fill', 'long', 'medium', 'short'].includes(r.barLength as string)) s.barLength = r.barLength as BarLength
  if (['rows', 'tiles', 'line', 'minimal'].includes(r.layout as string)) s.layout = r.layout as BarLayout
  if (['simple', 'detailed'].includes(r.barMode as string)) s.barMode = r.barMode as BarMode
  if (Object.keys(BARS).includes(r.barStyle as string)) s.barStyle = r.barStyle as BarStyle
  if (Object.keys(SKINS).includes(r.catSkin as string)) s.catSkin = r.catSkin as CatSkin
  if (r.mood === 'random' || MOODS.includes(r.mood as Mood)) s.mood = r.mood as CatSettings['mood']
  return s
}

async function setSettings($: EngineInterface, patch: Partial<CatSettings>): Promise<void> {
  await update($, settings, s => ({ ...s, ...patch }))
  await $.store.set(STORE_KEY, await read($, settings)).catch(() => {})
}

// ---------- the cat ----------

// ---- Kawaii: white fur, bold outlines, pink stripes, big shiny eyes.
const INK = '#1a1a1a'
const FUR = '#f6f6f6'
const STRIPE = '#f4c4c4'
const EAR = '#e3b0b0'

const KAWAII_EYES = `<circle cx="100" cy="118" r="13" fill="${INK}"/><circle cx="140" cy="118" r="13" fill="${INK}"/>
    <circle cx="104" cy="113" r="5" fill="#fff"/><circle cx="144" cy="113" r="5" fill="#fff"/>
    <circle cx="95" cy="123" r="2" fill="#fff"/><circle cx="135" cy="123" r="2" fill="#fff"/>`
const KAWAII_BROWS = `<path d="M91 99 q8 -5 15 0 M134 99 q7 -5 15 0" stroke="${INK}" stroke-width="2.5" fill="none" stroke-linecap="round"/>`

const KAWAII_PARTS = `
  <g class="tail">
    <path d="M148 224 q46 6 44 -30 q-1 -20 -20 -18" stroke="${INK}" stroke-width="20" fill="none" stroke-linecap="round"/>
    <path d="M148 224 q46 6 44 -30 q-1 -20 -20 -18" stroke="${FUR}" stroke-width="13" fill="none" stroke-linecap="round"/>
    <path d="M148 224 q46 6 44 -30 q-1 -20 -20 -18" stroke="${STRIPE}" stroke-width="13" fill="none" stroke-dasharray="5 10"/>
  </g>
  <path d="M90 238 Q84 192 100 158 L140 158 Q156 192 150 238 Z" fill="${FUR}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
  <path d="M110 238 q2 -9 0 -15 M130 238 q-2 -9 0 -15" stroke="${INK}" stroke-width="3" fill="none" stroke-linecap="round"/>
  <path d="M91 192 l13 4 l-12 6 Z M90 212 l13 4 l-12 6 Z" fill="${STRIPE}" stroke="${INK}" stroke-width="1.5" stroke-linejoin="round"/>
  <path d="M149 192 l-13 4 l12 6 Z M150 212 l-13 4 l12 6 Z" fill="${STRIPE}" stroke="${INK}" stroke-width="1.5" stroke-linejoin="round"/>
  <rect class="armL" x="74" y="168" width="28" height="13" rx="6.5" fill="${FUR}" stroke="${INK}" stroke-width="3.5"/>
  <rect class="armR" x="138" y="168" width="28" height="13" rx="6.5" fill="${FUR}" stroke="${INK}" stroke-width="3.5"/>
  <g class="head">
    <path d="M78 104 Q68 50 90 52 Q106 58 118 76 Z" fill="${FUR}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
    <path d="M162 104 Q172 50 150 52 Q134 58 122 76 Z" fill="${FUR}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
    <path d="M84 90 Q79 62 92 63 Q102 68 108 78 Z" fill="${EAR}"/>
    <path d="M156 90 Q161 62 148 63 Q138 68 132 78 Z" fill="${EAR}"/>
    <ellipse cx="120" cy="116" rx="50" ry="42" fill="${FUR}" stroke="${INK}" stroke-width="4"/>
    <path d="M100 75 l7 12 l7 -11 Z M113 74 l7 13 l7 -13 Z M126 76 l7 11 l7 -12 Z" fill="${STRIPE}" stroke="${INK}" stroke-width="1.5" stroke-linejoin="round"/>
    <path d="M71 106 l14 4 l-14 6 Z M72 124 l13 3 l-13 6 Z" fill="${STRIPE}" stroke="${INK}" stroke-width="1.5" stroke-linejoin="round"/>
    <path d="M169 106 l-14 4 l14 6 Z M168 124 l-13 3 l13 6 Z" fill="${STRIPE}" stroke="${INK}" stroke-width="1.5" stroke-linejoin="round"/>
    ${KAWAII_BROWS}
    ${KAWAII_EYES}
    <path d="M116 128 h8 l-4 5 Z" fill="${INK}" stroke="${INK}" stroke-width="1.5" stroke-linejoin="round"/>
    <path d="M112 135 q4 5 8 0 q4 5 8 0" stroke="${INK}" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    <path d="M76 128 l-20 -3 M76 134 l-18 6 M164 128 l20 -3 M164 134 l18 6" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>
  </g>`

const NOTES = `
  <text class="note" x="40" y="90" font-size="26" fill="#ffd84f">&#9835;</text>
  <text class="note n2" x="182" y="100" font-size="22" fill="#4fd1ff">&#9834;</text>`

const YARN = `
  <g class="yarn">
    <circle cx="196" cy="224" r="14" fill="#ff5c8a"/>
    <path d="M184 218 q12 -6 24 4 M186 230 q10 4 22 -6 M192 212 q4 12 0 24" stroke="#c2185b" stroke-width="2" fill="none"/>
  </g>
  <text class="spark" x="168" y="178" font-size="16" fill="#ffd84f">&#10022;</text>
  <text class="spark s2" x="62" y="150" font-size="13" fill="#ff8fd1">&#10022;</text>`


const KAWAII_SLEEPING = `
  <g class="tailS">
    <path d="M190 226 q30 0 26 -26" stroke="${INK}" stroke-width="20" fill="none" stroke-linecap="round"/>
    <path d="M190 226 q30 0 26 -26" stroke="${FUR}" stroke-width="13" fill="none" stroke-linecap="round"/>
    <path d="M190 226 q30 0 26 -26" stroke="${STRIPE}" stroke-width="13" fill="none" stroke-dasharray="5 10"/>
  </g>
  <g class="breathe">
    <ellipse cx="140" cy="208" rx="62" ry="30" fill="${FUR}" stroke="${INK}" stroke-width="4"/>
    <path d="M128 179 l6 11 l6 -11 Z M150 179 l6 11 l6 -10 Z M172 184 l5 10 l6 -8 Z" fill="${STRIPE}" stroke="${INK}" stroke-width="1.5" stroke-linejoin="round"/>
  </g>
  <g class="headS">
    <path d="M58 192 Q50 150 70 152 Q82 158 90 172 Z" fill="${FUR}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
    <path d="M118 186 Q128 146 108 150 Q96 156 90 170 Z" fill="${FUR}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
    <path d="M63 182 Q60 160 71 161 Q79 166 83 172 Z" fill="${EAR}"/>
    <path d="M113 178 Q118 158 107 159 Q99 164 96 171 Z" fill="${EAR}"/>
    <ellipse cx="88" cy="200" rx="40" ry="32" fill="${FUR}" stroke="${INK}" stroke-width="4"/>
    <path d="M76 170 l5 9 l5 -9 Z M88 169 l5 10 l5 -10 Z" fill="${STRIPE}" stroke="${INK}" stroke-width="1.5" stroke-linejoin="round"/>
    <path d="M68 200 q8 7 16 0 M94 200 q8 7 16 0" stroke="${INK}" stroke-width="3" fill="none" stroke-linecap="round"/>
    <circle cx="64" cy="212" r="5" fill="${STRIPE}"/><circle cx="114" cy="212" r="5" fill="${STRIPE}"/>
    <path d="M85 208 h6 l-3 4 Z" fill="${INK}"/>
    <path d="M83 216 q3 3 5 0 q3 3 5 0" stroke="${INK}" stroke-width="2" fill="none" stroke-linecap="round"/>
  </g>
  <ellipse cx="100" cy="232" rx="16" ry="7" fill="${FUR}" stroke="${INK}" stroke-width="3"/>
  <ellipse cx="126" cy="234" rx="14" ry="6" fill="${FUR}" stroke="${INK}" stroke-width="3"/>
  <text class="z" x="112" y="160" font-size="16" font-weight="bold" fill="#9fd3ff" stroke="${INK}" stroke-width=".8">z</text>
  <text class="z z2" x="112" y="160" font-size="20" font-weight="bold" fill="#9fd3ff" stroke="${INK}" stroke-width=".8">Z</text>
  <text class="z z3" x="112" y="160" font-size="24" font-weight="bold" fill="#9fd3ff" stroke="${INK}" stroke-width=".8">Z</text>`


// ---- Gray: gray fur, white muzzle, chest and paws, navy outline.
const NAVY = '#1b1f6b'
const GRAY = '#9a9aa4'
const GRAY_DARK = '#85858f'
const WHITE = '#ffffff'
const PINK = '#f2a5a5'

const GRAY_EYES = `<ellipse cx="98" cy="116" rx="12" ry="13" fill="${NAVY}"/><ellipse cx="142" cy="116" rx="12" ry="13" fill="${NAVY}"/>
    <circle cx="101" cy="113" r="5" fill="${WHITE}"/><circle cx="145" cy="113" r="5" fill="${WHITE}"/>
    <circle cx="93" cy="121" r="2.5" fill="#5a62c0"/><circle cx="137" cy="121" r="2.5" fill="#5a62c0"/>`
const GRAY_BROWS = `<path d="M90 92 q7 -6 14 0 M136 92 q7 -6 14 0" stroke="${NAVY}" stroke-width="4.5" fill="none" stroke-linecap="round"/>`

const GRAY_PARTS = `
  <g class="tail">
    <path d="M146 228 q42 6 40 -28 q-1 -24 20 -28" stroke="${NAVY}" stroke-width="18" fill="none" stroke-linecap="round"/>
    <path d="M146 228 q42 6 40 -28 q-1 -24 20 -28" stroke="${GRAY}" stroke-width="11" fill="none" stroke-linecap="round"/>
    <path d="M196 176 q5 -4 10 -4" stroke="${WHITE}" stroke-width="11" fill="none" stroke-linecap="round"/>
  </g>
  <path d="M90 238 Q84 194 100 158 L140 158 Q158 194 152 238 Z" fill="${GRAY}" stroke="${NAVY}" stroke-width="4" stroke-linejoin="round"/>
  <path d="M106 160 Q98 200 110 236 L126 236 Q132 198 126 160 Z" fill="${WHITE}"/>
  <ellipse cx="142" cy="214" rx="15" ry="20" fill="${GRAY}" stroke="${NAVY}" stroke-width="3"/>
  <ellipse cx="146" cy="206" rx="5" ry="3" fill="${WHITE}" opacity=".5"/>
  <ellipse cx="106" cy="236" rx="13" ry="7" fill="${WHITE}" stroke="${NAVY}" stroke-width="3"/>
  <ellipse cx="132" cy="236" rx="13" ry="7" fill="${WHITE}" stroke="${NAVY}" stroke-width="3"/>
  <path d="M102 237 v-4 M110 237 v-4 M128 237 v-4 M136 237 v-4" stroke="${NAVY}" stroke-width="2" stroke-linecap="round"/>
  <g class="armL"><rect x="74" y="168" width="28" height="13" rx="6.5" fill="${GRAY}" stroke="${NAVY}" stroke-width="3.5"/><circle cx="80" cy="174.5" r="5.5" fill="${WHITE}"/></g>
  <g class="armR"><rect x="138" y="168" width="28" height="13" rx="6.5" fill="${GRAY}" stroke="${NAVY}" stroke-width="3.5"/><circle cx="160" cy="174.5" r="5.5" fill="${WHITE}"/></g>
  <g class="head">
    <path d="M76 104 Q66 50 90 52 Q106 58 118 76 Z" fill="${GRAY}" stroke="${NAVY}" stroke-width="4" stroke-linejoin="round"/>
    <path d="M164 104 Q174 50 150 52 Q134 58 122 76 Z" fill="${GRAY}" stroke="${NAVY}" stroke-width="4" stroke-linejoin="round"/>
    <path d="M83 92 Q78 62 92 63 Q102 68 108 78 Z" fill="${PINK}"/>
    <path d="M157 92 Q162 62 148 63 Q138 68 132 78 Z" fill="${PINK}"/>
    <path d="M70 118 Q66 72 120 72 Q174 72 170 118 L176 126 L168 130 L172 138 L160 140 Q146 156 120 156 Q94 156 80 140 L68 138 L72 130 L64 126 Z" fill="${WHITE}" stroke="${NAVY}" stroke-width="4" stroke-linejoin="round"/>
    <path d="M71 118 Q68 74 120 74 Q172 74 169 118 Q166 134 150 134 Q138 134 128 126 Q120 122 112 126 Q102 134 90 134 Q74 134 71 118 Z" fill="${GRAY}"/>
    <path d="M90 80 Q120 70 150 80" stroke="${GRAY_DARK}" stroke-width="3" fill="none" opacity=".5"/>
    ${GRAY_BROWS}
    ${GRAY_EYES}
    <path d="M115 126 h10 q0 6 -5 7 q-5 -1 -5 -7 Z" fill="${NAVY}"/>
    <path d="M110 136 q5 6 10 0 q5 6 10 0" stroke="${NAVY}" stroke-width="2.5" fill="none" stroke-linecap="round"/>
  </g>`

const GRAY_SLEEPING = `
  <g class="tailS">
    <path d="M190 226 q30 0 26 -26" stroke="${NAVY}" stroke-width="18" fill="none" stroke-linecap="round"/>
    <path d="M190 226 q30 0 26 -26" stroke="${GRAY}" stroke-width="11" fill="none" stroke-linecap="round"/>
    <path d="M216 204 q1 -4 0 -6" stroke="${WHITE}" stroke-width="11" fill="none" stroke-linecap="round"/>
  </g>
  <g class="breathe">
    <ellipse cx="140" cy="208" rx="62" ry="30" fill="${GRAY}" stroke="${NAVY}" stroke-width="4"/>
    <ellipse cx="150" cy="190" rx="18" ry="5" fill="${WHITE}" opacity=".35"/>
  </g>
  <g class="headS">
    <path d="M56 192 Q48 150 70 152 Q82 158 90 172 Z" fill="${GRAY}" stroke="${NAVY}" stroke-width="4" stroke-linejoin="round"/>
    <path d="M120 186 Q130 146 108 150 Q96 156 90 170 Z" fill="${GRAY}" stroke="${NAVY}" stroke-width="4" stroke-linejoin="round"/>
    <path d="M62 182 Q59 160 71 161 Q79 166 83 172 Z" fill="${PINK}"/>
    <path d="M114 178 Q119 158 107 159 Q99 164 96 171 Z" fill="${PINK}"/>
    <ellipse cx="88" cy="200" rx="40" ry="32" fill="${WHITE}" stroke="${NAVY}" stroke-width="4"/>
    <path d="M49 200 Q50 170 88 168 Q126 170 127 200 Q120 210 108 206 Q96 200 88 204 Q80 200 68 206 Q56 210 49 200 Z" fill="${GRAY}"/>
    <path d="M68 198 q8 7 16 0 M94 198 q8 7 16 0" stroke="${NAVY}" stroke-width="3" fill="none" stroke-linecap="round"/>
    <circle cx="66" cy="212" r="5" fill="${PINK}" opacity=".7"/><circle cx="112" cy="212" r="5" fill="${PINK}" opacity=".7"/>
    <path d="M84 207 h8 q0 5 -4 6 q-4 -1 -4 -6 Z" fill="${NAVY}"/>
    <path d="M82 217 q3 3 6 0 q3 3 6 0" stroke="${NAVY}" stroke-width="2" fill="none" stroke-linecap="round"/>
  </g>
  <ellipse cx="100" cy="232" rx="16" ry="7" fill="${WHITE}" stroke="${NAVY}" stroke-width="3"/>
  <ellipse cx="126" cy="234" rx="14" ry="6" fill="${WHITE}" stroke="${NAVY}" stroke-width="3"/>
  <text class="z" x="112" y="160" font-size="16" font-weight="bold" fill="#9fd3ff" stroke="${NAVY}" stroke-width=".8">z</text>
  <text class="z z2" x="112" y="160" font-size="20" font-weight="bold" fill="#9fd3ff" stroke="${NAVY}" stroke-width=".8">Z</text>
  <text class="z z3" x="112" y="160" font-size="24" font-weight="bold" fill="#9fd3ff" stroke="${NAVY}" stroke-width=".8">Z</text>`

// ---- Classic: the first orange cat in sunglasses.
const CLASSIC_EYES = `<rect x="86" y="100" width="30" height="16" rx="4" fill="#111"/><rect x="124" y="100" width="30" height="16" rx="4" fill="#111"/>
    <rect x="114" y="104" width="12" height="4" fill="#111"/>
    <rect x="90" y="103" width="8" height="4" fill="#fff" opacity=".7"/><rect x="128" y="103" width="8" height="4" fill="#fff" opacity=".7"/>`
const CLASSIC_BROWS = `<path d="M104 80 l4 12 M120 76 v14 M136 80 l-4 12" stroke="#c96d1c" stroke-width="4" stroke-linecap="round"/>`

const CLASSIC_PARTS = `
  <path class="tail" d="M150 190 q40 -10 38 -50 q-2 -20 12 -24" stroke="#f29a3c" stroke-width="10" fill="none" stroke-linecap="round"/>
  <ellipse cx="120" cy="185" rx="34" ry="40" fill="#f29a3c"/>
  <ellipse cx="120" cy="195" rx="20" ry="26" fill="#ffe2bf"/>
  <rect class="armL" x="70" y="152" width="32" height="12" rx="6" fill="#f29a3c"/>
  <rect class="armR" x="138" y="152" width="32" height="12" rx="6" fill="#f29a3c"/>
  <ellipse cx="104" cy="228" rx="13" ry="8" fill="#e0862a"/>
  <ellipse cx="136" cy="228" rx="13" ry="8" fill="#e0862a"/>
  <g class="head">
    <path d="M84 96 L90 58 L112 84 Z" fill="#f29a3c"/><path d="M156 96 L150 58 L128 84 Z" fill="#f29a3c"/>
    <path d="M91 88 L93 68 L106 84 Z" fill="#ffb3c8"/><path d="M149 88 L147 68 L134 84 Z" fill="#ffb3c8"/>
    <ellipse cx="120" cy="112" rx="44" ry="38" fill="#f29a3c"/>
    ${CLASSIC_BROWS}
    ${CLASSIC_EYES}
    <path d="M116 124 l4 4 l4 -4 Z" fill="#ff6f91"/>
    <path d="M110 132 q5 6 10 0 q5 6 10 0" stroke="#5a2e0c" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="M82 122 h-18 M82 128 h-16 M158 122 h18 M158 128 h16" stroke="#5a2e0c" stroke-width="2" stroke-linecap="round"/>
  </g>`

const CLASSIC_SLEEPING = `
  <path class="tailS" d="M180 222 q34 2 30 -24" stroke="#f29a3c" stroke-width="10" fill="none" stroke-linecap="round"/>
  <g class="breathe">
    <ellipse cx="136" cy="206" rx="60" ry="30" fill="#f29a3c"/>
    <ellipse cx="136" cy="216" rx="40" ry="13" fill="#ffe2bf"/>
    <path d="M132 180 q5 8 0 15 M150 179 q5 8 0 15 M168 183 q5 8 0 15" stroke="#c96d1c" stroke-width="4" fill="none" stroke-linecap="round"/>
  </g>
  <g class="headS">
    <path d="M62 186 L60 152 L84 172 Z" fill="#f29a3c"/><path d="M108 176 L116 146 L92 166 Z" fill="#f29a3c"/>
    <path d="M66 180 L65 162 L78 173 Z" fill="#ffb3c8"/><path d="M106 174 L111 156 L97 167 Z" fill="#ffb3c8"/>
    <ellipse cx="88" cy="198" rx="36" ry="30" fill="#f29a3c"/>
    <rect x="68" y="174" width="18" height="9" rx="3" fill="#111"/><rect x="90" y="174" width="18" height="9" rx="3" fill="#111"/>
    <rect x="85" y="177" width="6" height="3" fill="#111"/>
    <path d="M70 198 q7 6 14 0 M92 198 q7 6 14 0" stroke="#5a2e0c" stroke-width="3" fill="none" stroke-linecap="round"/>
    <circle cx="66" cy="208" r="4" fill="#ffb3c8" opacity=".8"/><circle cx="110" cy="208" r="4" fill="#ffb3c8" opacity=".8"/>
    <path d="M85 207 l3 3 l3 -3 Z" fill="#ff6f91"/>
  </g>
  <ellipse cx="96" cy="228" rx="16" ry="7" fill="#e0862a"/><ellipse cx="120" cy="230" rx="14" ry="6" fill="#e0862a"/>
  <text class="z" x="110" y="160" font-size="16" font-weight="bold" fill="#9fd3ff">z</text>
  <text class="z z2" x="110" y="160" font-size="20" font-weight="bold" fill="#9fd3ff">Z</text>
  <text class="z z3" x="110" y="160" font-size="24" font-weight="bold" fill="#9fd3ff">Z</text>`


// ---- Shared bits for the newer cats.
const ZZZ = `
  <text class="z" x="150" y="80" font-size="16" font-weight="bold" fill="#9fd3ff" stroke="#1b1f6b" stroke-width=".8">z</text>
  <text class="z z2" x="150" y="80" font-size="20" font-weight="bold" fill="#9fd3ff" stroke="#1b1f6b" stroke-width=".8">Z</text>
  <text class="z z3" x="150" y="80" font-size="24" font-weight="bold" fill="#9fd3ff" stroke="#1b1f6b" stroke-width=".8">Z</text>`

/** A cat dozing where it stands: its eyes closed, breathing slowly, z's rising. */
function dozing(parts: string, eyes: string, closed: string): string {
  return `<g class="breathe">${eyes ? parts.replace(eyes, closed) : parts}</g>${ZZZ}`
}

const closedEyes = (lx: number, rx: number, y: number, color: string, w = 9) =>
  `<path d="M${lx - w} ${y} q${w} 7 ${w * 2} 0 M${rx - w} ${y} q${w} 7 ${w * 2} 0" stroke="${color}" stroke-width="3" fill="none" stroke-linecap="round"/>`

const STANDARD_CSS = `.tail { transform-origin: 148px 222px; } .armL { transform-origin: 100px 174px; } .armR { transform-origin: 140px 174px; }
  .breathe { transform-origin: 120px 240px; animation: breathe 2.6s ease-in-out infinite; }`

// ---- Ginger: orange, navy outline, white muzzle and belly, big paws, a heart bubble.
const G_FUR = '#f5c06a'
const G_INK = '#22306e'
const G_PINK = '#f29a9a'
const G_WHITE = '#fffdf8'
const GINGER_EYES = `<ellipse cx="100" cy="116" rx="8" ry="10" fill="${G_INK}"/><ellipse cx="140" cy="116" rx="8" ry="10" fill="${G_INK}"/>
    <circle cx="102" cy="112" r="3" fill="#fff"/><circle cx="142" cy="112" r="3" fill="#fff"/>`
const GINGER_BROWS = `<path d="M92 98 q7 -4 13 0 M135 98 q7 -4 13 0" stroke="${G_INK}" stroke-width="3" fill="none" stroke-linecap="round"/>`
const GINGER_PARTS = `
  <g class="tail">
    <path d="M146 222 q44 2 42 -34 q-1 -22 -18 -24" stroke="${G_INK}" stroke-width="17" fill="none" stroke-linecap="round"/>
    <path d="M146 222 q44 2 42 -34 q-1 -22 -18 -24" stroke="${G_FUR}" stroke-width="11" fill="none" stroke-linecap="round"/>
  </g>
  <path d="M92 236 Q86 194 100 158 L140 158 Q154 194 148 236 Z" fill="${G_FUR}" stroke="${G_INK}" stroke-width="4" stroke-linejoin="round"/>
  <ellipse cx="120" cy="210" rx="18" ry="22" fill="${G_WHITE}"/>
  <ellipse cx="94" cy="236" rx="18" ry="10" fill="${G_WHITE}" stroke="${G_INK}" stroke-width="3.5"/>
  <ellipse cx="146" cy="236" rx="18" ry="10" fill="${G_WHITE}" stroke="${G_INK}" stroke-width="3.5"/>
  <circle cx="94" cy="238" r="4" fill="${G_PINK}"/><circle cx="146" cy="238" r="4" fill="${G_PINK}"/>
  <circle cx="87" cy="232" r="2" fill="${G_PINK}"/><circle cx="94" cy="230" r="2" fill="${G_PINK}"/><circle cx="101" cy="232" r="2" fill="${G_PINK}"/>
  <circle cx="139" cy="232" r="2" fill="${G_PINK}"/><circle cx="146" cy="230" r="2" fill="${G_PINK}"/><circle cx="153" cy="232" r="2" fill="${G_PINK}"/>
  <g class="armL"><rect x="74" y="168" width="28" height="13" rx="6.5" fill="${G_FUR}" stroke="${G_INK}" stroke-width="3.5"/><circle cx="80" cy="174.5" r="5" fill="${G_WHITE}"/></g>
  <g class="armR"><rect x="138" y="168" width="28" height="13" rx="6.5" fill="${G_FUR}" stroke="${G_INK}" stroke-width="3.5"/><circle cx="160" cy="174.5" r="5" fill="${G_WHITE}"/></g>
  <g class="head">
    <path d="M76 104 Q66 50 90 52 Q106 58 118 76 Z" fill="${G_FUR}" stroke="${G_INK}" stroke-width="4" stroke-linejoin="round"/>
    <path d="M164 104 Q174 50 150 52 Q134 58 122 76 Z" fill="${G_FUR}" stroke="${G_INK}" stroke-width="4" stroke-linejoin="round"/>
    <path d="M83 92 Q78 62 92 63 Q102 68 108 78 Z" fill="${G_PINK}"/>
    <path d="M157 92 Q162 62 148 63 Q138 68 132 78 Z" fill="${G_PINK}"/>
    <ellipse cx="120" cy="114" rx="52" ry="42" fill="${G_FUR}" stroke="${G_INK}" stroke-width="4"/>
    <path d="M110 74 l3 14 l3 -14 Z M118 73 l2 16 l2 -16 Z M125 74 l3 14 l3 -14 Z" fill="${G_WHITE}"/>
    <path d="M69 108 l14 2 M69 116 l12 1 M171 108 l-14 2 M171 116 l-12 1" stroke="${G_WHITE}" stroke-width="3" stroke-linecap="round"/>
    ${GINGER_BROWS}
    ${GINGER_EYES}
    <ellipse cx="88" cy="132" rx="8" ry="4.5" fill="${G_PINK}" opacity=".8"/><ellipse cx="152" cy="132" rx="8" ry="4.5" fill="${G_PINK}" opacity=".8"/>
    <ellipse cx="120" cy="132" rx="13" ry="10" fill="${G_WHITE}"/>
    <path d="M116 125 h8 l-4 4 Z" fill="${G_INK}"/>
    <path d="M113 133 q7 10 14 0 Z" fill="${G_INK}"/><ellipse cx="120" cy="137" rx="3.5" ry="2" fill="${G_PINK}"/>
  </g>
  <g class="bubble">
    <circle cx="182" cy="66" r="15" fill="#fff" stroke="${G_INK}" stroke-width="3"/>
    <path d="M172 76 l-6 10 l12 -6" fill="#fff" stroke="${G_INK}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M182 72 q-9 -6 -7 -11 q3 -4 7 0 q4 -4 7 0 q2 5 -7 11 Z" fill="#ff4d6d"/>
  </g>`

// ---- Ghost: a white sheet of a cat, one paw up, black tail.
const GH_BODY = '#fdfdfd'
const GH_INK = '#161616'
const GH_PINK = '#f29aa8'
const GHOST_EYES = `<ellipse cx="106" cy="114" rx="6" ry="9" fill="${GH_INK}"/><ellipse cx="136" cy="114" rx="6" ry="9" fill="${GH_INK}"/>`
const GHOST_PARTS = `
  <path class="tail" d="M152 196 q30 -6 26 -36 q-4 -20 14 -26" stroke="${GH_INK}" stroke-width="12" fill="none" stroke-linecap="round"/>
  <path d="M82 132 Q76 200 84 240 q9 -9 18 0 q9 -9 18 0 q9 -9 18 0 q9 -9 18 0 Q162 200 158 132 Z" fill="${GH_BODY}" stroke="${GH_INK}" stroke-width="5" stroke-linejoin="round"/>
  <path class="armL" d="M86 156 q-24 -10 -20 -36 q8 -8 15 2 q2 12 10 22" fill="${GH_BODY}" stroke="${GH_INK}" stroke-width="5" stroke-linejoin="round"/>
  <path class="armR" d="M154 172 q18 4 16 20 q-9 7 -18 -4" fill="${GH_BODY}" stroke="${GH_INK}" stroke-width="5" stroke-linejoin="round"/>
  <g class="head">
    <path d="M80 100 L88 54 L114 78 Z" fill="${GH_BODY}" stroke="${GH_INK}" stroke-width="5" stroke-linejoin="round"/>
    <path d="M160 100 L152 54 L126 78 Z" fill="${GH_BODY}" stroke="${GH_INK}" stroke-width="5" stroke-linejoin="round"/>
    <path d="M88 66 L91 58 L100 68 Z" fill="${GH_PINK}"/><path d="M152 66 L149 58 L140 68 Z" fill="${GH_PINK}"/>
    <ellipse cx="120" cy="112" rx="46" ry="38" fill="${GH_BODY}" stroke="${GH_INK}" stroke-width="5"/>
    <rect x="84" y="134" width="72" height="16" fill="${GH_BODY}"/>
    ${GHOST_EYES}
    <path d="M96 124 l-22 -5 M96 129 l-22 2 M146 126 l22 -3 M146 131 l20 5" stroke="${GH_INK}" stroke-width="2" stroke-linecap="round"/>
  </g>`

// ---- Cool cat: a black-and-white head in white-framed sunglasses.
const C_BLACK = '#121212'
const C_WHITE = '#f4f4f4'
const C_EDGE = '#cfcfcf'
const COOL_EYES = `<rect x="62" y="124" width="52" height="36" rx="9" fill="${C_WHITE}"/><rect x="126" y="124" width="52" height="36" rx="9" fill="${C_WHITE}"/>
      <rect x="112" y="130" width="16" height="6" fill="${C_WHITE}"/>
      <rect x="68" y="130" width="40" height="24" rx="6" fill="${C_BLACK}"/><rect x="132" y="130" width="40" height="24" rx="6" fill="${C_BLACK}"/>`
const COOL_PARTS = `
  <g transform="translate(24 40) scale(0.8)"><g class="head">
    <path d="M56 130 L58 40 L114 86 Z" fill="${C_BLACK}" stroke="${C_EDGE}" stroke-width="2" stroke-linejoin="round"/>
    <path d="M184 130 L182 40 L126 86 Z" fill="${C_BLACK}" stroke="${C_EDGE}" stroke-width="2" stroke-linejoin="round"/>
    <ellipse cx="120" cy="150" rx="70" ry="66" fill="${C_BLACK}" stroke="${C_EDGE}" stroke-width="2"/>
    <path d="M120 98 Q110 122 72 136 Q64 192 120 214 Q176 192 168 136 Q130 122 120 98 Z" fill="${C_WHITE}"/>
    ${COOL_EYES}
    <path d="M111 176 h18 l-9 9 Z" fill="${C_BLACK}"/>
    <path d="M108 192 q6 6 12 0 q6 6 12 0" stroke="${C_BLACK}" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="M92 182 l-40 -4 M92 188 l-40 4 M148 182 l40 -4 M148 188 l40 4" stroke="${C_EDGE}" stroke-width="2" stroke-linecap="round"/>
  </g></g>`

// ---- Black cat: a black silhouette with big round eyes.
const B_FUR = '#141414'
const B_EDGE = '#bdbdbd'
const BLACK_EYES = `<circle cx="104" cy="116" r="9" fill="#fff"/><circle cx="136" cy="116" r="9" fill="#fff"/>
    <circle cx="105" cy="117" r="4.5" fill="${B_FUR}"/><circle cx="137" cy="117" r="4.5" fill="${B_FUR}"/>`
const BLACK_PARTS = `
  <path class="tail" d="M146 224 q46 4 44 -36 q-2 -30 -26 -40" stroke="${B_FUR}" stroke-width="14" fill="none" stroke-linecap="round"/>
  <path d="M90 238 Q82 194 100 158 L140 158 Q158 194 150 238 Z" fill="${B_FUR}" stroke="${B_EDGE}" stroke-width="2" stroke-linejoin="round"/>
  <rect class="armL" x="74" y="168" width="28" height="13" rx="6.5" fill="${B_FUR}" stroke="${B_EDGE}" stroke-width="2"/>
  <rect class="armR" x="138" y="168" width="28" height="13" rx="6.5" fill="${B_FUR}" stroke="${B_EDGE}" stroke-width="2"/>
  <g class="head">
    <path d="M74 106 L80 54 L116 80 Z" fill="${B_FUR}" stroke="${B_EDGE}" stroke-width="2" stroke-linejoin="round"/>
    <path d="M166 106 L160 54 L124 80 Z" fill="${B_FUR}" stroke="${B_EDGE}" stroke-width="2" stroke-linejoin="round"/>
    <ellipse cx="120" cy="116" rx="48" ry="40" fill="${B_FUR}" stroke="${B_EDGE}" stroke-width="2"/>
    ${BLACK_EYES}
    <path d="M90 130 l-30 -4 M90 135 l-30 3 M150 130 l30 -4 M150 135 l30 3" stroke="${B_EDGE}" stroke-width="1.5" stroke-linecap="round"/>
  </g>`

// ---- Siamese: cream fur, gray points, fine brown linework.
const S_CREAM = '#f3e6dc'
const S_POINT = '#7d7277'
const S_LINE = '#3b2416'
const S_PINK = '#e59a8f'
const SIAMESE_EYES = `<circle cx="104" cy="108" r="4" fill="${S_LINE}"/><circle cx="136" cy="108" r="4" fill="${S_LINE}"/>`
const SIAMESE_PARTS = `
  <g class="tail">
    <path d="M146 222 q46 6 44 -30 q-1 -24 -22 -22" stroke="${S_POINT}" stroke-width="16" fill="none" stroke-linecap="round"/>
    <path d="M182 196 l2 -4 M186 188 l2 -4" stroke="${S_LINE}" stroke-width="1.5" stroke-linecap="round"/>
  </g>
  <path d="M90 238 Q82 194 100 158 L140 158 Q158 194 150 238 Z" fill="${S_CREAM}" stroke="${S_LINE}" stroke-width="2.5" stroke-linejoin="round"/>
  <path d="M104 200 l2 -4 M108 200 l2 -4 M134 214 l2 -4 M138 214 l2 -4" stroke="${S_LINE}" stroke-width="1.5" stroke-linecap="round"/>
  <rect class="armL" x="74" y="168" width="28" height="13" rx="6.5" fill="${S_CREAM}" stroke="${S_LINE}" stroke-width="2"/>
  <rect class="armR" x="138" y="168" width="28" height="13" rx="6.5" fill="${S_CREAM}" stroke="${S_LINE}" stroke-width="2"/>
  <g class="head">
    <path d="M78 102 L84 54 L114 78 Z" fill="${S_POINT}"/><path d="M162 102 L156 54 L126 78 Z" fill="${S_POINT}"/>
    <path d="M86 84 L88 64 L104 78 Z" fill="${S_PINK}"/><path d="M154 84 L152 64 L136 78 Z" fill="${S_PINK}"/>
    <ellipse cx="120" cy="114" rx="46" ry="38" fill="${S_CREAM}"/>
    <path d="M80 92 Q86 80 100 78 L96 96 Z M160 92 Q154 80 140 78 L144 96 Z" fill="${S_POINT}" opacity=".85"/>
    <path d="M104 118 Q120 108 136 118 Q140 140 120 144 Q100 140 104 118 Z" fill="${S_POINT}"/>
    ${SIAMESE_EYES}
    <path d="M115 122 h10 l-5 5 Z" fill="${S_LINE}"/>
    <path d="M113 133 q4 4 7 0 q3 4 7 0" stroke="${S_LINE}" stroke-width="2" fill="none" stroke-linecap="round"/>
    <path d="M100 124 l-36 -8 M100 130 l-34 2 M140 124 l36 -8 M140 130 l34 2" stroke="${S_LINE}" stroke-width="1.5" stroke-linecap="round"/>
  </g>`


// ---- The space crew: original sci-fi characters on one shared body.

type CrewOpts = {
  suit: string
  trim: string
  ink?: string
  /** Head markup; %EYES% marks where the eyes go. */
  head: string
  eyes: string
  hand?: string
  legs?: string
  extraBody?: string
  back?: string
  ears?: string
  whisker?: string
}

function crewParts(o: CrewOpts): string {
  const ink = o.ink ?? '#1b1b2f'
  const legs = o.legs ?? `<rect x="100" y="220" width="16" height="20" rx="6" fill="${o.trim}" stroke="${ink}" stroke-width="3"/><rect x="124" y="220" width="16" height="20" rx="6" fill="${o.trim}" stroke="${ink}" stroke-width="3"/>`
  return `
  ${o.back ?? ''}
  ${legs}
  <rect x="92" y="154" width="56" height="72" rx="18" fill="${o.suit}" stroke="${ink}" stroke-width="4"/>
  ${o.extraBody ?? ''}
  <g class="armL"><rect x="70" y="166" width="30" height="13" rx="6.5" fill="${o.suit}" stroke="${ink}" stroke-width="3.5"/></g>
  <g class="armR"><rect x="140" y="166" width="30" height="13" rx="6.5" fill="${o.suit}" stroke="${ink}" stroke-width="3.5"/>${o.hand ?? ''}</g>
  <g class="head">${catEars(o.ears ?? o.suit, ink)}${o.head.replace('%EYES%', o.eyes)}${whiskers(o.whisker ?? ink)}</g>`
}

/** Cat ears, drawn behind the head so the head covers their base. */
const catEars = (c: string, ink: string) => `<path d="M78 94 L82 44 L114 72 Z" fill="${c}" stroke="${ink}" stroke-width="4" stroke-linejoin="round"/>
    <path d="M162 94 L158 44 L126 72 Z" fill="${c}" stroke="${ink}" stroke-width="4" stroke-linejoin="round"/>
    <path d="M86 80 L87 58 L103 72 Z" fill="#ffb3c8"/><path d="M154 80 L153 58 L137 72 Z" fill="#ffb3c8"/>`

const whiskers = (c: string) => `<path d="M84 128 l-26 -5 M84 134 l-26 4 M156 128 l26 -5 M156 134 l26 4" stroke="${c}" stroke-width="2" stroke-linecap="round"/>`

/** A laser sword held upright at the right hand. */
const laserSword = (glow: string) => `
    <rect x="164" y="98" width="11" height="66" rx="5.5" fill="${glow}" opacity=".35"/>
    <rect x="167" y="100" width="5" height="62" rx="2.5" fill="#fff" stroke="${glow}" stroke-width="2.5"/>
    <rect x="165" y="160" width="9" height="18" rx="2" fill="#9aa0a8" stroke="#2b2f35" stroke-width="2"/>`

const CREW_CSS = `.armL { transform-origin: 100px 172px; } .armR { transform-origin: 140px 172px; }
  .breathe { transform-origin: 120px 240px; animation: breathe 2.6s ease-in-out infinite; }`

const KNIGHT_EYES = `<ellipse cx="108" cy="116" rx="4" ry="3" fill="#ffe08a"/><ellipse cx="132" cy="116" rx="4" ry="3" fill="#ffe08a"/>`
const SHADOW_EYES = `<rect x="90" y="106" width="60" height="10" rx="5" fill="#ff2a2a"/>`
const DROID_EYES = `<rect x="98" y="94" width="14" height="14" rx="3" fill="#7fffe8"/><rect x="128" y="94" width="14" height="14" rx="3" fill="#7fffe8"/>`
const ZIB_EYES = `<ellipse cx="100" cy="112" rx="7" ry="9" fill="#1b1b2f"/><ellipse cx="120" cy="102" rx="7" ry="9" fill="#1b1b2f"/><ellipse cx="140" cy="112" rx="7" ry="9" fill="#1b1b2f"/>
    <circle cx="102" cy="109" r="2.5" fill="#fff"/><circle cx="122" cy="99" r="2.5" fill="#fff"/><circle cx="142" cy="109" r="2.5" fill="#fff"/>`
const PILOT_EYES = `<circle cx="108" cy="118" r="4" fill="#1b1b2f"/><circle cx="132" cy="118" r="4" fill="#1b1b2f"/>`
const BUNNY_EYES = `<circle cx="108" cy="120" r="4.5" fill="#1b1b2f"/><circle cx="132" cy="120" r="4.5" fill="#1b1b2f"/><circle cx="109.5" cy="118.5" r="1.5" fill="#fff"/><circle cx="133.5" cy="118.5" r="1.5" fill="#fff"/>`
const OCTO_EYES = `<circle cx="120" cy="108" r="16" fill="#fff" stroke="#1b1b2f" stroke-width="3"/><circle cx="122" cy="110" r="8" fill="#1b1b2f"/><circle cx="125" cy="106" r="3" fill="#fff"/>`
const COWBOY_EYES = `<circle cx="110" cy="120" r="3.5" fill="#1b1b2f"/><circle cx="130" cy="120" r="3.5" fill="#1b1b2f"/>`
const MONK_EYES = `<path d="M102 116 q6 4 12 0 M126 116 q6 4 12 0" stroke="#1b1b2f" stroke-width="3" fill="none" stroke-linecap="round"/>`

const CREW: Record<string, CrewOpts & { label: string; eyeAt: Skin['eyeAt']; closed: string }> = {
  knight: {
    label: 'Space cat · Star knight', ears: '#7a5a3a', whisker: '#e8d9c0', suit: '#8a6a48', trim: '#5a4330', eyes: KNIGHT_EYES, eyeAt: [108, 132, 116, 7],
    closed: closedEyes(108, 132, 116, '#ffe08a', 5),
    head: `<path d="M70 132 Q64 64 120 60 Q176 64 170 132 Q160 152 120 154 Q80 152 70 132 Z" fill="#7a5a3a" stroke="#1b1b2f" stroke-width="4"/>
    <ellipse cx="120" cy="120" rx="32" ry="27" fill="#2a1d14"/>%EYES%`,
    extraBody: `<rect x="92" y="196" width="56" height="8" fill="#4a3424"/><path d="M120 156 v66" stroke="#5a4330" stroke-width="3"/>`,
    hand: laserSword('#4fc3ff'),
  },
  shadow: {
    label: 'Space cat · Shadow knight', ears: '#15151c', whisker: '#9a9aaa', suit: '#22222c', trim: '#3a3a48', ink: '#6a6a7a', eyes: SHADOW_EYES, eyeAt: [104, 136, 111, 8],
    closed: `<rect x="90" y="109" width="60" height="4" rx="2" fill="#7a1010"/>`,
    head: `<path d="M74 128 Q72 64 120 62 Q168 64 166 128 L156 150 L84 150 Z" fill="#15151c" stroke="#6a6a7a" stroke-width="3"/>
    <path d="M86 92 Q120 80 154 92" stroke="#3a3a48" stroke-width="3" fill="none"/>%EYES%
    <path d="M104 132 h32 M108 140 h24" stroke="#3a3a48" stroke-width="3" stroke-linecap="round"/>`,
    back: `<path d="M88 160 L74 236 L166 236 L152 160 Z" fill="#101016" stroke="#6a6a7a" stroke-width="2"/>`,
    hand: laserSword('#ff2a2a'),
  },
  droid: {
    label: 'Space cat · Robo cat', ears: '#5fd3c6', whisker: '#7fffe8', suit: '#5fd3c6', trim: '#3a9c92', eyes: DROID_EYES, eyeAt: [105, 135, 101, 8],
    closed: `<rect x="98" y="100" width="14" height="3" rx="1.5" fill="#7fffe8"/><rect x="128" y="100" width="14" height="3" rx="1.5" fill="#7fffe8"/>`,
    head: `<path d="M120 74 V56" stroke="#1b1b2f" stroke-width="3"/><circle cx="120" cy="52" r="6" fill="#ffd84f" stroke="#1b1b2f" stroke-width="2.5"/>
    <rect x="76" y="74" width="88" height="74" rx="16" fill="#5fd3c6" stroke="#1b1b2f" stroke-width="4"/>
    <rect x="88" y="84" width="64" height="48" rx="10" fill="#10302d"/>%EYES%
    <path d="M106 120 q14 8 28 0" stroke="#7fffe8" stroke-width="3" fill="none" stroke-linecap="round"/>`,
    extraBody: `<rect x="104" y="170" width="32" height="22" rx="4" fill="#10302d"/><circle cx="112" cy="181" r="3" fill="#ff5c7a"/><circle cx="122" cy="181" r="3" fill="#ffd84f"/><circle cx="132" cy="181" r="3" fill="#7fffe8"/>`,
  },
  astro: {
    label: 'Space cat · Astronaut', ears: '#f4f4f4', suit: '#f4f4f4', trim: '#c9ced6', eyes: '', eyeAt: [104, 136, 114, 9], closed: '',
    head: `<circle cx="120" cy="112" r="46" fill="#f4f4f4" stroke="#1b1b2f" stroke-width="4"/>
    <ellipse cx="120" cy="114" rx="32" ry="25" fill="#f2b544" stroke="#1b1b2f" stroke-width="3"/>
    <path d="M100 104 q8 -10 22 -10" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round" opacity=".8"/>`,
    back: `<rect x="82" y="160" width="76" height="56" rx="12" fill="#c9ced6" stroke="#1b1b2f" stroke-width="3"/>`,
    extraBody: `<rect x="106" y="172" width="28" height="18" rx="4" fill="#5a8dee"/><circle cx="114" cy="181" r="2.5" fill="#fff"/><circle cx="126" cy="181" r="2.5" fill="#ff5c7a"/>`,
  },
  zib: {
    label: 'Space cat · Zib the alien', ears: '#7ed957', suit: '#5a3fa0', trim: '#3f2b78', eyes: ZIB_EYES, eyeAt: [100, 140, 110, 8],
    closed: closedEyes(100, 140, 112, '#1b1b2f', 7) + `<path d="M113 102 q7 6 14 0" stroke="#1b1b2f" stroke-width="3" fill="none" stroke-linecap="round"/>`,
    head: `<path d="M98 80 L88 50 M142 80 L152 50" stroke="#1b1b2f" stroke-width="3"/><circle cx="88" cy="48" r="6" fill="#ff5ca8" stroke="#1b1b2f" stroke-width="2.5"/><circle cx="152" cy="48" r="6" fill="#ff5ca8" stroke="#1b1b2f" stroke-width="2.5"/>
    <ellipse cx="120" cy="112" rx="46" ry="40" fill="#7ed957" stroke="#1b1b2f" stroke-width="4"/>%EYES%
    <path d="M110 134 q10 8 20 0" stroke="#1b1b2f" stroke-width="3" fill="none" stroke-linecap="round"/>`,
  },
  pilot: {
    label: 'Space cat · Rocket pilot', ears: '#e0e0e8', suit: '#7e57c2', trim: '#5e3fa0', eyes: PILOT_EYES, eyeAt: [108, 132, 118, 7],
    closed: closedEyes(108, 132, 118, '#1b1b2f', 5),
    head: `<circle cx="120" cy="112" r="44" fill="#e0e0e8" stroke="#1b1b2f" stroke-width="4"/>
    <path d="M80 96 Q120 66 160 96 L156 104 Q120 82 84 104 Z" fill="#2d3a6b"/>
    <ellipse cx="120" cy="122" rx="28" ry="24" fill="#f2c9a0" stroke="#1b1b2f" stroke-width="3"/>%EYES%
    <path d="M112 132 q8 6 16 0" stroke="#1b1b2f" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    <circle cx="80" cy="120" r="6" fill="#ff7043" stroke="#1b1b2f" stroke-width="2"/><circle cx="160" cy="120" r="6" fill="#ff7043" stroke="#1b1b2f" stroke-width="2"/>`,
    extraBody: `<path d="M100 160 l20 24 l20 -24" stroke="#ffd84f" stroke-width="4" fill="none"/>`,
  },
  bunny: {
    label: 'Space cat · Moon cat', ears: '#ffffff', suit: '#9fb8ff', trim: '#7a96e6', eyes: BUNNY_EYES, eyeAt: [108, 132, 120, 7],
    closed: closedEyes(108, 132, 120, '#1b1b2f', 5),
    head: `<ellipse cx="120" cy="120" rx="32" ry="28" fill="#fff" stroke="#1b1b2f" stroke-width="3"/>%EYES%
    <path d="M117 128 h6 l-3 3 Z" fill="#ff8fab"/><path d="M114 134 q3 3 6 0 q3 3 6 0" stroke="#1b1b2f" stroke-width="2" fill="none"/>
    <circle cx="120" cy="108" r="50" fill="#bfe6ff" fill-opacity=".18" stroke="#bfe6ff" stroke-width="3"/>
    <path d="M90 84 q10 -12 26 -14" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round" opacity=".8"/>`,
  },
  octo: {
    label: 'Space cat · Octo cat', ears: '#b06ad9', suit: '#b06ad9', trim: '#8a46b8', eyes: OCTO_EYES, eyeAt: [114, 126, 108, 9],
    closed: `<path d="M106 108 q14 8 28 0" stroke="#1b1b2f" stroke-width="3" fill="none" stroke-linecap="round"/>`,
    legs: `<path d="M98 220 q-10 14 -4 22 M110 222 q-4 14 2 20 M130 222 q4 14 -2 20 M142 220 q10 14 4 22" stroke="#8a46b8" stroke-width="9" fill="none" stroke-linecap="round"/>`,
    head: `<path d="M74 128 Q72 62 120 60 Q168 62 166 128 Z" fill="#b06ad9" stroke="#1b1b2f" stroke-width="4"/>
    <circle cx="92" cy="90" r="5" fill="#d9a5f2"/><circle cx="150" cy="82" r="4" fill="#d9a5f2"/>%EYES%
    <path d="M108 132 q12 8 24 0" stroke="#1b1b2f" stroke-width="3" fill="none" stroke-linecap="round"/>`,
  },
  cowboy: {
    label: 'Space cat · Star cowboy', ears: '#e8b98a', suit: '#c47f3a', trim: '#5a4330', eyes: COWBOY_EYES, eyeAt: [110, 130, 120, 7],
    closed: closedEyes(110, 130, 120, '#1b1b2f', 5),
    head: `<ellipse cx="120" cy="120" rx="30" ry="30" fill="#e8b98a" stroke="#1b1b2f" stroke-width="3"/>%EYES%
    <path d="M110 132 q10 5 20 0" stroke="#1b1b2f" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    <path d="M94 142 L120 156 L146 142 L146 150 L120 162 L94 150 Z" fill="#d84a4a" stroke="#1b1b2f" stroke-width="2"/>
    <ellipse cx="120" cy="96" rx="56" ry="9" fill="#7a5230" stroke="#1b1b2f" stroke-width="3"/>
    <path d="M94 96 Q94 64 120 64 Q146 64 146 96 Z" fill="#8a6238" stroke="#1b1b2f" stroke-width="3"/>
    <rect x="94" y="86" width="52" height="6" fill="#3a2a1a"/>`,
    hand: `<rect x="164" y="160" width="24" height="9" rx="3" fill="#9aa0a8" stroke="#2b2f35" stroke-width="2"/><rect x="166" y="167" width="8" height="12" rx="2" fill="#5a4330"/><circle cx="190" cy="164" r="3" fill="#ff5252"/>`,
  },
  songkok: {
    label: 'Cat · Songkok (baju Melayu)', ears: '#e8b98a', suit: '#1f8a70', trim: '#16624f', eyes: COWBOY_EYES, eyeAt: [110, 130, 120, 7],
    closed: closedEyes(110, 130, 120, '#1b1b2f', 5),
    head: `<ellipse cx="120" cy="118" rx="36" ry="34" fill="#e8b98a" stroke="#1b1b2f" stroke-width="4"/>
    <rect x="92" y="70" width="56" height="24" rx="5" fill="#141414" stroke="#1b1b2f" stroke-width="2"/>
    <path d="M96 76 h48" stroke="#3a3a3a" stroke-width="2"/>%EYES%
    <path d="M117 128 h6 l-3 3 Z" fill="#c96d6d"/>
    <path d="M112 134 q4 4 8 0 q4 4 8 0" stroke="#1b1b2f" stroke-width="2.5" fill="none" stroke-linecap="round"/>`,
    extraBody: `<path d="M106 156 l14 14 l14 -14" stroke="#16624f" stroke-width="4" fill="none"/>
    <circle cx="120" cy="178" r="2.5" fill="#d4a84a"/><circle cx="120" cy="188" r="2.5" fill="#d4a84a"/>
    <rect x="92" y="200" width="56" height="22" fill="#d4a84a" stroke="#1b1b2f" stroke-width="2"/>
    <path d="M96 204 l6 7 l6 -7 l6 7 l6 -7 l6 7 l6 -7 l6 7 l6 -7 M96 218 l6 -7 l6 7 l6 -7 l6 7 l6 -7 l6 7 l6 -7 l6 7" stroke="#8a6a20" stroke-width="1.5" fill="none"/>`,
    hand: `<g fill="#6b3f22" stroke="#3a2210" stroke-width="1">${Array.from({ length: 11 }, (_, i) => { const a = Math.PI * (0.1 + (i / 10) * 0.8); return `<circle cx="${(172 + Math.cos(a) * 8).toFixed(1)}" cy="${(180 + Math.sin(a) * 14).toFixed(1)}" r="2.4"/>` }).join('')}</g><path d="M172 194 v8" stroke="#d4a84a" stroke-width="2"/>`,
  },
}

const CREW_SKINS = Object.fromEntries(Object.entries(CREW).map(([k, o]) => {
  const parts = crewParts(o)
  return [k, {
    label: o.label, parts, sleeping: dozing(parts, o.eyes, o.closed), eyes: o.eyes, brows: '',
    eyeAt: o.eyeAt, recolor: [] as [string, string][], css: CREW_CSS,
  }]
})) as Record<string, Skin>

// ---- The skins and their red alert.

type Skin = {
  label: string
  parts: string
  sleeping: string
  eyes: string
  brows: string
  /** Where the warning eyes go: left x, right x, y, radius. */
  eyeAt: [number, number, number, number]
  /** How far below the eyes the screaming mouth goes (default 24). */
  mouthDy?: number
  recolor: [string, string][]
  /** Pivot points for this drawing's moving parts. */
  css: string
}

const SKINS: Record<CatSkin, Skin> = {
  gray: {
    label: 'Gray kitty',
    parts: GRAY_PARTS, sleeping: GRAY_SLEEPING, eyes: GRAY_EYES, brows: GRAY_BROWS,
    eyeAt: [98, 142, 116, 13],
    recolor: [[GRAY, '#ff6b6b'], [GRAY_DARK, '#d32f2f'], [PINK, '#ff3030']],
    css: `.tail { transform-origin: 146px 228px; } .armL { transform-origin: 100px 174px; } .armR { transform-origin: 140px 174px; }
  .breathe { transform-origin: 140px 238px; } .headS { transform-origin: 88px 226px; } .tailS { transform-origin: 190px 226px; }`,
  },
  ginger: {
    label: 'Ginger with a heart',
    parts: GINGER_PARTS, sleeping: dozing(GINGER_PARTS, GINGER_EYES, closedEyes(100, 140, 116, G_INK)), eyes: GINGER_EYES, brows: GINGER_BROWS,
    eyeAt: [100, 140, 116, 11],
    recolor: [[G_FUR, '#ff6b6b'], [G_PINK, '#b71c1c']],
    css: STANDARD_CSS + `\n  .bubble { animation: bubblebob 1.6s ease-in-out infinite alternate; }\n  @keyframes bubblebob { from { transform: translateY(0) } to { transform: translateY(-6px) } }`,
  },
  ghost: {
    label: 'Ghost cat',
    parts: GHOST_PARTS, sleeping: dozing(GHOST_PARTS, GHOST_EYES, closedEyes(106, 136, 114, GH_INK, 7)), eyes: GHOST_EYES, brows: '',
    eyeAt: [106, 136, 114, 10],
    recolor: [[GH_BODY, '#ffb3b3'], [GH_PINK, '#d50000']],
    css: `.tail { transform-origin: 152px 196px; } .armL { transform-origin: 88px 156px; } .armR { transform-origin: 154px 176px; }
  .breathe { transform-origin: 120px 240px; animation: breathe 2.6s ease-in-out infinite; }
  .cat { animation-name: ghostbob; } @keyframes ghostbob { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-8px) } }`,
  },
  cool: {
    label: 'Cool cat (sunglasses)',
    parts: COOL_PARTS, sleeping: dozing(COOL_PARTS, '', ''), eyes: COOL_EYES, brows: '',
    eyeAt: [88, 152, 142, 15],
    mouthDy: 46,
    recolor: [[C_WHITE, '#ffcdd2'], [C_BLACK, '#7f0000']],
    css: `.head { transform-origin: 120px 200px; } .breathe { transform-origin: 120px 216px; animation: breathe 2.6s ease-in-out infinite; }`,
  },
  black: {
    label: 'Black cat',
    parts: BLACK_PARTS, sleeping: dozing(BLACK_PARTS, BLACK_EYES, closedEyes(104, 136, 116, '#fff')), eyes: BLACK_EYES, brows: '',
    eyeAt: [104, 136, 116, 10],
    recolor: [[B_FUR, '#7f0000'], [B_EDGE, '#ff5252']],
    css: STANDARD_CSS.replace('148px 222px', '146px 224px'),
  },
  siamese: {
    label: 'Siamese',
    parts: SIAMESE_PARTS, sleeping: dozing(SIAMESE_PARTS, SIAMESE_EYES, closedEyes(104, 136, 108, S_LINE, 6)), eyes: SIAMESE_EYES, brows: '',
    eyeAt: [104, 136, 108, 9],
    recolor: [[S_CREAM, '#ffcdd2'], [S_POINT, '#c62828']],
    css: STANDARD_CSS.replace('148px 222px', '146px 222px'),
  },
  kawaii: {
    label: 'White striped',
    parts: KAWAII_PARTS, sleeping: KAWAII_SLEEPING, eyes: KAWAII_EYES, brows: KAWAII_BROWS,
    eyeAt: [100, 140, 118, 13],
    recolor: [[FUR, '#ff6b6b'], [STRIPE, '#b71c1c'], [EAR, '#ff3030']],
    css: `.tail { transform-origin: 148px 224px; } .armL { transform-origin: 100px 174px; } .armR { transform-origin: 140px 174px; }
  .breathe { transform-origin: 140px 238px; } .headS { transform-origin: 88px 226px; } .tailS { transform-origin: 190px 226px; }`,
  },
  classic: {
    label: 'Orange in sunglasses',
    parts: CLASSIC_PARTS, sleeping: CLASSIC_SLEEPING, eyes: CLASSIC_EYES, brows: CLASSIC_BROWS,
    eyeAt: [101, 139, 108, 11],
    recolor: [['#f29a3c', '#e53935'], ['#ffe2bf', '#ffcdd2'], ['#e0862a', '#b71c1c'], ['#c96d1c', '#8e0000'], ['#ffb3c8', '#ff8a80']],
    css: `.tail { transform-origin: 150px 190px; } .armL { transform-origin: 98px 160px; } .armR { transform-origin: 142px 160px; }
  .breathe { transform-origin: 136px 236px; } .headS { transform-origin: 88px 226px; } .tailS { transform-origin: 180px 222px; }`,
  },
  ...(CREW_SKINS as Record<'knight' | 'shadow' | 'droid' | 'astro' | 'zib' | 'pilot' | 'bunny' | 'octo' | 'cowboy' | 'songkok', Skin>),
}

/** A wide-open screaming mouth, with teeth and a wobbling tongue. */
function screamMouth([lx, rx, y]: Skin['eyeAt'], dy: number): string {
  const cx = (lx + rx) / 2
  const cy = y + dy
  return `<g class="scream">
      <ellipse cx="${cx}" cy="${cy}" rx="13" ry="15" fill="#4a0000" stroke="#1a1a1a" stroke-width="2.5"/>
      <path d="M${cx - 9} ${cy - 10} l3 5 l3 -5 l3 5 l3 -5 l3 5 l3 -5" fill="#fff" stroke="#fff" stroke-width="1" stroke-linejoin="round"/>
      <ellipse class="tongue" cx="${cx}" cy="${cy + 8}" rx="7" ry="4.5" fill="#ff5c7a"/>
    </g>`
}

/** Steam puffs from the ears and a throbbing anger mark. */
function rageMarks([lx, rx, y]: Skin['eyeAt']): string {
  return `<g class="steam">
      <circle class="puff" cx="${lx - 14}" cy="${y - 52}" r="6" fill="#e8e8e8"/>
      <circle class="puff p2" cx="${rx + 14}" cy="${y - 52}" r="6" fill="#e8e8e8"/>
      <circle class="puff p3" cx="${lx - 8}" cy="${y - 52}" r="4" fill="#e8e8e8"/>
      <circle class="puff p4" cx="${rx + 8}" cy="${y - 52}" r="4" fill="#e8e8e8"/>
    </g>
    <g class="vein" transform="translate(${rx + 4} ${y - 36})">
      <path d="M-8 -3 q5 0 5 -5 M8 -3 q-5 0 -5 -5 M-8 3 q5 0 5 5 M8 3 q-5 0 -5 5" stroke="#ff1744" stroke-width="3.2" fill="none" stroke-linecap="round"/>
    </g>`
}

function warningEyes([lx, rx, y, r]: Skin['eyeAt']): string {
  return `<g class="warn">
      <circle cx="${lx}" cy="${y}" r="${r}" fill="#fff3b0" stroke="#1a1a1a" stroke-width="2"/><circle cx="${rx}" cy="${y}" r="${r}" fill="#fff3b0" stroke="#1a1a1a" stroke-width="2"/>
      <circle cx="${lx}" cy="${y + 2}" r="${r * 0.45}" fill="#d50000"/><circle cx="${rx}" cy="${y + 2}" r="${r * 0.45}" fill="#d50000"/>
    </g>`
}

function angryBrows([lx, rx, y]: Skin['eyeAt']): string {
  return `<path d="M${lx - 14} ${y - 22} l24 9 M${rx + 14} ${y - 22} l-24 9" stroke="#1a1a1a" stroke-width="5" stroke-linecap="round"/>`
}

const BANG = `<text class="bang" x="176" y="84" font-size="40" font-weight="900" fill="#ffea00" stroke="#b71c1c" stroke-width="2">!</text>`

/** The character at 90% usage: red all over, warning eyes and a bouncing "!". */
function alertify(markup: string, skin: Skin): string {
  // The space crew have no fur palette: tint the whole drawing red instead.
  if (skin.recolor.length === 0) {
    return `<g style="filter: sepia(1) saturate(6) hue-rotate(-45deg) brightness(.95)">${markup}</g>` + BANG
  }
  let out = skin.brows
    ? markup.replace(skin.eyes, warningEyes(skin.eyeAt)).replace(skin.brows, angryBrows(skin.eyeAt))
    : markup.replace(skin.eyes, warningEyes(skin.eyeAt) + angryBrows(skin.eyeAt))
  for (const [from, to] of skin.recolor) out = out.split(from).join(to)
  return out + BANG
}

function moodGroup(m: Mood, skin: Skin, isAlert = false): string {
  if (isAlert) return alertify(moodGroup(m === 'sleep' ? 'headbang' : m, skin), skin)
  if (m === 'sleep') return `<g class="mv-sleep">${skin.sleeping}</g>`
  if (m === 'play') return `<g class="mv-play">${NOTES}<g class="cat">${skin.parts}</g>${YARN}</g>`
  return `<g class="mv-${m}">${NOTES}<g class="cat">${skin.parts}</g></g>`
}

/** How long each animation takes, times this: above 1 is slower. */
function speedFor(s: CatSettings, isWorking: boolean): number {
  const base = s.vibe === 'relaxed' ? 1.8 : s.vibe === 'party' ? 0.75 : 1
  const boost = s.turbo && isWorking ? (s.vibe === 'relaxed' ? 0.75 : 0.5) : 1
  return base * boost
}

function catCss(speed: number, skin: Skin): string {
  const d = (t: number) => `${(t * speed).toFixed(2)}s`
  return `
  .catglow { animation: catpulse ${d(0.6)} ease-in-out infinite alternate; }
  .warn { animation: warnflash .5s steps(2) infinite; }
  .bang { animation: bangpop .3s ease-in-out infinite alternate; transform-box: fill-box; transform-origin: center; }
  .rage { animation: rageshake .09s linear infinite; }
  .scream { transform-box: fill-box; transform-origin: center; animation: yell .25s ease-in-out infinite alternate; }
  .tongue { transform-box: fill-box; transform-origin: center; animation: wobble .18s ease-in-out infinite alternate; }
  .puff { opacity: 0; animation: puff 1s ease-out infinite; }
  .puff.p2 { animation-delay: -.5s; } .puff.p3 { animation-delay: -.25s; } .puff.p4 { animation-delay: -.75s; }
  .vein { animation: throb .35s ease-in-out infinite alternate; }
  @keyframes rageshake { 0% { transform: translate(0,0) } 25% { transform: translate(-2px,1px) rotate(-1deg) } 50% { transform: translate(2px,-1px) } 75% { transform: translate(-1px,-2px) rotate(1deg) } 100% { transform: translate(1px,2px) } }
  @keyframes yell { from { transform: scale(.9,.85) } to { transform: scale(1.1,1.15) } }
  @keyframes wobble { from { transform: translateX(-2px) } to { transform: translateX(2px) } }
  @keyframes puff { 0% { transform: translateY(0) scale(.6); opacity: 0 } 25% { opacity: .9 } 100% { transform: translateY(-26px) scale(1.6); opacity: 0 } }
  @keyframes throb { from { transform: scale(.85) } to { transform: scale(1.2) } }
  .tail { transform-origin: 148px 224px; animation: wag ${d(0.4)} ease-in-out infinite alternate; }
  .armL { transform-origin: 100px 174px; animation: wave ${d(0.45)} ease-in-out infinite alternate; }
  .armR { transform-origin: 140px 174px; animation: wave ${d(0.45)} ease-in-out infinite alternate-reverse; }
  .head { transform-origin: 120px 120px; animation: tilt ${d(0.9)} ease-in-out infinite; }
  .cat { transform-origin: 120px 200px; }
  .note { animation: float ${d(1.8)} ease-out infinite; opacity: 0; }
  .note.n2 { animation-delay: -${d(0.9)}; }
  .mv-chill .cat { animation: chill ${d(1.6)} ease-in-out infinite; }
  .mv-chill .head { animation: chillhead ${d(1.6)} ease-in-out infinite; }
  .mv-chill .armL, .mv-chill .armR { animation: armsway ${d(1.6)} ease-in-out infinite alternate; }
  .mv-chill .tail { animation: wag ${d(1.2)} ease-in-out infinite alternate; }
  .mv-vibe .cat { animation: sway ${d(0.9)} ease-in-out infinite; }
  .mv-headbang .cat { animation: bob ${d(0.35)} ease-in-out infinite; }
  .mv-headbang .head { animation: bang ${d(0.35)} ease-in-out infinite; }
  .mv-spin .cat { animation: spin ${d(1.6)} linear infinite; }
  .mv-shuffle .cat { animation: shuffle ${d(0.6)} ease-in-out infinite; }
  .mv-play .cat { animation: pounce ${d(1.1)} ease-in-out infinite; }
  .mv-play .armR { animation: swipe ${d(0.55)} ease-in-out infinite alternate; }
  .mv-play .head { animation: watch ${d(1.1)} ease-in-out infinite; }
  .yarn { transform-box: fill-box; transform-origin: center; animation: roll ${d(1.1)} ease-in-out infinite; }
  .spark { animation: twinkle ${d(0.8)} ease-in-out infinite alternate; }
  .spark.s2 { animation-delay: -${d(0.4)}; }
  .breathe { transform-origin: 140px 238px; animation: breathe 2.6s ease-in-out infinite; }
  .headS { transform-origin: 88px 226px; animation: nod 2.6s ease-in-out infinite; }
  .tailS { transform-origin: 190px 226px; animation: flick 3.2s ease-in-out infinite; }
  .z { opacity: 0; animation: zfloat 3s ease-out infinite; }
  .z.z2 { animation-delay: -1s; } .z.z3 { animation-delay: -2s; }
  .floor rect { animation: disco ${d(1.2)} steps(1) infinite; }
  .floor rect:nth-child(2n) { animation-delay: -${d(0.6)}; }
  .floor rect:nth-child(3n) { animation-delay: -${d(0.3)}; }
  @keyframes catpulse { from { opacity: .25 } to { opacity: .6 } }
  @keyframes warnflash { 0% { opacity: 1 } 50% { opacity: .55 } }
  @keyframes bangpop { from { transform: scale(.85) rotate(-8deg) } to { transform: scale(1.15) rotate(8deg) } }
  @keyframes chill { 0%,100% { transform: rotate(-3deg) } 50% { transform: rotate(3deg) translateY(-2px) } }
  @keyframes chillhead { 0%,100% { transform: rotate(4deg) } 50% { transform: rotate(-4deg) } }
  @keyframes armsway { from { transform: rotate(-8deg) } to { transform: rotate(10deg) } }
  @keyframes sway { 0%,100% { transform: rotate(-8deg) } 50% { transform: rotate(8deg) translateY(-6px) } }
  @keyframes bob { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-14px) } }
  @keyframes spin { from { transform: rotate(0) } to { transform: rotate(360deg) } }
  @keyframes shuffle { 0%,100% { transform: translateX(-22px) } 25% { transform: translateX(0) translateY(-8px) } 50% { transform: translateX(22px) } 75% { transform: translateX(0) translateY(-8px) } }
  @keyframes tilt { 0%,100% { transform: rotate(10deg) } 50% { transform: rotate(-10deg) } }
  @keyframes bang { 0%,100% { transform: rotate(-4deg) } 50% { transform: rotate(22deg) translateY(6px) } }
  @keyframes wag { from { transform: rotate(-25deg) } to { transform: rotate(25deg) } }
  @keyframes wave { from { transform: rotate(-35deg) } to { transform: rotate(45deg) } }
  @keyframes swipe { from { transform: rotate(-60deg) } to { transform: rotate(20deg) } }
  @keyframes pounce { 0%,100% { transform: translate(0,0) rotate(0) } 30% { transform: translate(8px,-20px) rotate(-6deg) } 60% { transform: translate(14px,0) rotate(5deg) } }
  @keyframes watch { 0%,100% { transform: rotate(-6deg) } 50% { transform: rotate(14deg) } }
  @keyframes roll { 0%,100% { transform: translateX(0) rotate(0) } 50% { transform: translateX(-30px) rotate(-360deg) } }
  @keyframes twinkle { from { opacity: .1; transform: scale(.8) } to { opacity: 1; transform: scale(1.2) } }
  @keyframes breathe { 0%,100% { transform: scaleY(1) } 50% { transform: scaleY(1.06) } }
  @keyframes nod { 0%,100% { transform: rotate(0) } 50% { transform: rotate(-3deg) } }
  @keyframes flick { 0%,80%,100% { transform: rotate(0) } 88% { transform: rotate(-14deg) } }
  @keyframes zfloat { 0% { transform: translate(0,0); opacity: 0 } 15% { opacity: 1 } 100% { transform: translate(34px,-70px); opacity: 0 } }
  @keyframes float { 0% { transform: translateY(0); opacity: 0 } 20% { opacity: 1 } 100% { transform: translateY(-60px); opacity: 0 } }
  ${skin.css}
  @keyframes disco { 0% { fill: #ff4fa3 } 33% { fill: #4fd1ff } 66% { fill: #ffd84f } }`
}

const FLOOR = `<g class="floor">
  <rect x="0" y="240" width="40" height="40" rx="4"/><rect x="40" y="240" width="40" height="40" rx="4"/><rect x="80" y="240" width="40" height="40" rx="4"/>
  <rect x="120" y="240" width="40" height="40" rx="4"/><rect x="160" y="240" width="40" height="40" rx="4"/><rect x="200" y="240" width="40" height="40" rx="4"/>
</g>`


/** The pane's cat: the current mood, its glow circle and a disco floor. */
function paneCatSvg(m: Mood, skin: Skin, speed: number, isAlert = false): string {
  return `<svg xmlns="${SVG_NS}" viewBox="0 0 240 280" width="240" height="280">
<style>${catCss(speed, skin)}</style>
${FLOOR}${moodGroup(m, skin, isAlert)}
</svg>`
}

/**
 * The strip's cat: every mood stacked, the current one first; a click shows
 * the next. No script: each layer's SMIL <set> hides it and shows the next on
 * click (a later-started <set> wins, so the cycle repeats).
 */
function catLayers(start: Mood, skin: Skin, isAlert: boolean): string {
  const i0 = MOODS.indexOf(start)
  const order = [...MOODS.slice(i0), ...MOODS.slice(0, i0)]
  return order
    .map((m, i) => {
      const prev = (i + order.length - 1) % order.length
      return `<g id="L${i}" display="${i === 0 ? 'inline' : 'none'}" style="cursor:pointer">
  <set attributeName="display" to="none" begin="L${i}.click" fill="freeze"/>
  <set attributeName="display" to="inline" begin="L${prev}.click" fill="freeze"/>
  <rect x="20" y="40" width="200" height="200" fill="transparent"/>
  ${moodGroup(m, skin, isAlert)}
</g>`
    })
    .join('\n')
}

// ---------- the lightsaber usage meter ----------

const SABERS: Record<SaberTheme, { label: string; core: string; glow: string }> = {
  auto: { label: 'Auto (blue → purple → red)', core: '', glow: '' },
  jedi: { label: 'Jedi blue', core: '#eef9ff', glow: '#2aa8ff' },
  yoda: { label: 'Yoda green', core: '#f0fff2', glow: '#2bff5a' },
  mace: { label: 'Mace purple', core: '#f6eaff', glow: '#b04dff' },
  sith: { label: 'Sith red', core: '#fff1f1', glow: '#ff2a2a' },
  darksaber: { label: 'Darksaber', core: '#0b0b0f', glow: '#d8e0ff' },
  rainbow: { label: 'Rainbow', core: '#ffffff', glow: '#ff2a2a' },
}

function saberColors(theme: SaberTheme, p: number): { core: string; glow: string } {
  if (theme !== 'auto') return SABERS[theme]
  if (p >= 80) return SABERS.sith
  if (p >= 50) return SABERS.mace
  return SABERS.jedi
}

const SABER_W = 240
const HILT_W = 44
const BLADE_MAX = SABER_W - HILT_W - 10

const bladeLength = (percent: number) => Math.max(4, (BLADE_MAX * Math.max(0, Math.min(100, percent))) / 100)

/** The saber's styles and markup in its own 240x40 box. */
function saberParts(percent: number, theme: SaberTheme, isFast: boolean): { css: string; defs: string; body: string } {
  const p = Math.max(0, Math.min(100, percent))
  const { core, glow } = saberColors(theme, p)
  const blade = bladeLength(p)
  const x0 = HILT_W
  const flicker = isFast ? '0.08s' : '0.14s'
  const rainbow = theme === 'rainbow'
  const css = `
  .sglow { animation: shum ${flicker} steps(2) infinite alternate${rainbow ? ', srainbow 3s linear infinite' : ''}; }
  .signite { transform-origin: ${x0}px 20px; }
  .sshine { animation: sshine 1.8s linear infinite; }
  @keyframes shum { from { opacity: .75 } to { opacity: 1 } }
  @keyframes signite { from { transform: scaleX(0) } to { transform: scaleX(1) } }
  @keyframes sshine { from { transform: translateX(-30px) } to { transform: translateX(${blade + 10}px) } }
  @keyframes srainbow { 0%,100% { fill: #ff2a2a } 17% { fill: #ffb02a } 33% { fill: #f5ff2a } 50% { fill: #2bff5a } 67% { fill: #2aa8ff } 83% { fill: #b04dff } }`
  const defs = `
  <filter id="sblur" x="-20%" y="-200%" width="140%" height="500%"><feGaussianBlur stdDeviation="4"/></filter>
  <filter id="sblur2" x="-20%" y="-200%" width="140%" height="500%"><feGaussianBlur stdDeviation="1.4"/></filter>
  <linearGradient id="shilt" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#d9dde3"/><stop offset=".5" stop-color="#8a9099"/><stop offset="1" stop-color="#4b5058"/>
  </linearGradient>
  <clipPath id="sbladeClip"><rect x="${x0}" y="15" width="${blade}" height="10" rx="5"/></clipPath>`
  const body = `
<rect x="${x0}" y="14" width="${BLADE_MAX}" height="12" rx="6" fill="${rainbow ? '#b04dff' : glow}" opacity=".12"/>
<g class="signite">
  <rect class="sglow" x="${x0}" y="11" width="${blade}" height="18" rx="9" fill="${glow}" filter="url(#sblur)"/>
  <rect class="sglow" x="${x0}" y="15" width="${blade}" height="10" rx="5" fill="${glow}" filter="url(#sblur2)"/>
  <rect x="${x0}" y="17" width="${blade}" height="6" rx="3" fill="${core}"/>
  <g clip-path="url(#sbladeClip)"><rect class="sshine" x="${x0}" y="15" width="24" height="10" fill="#fff" opacity="${theme === 'darksaber' ? '.35' : '.85'}" filter="url(#sblur2)"/></g>
</g>
<rect x="4" y="13" width="${HILT_W - 2}" height="14" rx="3" fill="url(#shilt)"/>
<rect x="10" y="13" width="3" height="14" fill="#2b2f35"/><rect x="17" y="13" width="3" height="14" fill="#2b2f35"/><rect x="24" y="13" width="3" height="14" fill="#2b2f35"/>
<rect class="${rainbow ? 'sglow' : ''}" x="31" y="16" width="6" height="8" rx="1" fill="${glow}" opacity=".9"/>
<rect x="${HILT_W}" y="12" width="4" height="16" rx="1" fill="#3a3f46"/>`
  return { css, defs, body }
}

/** The saber alone (settings preview), at half its old thickness. */
function saberSvg(percent: number, theme: SaberTheme, isFast: boolean): string {
  const { css, defs, body } = saberParts(percent, theme, isFast)
  return `<svg xmlns="${SVG_NS}" viewBox="0 10 ${SABER_W} 20" width="${SABER_W}" height="10" preserveAspectRatio="none">
<defs>${defs}</defs><style>${css}</style>${body}
</svg>`
}

/** The strip's cat alone: every mood stacked, clickable, no background. */
function stripCatSvg(mood: Mood, skin: Skin, speed: number, isAlert: boolean): string {
  return `<svg xmlns="${SVG_NS}" viewBox="20 40 200 200" width="${CAT_PX}" height="${CAT_PX}">
<style>${catCss(speed, skin)}</style>${catLayers(mood, skin, isAlert)}</svg>`
}

const CAT_PX = 64
// The band gives its width in columns, not pixels: these turn one into the other.
// Measured: an 84-column strip is about 730px wide on the desktop app.
const PX_PER_COLUMN = 8.6
const GEAR_PX = 44
const GAP_PX = 16
const LENGTH_PX: Record<BarLength, number> = { fill: 120, long: 300, medium: 200, short: 120 }

// ---------- other progress bars ----------

const levelColor = (p: number) => (p >= 80 ? '#ff4d4d' : p >= 50 ? '#ffb02a' : '#4fd18b')

/** n icons across `w`, the first `filled` drawn full, the rest empty. */
function iconRow(w: number, n: number, filled: number, draw: (x: number, isFull: boolean, i: number) => string): string {
  const step = w / n
  return Array.from({ length: n }, (_, i) => draw(step * i + step / 2, i < filled, i)).join('')
}

const PAW = (x: number, y: number, fill: string, op = 1) =>
  `<g transform="translate(${x.toFixed(1)} ${y})" fill="${fill}" opacity="${op}"><ellipse cx="0" cy="2.5" rx="4" ry="3.3"/><circle cx="-4.2" cy="-2.5" r="1.7"/><circle cx="-1.4" cy="-4.4" r="1.7"/><circle cx="1.4" cy="-4.4" r="1.7"/><circle cx="4.2" cy="-2.5" r="1.7"/></g>`

const FISH = (x: number, y: number, fill: string) =>
  `<g transform="translate(${x.toFixed(1)} ${y})"><path d="M-6 0 q6 -6 12 0 q-6 6 -12 0 Z" fill="${fill}"/><path d="M6 0 l4 -4 v8 Z" fill="${fill}"/><circle cx="-3" cy="-1" r=".9" fill="#1a1a1a"/></g>`

const BONES = (x: number, y: number) =>
  `<g transform="translate(${x.toFixed(1)} ${y})" stroke="#9a9a9a" stroke-width="1.2" fill="none" stroke-linecap="round"><circle cx="-5" cy="0" r="2.4"/><path d="M-2.6 0 h9 M-0.5 -3 v6 M2 -3 v6 M4.5 -3 v6 M7 0 l3 -3 M7 0 l3 3"/></g>`

const HEART = (x: number, y: number, fill: string, stroke: string) =>
  `<path transform="translate(${x.toFixed(1)} ${y})" d="M0 5 C-7 0 -6 -5 -3 -5.5 C-1.5 -5.8 0 -4.5 0 -3 C0 -4.5 1.5 -5.8 3 -5.5 C6 -5 7 0 0 5 Z" fill="${fill}" stroke="${stroke}" stroke-width="1"/>`

type BarArt = { source: string; width: number; height: number }

const BARS: Record<BarStyle, { label: string; draw: (p: number, w: number, theme: SaberTheme, isFast: boolean) => BarArt }> = {
  saber: {
    label: 'Lightsaber',
    draw: (p, w, theme, isFast) => ({ source: saberSvg(p, theme, isFast), width: w, height: w < 150 ? 6 : 10 }),
  },
  paws: {
    label: 'Paw prints',
    draw: (p, w) => {
      const n = w < 150 ? 5 : 10
      const filled = Math.round((p / 100) * n)
      const c = levelColor(p)
      const row = iconRow(w, n, filled, (x, full, i) => full
        ? `<g class="${i === filled - 1 ? 'pop' : ''}" style="transform-origin:${x.toFixed(1)}px 9px">${PAW(x, 9, c)}</g>`
        : PAW(x, 9, '#8a8a8a', 0.3))
      return { width: w, height: 18, source: `<svg xmlns="${SVG_NS}" viewBox="0 0 ${w} 18" width="${w}" height="18"><style>.pop{animation:pop 1.2s ease-in-out infinite}@keyframes pop{0%,100%{transform:scale(1)}50%{transform:scale(1.25)}}</style>${row}</svg>` }
    },
  },
  yarn: {
    label: 'Yarn ball',
    draw: (p, w) => {
      const end = 8 + ((w - 16) * Math.max(0, Math.min(100, p))) / 100
      const c = p >= 80 ? '#ff4d6d' : '#ff7eb6'
      return { width: w, height: 18, source: `<svg xmlns="${SVG_NS}" viewBox="0 0 ${w} 18" width="${w}" height="18">
<style>.ball{transform-box:fill-box;transform-origin:center;animation:roll 2s linear infinite}@keyframes roll{to{transform:rotate(360deg)}}</style>
<path d="M4 9 H${w - 4}" stroke="#8a8a8a" stroke-width="1.5" stroke-dasharray="2 4" opacity=".4"/>
<path d="M4 9 Q${(end / 4).toFixed(1)} 4 ${(end / 2).toFixed(1)} 9 T${end.toFixed(1)} 9" stroke="${c}" stroke-width="2" fill="none"/>
<g class="ball"><circle cx="${end.toFixed(1)}" cy="9" r="7" fill="${c}"/><path d="M${(end - 5).toFixed(1)} 6 q5 -3 10 1 M${(end - 6).toFixed(1)} 10 q6 3 12 -1 M${(end - 1).toFixed(1)} 3 q3 6 0 12" stroke="#c2185b" stroke-width="1" fill="none"/></g>
</svg>` }
    },
  },
  fish: {
    label: 'Fish snacks (eaten = used)',
    draw: (p, w) => {
      const n = w < 150 ? 5 : 10
      const eaten = Math.round((p / 100) * n)
      const row = iconRow(w, n, eaten, (x, isEaten) => (isEaten ? BONES(x, 9) : FISH(x, 9, '#5ab8ff')))
      return { width: w, height: 18, source: `<svg xmlns="${SVG_NS}" viewBox="0 0 ${w} 18" width="${w}" height="18">${row}</svg>` }
    },
  },
  hearts: {
    label: 'Hearts (lives left)',
    draw: (p, w) => {
      const n = w < 150 ? 5 : 10
      const left = n - Math.round((p / 100) * n)
      const row = iconRow(w, n, left, (x, full, i) => full
        ? `<g class="${left <= 2 && i < left ? 'beat' : ''}" style="transform-origin:${x.toFixed(1)}px 9px">${HEART(x, 9, '#ff4d6d', '#b0002b')}</g>`
        : HEART(x, 9, 'none', '#8a8a8a'))
      return { width: w, height: 18, source: `<svg xmlns="${SVG_NS}" viewBox="0 0 ${w} 18" width="${w}" height="18"><style>.beat{animation:beat .8s ease-in-out infinite}@keyframes beat{0%,100%{transform:scale(1)}50%{transform:scale(1.3)}}</style>${row}</svg>` }
    },
  },
  neon: {
    label: 'Neon tube',
    draw: (p, w) => {
      const fill = Math.max(6, ((w - 4) * Math.max(0, Math.min(100, p))) / 100)
      return { width: w, height: 12, source: `<svg xmlns="${SVG_NS}" viewBox="0 0 ${w} 12" width="${w}" height="12">
<defs><linearGradient id="ng" x1="0" x2="1"><stop offset="0" stop-color="#00e5ff"/><stop offset=".6" stop-color="#b04dff"/><stop offset="1" stop-color="#ff2bd6"/></linearGradient>
<filter id="nb" x="-10%" y="-100%" width="120%" height="300%"><feGaussianBlur stdDeviation="2"/></filter>
<clipPath id="nc"><rect x="2" y="3" width="${fill.toFixed(1)}" height="6" rx="3"/></clipPath></defs>
<style>.spark{animation:spark 1.6s linear infinite}@keyframes spark{from{transform:translateX(-20px)}to{transform:translateX(${(fill + 10).toFixed(0)}px)}}.hum{animation:hum .15s steps(2) infinite alternate}@keyframes hum{from{opacity:.7}to{opacity:1}}</style>
<rect x="2" y="3" width="${w - 4}" height="6" rx="3" fill="none" stroke="#8a8a8a" stroke-opacity=".35"/>
<rect class="hum" x="2" y="2" width="${fill.toFixed(1)}" height="8" rx="4" fill="url(#ng)" filter="url(#nb)"/>
<rect x="2" y="3" width="${fill.toFixed(1)}" height="6" rx="3" fill="url(#ng)"/>
<g clip-path="url(#nc)"><rect class="spark" x="2" y="3" width="14" height="6" fill="#fff" opacity=".7"/></g>
</svg>` }
    },
  },
  rainbow: {
    label: 'Rainbow trail',
    draw: (p, w) => {
      const end = Math.max(10, ((w - 14) * Math.max(0, Math.min(100, p))) / 100)
      const cols = ['#ff4d4d', '#ffa64d', '#ffe14d', '#4dff88', '#4db8ff', '#a64dff']
      const stripes = cols.map((c, i) => `<rect x="0" y="${1 + i * 2}" width="${end.toFixed(1)}" height="2" fill="${c}"/>`).join('')
      return { width: w, height: 14, source: `<svg xmlns="${SVG_NS}" viewBox="0 0 ${w} 14" width="${w}" height="14">
<style>.wave{animation:wave .5s steps(2) infinite}@keyframes wave{50%{transform:translateY(1px)}}.star{transform-box:fill-box;transform-origin:center;animation:tw 1s ease-in-out infinite alternate}@keyframes tw{from{transform:scale(.8) rotate(0)}to{transform:scale(1.2) rotate(30deg)}}</style>
<rect x="0" y="1" width="${w - 2}" height="12" rx="3" fill="#8a8a8a" opacity=".12"/>
<g class="wave">${stripes}</g>
<path class="star" transform="translate(${(end + 6).toFixed(1)} 7)" d="M0 -6 L1.6 -1.6 L6 0 L1.6 1.6 L0 6 L-1.6 1.6 L-6 0 L-1.6 -1.6 Z" fill="#fff59d"/>
</svg>` }
    },
  },
}

// ---------- stat tiles, drawn ----------

type Tile = { key: string; label: string; value: string; bar?: BarArt; valueColor?: string }

const TILE = { pad: 12, gap: 8, height: 54, radius: 10, labelSize: 12, valueSize: 15 }
const textW = (text: string, size: number) => Math.ceil(text.length * size * 0.62)
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Gives a bar's ids a prefix so two bars can share one drawing. */
function scopeIds(svg: string, prefix: string): string {
  const ids = [...svg.matchAll(/id="([^"]+)"/g)].map(x => x[1]!)
  let out = svg
  for (const id of ids) {
    out = out.split(`id="${id}"`).join(`id="${prefix}-${id}"`).split(`url(#${id})`).join(`url(#${prefix}-${id})`)
  }
  return out
}

/** One row of rounded tiles: a label over a value, or over a bar and its value. */
/** Lays the tiles out; with `fillTo`, the first tile's bar grows until the row is that wide. */
function tilesSvg(tiles: Tile[], fillTo?: number, redraw?: (width: number) => BarArt): { source: string; width: number; height: number } {
  if (fillTo && redraw && tiles[0]?.bar) {
    const natural = tilesSvg(tiles).width
    const extra = Math.floor(fillTo - natural)
    if (extra > 0) tiles = [{ ...tiles[0], bar: redraw(tiles[0].bar.width + extra) }, ...tiles.slice(1)]
  }
  let x = 0
  const parts: string[] = []
  tiles.forEach((t, i) => {
    const valueW = textW(t.value, TILE.valueSize)
    const lineW = t.bar ? t.bar.width + 8 + valueW : valueW
    const w = TILE.pad * 2 + Math.max(textW(t.label, TILE.labelSize), lineW)
    const lineY = 38
    let line = ''
    if (t.bar) {
      const bar = scopeIds(t.bar.source, `b${i}`)
        .replace(/<svg([^>]*?) width="[^"]*" height="[^"]*"/, `<svg$1 width="${t.bar.width}" height="${t.bar.height}"`)
        .replace('<svg ', `<svg x="${x + TILE.pad}" y="${lineY - t.bar.height / 2}" `)
      line = bar + `<text x="${x + TILE.pad + t.bar.width + 8}" y="${lineY + 5}" class="v"${t.valueColor ? ` style="fill:${t.valueColor}"` : ''}>${esc(t.value)}</text>`
    } else {
      line = `<text x="${x + TILE.pad}" y="${lineY + 5}" class="v"${t.valueColor ? ` style="fill:${t.valueColor}"` : ''}>${esc(t.value)}</text>`
    }
    parts.push(`<g class="tile"><rect class="bg" x="${x}" y="0" width="${w}" height="${TILE.height}" rx="${TILE.radius}"/>
<text x="${x + TILE.pad}" y="20" class="l">${esc(t.label)}</text>${line}</g>`)
    x += w + TILE.gap
  })
  const width = Math.max(1, x - TILE.gap)
  return {
    width,
    height: TILE.height,
    source: `<svg xmlns="${SVG_NS}" viewBox="0 0 ${width} ${TILE.height}" width="${width}" height="${TILE.height}">
<style>
  text { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; }
  .tile .bg { fill: rgba(255,255,255,0.06); }
  .l { font-size: ${TILE.labelSize}px; fill: #9a9a9a; }
  .v { font-size: ${TILE.valueSize}px; font-weight: 600; fill: #ececec; }
</style>
${parts.join('\n')}
</svg>`,
  }
}

/** One drawn row: a bar (grown to `fillTo` when given), its value, a label, and an optional mini bar. */
function lineSvg(o: {
  draw: (w: number) => BarArt; barW: number; value: string; valueColor?: string; label?: string; thin?: boolean
  second?: { bar: BarArt; text: string }
}, fillTo?: number): { source: string; width: number; height: number } {
  const H = 30, GAP = 10, VS = 15, LS = 13
  const fixed = (o.value ? GAP + textW(o.value, VS) : 0) + (o.label ? GAP + textW(o.label, LS) : 0) +
    (o.second ? GAP * 2 + o.second.bar.width + GAP / 2 + textW(o.second.text, LS) : 0)
  const barW = fillTo ? Math.max(o.barW, Math.floor(fillTo - fixed)) : o.barW
  const bar = o.draw(barW)
  const barH = bar.height
  let x = 0
  const parts: string[] = []
  parts.push(scopeIds(bar.source, 'm').replace(/<svg([^>]*?) width="[^"]*" height="[^"]*"/, `<svg$1 width="${barW}" height="${barH}"`).replace('<svg ', `<svg x="0" y="${(H - barH) / 2}" `))
  x += barW
  if (o.value) { x += GAP; parts.push(`<text x="${x}" y="${H / 2 + 5}" class="v"${o.valueColor ? ` style="fill:${o.valueColor}"` : ''}>${esc(o.value)}</text>`); x += textW(o.value, VS) }
  if (o.label) { x += GAP; parts.push(`<text x="${x}" y="${H / 2 + 4.5}" class="l">${esc(o.label)}</text>`); x += textW(o.label, LS) }
  if (o.second) {
    x += GAP * 2
    const sb = o.second.bar
    parts.push(scopeIds(sb.source, 's').replace(/<svg([^>]*?) width="[^"]*" height="[^"]*"/, `<svg$1 width="${sb.width}" height="${sb.height}"`).replace('<svg ', `<svg x="${x}" y="${(H - sb.height) / 2}" `))
    x += sb.width + GAP / 2
    parts.push(`<text x="${x}" y="${H / 2 + 4.5}" class="l">${esc(o.second.text)}</text>`)
    x += textW(o.second.text, LS)
  }
  const width = Math.ceil(x) + 6
  return { width, height: H, source: `<svg xmlns="${SVG_NS}" viewBox="0 0 ${width} ${H}" width="${width}" height="${H}">
<style>text { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; } .l { font-size: ${LS}px; fill: #9a9a9a; } .v { font-size: ${VS}px; font-weight: 600; fill: #ececec; }</style>
${parts.join('\n')}
</svg>` }
}

const SOURCE_LABEL: Record<UsageSource, string> = { five_hour: '5h usage', seven_day: 'weekly usage', context: 'context' }

function meterFor(u: Usage | null, source: UsageSource): { label: string; percent: number } | null {
  if (!u) return null
  if (source !== 'context') {
    const r = u.rateLimits.find(x => x.kind === source)
    if (r) return { label: SOURCE_LABEL[source], percent: r.percentUsed }
  }
  if (u.contextPercent !== null) return { label: 'context', percent: u.contextPercent }
  const any = u.rateLimits[0]
  return any ? { label: SOURCE_LABEL[any.kind as UsageSource] ?? any.kind, percent: any.percentUsed } : null
}

function toUsage(
  rateLimits: { kind: string; percentUsed: number; resetsAt?: string }[],
  contextPercent: number | undefined,
  cost: { usd: number } | undefined,
): Usage {
  return {
    rateLimits: rateLimits.map(r => ({ kind: r.kind, percentUsed: r.percentUsed, resetsAt: r.resetsAt ?? null })),
    contextPercent: contextPercent ?? null,
    costUsd: cost?.usd ?? null,
  }
}

// ---------- the info row ----------

const SHORT: Record<string, string> = { five_hour: '5h', seven_day: 'week', spend_limit: 'spend' }

/** 1h 42m, 3d 4h, 12m, 40s. */
function span(ms: number): string {
  const sec = Math.max(0, Math.round(ms / 1000))
  const d = Math.floor(sec / 86400), hrs = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60)
  if (d > 0) return `${d}d ${hrs}h`
  if (hrs > 0) return `${hrs}h ${m}m`
  if (m > 0) return `${m}m`
  return `${sec}s`
}

/** 0:42, 12:05, 1:02:09. */
function stopwatch(ms: number): string {
  const sec = Math.max(0, Math.floor(ms / 1000))
  const hrs = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), x = sec % 60
  const mm = hrs > 0 ? String(m).padStart(2, '0') : String(m)
  return `${hrs > 0 ? `${hrs}:` : ''}${mm}:${String(x).padStart(2, '0')}`
}

/** claude-opus-5-5[1m] → Opus 5.5 */
function prettyModel(id: string): string {
  const base = id.replace(/\[.*\]$/, '')
  const m = /claude-([a-z]+)-(\d+)(?:-(\d+))?/i.exec(base)
  if (!m) return base
  const fam = m[1]!.charAt(0).toUpperCase() + m[1]!.slice(1)
  return m[3] ? `${fam} ${m[2]}.${m[3]}` : `${fam} ${m[2]}`
}

function clockText(ms: number): string {
  const t = new Date(ms)
  const hrs = t.getHours(), mi = String(t.getMinutes()).padStart(2, '0')
  return `${((hrs + 11) % 12) + 1}:${mi} ${hrs < 12 ? 'AM' : 'PM'}`
}

const WINDOW_MS: Record<string, number> = { five_hour: 5 * 3600_000, seven_day: 7 * 86400_000 }

/** Milliseconds until the limit resets, or null. */
function resetMs(u: Usage | null, kind: string, nowMs: number): number | null {
  const r = u?.rateLimits.find(x => x.kind === kind)
  if (!r?.resetsAt) return null
  const at = Date.parse(r.resetsAt)
  return Number.isFinite(at) ? Math.max(0, at - nowMs) : null
}

/** The bar while a limit is used up: a lock, and a track that fills as the reset nears. */
function lockedBar(frac: number, w: number): BarArt {
  const f = Math.max(0, Math.min(1, frac))
  const x0 = 22
  const track = w - x0 - 18
  const fill = Math.max(4, track * f)
  return { width: w, height: 18, source: `<svg xmlns="${SVG_NS}" viewBox="0 0 ${w} 18" width="${w}" height="18">
<defs><pattern id="lk" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="4" height="8" fill="#7fb6ff" opacity=".55"/></pattern>
<clipPath id="lkc"><rect x="${x0}" y="6" width="${fill.toFixed(1)}" height="6" rx="3"/></clipPath></defs>
<style>.lkm{animation:lkm 1.2s linear infinite}@keyframes lkm{to{transform:translateX(11.3px)}}.lb{animation:lb 2s ease-in-out infinite}@keyframes lb{50%{opacity:.6}}</style>
<g class="lb"><rect x="2" y="7" width="13" height="10" rx="2" fill="#7fb6ff"/><path d="M5 7 V4.5 a3.5 3.5 0 0 1 7 0 V7" stroke="#7fb6ff" stroke-width="2" fill="none"/><circle cx="8.5" cy="12" r="1.5" fill="#1f1f1f"/></g>
<rect x="${x0}" y="6" width="${track}" height="6" rx="3" fill="#7fb6ff" opacity=".15"/>
<g clip-path="url(#lkc)"><rect class="lkm" x="${x0 - 12}" y="6" width="${fill + 24}" height="6" fill="url(#lk)"/></g>
<rect x="${x0}" y="6" width="${fill.toFixed(1)}" height="6" rx="3" fill="none" stroke="#7fb6ff" stroke-width="1"/>
<g transform="translate(${w - 14} 2)" opacity=".7"><rect x="0" y="5" width="11" height="9" rx="2" fill="none" stroke="#7fb6ff" stroke-width="1.5"/><path d="M2.5 5 V3 a3 3 0 0 1 6 0" stroke="#7fb6ff" stroke-width="1.5" fill="none"/></g>
</svg>` }
}

function resetIn(u: Usage | null, kind: string, nowMs: number): string | null {
  const r = u?.rateLimits.find(x => x.kind === kind)
  if (!r?.resetsAt) return null
  const at = Date.parse(r.resetsAt)
  return Number.isFinite(at) ? span(at - nowMs) : null
}

// ---------- forecast, alerts, today ----------

/** When the limit will hit 100% at the recent pace, or null when it won't move up. */
function forecast(samples: Sample[], nowMs: number): number | null {
  const recent = samples.filter(x => nowMs - x.t <= 90 * 60_000)
  if (recent.length < 2) return null
  const first = recent[0]!, last = recent[recent.length - 1]!
  const minutes = (last.t - first.t) / 60_000
  if (minutes < 5 || last.p <= first.p) return null
  const perMs = (last.p - first.p) / (last.t - first.t)
  return last.t + (100 - last.p) / perMs
}

const dateKey = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}` }

async function bumpToday($: EngineInterface, change: (t: Today) => Today): Promise<void> {
  const nowMs = await $.clock.now()
  const key = dateKey(nowMs)
  await update($, today, cur => change(cur && cur.date === key ? cur : { date: key, replies: 0, tools: 0, peak: 0 }))
  await $.store.set('today', await read($, today)).catch(() => {})
}

// The alert levels already sent for each limit, so each fires once per window.
const alerted: Record<string, number> = {}

async function smartAlert($: EngineInterface, kind: string, p: number): Promise<void> {
  const name = kind === 'five_hour' ? '5-hour' : kind === 'seven_day' ? 'weekly' : kind
  const before = alerted[kind] ?? 0
  if (before >= 75 && p < before - 30) {
    alerted[kind] = 0
    const text = `Your ${name} limit has reset. The cat is awake again.`
    $.ui.toast(text, { timeoutMs: 8000 })
    return
  }
  for (const level of [100, 90, 75]) {
    if (p >= level && before < level) {
      alerted[kind] = level
      const text = level >= 100 ? `Your ${name} limit is used up. The cat is napping until it resets.` : `Your ${name} usage is at ${Math.round(p)}%.`
      $.ui.toast(text, { timeoutMs: 8000 })
      return
    }
  }
}

// ---------- mood rotation ----------

const pick = <T,>(list: T[], not?: T): T => {
  const pool = list.filter(x => x !== not)
  return pool[Math.floor(Math.random() * pool.length)] ?? list[0]!
}

// ---------- hooks ----------

// ---------- activity ----------

let isTurnRunning = false
let toolsThisTurn = 0
// The strip's width as last drawn, kept so the fill estimate can be tuned.
let lastColumns = { body: 0, viewport: 0 }
let savedColumns = ''
let lastActive = 0

async function tick($: EngineInterface): Promise<void> {
  const s = await read($, settings)
  const current = await read($, move)
  const now = await $.clock.now()
  const isWorking = isTurnRunning || (await read($, busy)) > 0
  let nextMood: Mood
  const dances = s.vibe === 'relaxed' ? CALM : DANCES
  if (isWorking) {
    nextMood = s.mood === 'random' || s.mood === 'sleep' || s.mood === 'play'
      ? dances.includes(current) && Math.random() < 0.5 ? current : pick(dances, current)
      : s.mood
  } else if (s.sleepWhenIdle && lastActive > 0 && now - lastActive > IDLE_MS) {
    nextMood = 'sleep'
  } else if (s.mood === 'random') {
    nextMood = pick(s.vibe === 'relaxed' ? [...CALM, 'chill', 'play'] : [...DANCES, 'play', 'play'], current)
  } else {
    nextMood = s.mood
  }
  if (nextMood !== current) await update($, move, () => nextMood)
}

async function markActive($: EngineInterface): Promise<void> {
  lastActive = await $.clock.now()
  if ((await read($, move)) === 'sleep') await tick($).catch(() => {})
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'cat', description: 'Open the dancing cat pane' })
    await $.command.register({ name: 'cat-band', description: 'Show or hide the cat strip above the chat input' })
    await $.command.register({ name: 'cat-settings', description: 'Open the dancing cat settings' })
    const s = sanitize(await $.store.get(STORE_KEY).catch(() => undefined))
    const savedToday = (await $.store.get('today').catch(() => undefined)) as Today | undefined
    if (savedToday && typeof savedToday.date === 'string') await update($, today, () => savedToday)
    await update($, settings, () => s)
    if (s.openPaneOnStart) void $.ui.open({ id: PANE, title: TITLE })
    lastActive = await $.clock.now()
    const t0 = await $.clock.now()
    await update($, now, () => t0)
    void $.session.usage().then(async u => {
      await update($, usage, () => toUsage(u.rateLimits, u.context.percent, u.cost))
      await update($, stats, st => ({ ...st, startedAt: u.startedAt || t0 }))
    }).catch(() => {})
    void $.session.model().then(model => update($, stats, st => ({ ...st, model }))).catch(() => {})
    // The clock the strip reads moves once a minute: every write redraws the strip.
    $.clock.every(15000, () => {
      void $.clock.now().then(async t => {
        if (Math.floor(t / 60000) !== Math.floor((await read($, now)) / 60000)) await update($, now, () => t)
      }).catch(() => {})
      const key = JSON.stringify(lastColumns)
      if (lastColumns.body > 0 && key !== savedColumns) {
        savedColumns = key
        void $.store.set('stripColumns', lastColumns).catch(() => {})
      }
    })
    $.clock.every(TICK_MS, () => void tick($).catch(() => {}))
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    await update($, usage, () => toUsage(e.rateLimits, e.context.percent, e.cost)).catch(() => {})
    const s = await read($, settings)
    const main = e.rateLimits.find(r => r.kind === s.usageSource)
    if (main) {
      const t = await $.clock.now()
      await update($, history, list => [...list.filter(x => t - x.t <= 3 * 3600_000 && x.p <= main.percentUsed), { t, p: main.percentUsed }].slice(-200)).catch(() => {})
      await bumpToday($, d => ({ ...d, peak: Math.max(d.peak, main.percentUsed) })).catch(() => {})
    }
    if (s.smartAlerts) for (const r of e.rateLimits) await smartAlert($, r.kind, r.percentUsed).catch(() => {})
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    isTurnRunning = true
    await markActive($).catch(() => {})
    const t = await $.clock.now()
    await update($, stats, st => ({ ...st, turnStartedAt: t, toolsTurn: 0 })).catch(() => {})
    await update($, now, () => t).catch(() => {})
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    await bumpToday($, d => ({ ...d, replies: d.replies + 1 })).catch(() => {})
    isTurnRunning = false
    lastActive = await $.clock.now()
    const t = lastActive
    await update($, stats, st => ({
      ...st,
      turnStartedAt: null,
      lastTurnMs: st.turnStartedAt !== null ? t - st.turnStartedAt : st.lastTurnMs,
      toolsTurn: toolsThisTurn,
      toolsTotal: st.toolsTotal + toolsThisTurn,
    })).catch(() => {})
    const used = toolsThisTurn
    toolsThisTurn = 0
    await bumpToday($, d => ({ ...d, tools: d.tools + used })).catch(() => {})
    void $.session.model().then(model => update($, stats, st => ({ ...st, model }))).catch(() => {})
    return next(e)
  })

  on('command.run', { command: 'cat' }, async $ => {
    await $.ui.open({ id: PANE, title: TITLE })
    return { text: 'The cat is dancing.' }
  })

  on('command.run', { command: 'cat-settings' }, async $ => {
    await $.ui.open({ id: SETTINGS_PANE, title: SETTINGS_TITLE })
    return { text: 'Cat settings opened.' }
  })

  on('command.run', { command: 'cat-band' }, async $ => {
    const shown = await read($, showBand)
    await update($, showBand, () => !shown)
    return { text: shown ? 'Cat strip hidden.' : 'Cat strip is back above the input.' }
  })

  // The strip directly above the chat input: cat, saber meter and a gear.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || !(await read($, showBand))) return next(e)
    const ui = $.ui.resolve(e)
    if (!('Svg' in ui)) return next(e)
    const { Box, Text, Svg, Button } = ui
    const s = await read($, settings)
    let current = await read($, move)
    const isWorking = e.props.isWorking
    const isFast = s.turbo && isWorking && s.vibe !== 'relaxed'
    const m = meterFor(await read($, usage), s.usageSource)
    const isLocked = m !== null && m.percent >= 100 && s.usageSource !== 'context'
    const isAlert = s.redAlert && m !== null && m.percent >= 90 && !isLocked
    // Used up: the cat naps until the limit resets.
    if (isLocked) current = 'sleep'
    const gear = <Button key="cat-gear" label="⚙" onPress={() => $.ui.open({ id: SETTINGS_PANE, title: SETTINGS_TITLE })} />
    const u = await read($, usage)
    const st = await read($, stats)
    const t = (await read($, now)) || st.startedAt
    const mainKind = s.usageSource
    const otherKind = mainKind === 'seven_day' ? 'five_hour' : 'seven_day'
    const other = u?.rateLimits.find(r => r.kind === otherKind) ?? null
    const reset = mainKind !== 'context' ? resetIn(u, mainKind, t) : null

    const detailed = s.barMode === 'detailed'

    // Row 1: the main saber and its figure, then the second limit's mini saber.
    const meterRow = s.showUsage ? (
      m ? (
        <Box flexDirection="row" alignItems="center" gap={1}>
          {(() => { const art = BARS[s.barStyle].draw(m.percent, 220, s.saberTheme, isFast); return <Svg source={art.source} alt={`${m.label}: ${Math.round(m.percent)}%`} width={art.width} height={art.height} /> })()}
          {s.showPercent && <Text bold color={isAlert ? 'red' : undefined}>{Math.round(m.percent)}%</Text>}
          <Text dimColor>{isAlert ? `${m.label} · red alert!` : m.label}</Text>
          {detailed && s.showReset && reset && <Text dimColor>· resets in {reset}</Text>}
          {detailed && s.showSecondLimit && other && mainKind !== 'context' && (
            <Box flexDirection="row" alignItems="center" gap={1} marginLeft={2}>
              {(() => { const art = BARS[s.barStyle].draw(other.percentUsed, 90, s.saberTheme, false); return <Svg source={art.source} alt={`${SHORT[other.kind] ?? other.kind} usage: ${Math.round(other.percentUsed)}%`} width={art.width} height={art.height} /> })()}
              <Text dimColor>{Math.round(other.percentUsed)}% {SHORT[other.kind] ?? other.kind}</Text>
            </Box>
          )}
        </Box>
      ) : (
        <Text dimColor>usage appears after the next reply</Text>
      )
    ) : null

    // Row 2: small figures, separated by dots.
    const chips: string[] = []
    if (s.showContext && u?.contextPercent != null && mainKind !== 'context') chips.push(`ctx ${Math.round(u.contextPercent)}%`)
    if (s.showCost && u?.costUsd != null) chips.push(`$${u.costUsd.toFixed(2)}`)
    if (s.showTurnTimer) {
      if (st.turnStartedAt !== null) chips.push(`⏱ ${stopwatch(t - st.turnStartedAt)}`)
      else if (st.lastTurnMs !== null) chips.push(`last turn ${stopwatch(st.lastTurnMs)}`)
    }
    if (s.showTools) chips.push(`🔧 ${st.toolsTurn} turn · ${st.toolsTotal} total`)
    if (s.showModel && st.model) chips.push(prettyModel(st.model))
    if (s.showClock && t > 0) chips.push(`🕐 ${clockText(t)}${st.startedAt > 0 ? ` · up ${span(t - st.startedAt)}` : ''}`)
    const infoRow = detailed && chips.length > 0 ? <Text dimColor>{chips.join('  ·  ')}</Text> : null

    // The figures as label/value pairs, for the other layouts.
    const items: { key: string; label: string; value: string }[] = []
    if (detailed) {
      if (s.showReset && reset) items.push({ key: 'reset', label: 'resets in', value: reset })
      if (s.showContext && u?.contextPercent != null && mainKind !== 'context') items.push({ key: 'ctx', label: 'context', value: `${Math.round(u.contextPercent)}%` })
      if (s.showCost && u?.costUsd != null) items.push({ key: 'cost', label: 'cost', value: `$${u.costUsd.toFixed(2)}` })
      if (s.showTurnTimer) {
        if (st.turnStartedAt !== null) items.push({ key: 'turn', label: 'replying for', value: span(t - st.turnStartedAt) })
        else if (st.lastTurnMs !== null && st.lastTurnMs >= 1000) items.push({ key: 'turn', label: 'last reply took', value: stopwatch(st.lastTurnMs) })
      }
      if (s.showTools) items.push({ key: 'tools', label: 'tools', value: `${st.toolsTurn} · ${st.toolsTotal}` })
      if (s.showForecast && !isLocked && mainKind !== 'context') {
        const eta = forecast(await read($, history), t)
        const resetLeft = resetMs(u, mainKind, t)
        if (eta !== null && (resetLeft === null || eta < t + resetLeft)) items.push({ key: 'eta', label: 'hits 100% at', value: clockText(eta) })
      }
      if (s.showModel && st.model) items.push({ key: 'model', label: 'model', value: prettyModel(st.model) })
      if (s.showClock && t > 0) {
        items.push({ key: 'time', label: 'time', value: clockText(t) })
        if (st.startedAt > 0) items.push({ key: 'up', label: 'session', value: span(t - st.startedAt) })
      }
    }

    const catEl = s.showCat ? (
      <Svg
        source={stripCatSvg(current, SKINS[s.catSkin], speedFor(s, isWorking), isAlert)}
        alt={`${SKINS[s.catSkin].label} cat, ${isAlert ? 'red alert!' : CAPTION[current]}; click it to change mood`}
        width={CAT_PX}
        height={CAT_PX}
        isInteractive
      />
    ) : null
    const lockLeft = isLocked ? resetMs(u, s.usageSource, t) : null
    const lockFrac = lockLeft !== null ? 1 - lockLeft / (WINDOW_MS[s.usageSource] ?? WINDOW_MS.five_hour!) : 0
    const drawMain = (w: number): BarArt => isLocked ? lockedBar(lockFrac, w) : BARS[s.barStyle].draw(m?.percent ?? 0, w, s.saberTheme, isFast)
    lastColumns = { body: e.props.bodyColumns, viewport: e.viewport?.columns ?? 0 }
    const barEl = (w: number) => {
      if (!m) return null
      const art = drawMain(w)
      return <Svg source={art.source} alt={`${m.label}: ${Math.round(m.percent)}%`} width={art.width} height={art.height} />
    }
    // The second limit (weekly, or 5-hour when the main bar is weekly): its own bar.
    const second = detailed && s.showSecondLimit && other && mainKind !== 'context' ? other : null
    const secondLabel = second ? (SHORT[second.kind] ?? second.kind) : ''
    const secondBar = (w: number) => {
      if (!second) return null
      const art = BARS[s.barStyle].draw(second.percentUsed, w, s.saberTheme, false)
      return <Svg source={art.source} alt={`${secondLabel} usage: ${Math.round(second.percentUsed)}%`} width={art.width} height={art.height} />
    }
    const secondPct = second ? <Text bold>{Math.round(second.percentUsed)}%</Text> : null
    const pct = m && isLocked ? <Text bold color="blue">{lockLeft !== null ? span(lockLeft) : 'locked'}</Text>
      : m && s.showPercent ? <Text bold color={isAlert ? 'red' : undefined}>{Math.round(m.percent)}%</Text> : null
    const mainLabel = m ? (isAlert ? `${m.label} · red alert!` : m.label) : ''
    const noUsage = s.showUsage && !m ? <Text dimColor>usage appears after the next reply</Text> : null
    const TILE_BG = 'rgba(255, 255, 255, 0.06)'
    const TILE_HOVER = { backgroundColor: 'rgba(255, 255, 255, 0.1)' }

    // Fill room: the strip's width (columns at an estimated px each) less the cat and the gear.
    const fillRoom = Math.max(0, e.props.bodyColumns * PX_PER_COLUMN - (s.showCat ? CAT_PX : 0) - GEAR_PX - 3 * GAP_PX)
    const wants = s.barLength === 'fill'

    // A · One line: bar, %, "5h · resets 1h 42m", then the week mini bar and its %.
    if (s.layout === 'line') {
      const label = isLocked ? `${SHORT[s.usageSource] ?? ''} limit reached` : `${SHORT[mainKind] ?? 'usage'}${reset && s.showReset ? ` · resets ${reset}` : ''}`
      const art = m && s.showUsage
        ? lineSvg({
            draw: drawMain, barW: LENGTH_PX[s.barLength],
            value: isLocked ? (lockLeft !== null ? span(lockLeft) : 'locked') : s.showPercent ? `${Math.round(m.percent)}%` : '',
            valueColor: isLocked ? '#7fb6ff' : isAlert ? '#ff5252' : undefined,
            label,
            second: second ? { bar: BARS[s.barStyle].draw(second.percentUsed, 70, s.saberTheme, false), text: `${Math.round(second.percentUsed)}% ${secondLabel}` } : undefined,
          }, wants ? fillRoom : undefined)
        : null
      return (
        <Box key="line" flexDirection="row" alignItems="center" justifyContent="space-between" gap={2} flexWrap="nowrap">
          <Box flexDirection="row" alignItems="center" gap={2} flexWrap="nowrap">
            {catEl}
            {art && <Svg source={art.source} alt={`${label} ${m ? Math.round(m.percent) : ''}%`} width={art.width} height={art.height} />}
            {noUsage}
          </Box>
          {gear}
        </Box>
      )
    }

    // C · Stat tiles: one drawn row of rounded tiles: usage, second limit, context, reply time.
    if (s.layout === 'tiles') {
      const TILE_KEYS = ['ctx', 'eta', 'turn']
      const resetItem = items.find(i => i.key === 'reset')
      const tiles: Tile[] = []
      if (s.showUsage && m) {
        tiles.push({
          key: 'usage',
          label: isLocked ? `${SHORT[s.usageSource] ?? ''} limit reached · napping until reset` : resetItem ? `${mainLabel} · resets ${resetItem.value}` : mainLabel,
          value: isLocked ? (lockLeft !== null ? span(lockLeft) : 'locked') : s.showPercent ? `${Math.round(m.percent)}%` : '',
          bar: drawMain(LENGTH_PX[s.barLength]),
          valueColor: isLocked ? '#7fb6ff' : isAlert ? '#ff5252' : undefined,
        })
      }
      if (s.showUsage && second) {
        tiles.push({ key: 'second', label: `${secondLabel} usage`, value: `${Math.round(second.percentUsed)}%`, bar: BARS[s.barStyle].draw(second.percentUsed, 70, s.saberTheme, false) })
      }
      for (const i of items.filter(x => TILE_KEYS.includes(x.key))) tiles.push({ key: i.key, label: i.label, value: i.value })
      // Fill: the strip's width (columns, at an estimated px per column) less the cat and the gear.
      const room = e.props.bodyColumns * PX_PER_COLUMN - (s.showCat ? CAT_PX : 0) - GEAR_PX - 3 * GAP_PX
      const art = tiles.length === 0 ? null
        : s.barLength === 'fill' && m
          ? tilesSvg(tiles, Math.max(room, 0), w => drawMain(w))
          : tilesSvg(tiles)
      return (
        <Box key="tiles" flexDirection="column">
          <Box flexDirection="row" alignItems="center" justifyContent="space-between" gap={2} flexWrap="nowrap">
            <Box flexDirection="row" alignItems="center" gap={2} flexWrap="nowrap">
              {catEl}
              {art && <Svg source={art.source} alt={tiles.map(t => `${t.label} ${t.value}`).join(', ')} width={art.width} height={art.height} />}
              {noUsage}
            </Box>
            {gear}
          </Box>
        </Box>
      )
    }

    // E · Minimal: one long thin bar and its %; the details show while the pointer is over the strip.
    if (s.layout === 'minimal') {
      const art = m && s.showUsage
        ? lineSvg({
            draw: drawMain, barW: LENGTH_PX[s.barLength] * 2, thin: true,
            value: isLocked ? (lockLeft !== null ? span(lockLeft) : 'locked') : s.showPercent ? `${Math.round(m.percent)}%` : '',
            valueColor: isLocked ? '#7fb6ff' : isAlert ? '#ff5252' : undefined,
          }, wants ? fillRoom : undefined)
        : null
      const details = [
        reset && s.showReset ? `resets in ${reset}` : '',
        second ? `${secondLabel} ${Math.round(second.percentUsed)}%` : '',
        ...items.filter(i => ['ctx', 'eta', 'turn', 'model'].includes(i.key)).map(i => `${i.label} ${i.value}`),
      ].filter(Boolean)
      return (
        <Box key="minimal" flexDirection="column">
          <Box flexDirection="row" alignItems="center" justifyContent="space-between" gap={2} flexWrap="nowrap">
            <Box flexDirection="row" alignItems="center" gap={2} flexWrap="nowrap">
              {catEl}
              {art && <Svg source={art.source} alt={`${mainLabel} ${m ? Math.round(m.percent) : ''}%`} width={art.width} height={art.height} />}
              {noUsage}
            </Box>
            {gear}
          </Box>
          {details.length > 0 && (
            <Box display="none" hover={{ display: 'flex' }} flexDirection="row" paddingLeft={s.showCat ? 9 : 0}>
              <Text dimColor italic>{details.join('  ·  ')}</Text>
            </Box>
          )}
        </Box>
      )
    }

    // B · Two rows: the cat, then meters over figures, the gear at the far right.
    return (
      <Box flexDirection="row" alignItems="center" justifyContent="space-between" gap={1}>
        <Box flexDirection="row" alignItems="center" gap={2}>
          {s.showCat && (
            <Svg
              source={stripCatSvg(current, SKINS[s.catSkin], speedFor(s, isWorking), isAlert)}
              alt={`${SKINS[s.catSkin].label} cat, ${isAlert ? 'red alert!' : CAPTION[current]}; click it to change mood`}
              width={CAT_PX}
              height={CAT_PX}
              isInteractive
            />
          )}
          <Box flexDirection="column" gap={1}>
            {meterRow}
            {infoRow}
          </Box>
        </Box>
        {gear}
      </Box>
    )
  })

  // Count running tools (the cat dances faster while > 0).
  on('tool.call', async ($, e, next) => {
    await update($, busy, n => n + 1).catch(() => {})
    // Counted here, written when the reply ends, so tool calls don't redraw the strip.
    toolsThisTurn += 1
    lastActive = await $.clock.now().catch(() => lastActive)
    try {
      return await next(e)
    } finally {
      await update($, busy, n => Math.max(0, n - 1)).catch(() => {})
    }
  })

  // The big cat pane.
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const s = await read($, settings)
    let current = await read($, move)
    const isWorking = (await read($, busy)) > 0
    const pm = meterFor(await read($, usage), s.usageSource)
    const isLocked = pm !== null && pm.percent >= 100 && s.usageSource !== 'context'
    const isAlert = s.redAlert && pm !== null && pm.percent >= 90 && !isLocked
    if (isLocked) current = 'sleep'
    const caption = isLocked ? `${pm?.label} used up · napping until it resets`
      : isAlert ? `RED ALERT: ${pm?.label} at ${Math.round(pm?.percent ?? 0)}%`
      : isWorking && current !== 'sleep' ? 'claude is cooking... DANCE FASTER' : CAPTION[current]
    const tdRaw = await read($, today)
    const td = tdRaw && tdRaw.date === dateKey((await read($, now)) || Date.now()) ? tdRaw : null
    const ui = $.ui.resolve(e)
    const { Box, Text, Button } = ui

    const buttons = (
      <Box flexDirection="row" gap={1} flexWrap="wrap">
        {MOODS.map(mv => (
          <Button key={mv} variant={mv === current ? 'primary' : undefined} onPress={() => update($, move, () => mv)}>
            {mv}
          </Button>
        ))}
        <Button key="pane-gear" label="⚙ CatSettings" onPress={() => $.ui.open({ id: SETTINGS_PANE, title: SETTINGS_TITLE })} />
      </Box>
    )

    if ('Svg' in ui) {
      const { Svg } = ui
      return (
        <Box flexDirection="column" alignItems="center" gap={1}>
          <Svg source={paneCatSvg(current, SKINS[s.catSkin], speedFor(s, isWorking), isAlert)} alt={`${SKINS[s.catSkin].label} cat: ${CAPTION[current]}`} width={240} height={280} isInteractive />
          <Text bold>{caption}</Text>
          {td && <Text dimColor>Today: {td.replies} replies · {td.tools} tools · peak {Math.round(td.peak)}%</Text>}
          {buttons}
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
        <Text>{current === 'sleep' ? ' /\\_/\\  z' : ' /\\_/\\ '}</Text>
        <Text>{current === 'sleep' ? '( -.- ) zZ' : '( ■_■ )  ♫'}</Text>
        <Text bold>{caption}</Text>
        {buttons}
      </Box>
    )
  })

  // The settings pane.
  on('ui.render', { component: 'Pane', requestId: SETTINGS_PANE }, async ($, e) => {
    const ui = $.ui.resolve(e)
    const { Box, Text, Button, Select } = ui
    const s = await read($, settings)

    const toggle = (key: 'showForecast' | 'smartAlerts' | 'showSecondLimit' | 'showReset' | 'showContext' | 'showCost' | 'showTurnTimer' | 'showTools' | 'showModel' | 'showClock' | 'showCat' | 'showUsage' | 'showPercent' | 'redAlert' | 'sleepWhenIdle' | 'turbo' | 'openPaneOnStart', label: string, hint?: string) => {
      const isOn = s[key] === true
      return (
        <Box flexDirection="row" justifyContent="space-between" alignItems="center" gap={2}>
          <Box flexDirection="column">
            <Text>{label}</Text>
            {hint && <Text dimColor>{hint}</Text>}
          </Box>
          <Button key={`t-${key}`} variant={isOn ? 'primary' : undefined} onPress={() => setSettings($, { [key]: !isOn })}>
            {isOn ? "On" : "Off"}
          </Button>
        </Box>
      )
    }

    const row = (label: string, control: RenderChildren) => (
      <Box flexDirection="row" justifyContent="space-between" alignItems="center" gap={2}>
        <Text>{label}</Text>
        {control}
      </Box>
    )

    const barArt = BARS[s.barStyle].draw(62, 240, s.saberTheme, false)
    const preview = 'Svg' in ui
      ? <ui.Svg source={barArt.source} alt={`Bar preview: ${BARS[s.barStyle].label}`} width={barArt.width} height={barArt.height} isInteractive />
      : null

    return (
      <Box flexDirection="column" gap={1} padding={1}>
        <Text bold>Strip above the chat</Text>
        {toggle('showCat', 'Show cat')}
        {toggle('showUsage', 'Show usage meter')}
        {toggle('showPercent', 'Show percentage number')}
        {toggle('redAlert', 'Red alert cat at 90%', 'The cat turns red with warning eyes when usage hits 90%')}

        <Text bold>Cat</Text>
        {row('Cat', (
          <Select
            key="s-skin"
            value={s.catSkin}
            options={(Object.keys(SKINS) as CatSkin[]).map(k => ({ value: k, label: SKINS[k].label }))}
            onSelect={v => void setSettings($, { catSkin: v as CatSkin })}
          />
        ))}
        {row('Vibe', (
          <Select
            key="s-vibe"
            value={s.vibe}
            options={[
              { value: 'relaxed', label: 'Relaxed (slow, gentle dances only)' },
              { value: 'normal', label: 'Normal' },
              { value: 'party', label: 'Party (fast, every dance)' },
            ]}
            onSelect={v => void setSettings($, { vibe: v as Vibe })}
          />
        ))}
        {row('Mood', (
          <Select
            key="s-mood"
            value={s.mood}
            options={[{ value: 'random', label: 'Random (changes every few seconds)' }, ...MOODS.map(m => ({ value: m, label: m }))]}
            onSelect={v => void setSettings($, { mood: v as CatSettings['mood'] }).then(async () => { if (v !== 'random') await update($, move, () => v as Mood) })}
          />
        ))}
        {toggle('sleepWhenIdle', 'Nap when idle', 'Sleeps after 3 minutes with nothing happening')}
        {toggle('turbo', 'Dance faster while Claude works')}
        {toggle('openPaneOnStart', 'Open the big cat pane on start')}

        <Text bold>Usage meter</Text>
        {row('Measure', (
          <Select
            key="s-source"
            value={s.usageSource}
            options={[
              { value: 'five_hour', label: '5-hour plan usage' },
              { value: 'seven_day', label: 'Weekly plan usage' },
              { value: 'context', label: 'Chat context used' },
            ]}
            onSelect={v => void setSettings($, { usageSource: v as UsageSource })}
          />
        ))}
        {row('Bar style', (
          <Select
            key="s-barstyle"
            value={s.barStyle}
            options={(Object.keys(BARS) as BarStyle[]).map(k => ({ value: k, label: BARS[k].label }))}
            onSelect={v => void setSettings($, { barStyle: v as BarStyle })}
          />
        ))}
        {row('Bar length', (
          <Select
            key="s-barlength"
            value={s.barLength}
            options={[
              { value: 'fill', label: 'Fill the space' },
              { value: 'long', label: 'Long' },
              { value: 'medium', label: 'Medium' },
              { value: 'short', label: 'Short' },
            ]}
            onSelect={v => void setSettings($, { barLength: v as BarLength })}
          />
        ))}
        {s.barStyle === 'saber' && row('Saber theme', (
          <Select
            key="s-theme"
            value={s.saberTheme}
            options={(Object.keys(SABERS) as SaberTheme[]).map(k => ({ value: k, label: SABERS[k].label }))}
            onSelect={v => void setSettings($, { saberTheme: v as SaberTheme })}
          />
        ))}
        {preview}

        <Text bold>Bar display</Text>
        {row('Mode', (
          <Select
            key="s-barmode"
            value={s.barMode}
            options={[
              { value: 'simple', label: 'Simple (bar and percentage)' },
              { value: 'detailed', label: 'Detailed (every extra below)' },
            ]}
            onSelect={v => void setSettings($, { barMode: v as BarMode })}
          />
        ))}
        {row('Layout', (
          <Select
            key="s-layout"
            value={s.layout}
            options={[
              { value: 'tiles', label: 'Stat tiles' },
              { value: 'line', label: 'One line' },
              { value: 'minimal', label: 'Minimal (hover for details)' },
              { value: 'rows', label: 'Two rows' },
            ]}
            onSelect={v => void setSettings($, { layout: v as BarLayout })}
          />
        ))}
        <Text dimColor>The switches below apply in Detailed mode.</Text>
        {toggle('showSecondLimit', 'Second usage limit', 'A mini bar for the weekly (or 5-hour) limit')}
        {toggle('showReset', 'Reset countdown', 'When the usage limit resets')}
        {toggle('showContext', 'Context used', 'How full this chat is')}
        {toggle('showCost', 'Session cost')}
        {toggle('showTurnTimer', 'Turn timer', 'How long Claude has been working on this reply')}
        {toggle('showTools', 'Tool count', 'Tools run this turn and this session')}
        {toggle('showModel', 'Model name')}
        {toggle('showClock', 'Clock and session time')}
        {toggle('showForecast', 'Usage forecast', 'When you will hit 100% at your current pace')}

        <Text bold>Alerts</Text>
        {toggle('smartAlerts', 'Smart alerts', 'A message inside Claude Code at 75%, 90%, 100%, and when your limit resets')}

        <Box flexDirection="row" gap={1}>
          <Button key="s-reset" onPress={() => setSettings($, DEFAULTS)}>Reset to defaults</Button>
        </Box>
      </Box>
    )
  })
}
