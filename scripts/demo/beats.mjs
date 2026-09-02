/**
 * Shared storyboard for the Remotion demo.
 *
 * Every beat is one narrated idea. `actions` are the clicks the animated
 * cursor performs (in order); `highlights` are the elements that changed as a
 * result, boxed and labelled in the rendered video.
 */

export const VIEWPORT = { width: 1440, height: 810 }
export const SCALE = 4 / 3 // 1440x810 CSS px -> 1920x1080 video px

export const BEATS = [
  {
    id: '01-intro',
    narration:
      'This is WattWeave. A peak demand alert arrives, and an agent turns it into a safe, reversible load plan, with a human in the loop. It all runs in a deterministic sandbox: no real device ever gets a command.',
    highlights: [
      { testid: 'control-mode', label: 'Sandbox · no devices' },
      { testid: 'tool-count', label: 'Live WebMCP tools' },
    ],
  },
  {
    id: '02-event',
    narration:
      "Here's the problem. The utility called a demand event capped at one hundred seventy kilowatts, and the building is heading for two hundred twelve.",
    scrollTo: 'event-banner',
    highlights: [
      { testid: 'window-peak-chip', label: 'Projected peak vs. limit' },
      { testid: 'load-timeline', label: 'Baseline schedule' },
    ],
  },
  {
    id: '03-injection',
    narration:
      'The advisory attached to that event contains a prompt injection, telling the agent to skip safety checks and commit immediately. WattWeave renders it as untrusted data, never as an instruction.',
    actions: [{ testid: 'toggle-tariff-note', label: 'Open advisory' }],
    highlights: [{ testid: 'untrusted-note', label: 'Marked UNTRUSTED, ignored' }],
  },
  {
    id: '04-inspector',
    narration:
      'The inspector shows the actual tool surface the agent talks to: semantic WebMCP tools, not screen scraping.',
    actions: [
      { testid: 'toggle-tariff-note', label: 'Close advisory' },
      { testid: 'inspector-toggle', label: 'Open WebMCP inspector' },
    ],
    highlights: [{ testid: 'inspector', label: 'Registered tools and annotations' }],
  },
  {
    id: '05-read-state',
    narration:
      'A read only tool returns structured state, including the scenario version the agent is allowed to act on.',
    actions: [
      { testid: 'tool-get_active_demand_event', label: 'Pick read-only tool' },
      { testid: 'inspector-run', label: 'Execute' },
    ],
    highlights: [{ testid: 'inspector-result', label: 'Structured result + scenario version' }],
  },
  {
    id: '06-lock',
    narration:
      'Now a human constraint. The operator locks the computer lab so it can never be shed. The scenario version advances and the tools re-register, so any plan built on the old version is refused as stale.',
    actions: [
      { testid: 'inspector-toggle', label: 'Close inspector' },
      { testid: 'asset-computer-lab', label: 'Select Computer Lab' },
      { testid: 'lock-computer-lab', label: 'Lock asset' },
    ],
    highlights: [
      { testid: 'asset-computer-lab', label: 'Locked by operator' },
      { testid: 'tool-count', label: 'Tool surface re-registered' },
    ],
  },
  {
    id: '07-cancel',
    narration:
      'The solver runs in a web worker, and cancellation is real. Stop it mid sweep and the run is abandoned: no candidates, no schedule change, nothing partial left behind.',
    actions: [
      { testid: 'run-sim', label: 'Run simulation', waitMs: 220 },
      { testid: 'cancel-sim', label: 'Cancel mid-sweep', waitFor: 'canceled-note' },
    ],
    highlights: [{ testid: 'canceled-note', label: 'Canceled, nothing changed' }],
  },
  {
    id: '08-candidates',
    narration:
      'Run it again and the solver returns computed candidates. The balanced plan holds the window under the limit, keeps both E V departure targets, and respects the battery floor.',
    actions: [{ testid: 'run-sim', label: 'Re-run on current state', waitFor: 'candidate-balanced' }],
    scrollTo: 'candidate-balanced',
    highlights: [{ testid: 'candidate-balanced', label: 'Valid · computed, not guessed' }],
  },
  {
    id: '09-invalid',
    narration:
      "The tempting alternative is not hidden. Shed and restore looks cheaper, but rebounds to two hundred twenty four kilowatts, so it is marked invalid, with the reason spelled out and no stage action.",
    scrollTo: 'candidate-shed-restore',
    highlights: [
      { testid: 'candidate-shed-restore', label: 'Invalid · rebound violation' },
      { testid: 'violations-shed-restore', label: 'Reason in plain language' },
    ],
  },
  {
    id: '10-preview',
    narration:
      'Preview first. The plan appears as a ghost line against the untouched baseline, so the operator sees exactly what would change.',
    actions: [{ testid: 'preview-balanced', label: 'Preview plan' }],
    scrollTo: 'load-timeline',
    highlights: [{ testid: 'load-timeline', label: 'Ghost plan vs. live baseline' }],
  },
  {
    id: '11-stage',
    narration:
      'Staging freezes the plan for review. The drawer shows the exact load changes, the resulting peak, the rebound, and the untouched critical loads.',
    actions: [{ testid: 'stage-balanced', label: 'Stage for approval', waitFor: 'approval-drawer' }],
    highlights: [{ testid: 'staged-changes', label: 'Exact diff a human can audit' }],
  },
  {
    id: '12-approve',
    narration:
      'Until a human approves, the commit tool does not exist. Not hidden behind a check, simply not registered, so the agent cannot discover it or forge a click. One approval mints it.',
    actions: [{ testid: 'approve-btn', label: 'Approve schedule' }],
    highlights: [
      { testid: 'commit-btn', label: 'commit_load_plan now available' },
      { testid: 'tool-count', label: 'Plus one tool after approval' },
    ],
  },
  {
    id: '13-commit',
    narration:
      'Commit. The peak drops from two hundred twelve to one hundred sixty eight kilowatts, and the receipt records the actor, the before and after numbers, and the control mode: sandbox, so no command left the browser.',
    actions: [{ testid: 'commit-btn', label: 'Commit plan', waitFor: 'before-after' }],
    scrollTo: 'receipt-panel',
    highlights: [
      { testid: 'before-after', label: 'Measured before → after' },
      { testid: 'control-mode', label: 'Sandbox control receipt' },
    ],
  },
  {
    id: '14-rollback',
    narration:
      "And it is reversible. Rollback applies the precomputed inverse schedule, restoring the baseline exactly, while both actions stay in the audit trail.",
    actions: [{ testid: 'rollback-btn', label: 'Roll back' }],
    scrollTo: 'receipt-panel',
    highlights: [{ testid: 'audit-list', label: 'Full audit trail preserved' }],
  },
  {
    id: '15-outro',
    narration:
      "Real WebMCP orchestration, computed schedules, human authority at the gate, and honest sandbox boundaries. That's WattWeave.",
    scrollTo: 'event-banner',
    highlights: [],
  },
]
