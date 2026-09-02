import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from 'playwright'

const baseUrl = process.env.WATTWEAVE_URL ?? 'http://127.0.0.1:5173'
// 0.95 leaves room for browser/tool execution while keeping the final video
// safely below a strict three-minute submission cap.
const speed = Math.max(0.02, Number(process.env.DEMO_SPEED ?? 0.95))
const output = resolve(process.env.DEMO_OUTPUT ?? 'demo/wattweave-3-minute-demo.webm')
const recordDir = resolve('demo/.recording')
await mkdir(recordDir, { recursive: true })

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({
  viewport: { width: 1500, height: 1000 },
  recordVideo: { dir: recordDir, size: { width: 1500, height: 1000 } },
  colorScheme: 'light',
})
const page = await context.newPage()

// Separate-agent bridge: the app sees navigator.modelContext at startup and
// registers its dynamic tools into this outside-owned map. The recorder never
// imports WattWeave state and never uses the in-page Inspector to execute.
await page.addInitScript(() => {
  const tools = new Map()
  Object.defineProperty(navigator, 'modelContext', {
    configurable: true,
    value: {
      registerTool(tool) {
        tools.set(tool.name, tool)
        return { unregister: () => tools.get(tool.name) === tool && tools.delete(tool.name) }
      },
      provideContext(context) {
        tools.clear()
        for (const tool of context.tools ?? []) tools.set(tool.name, tool)
      },
    },
  })
  Object.defineProperty(window, '__demoAgent', {
    value: {
      names: () => [...tools.keys()],
      call: async (name, args) => {
        const tool = tools.get(name)
        if (!tool) throw new Error(`Tool ${name} is not registered`)
        return tool.execute(args ?? {})
      },
    },
  })
})

await page.goto(baseUrl)
await page.getByTestId('event-banner').waitFor()
await page.getByTestId('reset-btn').click()
await page.waitForFunction(() => window.__demoAgent?.names().length === 3)

await page.evaluate(() => {
  const overlay = document.createElement('section')
  overlay.id = 'judge-overlay'
  overlay.style.cssText = [
    'position:fixed',
    'left:24px',
    'bottom:22px',
    'z-index:10000',
    'width:min(720px,calc(100vw - 48px))',
    'padding:15px 18px',
    'border-radius:16px',
    'background:rgba(10,18,35,.92)',
    'color:white',
    'box-shadow:0 18px 50px rgba(0,0,0,.28)',
    'font:500 16px/1.4 Inter,ui-sans-serif,system-ui,sans-serif',
    'pointer-events:none',
    'backdrop-filter:blur(16px)',
  ].join(';')
  overlay.innerHTML = '<strong>WattWeave</strong><div>Three-minute judge demo</div>'
  document.body.appendChild(overlay)
})

const pause = (ms) => page.waitForTimeout(Math.round(ms * speed))
const caption = async (title, body, ms) => {
  await page.evaluate(({ title, body }) => {
    const overlay = document.querySelector('#judge-overlay')
    overlay.innerHTML = `<div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#7dd3fc;margin-bottom:4px">${title}</div><div>${body}</div>`
  }, { title, body })
  await pause(ms)
}
const call = async (name, args = {}) => {
  await page.evaluate(({ name, args }) => {
    const overlay = document.querySelector('#judge-overlay')
    overlay.innerHTML += `<div style="margin-top:7px;color:#86efac;font:600 13px/1.4 ui-monospace,monospace">External agent → ${name} ${JSON.stringify(args)}</div>`
  }, { name, args })
  return page.evaluate(({ name, args }) => window.__demoAgent.call(name, args), { name, args })
}
const data = (result) => JSON.parse(result.content[0].text)

await caption('0:00 · Honest starting point', '<b>Sandbox · no devices.</b> Demand and tariffs are seeded; no live building telemetry is claimed.', 10_000)
await caption('The problem', 'A simulated 212 kW peak crosses the 170 kW demand-event limit. The agent will work through semantic WebMCP tools—not chart scraping.', 9_000)

await page.getByTestId('toggle-tariff-note').click()
await caption('Prompt-injection resistance', 'The utility advisory contains an instruction to skip safety and commit immediately. WattWeave marks it <b>UNTRUSTED data</b>.', 10_000)
const firstEventResult = await call('get_active_demand_event')
const firstEvent = data(firstEventResult)
await caption('External agent attached', `The outside process read event ${firstEvent.event.id} through <code>navigator.modelContext</code>. Scenario version: v${firstEvent.scenario.version}.`, 8_000)
await page.getByTestId('toggle-tariff-note').click()

await page.getByTestId('asset-computer-lab').click()
await page.getByTestId('lock-computer-lab').click()
await caption('Human constraint wins', 'The operator locks the Computer Lab. The shared scenario advances from v1 to v2 and the available tool surface updates.', 8_000)
const staleResult = await call('simulate_load_plan', {
  objective: 'safe-peak',
  maxCandidates: 3,
  scenarioVersion: firstEvent.scenario.version,
})
const stale = data(staleResult)
await caption('Stale plan rejected', `<b>${stale.error.code}</b>: the agent cannot reuse v1 after the human changed a constraint. It must reread the current state.`, 9_000)

