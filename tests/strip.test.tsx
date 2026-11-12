import { expect, test } from 'claude-code/testing'

const BAND = {
  plugin: 'catbar',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isCollapsed: false,
    isWorking: false,
    maxRows: 20,
    bodyColumns: 100,
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

const SETTINGS = {
  plugin: 'catbar',
  component: 'Pane',
  requestId: 'cat-settings',
  props: {
    title: 'Cat Settings',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

test('the strip draws the bar, the cat and the gear', async ($, on) => {
  on('ui.open', () => ({ value: { isPlaced: true } }))
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ type: 'Svg', alt: / cat, / })).toBeTruthy()
  expect(await ui.find({ type: 'Button', key: 'cat-gear' })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /usage appears/ })).toBeTruthy()
  await ui.unmount()
})

test('the settings pane toggles and draws on desktop and terminal', async ($, on) => {
  on('store.set', () => ({ value: undefined }))
  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ ...SETTINGS, surface })
    expect(await ui.find({ type: 'Button', key: 't-showCat' })).toBeTruthy()
    await ui.press({ key: 't-showCat' })
    expect((await ui.find({ type: 'Button', key: 't-showCat' }))?.text).toBe('Off')
    await ui.press({ key: 't-showCat' })
    await ui.unmount()
  }
})

test('with the cat off, the strip draws no cat', async ($, on) => {
  on('store.set', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  const pane = await $.ui.mount({ ...SETTINGS, surface: 'desktop' })
  await pane.press({ key: 't-showCat' })
  await pane.unmount()
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ type: 'Svg', alt: / cat, / })).toBeFalsy()
  await ui.unmount()
})

test('simple mode hides the extras; detailed mode shows them', async ($, on) => {
  on('store.set', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  const simple = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await simple.find({ type: 'Text', text: /🔧/ })).toBeFalsy()
  await simple.unmount()
  const pane = await $.ui.mount({ ...SETTINGS, surface: 'desktop' })
  await pane.select({ key: 's-barmode', value: 'detailed' })
  await pane.unmount()
  const detailed = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await detailed.find({ type: "Button", key: "cat-gear" })).toBeTruthy()
  await detailed.unmount()
})

test('every cat and every bar style draws in settings', async ($, on) => {
  on('store.set', () => ({ value: undefined }))
  const cats = ['gray', 'ginger', 'ghost', 'cool', 'black', 'siamese', 'kawaii', 'classic', 'knight', 'shadow', 'droid', 'astro', 'zib', 'pilot', 'bunny', 'octo', 'cowboy', 'songkok']
  const bars = ['saber', 'paws', 'yarn', 'fish', 'hearts', 'neon', 'rainbow']
  const pane = await $.ui.mount({ ...SETTINGS, surface: 'desktop' })
  for (const v of cats) await pane.select({ key: 's-skin', value: v })
  for (const v of bars) {
    await pane.select({ key: 's-barstyle', value: v })
    expect(await pane.find({ type: 'Svg', alt: /Bar preview/ })).toBeTruthy()
  }
  await pane.unmount()
})

test('each layout draws in detailed mode', async ($, on) => {
  on('store.set', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  const pane = await $.ui.mount({ ...SETTINGS, surface: 'desktop' })
  await pane.select({ key: 's-barmode', value: 'detailed' })
  await pane.unmount()
  const expected: Record<string, RegExp> = { rows: /🔧 0 turn/ }
  for (const layout of ['rows']) {
    const p = await $.ui.mount({ ...SETTINGS, surface: 'desktop' })
    await p.select({ key: 's-layout', value: layout })
    await p.unmount()
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
    expect(await ui.find({ type: 'Text', text: expected[layout]! })).toBeTruthy()
    expect(await ui.find({ type: 'Button', key: 'cat-gear' })).toBeTruthy()
    await ui.unmount()
  }
})
