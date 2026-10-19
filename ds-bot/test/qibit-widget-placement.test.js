import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { build } from 'esbuild'

const { outputFiles } = await build({
  entryPoints: [fileURLToPath(new URL('../src/client/qibit-command-center.js', import.meta.url))],
  bundle: true, format: 'cjs', platform: 'browser', write: false,
  external: ['react', 'react-dom', '@deepseek-ai/dsh-client-ui-primitives'],
})
const module = { exports: {} }
const react = {
  createContext: value => ({ value, Provider: Symbol('Provider') }),
  useContext: context => context.value,
}
runInNewContext(outputFiles[0].text, { module, exports: module.exports, require: name => name === 'react' ? react : {} })
const { qibitWidgetLayout } = module.exports

const large = { width: 1800, height: 1200 }
test('manual placement scales with the viewport and restores on maximizing', () => {
  const panel = { x: 1100, y: 650, placement: large }
  const small = qibitWidgetLayout(panel, { width: 1200, height: 800 })
  assert.equal(small.anchorX, 1100 * 1200 / 1800)
  assert.equal(small.anchorY, 650 * 800 / 1200)
  const restored = qibitWidgetLayout(panel, large)
  assert.equal(restored.anchorX, 1100)
  assert.equal(restored.anchorY, 650)
})
test('automatic placement follows the small-window reference and centers on large screens', () => {
  const reference = qibitWidgetLayout({}, { width: 1280, height: 780 })
  assert.equal(reference.anchorX, 708)
  assert.ok(Math.abs(reference.y - 155) < 1)
  for (const area of [{ width: 1600, height: 900 }, large]) {
    const layout = qibitWidgetLayout({ x: null, y: null }, area)
    assert.equal(layout.anchorX, area.width / 2)
    assert.ok(layout.y + layout.height / 2 < area.height / 2)
    assert.ok(layout.y >= 12)
  }
})
const values = layout => [layout.x, layout.y, layout.width, layout.height, layout.anchorX, layout.anchorY, layout.heroHeight]
const anchored = layout => {
  assert.equal(layout.anchorX, layout.x + layout.width / 2)
  assert.equal(layout.anchorY, layout.y + layout.heroHeight)
}
function inside(layout, area) {
  assert.ok(values(layout).every(Number.isFinite), 'every layout coordinate and dimension is finite')
  assert.ok(layout.x >= 12 && layout.y >= 12, 'the widget respects the top and left margin')
  assert.ok(layout.x + layout.width <= area.width - 12, 'the widget respects the right margin')
  assert.ok(layout.y + layout.height <= area.height - 12, 'the widget respects the bottom margin')
  anchored(layout)
}

test('a dragged character keeps its anchor when its search panel is folded and restored', () => {
  const panel = Object.freeze({ x: 900, y: 600, folded: false })
  const expanded = qibitWidgetLayout(panel, large)
  const collapsed = qibitWidgetLayout({ ...panel, folded: true }, large)
  const restored = qibitWidgetLayout({ ...panel, folded: false }, large)
  for (const layout of [expanded, collapsed, restored]) {
    inside(layout, large)
    assert.equal(layout.anchorX, panel.x)
    assert.equal(layout.anchorY, panel.y)
  }
  assert.equal(expanded.width, 660)
  assert.equal(expanded.heroHeight, 284)
  assert.equal(collapsed.width, 216)
  assert.equal(collapsed.heroHeight, 212)
  assert.equal(collapsed.folded, true)
  assert.equal(restored.x, expanded.x)
  assert.equal(restored.y, expanded.y)
})

test('repeated fold cycles preserve an anchor moved in either direction', () => {
  for (const point of [{ x: 500, y: 420 }, { x: 1200, y: 760 }]) {
    for (let repeat = 0; repeat < 5; repeat++) {
      for (const folded of [false, true]) {
        const layout = qibitWidgetLayout({ ...point, folded }, large)
        assert.equal(layout.anchorX, point.x)
        assert.equal(layout.anchorY, point.y)
        anchored(layout)
      }
    }
  }
})

test('offscreen saved positions are clamped with a visible twelve pixel margin', () => {
  const area = { width: 1280, height: 800 }
  for (const folded of [false, true]) {
    for (const point of [{ x: -10000, y: -10000 }, { x: 10000, y: 10000 }]) {
      inside(qibitWidgetLayout({ ...point, folded }, area), area)
    }
  }
})

