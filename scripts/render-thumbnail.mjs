import { chromium } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

async function renderThumbnail() {
  const htmlPath = path.join(__dirname, 'thumbnail.html')
  const fileUrl = `file:///${htmlPath.replace(/\\/g, '/')}`
  
  console.log(`Loading HTML from: ${fileUrl}`)

  const browser = await chromium.launch()
  const page = await browser.newPage({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 2, // 2x scale for crisp 2560x1440 high-DPI rendering
  })

  await page.goto(fileUrl, { waitUntil: 'networkidle' })

  // Ensure fonts and assets are fully loaded
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(1000)

  // Save to public directory
  const publicOutPath = path.resolve(__dirname, '../public/youtube-thumbnail.png')
  await page.screenshot({ path: publicOutPath, type: 'png' })
  console.log(`Saved YouTube thumbnail to: ${publicOutPath}`)

  // Save to artifacts directory
  const artifactDir = 'C:/Users/HLC/.gemini/antigravity-ide/brain/4e76e8e4-f335-492f-b596-dfc2819a66fe'
  if (fs.existsSync(artifactDir)) {
    const artifactOutPath = path.join(artifactDir, 'youtube-thumbnail.png')
    await page.screenshot({ path: artifactOutPath, type: 'png' })
    console.log(`Saved YouTube thumbnail to artifact path: ${artifactOutPath}`)
  }

  await browser.close()
}

renderThumbnail().catch((err) => {
  console.error('Error rendering thumbnail:', err)
  process.exit(1)
})
