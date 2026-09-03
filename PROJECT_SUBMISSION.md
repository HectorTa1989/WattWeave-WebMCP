# WattWeave Project Submission

## Elevator Pitch
**Turn a peak-energy alert into a safe, visible load plan in seconds.**

## Inspiration
When a building receives a demand-response event or sudden price spike, facilities operators must reduce peak load without disrupting critical equipment or violating occupant constraints. Existing energy dashboards show charts but leave operators to manually coordinate dozens of devices and schedules. The core problem is that reducing total energy is not the same as reducing the critical peak, and manual changes can create dangerous rebound peaks later.

We were inspired by the need for a collaborative human-AI interface where operators define what cannot change (critical loads, departure targets, comfort bounds) while an agent discovers, simulates, and applies safe load-shifting plans—all with full visibility, cancellability, and reversibility.

## What it does
WattWeave is an interactive building-energy sandbox where a human pins non-negotiable constraints and an agent discovers, simulates, stages, and applies a safe load-shifting plan inside the same visual interface.

**Core workflow:**
1. Operator locks critical loads directly on the timeline (server room, accessibility equipment)
2. Agent reads the live demand event, locks, and flexible assets through WebMCP tools
3. Cancellable simulation sweeps across the timeline, generating up to 3 candidate plans
4. Operator compares candidates by peak, cost, comfort impact, and rebound risk
5. Selected plan renders as a ghost preview on the load chart and energy-flow diagram
6. Operator approves the exact schedule diff in a visible approval drawer
7. Agent commits the plan; the live meter falls below the target line
8. One-click rollback restores the exact prior schedule with full audit trail

**Key features:**
- Deterministic 15-minute slot model with integer watt-hour precision
- Transparent heuristic constraint solver (not a black-box optimizer)
- Dynamic WebMCP tool registration based on UI state
- Safety model: critical loads never change, commit requires visible approval, stale plans rejected
- Animated "living grid" energy-flow visualization
- Offline deterministic sandbox mode (no API keys required)
- Optional Pro features: side-by-side candidate comparison, audit export, animated particle flow

## How we built it
**Tech stack:**
- React 19.1.0 + TypeScript 5.9.2 + Vite 7.1.5
- Zustand 5.0.8 for state management
- Zod 4.1.5 for schema validation and JSON Schema generation
- Web Workers for off-main-thread simulation with real cancellation
- Vitest 3.2.4 for unit tests and intent evals
- Playwright 1.55.0 for end-to-end browser journeys
- Remotion for polished demo video production

**Architecture:**
- `domain/` - Pure, framework-free core: types, time model, seed data, schedule logic, constraint solver
- `sim/` - Web Worker bridge with AbortSignal support for clean cancellation
- `webmcp/` - 10 semantic tools with dynamic state-scoped registration via `navigator.modelContext`
- `state/` - Zustand store with pulse bus for tool-effect animations
- `components/` - React UI: load timeline, flow view, asset panel, planner, approval drawer, inspector
- `billing/` - Polar.sh integration with offline demo mode

**WebMCP integration:**
Tools are registered dynamically based on UI state—`get_selected_asset` only exists while an asset is selected, `commit_load_plan` is undiscoverable until the operator clicks approve. Every tool execution animates its effect on the UI so humans can see what the agent did.

**Testing:**
- 36 unit tests covering solver logic, time model, and 15 intent evals
- 9 Playwright E2E journeys including external agent integration
- Intent evals drive real WebMCP tools headlessly, exactly as an agent would

## Challenges we ran into
1. **Cancellation semantics** - Making `AbortSignal` work cleanly through Web Worker → solver → checkpoint without state mutation required careful architecture. We solved it with a structured `CANCELED` result and explicit checkpoint boundaries.

2. **Stale plan rejection** - Ensuring operators can't accidentally approve plans based on outdated constraints. We implemented `scenarioVersion` bumping on every constraint change and rejection by name in simulate/preview/stage/commit.

3. **Exact rollback** - Generating mathematically precise inverse schedules that restore the baseline array exactly. We solved this by negating every integer-Wh delta at staging time and storing the inverse alongside the staged plan.

4. **Untrusted content handling** - The utility tariff feed in our scenario contains a literal prompt injection. We return it inside an `untrusted` envelope with warnings, keeping numeric data structured and separate.

5. **Dynamic tool registration** - Making the tool list itself serve as the permission model. We implemented state-scoped registration where tools appear/disappear based on selection, staging, and approval state.

6. **Rebound peak detection** - Naïve load-shifting can create worse peaks after the event window. We added explicit 60-minute post-event rebound analysis with guard thresholds.

## Accomplishments that we're proud of
- **Semantic over scraping:** WebMCP tools encode meaning (e.g., "pre-cool auditorium by 30 minutes within comfort bounds") rather than pixel coordinates, making agent actions reliable and interpretable.

- **Safety-critical guarantees:** Critical loads never change, commit requires visible human approval, cancellation is clean, rollback is exact, and untrusted content stays data.

- **Transparent solver:** We show the full scoring breakdown (peak 32 · rebound 25 · cost 20 · comfort 10) and explicitly state "best candidate found by the deterministic heuristic, not a claim of optimality."

- **Real cancellation:** `AbortSignal` propagates through Web Worker to solver checkpoints, returning structured `CANCELED` with zero state mutation—no hangs, no rejected promises.

- **Deterministic demo:** The entire hero scenario (212 kW → 168 kW, both EV targets met, 160 kW rebound) is reproducible without any external APIs or random data.

- **Comprehensive testing:** 15 intent evals prove the WebMCP contract, 36 unit tests cover domain logic, and 9 E2E journeys validate the full user and agent workflows.

