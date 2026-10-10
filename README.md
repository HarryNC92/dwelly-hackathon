# Property Operations Agent - Dwelly Real-World Agents Hackathon

Property Management track, London, 10 October 2026.

This repository contains a generalised triage, rationale and next-action engine for UK property-management operations. Inbound emails, calls, messages, tickets and case files become cases. For each new case, including cases the system has not seen before, it identifies the operational issue, explains its reasoning, chooses the safest next action, checks that action against deterministic rules, and either executes it or escalates to a human with a complete handover. Urgent escalations can page the on-call manager through the demo service.

## 1. What We Built

We built a reusable decision program for property-management cases, not a solver for a fixed dataset. Its job is to read a new operational case, triage it, produce a rationale, select the next action, and preserve an audit trail that shows why that action was safe. It writes a human-readable folder for every case containing `ANSWER.md`, `REASONING.md` and `trace.jsonl`, so an evaluator can see what the system received, looked up, decided, staged, executed, escalated, failed and deliberately did not do.

The important design choice is that judgement is split into three explicit outputs: triage, rationale and next action. The model can propose actions, but code checks them first. Only checked actions run, and the final answer is generated from execution results rather than from hopeful model prose. If an action fails or returns unknown, the system reconciles, withdraws unsafe pending messages, tries a safe recovery where possible, or escalates with an honest handover.

## 2. The Operational Problem

Lettings agencies run on an inbox: repairs, compliance deadlines, arrears, applicant questions, landlord instructions, complaints, noise and legal threats. The hard part is not matching yesterday's examples; it is making a defensible next-action decision on a new case with partial context, conflicting details and uneven stakes. A competent property manager has to decide what is safe to do now, what needs landlord approval, what should be escalated, what should be recorded, and what must not be promised.

The Reality Test rewards that judgement on unseen cases. Doing nothing, waiting on a timed hold, or escalating can be correct. The system is built to take routine safe actions inside authority, stop before unsafe actions, and hand humans the decisions they must make with enough context to act.

## 3. Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full design and rationale.

The ten-stage pipeline is: ingest any case file or folder into a normalized `Case`; attach deterministic flags for safety, legal, payment, compliance and prompt-injection signals; route to the relevant family; prefetch records from the store; run a specialist or generalist agent with read tools and staged write tools; require a structured resolution containing triage, rationale and next action; run deterministic checks over that proposed resolution; execute state-changing writes through one wrapper; reconcile failures or unknowns; fire-and-forget any escalation; then write `ANSWER.md`, `REASONING.md`, `trace.jsonl`, `summary.md` and `index.json`.

The system is deliberately registry-based:

- `src/tools/`: read, write and control tools with Zod schemas and optional guards.
- `src/policies/`: operating policy per family plus shared constraints.
- `src/agents/`: agent configurations, model choices, tool sets and step caps.
- `src/backend/`: PGlite/Postgres record store and seed loader.
- `src/orchestrator/runCase.ts`: route, run, check, execute, reconcile, escalate and write.

## 4. How To Run

Prerequisites: Node 24 and `pnpm`.

Install dependencies:

```bash
pnpm install
```

For offline verification, no API key is needed:

```bash
pnpm smoke
pnpm scenarios
```

For real model runs, create `.env` and set `ANTHROPIC_API_KEY`:

```bash
cp .env.example .env
# edit .env and set ANTHROPIC_API_KEY=...
```

Run the synthetic sample set. This is a validation fixture for the general engine, not the target workload:

```bash
pnpm cases --cases ./cases/sample --data ./data/sample --out ./out/sample --concurrency 8
pnpm eval --out ./out/sample
pnpm judge --out ./out/sample --cases ./cases/sample --report ./out/sample-judge.md
```

Build decision-point cuts from the public practice cases. These are another validation fixture for unseen-case judgement:

```bash
git clone https://github.com/DwellyOrg/HackatonPublicCases
pnpm cut --src "HackatonPublicCases/Property Management"
pnpm cases --cases "HackatonPublicCases/Property Management" --out ./out/public --numbered --cuts evals/cuts-auto.json --concurrency 10
```

Rehearse the Reality Test runbook without committing:

```bash
DRY_RUN=1 scripts/reality-test.sh "HackatonPublicCases/Property Management" 6
```

Run the Reality Test when the challenge cases are available:

```bash
scripts/reality-test.sh <challenge-repo-url> 10
```

The organisers publish the challenge repository URL at 16:30; the script clones it, finds the Property Management folder, writes numbered folders to `ANSWERS/`, checks that each selected case has an `ANSWER.md`, commits `ANSWERS/` only, pushes, and prints the commit hash for the submission form. `DRY_RUN=1` writes to `out/rehearsal` and skips commit/push. `ONLY=003,027` can limit a rehearsal subset.

Demo board and voice endpoints:

```bash
OUT_DIR=./out/sample pnpm service
```

Then open <http://localhost:8787>.

## 5. Models And Services

Core runtime:

- TypeScript on Node 24.
- Vercel AI SDK 7 with `@ai-sdk/anthropic`.
- Anthropic `claude-opus-5-5` for agents by default.
- Anthropic `claude-sonnet-5-5` for routing by default and as the rate-limit fallback.
- Zod 4.6, PGlite 0.5 or `postgres` 3.4, `p-limit` 7 and `commander` 15.