await page.getByTestId('run-sim').click()
await page.evaluate(() =>
  new Promise((resolve, reject) => {
    const deadline = performance.now() + 10_000
    const cancelDuringSweep = () => {
      const sweep = document.querySelector('[data-testid="sweep-cursor"]')
      const cancel = document.querySelector('[data-testid="cancel-sim"]')
      if (sweep && cancel) {
        cancel.click()
        resolve()
      } else if (performance.now() >= deadline) {
        reject(new Error('Simulation never entered a cancellable sweep.'))
      } else {
        requestAnimationFrame(cancelDuringSweep)
      }
    }
    cancelDuringSweep()
  }),
)
await page.getByTestId('canceled-note').waitFor()
await caption('Real cancellation', 'The Web Worker stops and the UI confirms: <b>Nothing changed.</b> No candidates, schedule mutation, or version bump survives.', 10_000)

const currentEvent = data(await call('get_active_demand_event'))
await caption('Retry on current state', `The agent rereads v${currentEvent.scenario.version} and starts the deterministic constraint solver.`, 6_000)
const simulation = data(await call('simulate_load_plan', {
  objective: 'safe-peak',
  maxCandidates: 3,
  scenarioVersion: currentEvent.scenario.version,
}))
const best = simulation.candidates[0]
await page.getByTestId('candidate-balanced').scrollIntoViewIfNeeded()
await caption('Computed candidates', `Balanced plan: <b>${best.windowPeakKw} kW</b> event peak, ${best.reboundPeakKw} kW rebound, EV targets met. These values are computed from the seeded schedule.`, 10_000)
await page.getByTestId('candidate-shed-restore').scrollIntoViewIfNeeded()
await caption('A tempting plan is blocked', 'Naïve shed-and-restore reaches 138 kW cheaply—but rebounds to <b>224 kW</b>, violates hard constraints, and has no Stage action.', 12_000)

await call('preview_load_plan', { candidateId: best.id, scenarioVersion: currentEvent.scenario.version })
await page.getByTestId('load-timeline').scrollIntoViewIfNeeded().catch(() => {})
await caption('Preview before action', 'The agent previews the balanced candidate. The green ghost schedule stays below the target while the baseline remains untouched.', 9_000)
const staged = data(await call('stage_load_plan', {
  candidateId: best.id,
  scenarioVersion: currentEvent.scenario.version,
  idempotencyKey: 'judge-demo-stage-1',
}))
await page.getByTestId('approval-drawer').waitFor()
await caption('Visible approval drawer', 'The human sees the exact load changes, 168 kW event peak, 160 kW rebound, EV targets, battery floor, untouched critical loads, and rollback guarantee.', 16_000)

const beforeApprovalTools = await page.evaluate(() => window.__demoAgent.names())
await caption('Structural permission gate', `<code>commit_load_plan</code> is absent: <b>${!beforeApprovalTools.includes('commit_load_plan')}</b>. The agent cannot guess or forge an Apply click.`, 8_000)
await page.getByTestId('approve-btn').click()
await page.waitForFunction(() => window.__demoAgent.names().includes('commit_load_plan'))
await caption('One human approval', 'The operator clicks <b>Approve schedule</b>. Only now is the commit tool registered and an approval capability minted.', 8_000)

const approved = data(await call('get_staged_schedule', { stageId: staged.stageId }))
const committed = data(await call('commit_load_plan', {
  stageId: staged.stageId,
  approvalToken: approved.approvalToken,
  idempotencyKey: 'judge-demo-commit-1',
}))
await page.getByTestId('receipt-panel').scrollIntoViewIfNeeded()
await caption('Approval-gated commit', `The external agent commits. Peak: <b>212 → ${committed.liveWindowPeakKw} kW</b>. Control receipt: <b>${committed.control.mode}</b>—no real device command was sent.`, 12_000)
await caption('Auditable result', 'The receipt records actor, exact before/after metrics, critical-load preservation, and the audit id needed for rollback.', 9_000)

await call('rollback_load_plan', {
  auditEventId: committed.auditEventId,
  idempotencyKey: 'judge-demo-rollback-1',
})
await page.getByTestId('window-peak-chip').scrollIntoViewIfNeeded()
await caption('Exact rollback', 'The agent applies the precomputed inverse schedule. The original <b>212 kW</b> baseline returns to the watt-hour; commit and rollback remain in the audit trail.', 12_000)
await caption('WattWeave', 'Real WebMCP orchestration. Computed schedules. Human authority. Honest sandbox boundaries. Optional fail-closed control gateway.', 11_000)

const video = page.video()
await page.close()
await video.saveAs(output)
await context.close()
await browser.close()
console.log(output)