- **Beautiful "living grid" UI:** Frosted translucent panels, animated particle flow tracking real dispatch numbers, springy motion, and full accessibility support.

## What we learned
- **WebMCP is transformative for agent-human collaboration:** Shared live state through a single Zustand store eliminates the drift that plagues chart-scraping approaches. The tool list itself becomes the permission model.

- **Cancellation is a first-class feature:** Real cancellation requires architectural commitment—checkpoint boundaries, structured results, and zero state mutation on abort. It's not an afterthought.

- **Scoring transparency builds trust:** Showing the full breakdown and explicitly disclaiming optimality is more honest than hiding the heuristic. Users appreciate understanding *why* a plan was recommended.

- **The approval pattern is powerful:** Making `commit_load_plan` undiscoverable until the human clicks approve creates a strong structural guarantee. The tool surface itself encodes the permission model.

- **Integer arithmetic matters:** Using 15-minute slots and integer watt-hours internally avoids floating-point surprises that could corrupt schedule calculations.

- **Untrusted content needs structural boundaries:** Returning prompt injections inside an `untrusted` envelope with warnings keeps the app safe while still displaying the information.

- **E2E tests with external agents are invaluable:** The Playwright journey that injects a real `navigator.modelContext` and drives the full lifecycle outside the app proves the WebMCP contract without spending model tokens.

## What's next for WattWeave
- **Real control gateway integration:** Complete the documented Home Assistant loopback adapter with organization authentication, transport security, command allowlists, and site-specific safety interlocks.

- **Multi-building scenarios:** Extend the deterministic seed data to support additional building types (office, retail, hospital) with different asset profiles and constraint patterns.

- **Historical analysis:** Add time-series exploration of past demand events, committed schedules, and their outcomes to support learning and refinement.

- **Collaborative mode:** Multi-operator support with role-based permissions, constraint proposal workflows, and team audit trails.

- **Advanced solver strategies:** Implement additional candidate generation strategies (thermal mass pre-conditioning, predictive battery dispatch, machine-learning-assisted feasibility analysis).

- **Mobile optimization:** Responsive design improvements for tablet and field-operator use cases.

## Built with
React, TypeScript, Vite, Zustand, Zod, Web Workers, Vitest, Playwright, WebMCP, JSON Schema, Remotion, HTML5, CSS3

## Which agent(s) or client(s) did you test your WebMCP tools with?
- **OpenAI Responses API** - External agent demo using GPT-5.6 (configurable via `OPENAI_MODEL`) through the native `navigator.modelContext` boundary. The separate Node process converts WebMCP schemas to Responses tools, executes model-selected calls through the browser boundary, and sends results back as `function_call_output`.

- **Native WebMCP Inspector** - Built-in developer tool that lists every tool registered for the current UI state with annotations and schemas, allowing manual execution with real arguments for testing and validation.

- **Playwright E2E test agent** - Automated browser journeys that inject a mock `navigator.modelContext`, invoke every lifecycle stage (simulate → preview → stage → approve → commit → rollback), and validate the full WebMCP contract without spending model tokens.

## Which AI tools have you leveraged while working on this project?
- **OpenAI GPT-5.6** - Used in the external agent demo (`npm run agent:demo`) to demonstrate real-time agent collaboration through WebMCP tools. The model reads demand events, constraints, and candidate plans, then makes tool calls to simulate, preview, stage, and commit load-shifting schedules.

- **Cascade (SWE-1.6)** - AI coding assistant used for development, debugging, and implementation of the WattWeave application, including WebMCP tool integration, constraint solver logic, and comprehensive test coverage.

- **Edge-TTS** - Free Microsoft neural text-to-speech service used for demo voiceover generation (`en-US-AndrewMultilingualNeural` and `en-US-GuyNeural` voices). No paid TTS account required.

- **Remotion** - AI-assisted video composition framework used for producing the polished demo video with animated cursor, highlight boxes, and synchronized captions.

---

## YouTube Video Hook & Description

### Viral Hook Title
**"I Built an AI That Can't Destroy Your Building (And That's the Point)"**

### Alternative Hook Titles
- "The AI Energy Crisis Solution That Actually Lets You Say NO"
- "Why Most AI Energy Tools Are Dangerous (And How We Fixed It)"
- "Watch AI Solve a $10,000 Energy Problem in 60 Seconds (With Your Permission)"

### Video Description

**When your building hits peak demand, you have seconds to act. Most AI tools would just "optimize" everything—but what if that kills your critical systems?**

I built WattWeave: an AI-powered energy sandbox where YOU lock what can't change, and the AI figures out the rest. No black boxes. No silent mutations. Just transparent, cancellable, reversible plans that you approve before anything happens.

**In this video, you'll see:**
- A real 212 kW peak crisis get solved in under 3 minutes
- Why WebMCP changes everything for human-AI collaboration
- The AI try to commit a plan—and get BLOCKED until I click approve
- One-click rollback that restores the EXACT prior schedule
- How we handle prompt injections in utility feeds (spoiler: they fail)

**The tech stack:** React, TypeScript, WebMCP, Web Workers, and a constraint solver that shows its work instead of hiding it.

**The result:** Peak reduced from 212 kW → 168 kW, critical loads untouched, both EV targets met, and zero rebound spikes.

This is what safe AI-human collaboration looks like in the real world.

**🔗 Links:**
- GitHub: [repository link]
- Try the demo: [live demo link]
- WebMCP docs: [documentation link]

**Chapters:**
0:00 - The 212 kW problem
0:45 - Why existing dashboards fail
1:30 - How WattWeave works
2:15 - The AI tries to commit (and gets blocked)
3:00 - One-click rollback magic
4:00 - Under the hood: WebMCP tools
5:00 - The constraint solver explained
6:00 - Building it yourself
7:00 - What's next
