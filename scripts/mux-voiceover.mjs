import { chromium } from 'playwright'
import { resolve } from 'node:path'

const baseUrl = process.env.WATTWEAVE_URL ?? 'http://127.0.0.1:5173'
const inputVideo = `${baseUrl}/demo/wattweave-3-minute-demo.webm`
const inputAudio = `${baseUrl}/demo/wattweave-narration.mp3`
const output = resolve(process.env.DEMO_OUTPUT ?? 'demo/wattweave-3-minute-demo-voiced.webm')

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } })
await page.goto(baseUrl)
await page.setContent(`<!doctype html><style>html,body{margin:0;background:#000}video{width:1px;height:1px}</style><video id="video" playsinline></video><audio id="audio"></audio>`)
await page.evaluate(({ inputVideo, inputAudio }) => {
  document.querySelector('#video').src = inputVideo
  document.querySelector('#audio').src = inputAudio
}, { inputVideo, inputAudio })
await page.waitForFunction(() => {
  const video = document.querySelector('#video')
  const audio = document.querySelector('#audio')
  return video?.readyState >= 3 && audio?.readyState >= 3
})

const downloadPromise = page.waitForEvent('download', { timeout: 0 })
await page.evaluate(async () => {
  const video = document.querySelector('#video')
  const audio = document.querySelector('#audio')
  video.muted = true
  video.currentTime = 0
  audio.currentTime = 0
  const videoStream = video.captureStream()
  const audioStream = audio.captureStream()
  for (const track of audioStream.getAudioTracks()) videoStream.addTrack(track)
  const chunks = []
  const recorder = new MediaRecorder(videoStream, { mimeType: 'video/webm;codecs=vp9,opus', videoBitsPerSecond: 5_000_000 })
  recorder.ondataavailable = (event) => event.data.size && chunks.push(event.data)
  const finished = new Promise((resolve) => { recorder.onstop = resolve })
  recorder.start(250)
  await Promise.all([video.play(), audio.play()])
  await new Promise((resolve) => { video.onended = resolve })
  if (!audio.paused) audio.pause()
  recorder.stop()
  await finished
  const blob = new Blob(chunks, { type: 'video/webm' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = 'wattweave-3-minute-demo-voiced.webm'
  link.click()
})

const download = await downloadPromise
await download.saveAs(output)
await browser.close()
console.log(output)
