export type Mood = 'chill' | 'vibe' | 'headbang' | 'spin' | 'shuffle' | 'play' | 'sleep'
export type SaberTheme = 'auto' | 'jedi' | 'sith' | 'mace' | 'yoda' | 'darksaber' | 'rainbow'
export type CatSkin = 'gray' | 'ginger' | 'ghost' | 'cool' | 'black' | 'siamese' | 'kawaii' | 'classic' | 'knight' | 'shadow' | 'droid' | 'astro' | 'zib' | 'pilot' | 'bunny' | 'octo' | 'cowboy' | 'songkok'
export type Vibe = 'relaxed' | 'normal' | 'party'
export type BarMode = 'simple' | 'detailed'
export type BarLayout = 'rows' | 'tiles' | 'line' | 'minimal'
export type BarLength = 'fill' | 'long' | 'medium' | 'short'
export type BarStyle = 'saber' | 'paws' | 'yarn' | 'fish' | 'hearts' | 'neon' | 'rainbow'
export type UsageSource = 'five_hour' | 'seven_day' | 'context'
export type CatSettings = {
  showCat: boolean
  showUsage: boolean
  showPercent: boolean
  redAlert: boolean
  usageSource: UsageSource
  saberTheme: SaberTheme
  mood: 'random' | Mood
  catSkin: CatSkin
  vibe: Vibe
  barStyle: BarStyle
  barMode: BarMode
  layout: BarLayout
  barLength: BarLength
  sleepWhenIdle: boolean
  turbo: boolean
  openPaneOnStart: boolean
  showSecondLimit: boolean
  showReset: boolean
  showContext: boolean
  showCost: boolean
  showTurnTimer: boolean
  showTools: boolean
  showModel: boolean
  showClock: boolean
  showForecast: boolean
  smartAlerts: boolean
}
export type Usage = {
  rateLimits: { kind: string; percentUsed: number; resetsAt: string | null }[]
  contextPercent: number | null
  costUsd: number | null
}
export type Sample = { t: number; p: number }
export type Today = { date: string; replies: number; tools: number; peak: number }
export type Stats = {
  model: string | null
  startedAt: number
  turnStartedAt: number | null
  lastTurnMs: number | null
  toolsTurn: number
  toolsTotal: number
}

declare module 'claude-code' {
  interface PluginState {
    'catbar': {
      move: Shaped<Mood>
      busy: Shaped<number>
      showBand: Shaped<boolean>
      usage: Shaped<Usage | null>
      settings: Shaped<CatSettings>
      stats: Shaped<Stats>
      now: Shaped<number>
      history: Shaped<Sample[]>
      today: Shaped<Today | null>
    }
  }
}
