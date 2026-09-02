/**
 * Step 1 of the Remotion demo pipeline.
 *
 * Drives the real app with Playwright and captures, for every storyboard beat,
 * the exact screenshots plus the viewport rectangles of (a) the control the
 * cursor is about to click and (b) the elements whose state changed. Remotion
 * animates the cursor and the highlight boxes on top of these stills, so the
 * video timing is fully deterministic and never drifts against the voiceover.
 */

import { mkdir, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { BEATS, VIEWPORT, SCALE } from './beats.mjs'

const baseUrl = process.env.WATTWEAVE_URL ?? 'http://127.0.0.1:5173'
const framesDir = resolve('remotion/public/frames')
const timelinePath = resolve('remotion/src/capture.json')

await rm(framesDir, { recursive: true, force: true })
await mkdir(framesDir, { recursive: true })

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({
  viewport: VIEWPORT,
  deviceScaleFactor: SCALE,
  colorScheme: 'light',
  reducedMotion: 'no-preference',
})
const page = await context.newPage()
await page.goto(baseUrl)
await page.getByTestId('event-banner').waitFor()
await page.evaluate(() => localStorage.removeItem('wattweave.session.v1'))
await page.reload()
await page.getByTestId('event-banner').waitFor()
await page.waitForTimeout(600)

const scaleRect = (r) => ({
  x: Math.round(r.x * SCALE),
  y: Math.round(r.y * SCALE),
  width: Math.round(r.width * SCALE),
  height: Math.round(r.height * SCALE),
})

const rectOf = async (testid) => {
  const el = page.getByTestId(testid).first()
  const box = await el.evaluate((node) => {
    const r = node.getBoundingClientRect()
    return { x: r.x, y: r.y, width: r.width, height: r.height }
  })
  return scaleRect(box)
}

const bringIntoView = async (testid) => {
  const el = page.getByTestId(testid).first()
  await el.scrollIntoViewIfNeeded().catch(() => {})
  await page.waitForTimeout(320)
}

const shots = []
let shotIndex = 0
const snap = async (beatId, extra) => {
  const file = `${String(shotIndex).padStart(2, '0')}-${beatId}.png`
  shotIndex += 1
  await page.screenshot({ path: resolve(framesDir, file) })
  return { image: `frames/${file}`, ...extra }
}

const timeline = []

// Slow the worker sweep so the cancellation beat can actually be filmed
// mid-run; restored to normal pacing once that beat is captured.
const setSweepPace = (ms) =>
  page.evaluate((v) => {
    const t = window.__wattweaveSimTiming
    if (t) t.stepDelayMs = v
  }, ms)

for (const beat of BEATS) {
  const beatShots = []
  if (beat.id === '07-cancel') await setSweepPace(150)
  if (beat.id === '08-candidates') await setSweepPace(28)

  for (const action of beat.actions ?? []) {
    await bringIntoView(action.testid)
    const target = await rectOf(action.testid)
    beatShots.push(await snap(beat.id, { target, label: action.label, click: true, weight: 1 }))
    await page.getByTestId(action.testid).first().click()
    if (action.waitFor) await page.getByTestId(action.waitFor).first().waitFor({ timeout: 15_000 })
    if (action.waitMs) await page.waitForTimeout(action.waitMs)
    await page.waitForTimeout(260)
  }

  if (beat.scrollTo) await bringIntoView(beat.scrollTo)
  else if (beat.highlights?.length) await bringIntoView(beat.highlights[0].testid)
  await page.waitForTimeout(200)

  const highlights = []
  for (const h of beat.highlights ?? []) {
    const rect = await rectOf(h.testid).catch(() => null)
    if (rect && rect.width > 0) highlights.push({ ...rect, label: h.label })
  }
  beatShots.push(await snap(beat.id, { target: null, click: false, highlights, weight: 2.2 }))

  timeline.push({ id: beat.id, narration: beat.narration, shots: beatShots })
  console.log(`captured ${beat.id} (${beatShots.length} shots)`)
}

await writeFile(
  timelinePath,
  `${JSON.stringify({ width: Math.round(VIEWPORT.width * SCALE), height: Math.round(VIEWPORT.height * SCALE), beats: timeline }, null, 2)}\n`,
)
await context.close()
await browser.close()
console.log(`\n${shots.length || shotIndex} frames -> ${framesDir}\n${timelinePath}`)
