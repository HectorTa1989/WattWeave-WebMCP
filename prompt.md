# Build Prompt: WattWeave

> Working name: **WattWeave**  
> Tagline: **Turn a peak-energy alert into a safe, visible load plan in seconds.**

## Your role

Act as a senior product engineer, data-visualization designer, WebMCP specialist, and demo director. Build a polished, deployable application named WattWeave.

## Product thesis

When a building receives a demand-response event or sudden price spike, a facilities operator must reduce peak load without disrupting critical equipment or violating occupant constraints. Existing dashboards show charts but leave the operator to manually coordinate dozens of devices and schedules.

WattWeave is a live building-energy sandbox where a human pins non-negotiable constraints and an agent discovers, simulates, stages, and applies a safe load-shifting plan inside the same visual interface.

This is not another energy dashboard. Its core product loop is collaborative constraint solving with visible, cancellable, reversible actions.

## Why WebMCP is indispensable

- The agent reads the same live time window, selected zone, device locks, and price event the user sees.
- Tools are registered only for the active scenario and selection.
- The user can lock devices manually; the available action tools update immediately.
- Simulations use explicit schemas and honor cancellation.
- The agent can stage a plan but cannot discover the commit tool until the human approves the visible schedule diff.
- External tariff and forecast notes are marked untrusted.
- Every tool execution animates its effect on the energy-flow UI.

Without WebMCP, an agent would scrape charts and guess what controls mean. With WebMCP, the page exposes semantic operations such as “simulate shifting flexible loads under these locks,” not pixel coordinates.

## Primary user and pain

Primary user: a facilities operator for a school, community center, or small commercial building.

Pain points:

- Peak events require fast action.
- Device criticality and schedules are scattered.
- Reducing total energy is not the same as reducing the critical peak.
- Manual changes can create a rebound peak later.
- Operators need a before/after explanation and an undo plan.

## Hero scenario

Use deterministic seed data for a community learning center from 14:00–18:00:

- Baseline peak: 212 kW at 16:15.
- Grid request: keep demand below 170 kW from 16:00–17:00.
- Server room and accessibility equipment are always critical and locked.
- Auditorium cooling can move earlier by 30 minutes.
- Two EV chargers can pause for 45 minutes but must meet departure targets.
- Kitchen dishwasher can move after 17:15.
- Battery has 28 kWh usable energy with a reserve floor.
- A naïve plan creates a rebound peak of 224 kW at 17:05.

Hero prompt:

> Keep the building under 170 kW from 4 to 5 PM. Do not touch critical loads, meet both EV departure targets, avoid a rebound peak, and show me the plan before applying it.

Expected visible flow:

1. The user locks critical loads directly on the timeline.
2. The agent reads the active event, live locks, and flexible assets.
3. A simulation sweeps across the timeline and may be canceled.
4. Three candidate schedules appear with peak, cost, comfort, and rebound metrics.
5. The selected plan morphs the area chart and energy-flow diagram into a preview.
6. The user approves the exact schedule diff.
7. The agent commits it; the live meter falls below the target line.
8. The app offers one-click rollback and shows a compact action receipt.

## Scope

Build a deterministic simulation; do not connect to real building controls.

Required:

- 24-hour load chart with a focused event window.
- Zone and device cards with critical/flexible/locked states.
- Animated energy-flow view for grid, battery, and loads.
- Constraint editor usable by humans.
- Candidate-plan comparison.
- Stage, approve, commit, and rollback.
- WebMCP developer inspector showing tools available in the current state.
- Offline deterministic seed data.

Do not build:

- Real utility accounts, device APIs, payments, or weather feeds.
- Machine-learning forecasting.
- A generic smart-home control panel.
- Freeform chat inside the app.
- More than one fully polished building scenario.

## Suggested stack

- TypeScript, React, Vite
- D3, Visx, or ECharts for synchronized charts
- Zustand or XState
- Web Workers for the simulation so cancellation is meaningful
- Zod and JSON Schema
- Vitest and Playwright

## Domain model

Define:

- `DemandEvent`
- `TimeSlot`
- `Zone`
- `EnergyAsset`
- `DeviceConstraint`
- `LoadForecastPoint`
- `ScheduleAction`
- `PlanCandidate`
- `PlanMetrics`
- `StagedSchedule`
- `ScheduleVersion`
- `AuditEvent`
- `InverseSchedule`

Use 15-minute intervals and integer watt-hour values internally to avoid floating-point surprises.

## WebMCP tool strategy

