# Dashboard handoff (written 10 Oct 2026, ~13:55, for the session building the demo front end on Jeremy's machine)

You are building the demo dashboard for Jeremy's team at the Dwelly Real-World Agents Hackathon (Property Management track, London, today). The dashboard is for the 60-second demo video (30 of 100 points, judged by humans) and for clicking through live. It is not on the judged path: the 70 technical points come from files the runner writes, and the dashboard only reads them. Jeremy runs and clicks it on this machine and relays between you and the orchestrator session. Address him plainly; short answers; no em-dashes.

## 0. Rules that cannot be broken

- You edit only `dashboard/` (new, yours) and nothing else. Never `src/`, `public/`, `scripts/`, `evals/`, `cases/`, `docs/`, root config files. `src/service.ts` and `public/` belong to the voice stream (Vedaant); the runner belongs to the orchestrator. If you need something from outside `dashboard/`, say so in your report and the orchestrator does it.
- The dashboard reads output folders. It never writes into `out/` or `ANSWERS/`, and nothing in those folders is ever hand-edited (that would disqualify the team).
- `dashboard/` is a standalone package with its own `package.json`, lockfile and `tsconfig.json`. The root `pnpm typecheck && pnpm smoke && pnpm scenarios` must stay green and must not depend on `dashboard/` (root `tsconfig.json` includes only `src`, so a sibling folder is already outside it). A clean clone must not need `dashboard/` to run the system. Make sure `dashboard/node_modules` and `dashboard/dist` are gitignored (add a `dashboard/.gitignore`).
- Branch `stream/dashboard`. `git merge main` before you start and before every push. Commit after each element with a message that says what the viewer can now see. Hard stop 15:45; the video is shot from 16:00. The system's own code freeze is 15:00 and does not apply to `dashboard/`.
- No API keys, no voice setup on this machine. The dashboard never calls Anthropic, ElevenLabs or Twilio.

## 1. Stack and layout

Vite + React + TypeScript in `dashboard/`, plus a tiny data API, `dashboard/server.ts`, run with `tsx`, that reads `OUT_DIR` and serves JSON on port 8788. Vite dev server on 5173 proxies `/api` to 8788. Plain fetch with polling every two seconds is enough; no state library, no router needed (tabs in state). Tailwind or plain CSS, your call; keep it fast.

```bash
cd dashboard && pnpm install
OUT_DIR=../out/public-full-2 pnpm dev        # starts server.ts and vite together (use concurrently or two scripts)
# open http://localhost:5173
```

API to expose (all read-only):
- `GET /api/cases` → one row per folder: folder, case_id, status (from the `case.end` event or "running"), family, urgency, escalation tier, agent, seconds, next_action (the line under `## Next action` in ANSWER.md), property (first address in ANSWER.md if present), judge scores if `JUDGE.json` exists.
- `GET /api/case/:folder` → `answer` (ANSWER.md text), `reasoning` (REASONING.md text), `events` (trace.jsonl parsed, in order), `judge` (JUDGE.json or null), `callback` (callback.json or null), `summary` row.
- `GET /api/summary` → counts by status, total, completed, elapsed, from `summary.md` and `index.json`.

## 2. Data on disk (what the runner writes)

An output directory (`OUT_DIR`) holds one folder per case. With `--numbered` the folders are `1`, `2`, `3` … and `index.json` maps them:

```json
[{"folder":"1","case_id":"001","files":["index.md","history.md"],"channel":"tenant request","received_at":"2025-10-11T22:29:12.000Z"}, …]
```

`summary.md` at the top has a table: `| Folder | Case | Status | Family | Urgency | Escalation | Agent | Seconds |` and a line `Cases: 50. Completed: 50. Pipeline errors: 0. Deadline skips: 0.`

Per case folder:
- `ANSWER.md` sections, in order: `## Next action` (one line: `type → recipient (stage: …; confidence …; rules PM-…)`), `## Rationale`, `## Execution status (generated from execution results, not from the agent's text)`, `## Actions taken`, `## Not done and why`, `## Escalation`, `## Communications`, `## Messages sent (full text)`, `## Conflicts and missing information`, `## Final state`, `## Summary`. Some sections are empty for some cases.
- `REASONING.md` sections: `## What the system received`, `## Triage and routing`, `## What it looked up, staged and executed`, `## What it decided and why`, `## What it escalated`, `## What failed`, `## Automated checks`, `## Final result`.
- `trace.jsonl`: one JSON object per line, appended live while the case runs. Every line has `ts`, `case`, `event`. Events in the order they occur:
  - `case.start` {channel, kind, flags[], files[]}
  - `route` {families[], urgency P0|P1|P2, confidence, reasons}
  - `prefetch` (records looked up) and `prefetch.error`
  - `agent.start`, `agent.step` (one per model step), `agent.submit`, `agent.reroute`, `agent.fallback_model`, `agent.error`
  - `tool.read` {tool, input} (live reads), `tool.staged` {tool, actionId, input} (writes staged, not yet executed), `tool.control` {tool, input} (`submit_resolution` carries the full resolution: decision, nextAction, rulesApplied, escalation, finalState, summaryForHuman)
  - `checks` {pass: 0|1, problems[]} (deterministic checks with rule ids like PM-AUTH-001), `revision.failed`
  - `tool.blocked` {actionId, tool, reason} (a guard refused a write)
  - `execute.success` | `execute.failure` | `execute.unknown` {actionId, tool, attempt, phase: "state"|"comms"}
  - `reconcile.start`, `reconcile.withdrawn` (messages pulled back after a failure), `claims.unresolved`
  - `escalate.p0.call` {status} (on-call page placed), `escalate.p0.recorded` (no voice configured), `escalate.p0.rate_limited`, `escalate.p0.call_failed`
  - `case.end` {ms, status} where status is one of resolved, scheduled, on_hold, awaiting_approval, escalated, closed_no_action, blocked, error
