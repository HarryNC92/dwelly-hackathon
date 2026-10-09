# Architecture (v4, matches the code as of 02:00, 10 Oct 2026)

Read MORNING.md first for the plan of the day. This file is the design and the reasons.

## 1. What is scored, and what that forces

The technical 70 is a Claude judge reading `ANSWERS/<n>/ANSWER.md`, `REASONING.md` and traces per case against a hidden per-case rubric: required outcomes, acceptable alternatives, red flags, prohibited actions, critical failures. The Reality Test is tens of unseen cases processed with no human in 30 minutes. Inside the 70: outcomes 35, coverage 20, judgement and safety 20, engineering 15, applicability 10. Demo 30 is humans in the room.

Forced consequences, all implemented:

- Correctness per case outweighs everything. Fewer cascade points beats more layers.
- Every case always emits a folder, with the organisers' case ids. A missing folder is a zero.
- The judge reads markdown. REASONING.md says what was received, looked up, staged, executed, decided, escalated, and what failed. The trace is JSONL next to it.
- No human in the loop during the test. Escalation is an output, never a wait.
- Text must match the trace. Nothing claimed that did not execute.
- Simple systems that work beat elaborate ones (rules, section 15).

## 2. Stack

TypeScript on Node 24. Vercel AI SDK 7 with the Anthropic provider, Zod schemas, PGlite or Postgres record store, p-limit for concurrency. Opus 5.5 at effort medium with adaptive thinking for every agent; Sonnet 5.5 restarts a case from scratch if Opus rate-limits. No LangGraph (no state graph exists, and its Anthropic package has an open forced-tool-choice bug on Opus 5.5). No strict tool schemas (API caps at 20 strict tools and rejects large grammars; Zod validates every input anyway). No forced tool choice (rejected by Opus 5.5).

## 3. Composition: how the orchestrator stays thin

Three registries, all config:

- **Tools** (`src/tools/`): one object per tool with name, kind (read, write, control), risk, Zod input, and `run` (reads) or `perform` (writes) plus an optional deterministic `guard`.
- **Policies** (`src/policies/`): one markdown per family plus `constraints.md` that every agent gets. The UK regime (Renters' Rights Act from 1 May 2026, gas annual, EICR five-yearly, deposit 30 days, HHSRS damp and mould, no section 21) is written in.
- **Agents** (`src/agents/index.ts`): policies plus tools plus model, effort and step cap. The generalist has everything; specialists are a focused subset.

The orchestrator (`src/orchestrator/runCase.ts`) is code. One cheap routing call with a schema, a config lookup, then the agent. Low confidence, multi-family cases, a specialist `reroute`, or any failure all land on the generalist, so a wrong route costs no more than having no router. A model orchestrator calling specialists as tools was rejected: it serialises the case and bloats one context.

## 4. The pipeline per case

1. **Ingest** (`src/ingest/generic.ts`). Any file or folder becomes a `Case`: organiser id, channel, raw text, structured JSON, attachments (PDFs and images go to the model natively), linked ids, dataset timestamp. Question-style cases ("Decision point: should the agency…") are detected and answered directly.
2. **Flags** (`src/runtime/flags.ts`). Deterministic patterns attach hints: gas or CO, fire, water near electrics, structural, person at risk, self-harm language, no heating, only toilet, legal threat, payment-details change, notice or eviction, damp or mould, security, possible prompt injection. Only gas or CO forces an action (emergency line 0800 111 999 first). Everything else is a hint the agent must address and the checks verify.
3. **Route** (`src/runtime/router.ts`). Opus at low effort returns families, urgency, confidence and reasons as a structured object. Flag urgency can only raise it.
4. **Prefetch** (`src/runtime/context.ts`). Linked ids, postcodes, addresses, emails and references in the text are searched in the record store; the property's landlord, tenancy, tickets and certificates follow one hop. Found records go into the case pack with provenance; misses are listed, never invented.
5. **Agent** (`src/runtime/runAgent.ts`). One tool loop, policy block cached, step cap 10 to 12. Reads run live. Writes are **staged**: the tool returns "recorded" and nothing touches the store. The loop ends when `submit_resolution` is called with a valid payload (family, urgency, decision, not-done list with reasons, conflicts and how they were weighed, missing information, communications per party, escalation tier with the decision required, final state, two-sentence summary).
6. **Checks** (`src/runtime/checks.ts`). Code, before any write executes: P0 flags honoured, forced actions present, payment-detail changes never actioned, legal or self-harm flags escalated, P0 escalates at P0, nothing marked resolved while a write is unknown, escalations name the decision required, blocked actions are either escalated or explained. A failure sends one revision request (appended to the conversation, never edited). A second failure keeps the safe actions, drops the high-risk ones and escalates with the pack.
7. **Execute** (`src/runtime/execute.ts`). Staged writes run through one wrapper: idempotency per action, bounded retries on transient errors, results typed success, failure or unknown, everything traced. Guards inside write tools refuse spend above landlord authority without a recorded approval, messages that commit the landlord to money or a legal position, and contractors not on the panel.
8. **Reconcile**. If any write failed or returned unknown, the agent gets one bounded turn with the execution results: book the second contractor, correct the message, and resubmit a resolution whose text matches what actually happened. New staged actions pass the checks and execute. Unknown is never repeated blindly.
9. **Escalate** (`src/runtime/escalate.ts`). Fire and forget. P1 is a handover record. P0 additionally posts to the voice service with a five-second timeout, and the case completes regardless.
10. **Write** (`src/runtime/write.ts`). ANSWER.md in the rubric's own vocabulary (Decision or Answer, Actions taken, failed or unknown, blocked, Not done and why, Escalation, Communications, Conflicts and missing information, Final state, Summary). REASONING.md with the received excerpt, triage, prefetched records, a tool table rendered from the trace, what it decided, escalated and what failed, the automated check results. `summary.md` and `index.json` at the top. The writer never throws; a pipeline failure still produces the folder with an escalation.

Honest flexibility for the unknown: `propose_action` stages a write we have no tool for and surfaces it as a recommended human action; `report_blocker` records a missing capability as a partial outcome plus escalation. No self-written tools during the judged run.

## 5. The record store

`src/backend/store.ts`: one `records` table keyed by type and id with the full JSON kept, so any dataset shape loads (`seed.ts` handles JSON arrays, objects of arrays, CSV, markdown). PGlite in-process by default (nothing on disk, zero setup for judges); hosted Postgres via `DATABASE_URL` with a schema per run for shared team state. Generic read tools (`list_record_types`, `get_record`, `search_records`, `list_records`, read-only `query_records`) work on anything; typed reads (`get_property`, `get_tenancy`, …) are thin wrappers. Writes are typed only, there is no write SQL. State mutates across cases, and cases about the same property run in time order so later ones see earlier state. If the organisers supply an API or MCP server, the wrapper calls it and the store becomes the audit copy (`src/backend/mcp.ts` has the wiring sketch).

## 6. Runner

```bash
pnpm cases -- --cases ./cases/<set> --data ./data/<set> --out ./ANSWERS --concurrency 10 --numbered --deadline 22
```

Urgent cases first, property groups serialised, groups parallel. Per-case timeout four minutes, global deadline after which remaining cases get an escalation folder, resume by skipping complete folders, `--numbered` for the organisers' `1..N` layout with `index.json` mapping, `--inject` for failure rehearsal, `--mock-model` for an offline smoke test.

## 7. Our own scoring loop

`pnpm eval` scores a run against `evals/expected.yaml` (family, urgency, escalation, tools used or avoided, phrases that must or must not appear). `pnpm judge` grades each case with Opus the way the rules describe the organisers' judge and writes `JUDGE.json` per case. The afternoon is spent on these two numbers.

## 8. Jev

TypeSafe AI's classifier is behind `src/classify/` as a shadow signal: if `TYPESAFE_API_KEY` is set, triage questions are scored in parallel with the router and logged in the trace; with `JEV_MODE=active` a P0 score can raise urgency. It is never on the critical path, never a README dependency, and its endpoint details are unverified until a key exists.

## 9. Demo surface and voice

`pnpm service` serves a live board (`public/board.html`) from the run's trace files and the voice endpoints. The P0 call is an ElevenLabs outbound call with the handover as dynamic variables; the decision comes back on a webhook into `callback.json` (demo path on training cases; see VOICE-BRIEF.md). Inbound WhatsApp via Twilio is the strongest demo image and is a day-two stream.

## 10. What was verified tonight

Offline smoke passes (mock model, injected unknown result, forced gas escalation, reconciliation). Nine real cases ran end to end on Opus 5.5 before the org's API credit ran out: 52 of 54 deterministic checks passed; 45 to 65 seconds per case at concurrency 8. The gas emergency, break-in, water-through-light-fitting, arrears hardship, expired gas certificate, solicitor complaint, mould with a newborn and spam cases all resolved the way the expectations say. One defect found and fixed: text claimed a booking that had failed at execution, now covered by the reconciliation turn.
