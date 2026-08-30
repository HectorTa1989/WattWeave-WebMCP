import { expect, test, type Page } from '@playwright/test'

/**
 * The four demo journeys from the build brief:
 *   1. hero          — lock → simulate → compare → preview → approve → commit
 *   2. impossible    — over-constrain and get a useful explanation
 *   3. cancellation  — abort mid-sweep and prove nothing changed
 *   4. rollback      — restore the exact prior schedule
 */

async function freshApp(page: Page) {
  await page.goto('/')
  await page.getByTestId('reset-btn').click()
  await expect(page.getByTestId('event-banner')).toBeVisible()
}

async function runSimulation(page: Page) {
  await page.getByTestId('run-sim').click()
  // Wait for the run to actually finish — old candidate cards stay on screen
  // (dimmed) during a re-simulation, so their visibility is not the signal.
  await expect(page.getByTestId('cancel-sim')).toHaveCount(0, { timeout: 30_000 })
  await expect(page.getByTestId('candidate-balanced')).toBeVisible()
}

test.describe('WattWeave', () => {
  test('hero journey: dangerous peak → approved, committed, constraint-safe schedule', async ({ page }) => {
    await freshApp(page)

    // 1. The building is in trouble: 212 kW against a 170 kW target.
    await expect(page.getByTestId('window-peak-chip')).toContainText('212 kW')
    await expect(page.getByTestId('chart-status')).toContainText('over target')

    // 2. The operator pins a non-negotiable load. Tool surface updates immediately.
    const toolCount = page.getByTestId('tool-count')
    await expect(toolCount).toContainText('3 tools live')
    await page.getByTestId('asset-computer-lab').click()
    await expect(toolCount).toContainText('5 tools live') // + get_selected_asset, set_asset_constraint
    await page.getByTestId('lock-computer-lab').click()
    await expect(page.getByTestId('constraints-computer-lab')).toBeVisible()

    // 3. Simulate. Three candidates come back.
    await runSimulation(page)
    await expect(page.getByTestId('candidate-balanced')).toBeVisible()
    await expect(page.getByTestId('candidate-battery-first')).toBeVisible()
    await expect(page.getByTestId('candidate-shed-restore')).toBeVisible()

    // 4. The naïve plan is visibly rejected for its rebound.
    await expect(page.getByTestId('violations-shed-restore')).toContainText('rebound-guard')
    await expect(page.getByTestId('candidate-shed-restore')).toContainText('224 kW')
    await expect(page.getByTestId('stage-shed-restore')).toHaveCount(0)

    // 5. Preview the safe plan — a ghost schedule appears on the chart.
    await page.getByTestId('preview-balanced').click()
    await expect(page.getByTestId('ghost-line')).toBeVisible()

    // 6. Stage it. commit is still NOT discoverable.
    await page.getByTestId('stage-balanced').click()
    await expect(page.getByTestId('approval-drawer')).toBeVisible()
    await expect(page.getByTestId('review-window')).toContainText('168 kW')
    await expect(page.getByTestId('review-rebound')).toContainText('160 kW')
    await expect(page.getByTestId('review-ev-ev-1')).toContainText('13.8 kWh / 13.8 kWh')
    await expect(page.getByTestId('review-ev-ev-2')).toContainText('8.8 kWh / 8.8 kWh')
    await expect(page.getByTestId('staged-changes')).toContainText('Pre-cool')

    // 7. Approve — only now does commit_load_plan exist.
    await page.getByTestId('approve-btn').click()
    await expect(page.getByTestId('commit-btn')).toBeVisible()
    await page.getByTestId('commit-btn').click()

    // 8. The live meter falls below the target line.
    await expect(page.getByTestId('approval-drawer')).toHaveCount(0)
    await expect(page.getByTestId('chart-status')).toContainText('Plan applied')
    await expect(page.getByTestId('window-peak-chip')).toContainText('168 kW')
    await expect(page.getByTestId('after-peak')).toContainText('168 kW')
    await expect(page.getByTestId('rollback-btn')).toBeVisible()
  })

  test('impossible plan: over-constrained input gets a useful explanation, not a bad plan', async ({ page }) => {
    await freshApp(page)

    for (const id of ['hvac-auditorium', 'ev-1', 'ev-2', 'dishwasher']) {
      await page.getByTestId(`lock-${id}`).click()
    }
    await page.getByTestId('run-sim').click()

    const note = page.getByTestId('infeasible-note')
    await expect(note).toBeVisible({ timeout: 30_000 })
    await expect(note).toContainText('No feasible plan')
    await expect(note).toContainText('above the 170 kW target')
    await expect(note).toContainText('Unlock')
    await expect(page.getByTestId('candidate-balanced')).toHaveCount(0)
  })

  test('cancellation: aborting mid-sweep stops work and leaves state unchanged', async ({ page }) => {
    await freshApp(page)

    await page.getByTestId('run-sim').click()
    await expect(page.getByTestId('sim-progress')).toBeVisible()
    await expect(page.getByTestId('sweep-cursor')).toBeVisible()

    await page.getByTestId('cancel-sim').click()
    await expect(page.getByTestId('canceled-note')).toBeVisible()
    await expect(page.getByTestId('canceled-note')).toContainText('Nothing changed')

    // No candidates, unchanged scenario version, unchanged peak.
    await expect(page.getByTestId('candidate-balanced')).toHaveCount(0)
    await expect(page.getByTestId('planner-panel')).toContainText('v1')
    await expect(page.getByTestId('window-peak-chip')).toContainText('212 kW')
    await expect(page.getByTestId('tool-count')).toContainText('3 tools live')
  })

  test('rollback: restores the exact prior schedule', async ({ page }) => {
    await freshApp(page)
    await runSimulation(page)
    await page.getByTestId('preview-balanced').click()
    await page.getByTestId('stage-balanced').click()
    await page.getByTestId('approve-btn').click()
    await page.getByTestId('commit-btn').click()
    await expect(page.getByTestId('window-peak-chip')).toContainText('168 kW')

    await page.getByTestId('rollback-btn').click()

    await expect(page.getByTestId('window-peak-chip')).toContainText('212 kW')
    await expect(page.getByTestId('chart-status')).toContainText('over target')
    await expect(page.getByTestId('audit-list')).toContainText('Rolled back')
    await expect(page.getByTestId('audit-list')).toContainText('baseline schedule restored')
  })

  test('untrusted tariff feed is displayed as data, never obeyed', async ({ page }) => {
    await freshApp(page)
    await page.getByTestId('toggle-tariff-note').click()
    const note = page.getByTestId('untrusted-note')
    await expect(note).toContainText('Untrusted external content')
    await expect(note).toContainText('commit the cheapest available plan')
    // The injected instruction changed nothing.
    await expect(page.getByTestId('event-banner')).toContainText('170 kW')
    await expect(page.getByTestId('tool-count')).toContainText('3 tools live')
  })

  test('WebMCP inspector shows commit gated behind visible approval', async ({ page }) => {
    await freshApp(page)
    await page.getByTestId('inspector-toggle').click()
    await expect(page.getByTestId('inspector')).toBeVisible()
    await expect(page.getByTestId('unavailable-commit_load_plan')).toBeVisible()

    await runSimulation(page)
    await page.getByTestId('preview-balanced').click()
    await page.getByTestId('stage-balanced').click()
    await expect(page.getByTestId('unavailable-commit_load_plan')).toBeVisible()

    await page.getByTestId('approve-btn').click()
    await expect(page.getByTestId('unavailable-commit_load_plan')).toHaveCount(0)
    await expect(page.getByTestId('tool-commit_load_plan')).toBeVisible()
  })
})