Optional services:

- ElevenLabs Agents and Twilio for the P0 on-call phone demo.
- TypeSafe AI Jev as an optional shadow classifier when `TYPESAFE_API_KEY` is set.

The judged run does not require ElevenLabs, Twilio, Jev or hosted Postgres. With no `DATABASE_URL`, the record store is in-process PGlite.

## 6. Assumptions

- Case time comes from the case, never from the wall clock.
- Cases may arrive as email/call/message JSON, plain text, folders of files, or Dwelly-style `index.md` plus `history.md` exports.
- Public Dwelly practice cases are only one supported input shape. Overview and Outcome sections in those practice cases describe the ending, so the adapter hides them by default.
- Landlord approval is required before contractor dispatch unless the visible case contains explicit pre-authorisation.
- Quoted works, scope changes, liability decisions and rent deductions need explicit approval or escalation.
- When the case names no provider, the system assigns by trade through the platform provider step, as the organisers' cases do, and never invents a named contractor. Spend checks apply only when a landlord authority exists.
- The record store is the audit copy unless a supplied API is wired behind the same wrapper.

## 7. Known Limitations

- Deterministic flags are pattern-based. They are guardrails, not a full verifier.
- When an input is only a case-file export rather than a complete CRM, provider identity and contact details may be unavailable.
- Some safe actions are intentionally conservative. The system may hold or escalate where a human agency worker might proceed from context outside the export.
- The voice page is fire-and-forget. The scored case completes even if voice is not configured.
- `ANSWER.md` and `REASONING.md` are generated outputs. They should never be hand-edited to improve a score.

## 8. What We Would Build Next

- Put the organisers' or a real agency API behind the existing write wrapper.
- Add a small verifier only for failure classes found in judge reports, such as missing quote attachments or premature provider expectation-setting.
- Persist richer case-state extraction for exported-case workflows.
- Turn inbound WhatsApp/SMS into live case sources with replies on the same channel.
- Add a human review console for escalations, holds and callback outcomes.

## How To Read An Answer

Open the committed, unedited example output folder at `docs/evidence/example-case-008/`.

`ANSWER.md` is the operational output. It starts with an execution status block generated from actual tool results, then gives the next action, decision, actions taken, recorded human handovers, failed or blocked actions, escalation, communications, full message text, conflicts, missing information, final state and summary. In example case 008, the system handles an agency check-out job on a vacant flat: the landlord has asked for a comparison quote, so the next action is to assign a second provider for a quote only, set a provider hold with a chase date, and email the landlord. It sends no tenant message because nobody is in occupation, and it does not approve any works.

`REASONING.md` is the audit trail in plain English. It shows the source files, deterministic flags, routing, records prefetched, every read/staged/executed tool action, the final decision, escalation, failures and automated check results. `trace.jsonl` is the machine-readable version with every model step, guard decision and execution result.

The critical thing to check is consistency: if an action failed, `ANSWER.md` must not claim it happened. If the system escalated, the escalation must say what decision a human needs to make.

## Evidence

The committed reports in [docs/evidence](docs/evidence) are generated by the system's own scripts from real Anthropic runs on 10 October 2026.

[sample-set-eval.md](docs/evidence/sample-set-eval.md) scores sixteen synthetic validation cases with an injected booking failure: 92/100 deterministic checks passed. The misses are mostly conservative escalation/classification differences, while P0 gas, P0 break-in, prompt injection, arrears, compliance and complaint cases follow the expected safe paths.

[public-cases-judge-all-fifty.md](docs/evidence/public-cases-judge-all-fifty.md) grades all fifty cut public Property Management practice cases with the judge simulator. This tests whether the general next-action engine transfers to a different exported-case shape: mean outcome 8.2/10, mean judgement 8.0/10, and zero critical failures. The recurring weaknesses are useful and concrete: missing quote attachments, occasional premature "provider will contact you" wording, and some over-conservative holds.

[public-cases-judge-baseline.md](docs/evidence/public-cases-judge-baseline.md), [public-cases-judge-merged.md](docs/evidence/public-cases-judge-merged.md) and [public-cases-judge-with-rules.md](docs/evidence/public-cases-judge-with-rules.md) show improvement across the morning as the state layer, agency policy and rule guards landed.

[capacity-model.md](docs/evidence/capacity-model.md) models throughput from 46 completed real cases. Median observed case time is 38 seconds, average is 44 seconds, and even the slowest observed case keeps a 50-case run inside the 30-minute Reality Test window at concurrency 10.

## Repository Layout

```text
src/tools        one file per tool family; registry.ts names them
src/policies     operating policy per case family plus shared constraints
src/agents       generalist and specialists
src/orchestrator code orchestrator for each case
src/runtime      router, agent loop, context, checks, execute, escalate, write, trace, flags, rules
src/backend      PGlite/Postgres record store, seed loader, failure injector
src/ingest       generic and Dwelly case-file ingest
src/casefile     case-state extraction and rendering
cases/ data/     synthetic sample cases and sample system-of-record data
evals/           deterministic expectations, scenario tests and public-case cuts
docs/evidence    generated eval, judge and capacity reports
scripts/         Reality Test runbook script
public/          demo board
```