test('window shrinkage clamps the display without modifying the preferred anchor', () => {
  const panel = Object.freeze({ x: 1200, y: 760, folded: false })
  const smaller = { width: 600, height: 700 }
  const small = qibitWidgetLayout(panel, smaller)
  inside(small, smaller)
  assert.notEqual(small.anchorX, panel.x)
  assert.notEqual(small.anchorY, panel.y)
  const restored = qibitWidgetLayout(panel, large)
  assert.equal(restored.anchorX, panel.x)
  assert.equal(restored.anchorY, panel.y)
  assert.deepEqual(panel, { x: 1200, y: 760, folded: false })
})

test('responsive width and hero geometry match the existing QiBit breakpoints', () => {
  for (const [width, expectedWidth, heroHeight] of [
    [420, 388, 312], [480, 448, 312], [481, 449, 284],
    [760, 660, 284], [761, 411, 284], [1000, 650, 284],
    [1001, 611, 284], [1800, 660, 284],
  ]) {
    const layout = qibitWidgetLayout({ x: width / 2, y: 500 }, { width, height: 1200 })
    assert.equal(layout.width, expectedWidth, `width at canvas ${width}`)
    assert.equal(layout.heroHeight, heroHeight, `hero height at canvas ${width}`)
    assert.equal(layout.folded, false)
    anchored(layout)
  }
})

test('actual measured heights apply only to the matching folded state', () => {
  const panel = { x: 900, y: 600, folded: false }
  const baseline = qibitWidgetLayout(panel, large)
  const measured = qibitWidgetLayout(panel, large, { height: 520, folded: false })
  const stale = qibitWidgetLayout(panel, large, { height: 212, folded: true })
  const unlabelled = qibitWidgetLayout(panel, large, { height: 212 })
  assert.equal(measured.height, 520)
  assert.equal(measured.anchorX, panel.x)
  assert.equal(measured.anchorY, panel.y)
  assert.equal(stale.height, baseline.height)
  assert.equal(unlabelled.height, baseline.height)
  const collapsed = qibitWidgetLayout({ ...panel, folded: true }, large, { height: 220, folded: true })
  assert.equal(collapsed.height, 220)
  assert.equal(collapsed.anchorX, panel.x)
  assert.equal(collapsed.anchorY, panel.y)
})

test('a changed measured height reclamps the bottom edge without moving the character unnecessarily', () => {
  const area = { width: 1280, height: 800 }
  const panel = { x: 640, y: 700, folded: false }
  const short = qibitWidgetLayout(panel, area, { height: 420, folded: false })
  const tall = qibitWidgetLayout(panel, area, { height: 580, folded: false })
  inside(short, area)
  inside(tall, area)
  assert.equal(tall.height, 580)
  assert.ok(tall.y < short.y, 'larger content shifts up to remain reachable')
  assert.equal(tall.anchorX, short.anchorX)
  assert.equal(tall.y + tall.height, area.height - 12)
})

test('missing, nonfinite and malformed saved coordinates use finite defaults', () => {
  for (const panel of [
    {}, { x: null, y: null }, { x: NaN, y: Infinity },
    { x: -Infinity, y: NaN }, { x: '900', y: '600' },
  ]) {
    const layout = qibitWidgetLayout(panel, large)
    inside(layout, large)
    assert.equal(layout.folded, false)
  }
  const missing = qibitWidgetLayout({}, large)
  const invalid = qibitWidgetLayout({ x: NaN, y: Infinity }, large)
  assert.equal(invalid.anchorX, missing.anchorX)
  assert.equal(invalid.anchorY, missing.anchorY)
})

test('nonfinite area and measurement values never propagate invalid CSS numbers', () => {
  for (const area of [
    { width: NaN, height: Infinity }, { width: Infinity, height: NaN }, {},
  ]) {
    const layout = qibitWidgetLayout({ x: NaN, y: Infinity }, area, { height: NaN, folded: false })
    assert.ok(values(layout).every(Number.isFinite))
    assert.ok(layout.width > 0 && layout.height > 0)
    anchored(layout)
  }
  const baseline = qibitWidgetLayout({}, large)
  for (const height of [NaN, Infinity, -Infinity, -1, 0]) {
    assert.equal(qibitWidgetLayout({}, large, { height, folded: false }).height, baseline.height)
  }
})
