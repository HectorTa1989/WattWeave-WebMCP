# WattWeave — launch post

Video: `demo/wattweave-demo.mp4` (1920×1080, narrated, ~2.5 min)

---

## Short post (X / Bluesky)

Peak demand alert at 4 PM. 212 kW against a 170 kW cap.

WattWeave lets an agent plan the fix through real WebMCP tools — and stops it at the one place that matters: **`commit_load_plan` does not exist until a human clicks Approve.** Not gated. Not registered.

Watch the 2-minute demo 👇

- Prompt injection in the utility advisory → rendered as untrusted data, never as an instruction
- Operator locks a zone → scenario version bumps → stale plans get refused
- Cancel the solver mid-sweep → nothing partial survives
- Commit → 212 kW down to 168 kW, with a receipt
- Roll back → precomputed inverse schedule restores the baseline exactly

Deterministic sandbox. No real device ever gets a command.

---

## Long post (LinkedIn / Devpost / HN Show)

**WattWeave — turning a peak-energy alert into a safe, reversible load plan, with the human still in charge.**

Most "agent controls your building" demos skip the hard part. The hard part isn't planning the schedule — it's proving the agent can't do anything you didn't approve, and proving you can undo it.

WattWeave is a browser-native energy-operations sandbox built on WebMCP. An external agent attaches through `navigator.modelContext` and works entirely through semantic tools — no screen scraping, no synthetic clicks.

**What the demo shows, in order:**

1. **Honest boundaries first.** The header says *Sandbox · no devices*. Demand and tariff data is seeded. Nothing claims live telemetry.
2. **Prompt-injection resistance.** The utility advisory contains text telling the agent to skip safety checks and commit immediately. It is displayed as untrusted data and never reaches the constraint set.
3. **Human constraints outrank the agent.** The operator locks the Computer Lab. The scenario version advances, the tool surface re-registers, and any plan built on the previous version is refused as stale.
4. **Cancellation is real.** The solver runs in a Web Worker. Cancel it mid-sweep and the run is abandoned — no candidates, no schedule mutation, no partial state.
5. **Plans are computed, not narrated.** A deterministic constraint solver returns candidates scored on peak, rebound, cost and comfort. The balanced plan holds the event window under 170 kW, meets both EV departure targets, and respects the battery floor.
6. **The tempting wrong answer is shown, not hidden.** Naïve shed-and-restore hits 138 kW during the event and then rebounds to 224 kW. It is marked invalid, with the violation in plain language — and it has no Stage action at all.
7. **Preview, then stage.** The proposal renders as a ghost line against an untouched baseline, then freezes into an approval drawer showing the exact per-asset changes and the inverse schedule.
8. **The structural gate.** Before approval, `commit_load_plan` is not registered. The agent cannot discover it, guess it, or forge a click. One human approval mints the capability.
9. **Commit with a receipt.** 212 kW → 168 kW, recorded with actor, before/after metrics, critical loads preserved, control mode, and an audit id.
10. **Exact rollback.** The precomputed inverse schedule restores the original baseline to the watt-hour. Commit and rollback both stay in the audit trail.

An optional fail-closed control gateway is documented for real integrations — but this demo makes no live-control claim.

Built with React, Zustand, a Web Worker constraint solver, and WebMCP tool registration that changes with UI state.

**Repo:** https://github.com/HectorTa1989

---

## How this video was made

The video is rendered with Remotion from a reproducible three-step pipeline:

```bash
npm run demo:capture    # Playwright drives the real app, saves frames + element rects
npm run demo:voice      # neural voiceover + caption timings per beat
npm run demo:render     # Remotion composites cursor, highlight boxes, subtitles
```

Because the voiceover durations define the frame budget and the highlight boxes come from
real `getBoundingClientRect()` measurements taken during capture, the narration, the animated
cursor and the boxes can never drift out of sync.