- `JUDGE.json` (only on evaluation runs): `outcome_score`, `judgement_score` (0 to 10), `coverage_complete`, `required_outcomes_met[]`, `required_outcomes_missed[]`, `red_flags[]`, `critical_failure`, `verdict`.
- `callback.json` (only when the on-call call happened): `status` ("decided"), `chosen_option`, `decision`, plus the transcript summary fields the voice service writes.

Data on this machine now: `out/public-full-2` (fifty real cases from today's 13:30 run, with JUDGE.json), `out/smoke` (two mock cases, one is a P0 gas case), and from 15:15 `out/rehearsal` (the dress rehearsal, with one injected booking failure, so it contains a real `execute.failure` and `reconcile.*` sequence). Vedaant will supply a fixture folder from the real phone test (`S02-gas-smell-call` with `escalate.p0.call` and `callback.json`); drop it into a folder under `out/fixtures/` and point `OUT_DIR` there to build the on-call panel.

## 3. Elements to build, in this order

1. **Queue board.** One row per case: urgency badge (P0 red, P1 amber, P2 grey), case id, property, family, stage (from the Next action line), final state, the Next action line. Stat tiles above: processed, scheduled, awaiting approval, on hold, escalated, elapsed seconds. Rows appear as folders are written (poll). Click a row to open the case.
2. **Case view.** Harry's two-column HTML (action taken | justification) arrives from Jeremy; port it as the `CaseView` component. Add: the execution status block, actions taken with their results, "Not done and why", messages sent in full, final state. Everything comes from ANSWER.md; render the markdown sections, do not reinterpret them.
3. **Decision trail.** A horizontal stepper for the open case built from the trace: Received (flags) → Routed (family, urgency, confidence) → Context (tool.read count) → Proposed (tool.staged list) → Checked (checks problems, rule ids, pass/fail) → Executed (per action: success, failure, unknown) → Reconciled (withdrawn messages, retries) → Escalated (tier, page status) → Written. Each step expands to its raw events. `execute.failure` and `reconcile.*` render the step red: this is the exception-handling story (there is a Best Exception Handling award).
4. **On-call panel.** For a case with `escalate.p0.*` events: the handover summary (from the `submit_resolution` payload: `escalation.decisionRequired`, `summaryForHuman`), the page status, and `callback.json` when it appears (chosen option and decision), refreshing live.
5. **Evidence tiles.** Static, from `docs/evidence/README.md`: fifty public cases self-evaluated against their hidden endings, outcome 8.2 of 10, judgement 7.8, zero critical failures, 50 of 50 folders written, 174 seconds at concurrency 10.
6. **Architecture panel.** One static SVG of the pipeline (the orchestrator can supply it; otherwise draw it): case file → flags (deterministic) → router (Sonnet 5.5) → agent (Opus 5.5, policies + tools; reads live, writes staged) → checks (rules with ids; one revision) → execute phase 1 (state changes) → reconcile (truthfulness, claim check) → execute phase 2 (messages) → escalate (P0 voice page, fire and forget) → write (ANSWER.md, REASONING.md, trace.jsonl). Caption: code decides what runs, the model proposes.
7. **Follow-up queue** (only if the orchestrator adds it to the run summary): tomorrow's chases across cases.

## 4. The 60-second video the dashboard serves

| Seconds | On screen |
|---|---|
| 0 to 10 | The problem: a folder of fifty real-shaped cases, one case file open |
| 10 to 25 | The run: terminal plus the queue board filling, fifty folders in about three minutes |
| 25 to 42 | One case: case view and decision trail, including the red exception step from the injected failure |
| 42 to 55 | The gas case: on-call panel, phone rings, WhatsApp page, decision lands in callback.json |
| 55 to 60 | The repo and the ANSWERS folder, nothing hand-edited |

## 5. Reporting

After each element: commit on `stream/dashboard`, push, and tell Jeremy what to look at and the hash. The orchestrator merges. If anything in the data does not match this document, say exactly what you found rather than working around it; the orchestrator owns the writer and will answer.