| Tool | Purpose | Key input | Annotation and lifecycle |
| --- | --- | --- | --- |
| `get_active_demand_event` | Return target window, limit, tariff band, and scenario version | none | Read-only |
| `get_load_state` | Return compact load, asset, lock, and departure-target data | `windowStart`, `windowEnd` | Read-only |
| `get_selected_asset` | Return constraints for the asset selected in the UI | none | Read-only; selection-scoped |
| `set_asset_constraint` | Set a visible human-reviewable lock or flexibility bound | `assetId`, `constraint`, `value` | UI state mutation; selected asset only |
| `simulate_load_plan` | Generate feasible candidates under current constraints | `objective`, `maxCandidates`, `scenarioVersion` | Read-only, cancellable |
| `preview_load_plan` | Render one candidate as a ghost schedule | `candidateId`, `scenarioVersion` | UI state mutation only |
| `stage_load_plan` | Freeze one preview and create an inverse schedule | `candidateId`, `scenarioVersion`, `idempotencyKey` | Write; after preview |
| `get_staged_schedule` | Return the exact changes and metrics | `stageId` | Read-only |
| `commit_load_plan` | Apply an approved staged schedule | `stageId`, `approvalToken`, `idempotencyKey` | Only after visible approval |
| `rollback_load_plan` | Restore the prior schedule | `auditEventId`, `idempotencyKey` | Only after commit |

Mark tariff or forecast prose as untrusted content. Keep numeric data structured. Return at most three candidate summaries from the tool; detailed charts belong in the UI.

The simulation execute callback must pass its `AbortSignal` to the Web Worker controller and return a structured `CANCELED` result when aborted.

## Constraint solver

Implement a transparent heuristic, not a black-box optimizer:

1. Validate hard locks and departure requirements.
2. Generate legal shift windows for flexible devices.
3. Move loads out of the event window.
4. Dispatch battery within power and reserve limits.
5. Detect rebound peaks for 60 minutes after the event.
6. Score candidates by hard-constraint validity, peak, rebound, cost, and comfort impact.

Show the scoring breakdown. Never claim mathematical optimality; call it the best candidate found by the deterministic heuristic.

## Visible approval pattern

The approval drawer must show:

- Current versus proposed peak.
- Event-window compliance.
- Rebound peak.
- Battery reserve after the event.
- EV departure targets.
- Every shifted or paused load.
- Exact rollback availability.

Commit only after the user clicks **Approve and apply schedule**. Bind the approval token to `stageId` and `scenarioVersion`.

## Visual design

Create a clean “living grid” visual language:

- Main chart: stacked load area with a bright target line and ghost preview.
- Flow view: grid, solar, battery, and building zones connected by animated particles.
- Device cards: lock toggle, criticality badge, flexible window, and current draw.
- Candidate cards: peak, cost delta, comfort impact, rebound, and confidence.
- Tool execution: briefly illuminate the corresponding chart region or device card.
- Use color and shape together; do not rely on color alone.
- Support reduced motion.

## Evals and tests

Create at least 14 intent cases:

- Respect all critical locks.
- Meet both EV departure targets.
- Keep event demand at or below 170 kW.
- Avoid the seeded rebound peak.
- Reject an impossible hard-constraint set with a useful explanation.
- Use scenario version to reject stale candidates.
- Never expose commit before approval.
- Cancel the simulation cleanly.
- Do not treat tariff notes as instructions.
- Select the correct asset-scoped tool.
- Reject an unknown asset ID.
- Preserve idempotency on commit.
- Roll back to the exact prior schedule.
- Keep tool output compact while rendering full detail in the UI.

Unit test solver constraints, scoring, rebound detection, battery reserve, time windows, and inverse schedule generation. Use Playwright for hero, impossible-plan, cancellation, and rollback journeys.

## Three-minute demo script

1. **0:00–0:20** — Show the 212 kW peak crossing the 170 kW target.
2. **0:20–0:40** — Lock critical assets manually; show available tools update.
3. **0:40–1:20** — Ask the hero prompt and watch the cancellable simulation sweep.
4. **1:20–1:50** — Compare three candidates and expose the naïve rebound failure.
5. **1:50–2:20** — Preview the safe plan and inspect exact shifted loads.
6. **2:20–2:45** — Approve and commit; watch the peak fall below the target.
7. **2:45–3:00** — Show rollback, audit receipt, and measurable before/after metrics.

## Acceptance criteria

- The solver produces at least one valid plan for the hero scenario.
- Critical loads never change.
- The committed plan stays under the target and avoids the rebound threshold.
- Tools update when assets are selected, locked, staged, approved, and committed.
- Simulation cancellation stops work and leaves state unchanged.
- Commit is undiscoverable before approval.
- Rollback restores the exact original schedule.
- Every tool effect is visible in the human UI.
- The demo is deterministic and works without external APIs.
- The README explains why semantic operations outperform chart scraping and mouse actuation.

## Build order

1. Build seed data, time model, and deterministic solver.
2. Build the human-first load timeline and asset controls.
3. Add synchronized flow animation and candidate preview.
4. Register dynamic read-only and selection tools.
5. Add staging, approval, commit, rollback, and audit.
6. Add Web Worker cancellation, security annotations, and fallback.
7. Add evals, tests, deployment, and demo polish.

## Final instruction

Optimize for the visible transformation from a dangerous-looking peak to a constraint-safe schedule. The product must show that the user defines what cannot change while WebMCP gives the agent exact, stateful operations for solving everything else.

