import { expect, test, type Page } from '@playwright/test'

type WebMcpResult = { content: Array<{ type: 'text'; text: string }>; isError?: boolean }

async function attachExternalAgent(page: Page) {
  await page.addInitScript(() => {
    const tools = new Map<string, any>()
    Object.defineProperty(navigator, 'modelContext', {
      configurable: true,
      value: {
        registerTool(tool: any) {
          tools.set(tool.name, tool)
          return { unregister: () => tools.get(tool.name) === tool && tools.delete(tool.name) }
        },
        provideContext(context: { tools?: any[] }) {
          tools.clear()
          for (const tool of context.tools ?? []) tools.set(tool.name, tool)
        },
      },
    })
    ;(window as any).__externalAgent = {
      names: () => [...tools.keys()],
      call: (name: string, args: unknown) => {
        const tool = tools.get(name)
        if (!tool) throw new Error(`Tool ${name} is not registered`)
        return tool.execute(args)
      },
    }
  })
  await page.goto('/')
  await page.getByTestId('reset-btn').click()
  await expect.poll(() => page.evaluate(() => (window as any).__externalAgent.names())).toEqual([
    'get_active_demand_event',
    'get_load_state',
    'simulate_load_plan',
  ])
}

async function call(page: Page, name: string, args: unknown = {}) {
  const result = await page.evaluate(
    ({ toolName, toolArgs }) => (window as any).__externalAgent.call(toolName, toolArgs),
    { toolName: name, toolArgs: args },
  ) as WebMcpResult
  return { ok: !result.isError, data: JSON.parse(result.content[0].text) as Record<string, any> }
}

test('external agent drives the native WebMCP boundary through approval, commit, and rollback', async ({ page }) => {
  await attachExternalAgent(page)

  const event = await call(page, 'get_active_demand_event')
  expect(event.data.event.limitKw).toBe(170)
  expect(event.data.untrusted.warning).toContain('UNTRUSTED')

  const simulated = await call(page, 'simulate_load_plan', {
    objective: 'safe-peak',
    maxCandidates: 3,
    scenarioVersion: event.data.scenario.version,
  })
  const best = simulated.data.candidates[0]
  expect(best.windowPeakKw).toBeLessThanOrEqual(170)

  await call(page, 'preview_load_plan', {
    candidateId: best.id,
    scenarioVersion: event.data.scenario.version,
  })
  const staged = await call(page, 'stage_load_plan', {
    candidateId: best.id,
    scenarioVersion: event.data.scenario.version,
    idempotencyKey: 'external-agent-stage-1',
  })
  await expect(page.getByTestId('approval-drawer')).toBeVisible()
  expect(await page.evaluate(() => (window as any).__externalAgent.names())).not.toContain('commit_load_plan')

  // This is the only human action in the flow.
  await page.getByTestId('approve-btn').click()
  await expect.poll(() => page.evaluate(() => (window as any).__externalAgent.names())).toContain('commit_load_plan')

  const approved = await call(page, 'get_staged_schedule', { stageId: staged.data.stageId })
  expect(approved.data.approvalToken).toMatch(/^apv-/)
  const committed = await call(page, 'commit_load_plan', {
    stageId: staged.data.stageId,
    approvalToken: approved.data.approvalToken,
    idempotencyKey: 'external-agent-commit-1',
  })
  expect(committed.data.liveWindowPeakKw).toBeLessThanOrEqual(170)
  expect(committed.data.control).toMatchObject({ mode: 'sandbox', accepted: false })
  await expect(page.getByTestId('chart-status')).toContainText('Plan applied')

  const rolledBack = await call(page, 'rollback_load_plan', {
    auditEventId: committed.data.auditEventId,
    idempotencyKey: 'external-agent-rollback-1',
  })
  expect(rolledBack.data.rolledBack).toBe(true)
  await expect(page.getByTestId('window-peak-chip')).toContainText('212 kW')

  await page.getByTestId('inspector-toggle').click()
  await expect(page.getByTestId('inspector')).toContainText('(agent,')
  await expect(page.getByTestId('inspector')).toContainText('rollback_load_plan')
})
