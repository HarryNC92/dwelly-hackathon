# Stream A: case state extraction and stage machine

## Goal
Turn a case file (the organisers' format: `index.md` + `history.md` + attachments) into a filled `CaseState` (`src/schemas/casestate.ts`) so that the agent starts from facts and the deterministic rules have something to check. This is the "landlord as an entity" requirement: every party, approval, quote, hold, timer and conflict becomes structured.

## Why it matters for the score
The Reality Test is almost certainly "here is a case so far, what happens next". Correct outcomes depend on knowing the current workflow stage, whether landlord approval exists, who the assigned provider is, what is being waited on, and whether the data conflicts. Today the agent re-derives all of that from raw text every time and sometimes gets it wrong.

## Read first
`CONTEXT.md`, `CLAUDE.md`, `docs/case-breakdown.md` (sections 3, 4, 5 are your spec), `src/ingest/dwelly.ts` (how a case is parsed today; `parseHistory` gives you events), `src/schemas/casestate.ts` (the contract; do not change it, request changes), five cases under `HackatonPublicCases/Property Management/` including 003, 008, 027, 043, 045.

## You own
`src/casefile/` (new directory): `extract.ts` (deterministic extraction from system strings), `stage.ts` (stage machine), `entities.ts` (names, aliases, emails, phones, addresses, amounts; a bounded Opus 5.5 call via the AI SDK is allowed for aliases and amounts only, deterministic for everything else), `render.ts` (a compact markdown rendering of a CaseState for the case pack), `index.ts` exporting `extractCaseState(events, header, attachmentsText): Promise<CaseState>` and `renderCaseState(state): string`. Also `evals/casestate/` with expected states for at least eight public cases and a tiny script that compares.

## Interface contract
`extractCaseState` takes the `HistoryEvent[]` from `parseHistory`, the header fields (job id, property address, source role, created) and an optional string of attachment text, and returns a `CaseState`. It must never throw; unknowns stay "unknown". Stage is derived from the exact system strings in section 3 of the breakdown, using the latest decisive event. Timers are computed from event timestamps plus the breakdown's day counts, as ISO strings. `dataConflicts` lists every address, name, phone or date that disagrees with the header or with itself, with event numbers. `safetySignals` uses the section 6 list. The orchestrator wires your function into `src/ingest/dwelly.ts` and the case pack; you do not edit those files.

## Deliverables
0. `difficulty` on the state (score 0 to 10, reasons, tier routine/standard/hard), deterministic: +3 any safety signal, +2 each data conflict touching a party or the address (cap 4), +2 a silence timer expired (landlord 3 days, provider 3+ reminders, missed visit), +2 dispute or disagreement in the last inbound, +1 missing approval at a stage that needs one, +1 more than 35 events, +1 unparseable or unavailable attachment referenced in the last three events. Tier: routine <= 2, standard 3 to 5, hard >= 6. The orchestrator uses the tier to choose model and effort; it must be stable and explainable in the rendering.
1. `extractCaseState` and `renderCaseState` with the behaviour above.
2. A CLI `pnpm casestate -- --case "HackatonPublicCases/Property Management/008" [--cut 20]` that prints the state as JSON and the rendering (add the script to package.json, that one line is yours).
3. Expected states for eight cases and a comparison script; report precision on stage, approval status, provider, occupancy and conflicts across all fifty (run your extractor over all fifty and eyeball the distribution; it must not crash on any).

## Verify
`pnpm typecheck && pnpm smoke && pnpm scenarios`, your comparison script, and the all-fifty run.

## Report
Branch `stream/case-state`, the precision numbers, any system strings you found that the breakdown does not list, and the request to wire it in.