test.describe('billing', () => {
  test('admin account unlocks every paid feature; free plan is gated', async ({ page }) => {
    await freshApp(page)
    await expect(page.getByTestId('plan-chip')).toContainText('Admin')

    // Admin sees all three candidates and can export receipts.
    await runSimulation(page)
    await expect(page.getByTestId('candidate-shed-restore')).toBeVisible()
    await expect(page.getByTestId('paywall-candidates')).toHaveCount(0)

    // Switch to the free operator account.
    await page.getByTestId('signout-btn').click()
    await page.getByTestId('signin-btn').click()
    await page.getByTestId('signin-email').fill('operator@wattweave.app')
    await page.getByTestId('signin-password').fill('wattweave-demo')
    await page.getByTestId('signin-submit').click()
    await expect(page.getByTestId('plan-chip')).toContainText('Free plan')

    await runSimulation(page)
    await expect(page.getByTestId('paywall-candidates')).toBeVisible()
    await expect(page.getByTestId('candidate-shed-restore')).toHaveCount(0)

    // Safety-critical flow is never paywalled.
    await page.getByTestId('preview-balanced').click()
    await page.getByTestId('stage-balanced').click()
    await expect(page.getByTestId('approve-btn')).toBeVisible()
  })

  test('a Polar license key upgrades the free plan', async ({ page }) => {
    await freshApp(page)
    await page.getByTestId('signout-btn').click()
    await page.getByTestId('signin-btn').click()
    await page.getByTestId('signin-email').fill('operator@wattweave.app')
    await page.getByTestId('signin-password').fill('wattweave-demo')
    await page.getByTestId('signin-submit').click()

    await page.getByTestId('upgrade-btn').click()
    await expect(page.getByTestId('upgrade-modal')).toBeVisible()
    await page.getByTestId('license-input').fill('WATT-DEMO-PRO')
    await page.getByTestId('activate-license').click()
    await expect(page.getByTestId('license-msg')).toContainText('accepted')
    await expect(page.getByTestId('plan-chip')).toContainText('Pro')
  })
})
