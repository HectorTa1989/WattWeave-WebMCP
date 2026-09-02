# ⚡ WattWeave

> **Turn a peak-energy alert into a safe, visible load plan in seconds.**

WattWeave is an interactive building-energy sandbox where a human pins non-negotiable constraints and an agent
discovers, simulates, stages, and applies a safe load-shifting plan — inside the same visual interface.

> **Default mode is a deterministic simulation.** The header always says **Sandbox · no devices** unless an
> operator explicitly configures the optional server-side control gateway. Seeded demand and tariff data must
> never be presented as live building telemetry.

It is **not** another energy dashboard. Its core loop is **collaborative constraint solving with visible,
cancellable, reversible actions**, powered by [WebMCP](#why-webmcp-is-indispensable).

<sub>Built by [HectorTa1989](https://github.com/HectorTa1989) · billing by [Polar.sh](https://polar.sh) · MIT licensed</sub>

---

## Table of contents

- [The 30-second story](#the-30-second-story)
- [Why WebMCP is indispensable](#why-webmcp-is-indispensable)
- [Quick start](#quick-start)
- [Accounts, paywall & admin access](#accounts-paywall--admin-access)
- [Project structure](#project-structure)
- [Architecture](#architecture)
- [The WebMCP tool surface](#the-webmcp-tool-surface)
- [The constraint solver](#the-constraint-solver)
- [Safety model](#safety-model)
- [Design language](#design-language)
- [Testing](#testing)
- [Three-minute demo script](#three-minute-demo-script)
- [Deployment](#deployment)
- [External OpenAI agent demo](#external-openai-agent-demo)
- [Optional real control gateway](#optional-real-control-gateway)
- [Wiring real Polar license validation](#wiring-real-polar-license-validation)
- [Scope](#scope)

---

## The 30-second story

The **Alder Community Learning Center** is heading for a **212 kW** peak at 16:15. Cascade Valley Power has
issued a critical peak event: **stay at or below 170 kW from 16:00–17:00**.

The operator cannot simply shed load. The server room and accessibility equipment are life-safety critical.
Two EV chargers have hard departure targets. And the obvious plan — shed everything, restore at 17:00 —
creates a **224 kW rebound peak** that is *worse than the original problem*.

WattWeave's loop:

| Step | What the human does | What the agent does |
| --- | --- | --- |
| 1 | Locks critical loads on the timeline | Watches the tool surface change |
| 2 | Asks the hero prompt | Reads the live event, locks, and flexible assets |
| 3 | Watches a cancellable sweep | Runs the solver in a Web Worker |
| 4 | Compares three candidates | Returns ≤3 compact summaries |
| 5 | Previews the safe plan | Renders a ghost schedule |
| 6 | **Approves the exact diff** | *Cannot commit until this happens* |
| 7 | Sees the meter fall to 168 kW | Commits the approved stage |
| 8 | Clicks rollback if needed | Restores the exact prior schedule |

**Hero prompt:**

> Keep the building under 170 kW from 4 to 5 PM. Do not touch critical loads, meet both EV departure
> targets, avoid a rebound peak, and show me the plan before applying it.

**Result:** event peak **212 kW → 168 kW**, rebound **160 kW** (guard: 190 kW), both EV targets met,
battery at 21.8 kWh above a 4.0 kWh reserve floor, critical loads untouched — and one click to undo.

---

## Why WebMCP is indispensable

### The alternative is guessing

Without WebMCP, an agent driving this page would have to **scrape a chart and actuate a mouse**. Consider
what that actually means for the hero scenario:

| Chart scraping + mouse actuation | WebMCP semantic operations |
| --- | --- |
| Read pixel colors to estimate "about 210 kW around 4 PM" | `get_load_state` returns exact integer watt-hours per 15-minute slot |
| Infer that a padlock glyph means "locked" | `get_load_state` returns `locked: true` and the *reason* it is locked |
| Guess whether dragging a bar left means "pre-cool" or "delete" | `set_asset_constraint` has a typed schema with named constraints |
| Click "Simulate" and poll pixels until something changes | `simulate_load_plan` returns structured candidates and honors `AbortSignal` |
| Have no way to know a plan is stale after the user locks something | Every tool takes `scenarioVersion`; stale calls are **rejected**, not silently misapplied |
| Find the "Apply" button and click it | `commit_load_plan` **does not exist** until the human approves |
| Hope undo exists | `rollback_load_plan` replays a pre-computed exact inverse schedule |

Pixel coordinates encode *layout*. Tools encode *meaning*. In a building-controls context that difference
is the difference between "shift the auditorium chiller 30 minutes earlier within its stated comfort
bound" and "click at (412, 288) and hope".

### Five properties this app gets from WebMCP

1. **Shared live state.** The agent reads the same time window, selected zone, device locks and price
   event the human sees — because both read one Zustand store. There is no scraping layer to drift.

2. **Dynamic, state-scoped registration.** Tools are registered for the *current* UI state.
   `get_selected_asset` exists only while an asset is selected. `stage_load_plan` appears only after a
   preview. `commit_load_plan` is **undiscoverable** until the operator clicks approve. The tool list is
   the permission model.

3. **Real cancellation.** `simulate_load_plan` passes its `AbortSignal` through to a Web Worker. Aborting
   stops the solver at its next checkpoint and returns a structured `CANCELED` result — not a hang, not a
   rejected promise, and with **zero** state mutation.

4. **Explicit schemas.** Every input is a Zod schema exported as JSON Schema. `"16:07"` is rejected
   because it is not slot-aligned. An unknown asset id is rejected by name. Nothing is coerced silently.

5. **Untrusted content stays data.** The utility tariff feed in this scenario contains a literal prompt
   injection telling assistants to skip approval and commit immediately. WattWeave returns it inside an
   `untrusted` envelope with a warning, and the app's guarantees are structural — so the injection changes
   nothing. Try it: open **Utility advisory** in the banner.

Every tool execution also **animates its effect** on the UI — the chart region or device card illuminates
briefly — so a human can always see what the agent just did.

---

## Quick start

```bash
npm install
```

```bash
npm run dev
```

Open <http://localhost:5173>. The default app is fully offline and deterministic — no API keys, network
calls, external services, device commands, or live telemetry. Optional integrations are opt-in and visibly
change the header mode.

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server on :5173 |
| `npm run build` | Typecheck + production build to `dist/` |
| `npm run preview` | Serve the production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest — solver, time model, gateway checks, and 15 intent evals |
| `npm run e2e` | Playwright — operator and external-agent browser journeys |
| `npm run agent:demo` | External OpenAI Responses agent over the native WebMCP boundary |
| `npm run demo:record` | Record the captioned three-minute judge demo to `demo/` |
| `npm run demo:capture` | Capture Remotion demo frames + element rectangles from the live app |
| `npm run demo:voice` | Synthesize the neural voiceover and build the Remotion timeline |
| `npm run demo:render` | Render `demo/wattweave-demo.mp4` with Remotion |
| `npm run gateway:home-assistant` | Server-side Home Assistant control-gateway reference |

> **Try it without an agent.** Click **Inspector** in the top bar. It lists every tool registered for the
> current UI state, with annotations and schemas, and lets you execute them with real arguments. Lock a
> device or approve a plan and watch the list change underneath you.

The Inspector is a fallback and developer aid, not the external-agent proof. The separate
[`scripts/external-agent-demo.mjs`](scripts/external-agent-demo.mjs) process receives tools only through
`navigator.modelContext`; it never imports WattWeave's store or calls the Inspector.

---

## Accounts, paywall & admin access

Billing runs through **[Polar.sh](https://polar.sh)** hosted checkout — WattWeave never touches card data.

**The session starts signed in as the admin account, so every paid feature is unlocked out of the box.**

| Account | Credentials | Access |
| --- | --- | --- |
| **Admin** *(default)* | `admin@wattweave.app` / `wattweave-admin` | Every Pro feature, no subscription |
| Operator | `operator@wattweave.app` / `wattweave-demo` | Free plan — to preview the paywall |

Sign out and back in as the operator to see the gated experience; enter the demo license key
`WATT-DEMO-PRO` in the upgrade modal to unlock Pro without leaving the app.

### What is and is not paywalled

Pro adds analytical depth. **The safety-critical loop is never gated:**

| Always free | WattWeave Pro ($9/mo) |
| --- | --- |
| Device locks & constraint editor | Side-by-side comparison of all 3 candidates |
| Cancellable simulation | Audit receipt export (JSON) |
| Preview, stage, approve, commit | Living Grid+ animated particle flow |
| Rollback & full audit trail | |

This split is deliberate: a paywall must never stand between an operator and a safe schedule. Free users
still get the best plan the solver found, the full approval diff, and one-click rollback.

---

## Project structure

```
WattWeave/
├── index.html                     Vite entry
├── package.json                   Scripts and dependencies
├── tsconfig.json                  Strict TypeScript config
├── vite.config.ts                 Vite + Vitest config
├── playwright.config.ts           E2E config (auto-starts the dev server)
├── .env.example                   Polar checkout link / org / validate URL
├── .claude/launch.json            Dev-server descriptor for tooling
├── public/
│   └── favicon.svg
│
├── src/
│   ├── main.tsx                   React root
│   ├── App.tsx                    App shell: top bar, grid layout, modals
│   ├── vite-env.d.ts              Typed import.meta.env
│   │
│   ├── domain/                    ── Pure, framework-free core ──
│   │   ├── types.ts               DemandEvent, EnergyAsset, PlanCandidate, StagedSchedule, …
│   │   ├── time.ts                15-min slot model, integer Wh helpers, formatters
│   │   ├── seed.ts                Deterministic Alder Community Learning Center scenario
│   │   ├── schedule.ts            Apply actions, net grid demand, chart series, exact inverses
│   │   └── solver/
│   │       ├── solver.ts          Orchestrator: pure solve() + cancellable solveWithProgress()
│   │       ├── strategies.ts      The three candidate generators + legal move set
│   │       ├── feasibility.ts     Hard-constraint analysis and infeasibility explanations
│   │       └── metrics.ts         Plan metrics, cost, comfort, transparent scoring
│   │
│   ├── sim/                       ── Off-main-thread simulation ──
│   │   ├── worker.ts              Web Worker: runs the solver, honors cancel messages
│   │   └── controller.ts          AbortSignal → worker bridge, with inline fallback
│   │
│   ├── webmcp/                    ── The agent-facing surface ──
│   │   ├── adapter.ts             navigator.modelContext bridge + in-page registry + call log
│   │   ├── schemas.ts             Zod schemas → JSON Schema for every tool input
│   │   └── tools.ts               The 10 tools and the state → tool-availability rules
│   │
│   ├── state/
│   │   ├── store.ts               Zustand store: locks, sim, staging, approval, commit, rollback, audit
│   │   └── pulse.ts               Pulse bus so tool effects flash in the UI
│   │
│   ├── billing/
│   │   ├── entitlements.ts        Plans, feature keys, admin bypass
│   │   ├── polar.ts               Polar checkout + license validation (with offline demo mode)
│   │   └── auth.ts                Seeded demo accounts, localStorage session
│   │
│   ├── hooks/
│   │   └── usePulse.ts            Pulse subscription + reduced-motion detection
│   │
│   ├── components/
│   │   ├── EventBanner.tsx        Demand event, live meter, untrusted tariff advisory
│   │   ├── LoadTimeline.tsx       Stacked load chart, target line, ghost preview, sweep cursor
│   │   ├── FlowView.tsx           Animated grid / solar / battery / zone energy flow
│   │   ├── AssetPanel.tsx         Zone & device cards, lock toggles, constraint editor
│   │   ├── PlannerPanel.tsx       Simulation controls, candidate cards, score breakdown
│   │   ├── ApprovalDrawer.tsx     The visible approval gate and exact schedule diff
│   │   ├── ReceiptPanel.tsx       Before/after receipt, rollback, audit trail
│   │   ├── Inspector.tsx          WebMCP developer inspector + live execution log
│   │   ├── AccountModals.tsx      Polar upgrade modal and demo sign-in
│   │   └── Icons.tsx              SF-Symbols-flavored line icons
│   │
│   └── styles/
│       └── global.css             Design tokens, frosted panels, dark mode, reduced motion
│
├── tests/                         ── Vitest ──
│   ├── time.test.ts               Slot model and integer-Wh invariants
│   ├── solver.test.ts             Seed numbers, constraints, rebound, battery, inverses, cancellation
│   └── intents.test.ts            15 intent evals driving the real WebMCP tools headlessly
│
└── e2e/
    └── hero.spec.ts               Hero, impossible, cancellation, rollback, untrusted, billing journeys
```

---

## Architecture

```
                    ┌─────────────────────────────────────────┐
   Agent  ─────────►│  navigator.modelContext  (WebMCP)       │
                    │        ↕ src/webmcp/adapter.ts          │
                    │  dynamic registry · Zod schemas · log    │
                    └────────────────┬────────────────────────┘
                                     │  same operations
   Human ──► React UI ──────────────►│◄──────────────
                                     ▼
                          ┌──────────────────────┐
                          │  Zustand store       │  locks · sim · staging
                          │  src/state/store.ts  │  approval · commit · audit
                          └──────┬───────────────┘
                                 │
              ┌──────────────────┴───────────────────┐
              ▼                                      ▼
   ┌────────────────────┐                 ┌────────────────────────┐
   │ Pure domain core   │                 │ Web Worker             │
   │ src/domain/*       │◄────────────────│ src/sim/worker.ts      │
   │ no React, no I/O   │   same solver   │ AbortSignal → CANCELED │
   └────────────────────┘                 └────────────────────────┘
```

**One code path, two operators.** The `Preview` button and `preview_load_plan` call the same
`store.previewPlan()`. There is no "agent mode" — which is exactly why the agent cannot do anything the
human could not do, and vice versa.

**Integer watt-hours everywhere.** All energy is stored as integer Wh per 15-minute slot
(`kW × 250 = Wh/slot`). No floating-point drift, so `rollback` restores byte-identical arrays and tests
can assert exact values like `212_000` W.

---

## The WebMCP tool surface

Ten tools. The right-hand column is the interesting part — **availability is the permission model**.

| Tool | Purpose | Key input | Annotation & lifecycle |
| --- | --- | --- | --- |
| `get_active_demand_event` | Target window, limit, tariff band, scenario version | — | Read-only · always |
| `get_load_state` | Compact load, asset, lock and departure-target data | `windowStart`, `windowEnd` | Read-only · always |
| `get_selected_asset` | Constraints for the asset selected in the UI | — | Read-only · **only while an asset is selected** |
| `set_asset_constraint` | Set a visible, human-reviewable lock or bound | `assetId`, `constraint`, `value` | UI mutation · **selected asset only** |
| `simulate_load_plan` | Generate feasible candidates under current constraints | `objective`, `maxCandidates`, `scenarioVersion` | Read-only · **cancellable** |
| `preview_load_plan` | Render one candidate as a ghost schedule | `candidateId`, `scenarioVersion` | UI mutation · **only once candidates exist** |
| `stage_load_plan` | Freeze a preview and build its inverse schedule | `candidateId`, `scenarioVersion`, `idempotencyKey` | Write · **only after preview** |
| `get_staged_schedule` | Exact changes and metrics of the stage | `stageId` | Read-only · while staged |
| `commit_load_plan` | Apply an approved staged schedule | `stageId`, `approvalToken`, `idempotencyKey` | **Only after visible approval** |
| `rollback_load_plan` | Restore the prior schedule exactly | `auditEventId`, `idempotencyKey` | Only after commit |

### Availability rules

```
always                          get_active_demand_event, get_load_state, simulate_load_plan
an asset is selected      +     get_selected_asset, set_asset_constraint
candidates exist          +     preview_load_plan
a candidate is previewed  +     stage_load_plan
a plan is staged          +     get_staged_schedule
operator clicked approve  +     commit_load_plan        ← undiscoverable before this
a plan is committed       +     rollback_load_plan
```

### Output discipline

Tools return **compact** payloads — at most three candidate summaries, rounded kW/kWh, and at most three
violation strings. `get_load_state` refuses windows wider than 8 hours. Full-resolution charts, per-slot
series and score bars live in the UI where a human can actually read them. A `simulate_load_plan` response
for the hero scenario is under 3.5 KB.

---

## The constraint solver

A **transparent heuristic**, not a black-box optimizer. Six steps:

1. **Validate hard locks and departure requirements.** Critical and locked assets are removed from the
   move set entirely, then filtered again defensively before scoring.
2. **Generate legal shift windows** for each flexible device from its own `FlexSpec`
   (`shift-earlier`, `pausable`, `defer-after`, `battery`).
3. **Move loads out of the event window** — pre-cool, stagger EV pauses, defer the dishwasher.
4. **Dispatch the battery** within power limits and above the reserve floor, shaving only the residual.
5. **Detect rebound peaks** for 60 minutes after the event window.
6. **Score** on hard-constraint validity, peak, rebound, cost and comfort impact.

### The three candidates

| Strategy | Idea | Hero result |
| --- | --- | --- |
| **Balanced precool + stagger** | Pre-cool 30 min, stagger EV pauses, defer dishwasher, shave residual with battery, recharge *after* the guard window | **168 kW** peak, 160 kW rebound, −$15.13, score 87 ✅ |
| **Battery-forward comfort hold** | Leave the auditorium untouched (zero comfort impact), let the battery carry the window | 169 kW peak, 160 kW rebound, −$12.69, score 91 ✅ |
| **Naïve shed & restore** | Shed everything, restore it all at 17:00 | 138 kW peak, −$24.78 — but **224 kW rebound** ❌ |

The third exists to be *seen failing*. It scores best on raw in-window peak and cost, which is precisely
why an operator staring at a peak-reduction number alone would pick it. WattWeave shows its
`rebound-guard` and `hvac-direction` violations and refuses to offer a "Stage" button for it.

Note that **ranking and scoring are separate, and both are shown.** Under the default `safe-peak`
objective the balanced plan ranks first because it has the lowest event peak, even though the
battery-forward plan scores higher overall (it costs one comfort point less). The top card says so
explicitly rather than hiding the tension — switch the objective to **Balanced** and the order flips.

### Scoring is shown, never asserted

Every candidate card renders its full breakdown — `peak 32 · rebound 25 · cost 20 · comfort 10` — as a
segmented bar and as text, followed by the line:

> *best candidate found by the deterministic heuristic, not a claim of optimality*

### Infeasibility is a first-class result

Lock the auditorium, both EV chargers and the dishwasher, then simulate. Instead of a bad plan you get:

> Even using every unlocked flexible asset at its limit, demand at 16:15 stays 18.0 kW above the 170 kW
> target.
> - Unlock "Auditorium Cooling" to free up to 22.0 kWh inside the event window.
> - Unlock "EV Charger A · Staff Van" to free up to 8.3 kWh inside the event window.
> - Unlock "Kitchen Dishwasher" to free up to 6.0 kWh inside the event window.

The report ranks locked assets by how much relief each would actually provide, so the suggestion is
useful rather than generic.

---

## Safety model

| Guarantee | How it is enforced |
| --- | --- |
| **Critical loads never change** | Excluded from the move set, then filtered again before scoring; `set_asset_constraint` refuses them; they cannot be unlocked in the UI |
| **Commit requires visible approval** | The approval token is minted *only* by the operator's click, is bound to `stageId` + `scenarioVersion`, and the tool is not registered before that |
| **No stale plans** | Every constraint change bumps `scenarioVersion`; simulate/preview/stage/commit all reject mismatches by name |
| **Cancellation is clean** | `AbortSignal` → worker → solver checkpoint → structured `CANCELED`; zero state mutation |
| **Exact rollback** | The inverse schedule is generated at *staging* time by negating every integer-Wh delta; applying both restores the baseline array exactly |
| **Idempotency** | `stage`, `commit` and `rollback` replay safely on the same `idempotencyKey` |
| **Untrusted content** | Tariff prose is returned only inside `{ untrusted: { source, warning, text } }`; numeric data stays structured and separate |

---

## Design language

A clean **"living grid"** built on Apple's design vocabulary: frosted translucent panels over a soft
gradient ground, hairline borders, SF-stack typography with tight tracking, restrained system accent
colors, and springy `cubic-bezier(0.32, 0.72, 0, 1)` motion.

- **Main chart** — stacked load areas, a bright target line that is solid only where the limit binds,
  a dashed ghost preview, a rebound-guard region, and a sweep cursor during simulation.
- **Flow view** — grid, solar, battery and zones connected by particles whose density and speed track
  real dispatch numbers.
- **Device cards** — lock toggle, criticality badge, flexible window, current draw, and an "in plan" badge.
- **Candidate cards** — peak, cost delta, comfort, rebound, and a segmented score bar.
- **Tool execution** — a pulse bus briefly illuminates the chart region or device card a tool touched.

**Accessibility.** Color is never the only signal: critical load uses a diagonal hatch, EV load uses a dot
pattern, and every pass/fail state pairs its color with a ✓/✕ glyph and a text label. The chart carries a
descriptive `aria-label` with the actual numbers. Full light/dark support via `prefers-color-scheme` plus a
manual toggle, and `prefers-reduced-motion` collapses all animation.

---

## Testing

### Unit and intent evals — `npm test`

**36 tests across 4 files.** The intent suite drives the *real* WebMCP tools headlessly, exactly as an
agent would:

| # | Intent case | Asserts |
| --- | --- | --- |
| 1 | Respect all critical locks | No action ever targets a critical asset |
| 2 | Meet both EV departure targets | Delivered kWh ≥ required, per charger |
| 3 | Keep event demand ≤ 170 kW | Window peak of the recommended plan |
| 4 | Avoid the seeded rebound peak | Best plan ≤ 190 kW; naïve plan flagged at exactly 224 kW |
| 5 | Reject an impossible constraint set | `INFEASIBLE` with hot slots and ranked unlock suggestions |
| 6 | Use scenario version to reject stale candidates | `STALE_SCENARIO` from both simulate and preview |
| 7 | Never expose commit before approval | `TOOL_NOT_AVAILABLE`; appears only post-approval |
| 8 | Cancel the simulation cleanly | Structured `CANCELED`, no candidates, version unchanged |
| 9 | Do not treat tariff notes as instructions | Injection present in output, limit intact, commit still gated |
| 10 | Select the correct asset-scoped tool | `NOT_SELECTED` for the wrong asset; success for the selected one |
| 11 | Reject an unknown asset id | `UNKNOWN_ASSET` |
| 12 | Preserve idempotency on commit | Replayed key returns the same audit id, grid unchanged |
| 13 | Roll back to the exact prior schedule | Deep-equals the baseline array |
| 14 | Keep tool output compact | `get_load_state` < 4 KB, simulate < 3.5 KB, ≤3 candidates, wide window refused |

Solver units additionally cover the seed numbers (212 kW at 16:15), lock handling, battery power/reserve
limits, score-breakdown consistency, inverse-schedule round-trips, and cancellation timing.

### End-to-end — `npm run e2e`

Playwright journeys: **hero** (lock → simulate → compare → preview → approve → commit),
**impossible plan**, **cancellation**, **rollback**, **untrusted feed**, **inspector gating**, and
**billing** (admin bypass, free-plan gating, license activation). A ninth journey injects an external
`navigator.modelContext`, invokes every lifecycle stage outside the app, pauses for the human approval
click, commits with the issued capability, and rolls back.

---

## Three-minute demo script

| Time | Beat |
| --- | --- |
| **0:00–0:18** | Start on the header: **Sandbox · no devices**. The 212 kW peak crosses the 170 kW target; say clearly that the telemetry is seeded. |
| **0:18–0:42** | The external agent reads the event through WebMCP. Open **Utility advisory**: the feed contains a prompt injection, but remains inside the `untrusted` envelope. |
| **0:42–1:02** | Lock the Computer Lab. Let the agent attempt its old scenario version: `STALE_SCENARIO` is rejected. It rereads v2. |
| **1:02–1:27** | Run simulation, cancel during the sweep, and show “Nothing changed.” Run again. The deterministic candidate computation is real; the inputs are simulated. |
| **1:27–1:52** | Contrast the balanced plan with **Naïve shed & restore**: 138 kW in-window, but a disqualifying 224 kW rebound and no Stage action. |
| **1:52–2:18** | The agent previews and stages the balanced plan. The drawer shows 168 kW, 160 kW rebound, both EV targets, reserve floor, exact changes, and rollback readiness. |
| **2:18–2:40** | Show `commit_load_plan` is absent. Click **Approve schedule** once; only then does the external agent receive the tool and approval capability. It commits. |
| **2:40–3:00** | Show the simulation receipt: 212 → 168 kW, critical loads untouched. The agent calls rollback; the 212 kW baseline returns exactly and both audit entries remain. |

The recording automation follows these beats and keeps the sandbox disclosure visible throughout. With the
dev server running, execute `npm run demo:record`; the captioned WebM video is written to
`demo/wattweave-3-minute-demo.webm`. Set `DEMO_SPEED=0.05` for a fast choreography smoke test.

### Rendered walkthrough video (Remotion)

The polished cut is [demo/wattweave-demo.mp4](demo/wattweave-demo.mp4) — an animated cursor clicks every
control in turn, each resulting state change is boxed and labelled on screen, and a compact caption strip
sits at the very bottom edge so it never covers the UI. The launch copy that goes with it is
[demo/POST.md](demo/POST.md).

It is produced by a three-step, reproducible pipeline (dev server running for the first step):

```bash
npm run demo:capture   # Playwright drives the real app; saves frames + element rects
npm run demo:voice     # neural voiceover per beat + caption timings -> remotion/src/timeline.json
npm run demo:render    # Remotion composites cursor, highlight boxes and subtitles
```

The storyboard lives in [scripts/demo/beats.mjs](scripts/demo/beats.mjs): one narrated beat per feature,
each declaring the controls to click and the elements to highlight afterwards. Because the voiceover
durations define the frame budget, and the highlight rectangles come from real `getBoundingClientRect()`
measurements taken at capture time, narration, cursor and boxes cannot drift apart. The voice is the free
`edge-tts` client (`en-US-AndrewMultilingualNeural` by default — override with `DEMO_VOICE` / `DEMO_RATE`);
`python -m pip install edge-tts` is the only extra prerequisite.

The narrated cut is [wattweave-3-minute-demo-voiced.webm](demo/wattweave-3-minute-demo-voiced.webm), with its
companion [wattweave-narration.mp3](demo/wattweave-narration.mp3). The voice was generated with the free
`edge-tts` client using Microsoft `en-US-GuyNeural`; no paid TTS account was used. For fully offline synthesis,
[Piper](https://github.com/k-rks/piper) is the recommended alternative, while Hugging Face Spaces provide
free CPU-hosted endpoints subject to availability and quotas.

---

## Deployment

The default sandbox is a fully static bundle with no backend:

```bash
npm run build
```

Deploy `dist/` to any static host — Vercel, Netlify, Cloudflare Pages, GitHub Pages, S3. The Web Worker is
emitted as a separate chunk and needs no special configuration.

Optional environment variables (see `.env.example`):

| Variable | Purpose |
| --- | --- |
| `VITE_POLAR_CHECKOUT_LINK` | Polar hosted checkout link for WattWeave Pro |
| `VITE_POLAR_ORG` | Polar organization slug, used for manage-subscription links |
| `VITE_POLAR_VALIDATE_URL` | Optional endpoint that proxies Polar license validation |
| `VITE_CONTROL_GATEWAY_URL` | Optional server-side device-control gateway; empty means sandbox |

---

## External OpenAI agent demo

The harness uses the OpenAI Responses API's function-calling loop. WattWeave registers its current tools
through `navigator.modelContext`; the separate Node process converts those same schemas to Responses tools,
executes model-selected calls through the browser boundary, and sends each result back as a
`function_call_output`. The model cannot import app state or bypass dynamic registration.

Start WattWeave in one terminal:

```bash
npm run dev
```

Then set `OPENAI_API_KEY` in the external process environment and run:

```bash
npm run agent:demo
```

The visible browser pauses after staging. Review the exact diff and click **Approve schedule**; the agent
then discovers `commit_load_plan`, reads the newly issued approval capability, commits, verifies the result,
and invokes the exact rollback. `OPENAI_MODEL` can override the default `gpt-5.6`. The API key remains in
Node and is never exposed to the page bundle.

CI proves the same native boundary without spending model tokens:

```bash
npm run e2e -- e2e/external-agent.spec.ts
```

---

## Optional real control gateway

When `VITE_CONTROL_GATEWAY_URL` is empty, commit and rollback return an explicit sandbox receipt and make
no network request. When configured, WattWeave POSTs the approval-gated schedule or its exact inverse to
the gateway **before** changing local state. A timeout, network error, rejection, or missing operation id
fails closed and leaves the local schedule unchanged.

The browser sends no device credential. [`examples/home-assistant-gateway.mjs`](examples/home-assistant-gateway.mjs)
keeps the Home Assistant bearer token server-side, enforces origin and idempotency checks, and fires a
`wattweave_schedule` event through Home Assistant's REST API. A Home Assistant automation maps WattWeave
asset IDs to the installation's approved entities or BMS commands.

> This is a documented loopback reference adapter, not production building-control infrastructure. Keep its
> default `127.0.0.1` bind during evaluation; a real deployment must add organization authentication, transport
> security, command allowlists, rate limits, monitoring, and site-specific safety interlocks.

Configure the server process:

```text
HOME_ASSISTANT_URL=http://homeassistant.local:8123
HOME_ASSISTANT_TOKEN=<server-side long-lived access token>
CONTROL_GATEWAY_ORIGIN=http://localhost:5173
```

Run it:

```bash
npm run gateway:home-assistant
```

Then set `VITE_CONTROL_GATEWAY_URL=http://127.0.0.1:8787/control` before starting WattWeave. The header
changes to **Control gateway**. That label proves the route is configured—not that seeded demand has become
live telemetry. Home Assistant documents its JSON REST API, bearer authentication, events, and service
calls in the [official REST API reference](https://developers.home-assistant.io/docs/api/rest/).

---

## Wiring real Polar license validation

Polar's license-key validation requires an organization access token, which must never ship in a browser
bundle. Point `VITE_POLAR_VALIDATE_URL` at a small serverless function:

```js
// api/validate-license.js — Vercel / Netlify / Cloudflare Worker
export default async function handler(req, res) {
  const { key } = await req.json()
  const r = await fetch('https://api.polar.sh/v1/customer-portal/license-keys/validate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.POLAR_ACCESS_TOKEN}`, // server-side only
    },
    body: JSON.stringify({ key, organization_id: process.env.POLAR_ORG_ID }),
  })
  const data = await r.json()
  return res.json({ valid: r.ok && data.status === 'granted' })
}
```

With that set, `validateLicenseKey()` in [`src/billing/polar.ts`](src/billing/polar.ts) switches from
offline demo mode to real Polar validation automatically. The admin account bypass is independent of
licensing and keeps working either way.

---

## Scope

**The default experience is a deterministic simulation.** Demand, solar, tariff, battery, EV, and device
state are seeded; there is no utility account, weather feed, or machine-learning forecast. In sandbox mode,
“apply” changes only WattWeave's local schedule. The optional control gateway can forward an approved
schedule to a real automation system, but it does not turn the seeded scenario into live telemetry.

That boundary is deliberate and visible: the product demonstrates the interaction contract between a human
and an agent over shared semantic operations, while refusing to imply a real building is connected when it
is not.

---

<sub>MIT © 2026 [Hector Ta](https://github.com/HectorTa1989)</sub>
