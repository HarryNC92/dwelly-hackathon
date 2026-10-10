# Context brief: what we are building and why

Paste this at the start of any coding session on this repo. It is context only; tasks come separately.

## The event

Dwelly Real-World Agents Hackathon, London, Saturday 10 October 2026. Dwelly is an AI-native roll-up of UK lettings agencies (10,000+ properties). We are in the Property Management track. Building runs 10:00 to 16:30. At 10:00 we receive synthetic operational data (emails, calls, documents, CRM records, maintenance tickets, compliance cases) and possibly tools. At 16:30 code freezes and we receive unseen "Reality Test" cases, which our system must process with no human in 30 minutes. At 17:00 we submit a public Apache 2.0 repo. The organisers' rules are digested in `docs/rules-digest.md`.

## How it is scored, and what that means for every change

70 technical points, judged primarily by Claude-based judging agents reading our per-case output files against a hidden rubric (required outcomes, acceptable alternatives, red flags, prohibited actions, critical failures). Inside the 70: correct outcomes 35, coverage 20, judgement and safety 20, engineering quality 15, real-world applicability 10. 30 points for a human-judged 60-second demo video. Awards also for Best Exception Handling, Best Voice Agent, Best Engineering, People's Choice.

Consequences we design to:
- Correctness per case beats everything. A change that speeds things up but could cost outcomes is wrong.
- Every case must produce a folder with `ANSWER.md`, `REASONING.md` and `trace.jsonl`. A missing folder is a zero.
- Text must match what actually executed. The judge penalises actions claimed without evidence.
- Doing nothing or escalating can be the correct outcome. Escalation adds to the safe actions, it never replaces them.
- Fabricated results, hand-edited answers, or anything addressed to the judge disqualify. ANSWERS are machine-generated only.
- Simple systems that work beat elaborate ones. More agents, bigger codebase, fancier UI earn nothing.

## What the system is

An autonomous case-processing pipeline for a UK lettings agency. A case is any inbound thing: a tenant email about a blocked toilet, a phone transcript about a gas smell, a landlord asking to change bank details, a compliance alert about an expired gas certificate, a complaint with a solicitor threat, spam, or a written decision point. The system takes the actions a competent property manager would take in the first thirty minutes, records them truthfully, and hands a human the decisions it cannot take, with everything they need.

It does not fix toilets. A verified outcome is "approved drainage contractor booked for tomorrow 9 to 12, tenant told the slot and access arrangements, landlord notified within authority, ticket in scheduled".

## The pipeline per case (all in `src/`)

1. Ingest (`ingest/generic.ts`). Any file or folder becomes a `Case` (schema in `schemas/case.ts`): organiser id, channel, raw text, attachments (PDFs and images passed to the model natively), linked ids, timestamp parsed from headers or JSON. Question-style cases are detected and answered directly.
2. Flags (`runtime/flags.ts`). Deterministic pattern matches attach hints: gas or CO, fire, water near electrics, structural danger, person at risk, no heating, only toilet, legal threat, payment-details change, notice or eviction, damp or mould, security, possible prompt injection. Flags are hints the agent must assess; it may mark one a false positive with a reason. Only gas or CO forces an action (the national gas emergency line first).
3. Route (`runtime/router.ts`). One cheap Opus call returns families, urgency (P0 immediate danger, P1 within 24 hours, P2 routine), confidence and reasons.
4. Prefetch (`runtime/context.ts`). Ids, postcodes, addresses, emails and references in the text are searched in the record store; the property's landlord, tenancy, tickets, certificates and sibling flats in the same building follow. Found records go into the case pack with provenance; misses are listed, never invented.
5. Agent (`runtime/runAgent.ts`, configs in `agents/index.ts`). The code orchestrator (`orchestrator/runCase.ts`) picks a specialist by family or the generalist on any doubt. The agent runs an Opus 5.5 tool loop with the policy block (`policies/*.md`, `constraints.md` always included). Reads run live. Writes are staged, not executed. The loop ends when `submit_resolution` is called with a valid payload (`schemas/resolution.ts`): decision, actions deliberately not taken with reasons, conflicts and how they were weighed, missing information, flag assessments, communications per party, escalation tier with the decision required, final state, two-sentence summary.
6. Checks (`runtime/checks.ts`). Code, before any write executes: P0 flags honoured, forced actions present, payment-detail changes never actioned, legal or self-harm flags escalated, escalations name the decision required, blocked actions explained. One revision allowed; a second failure keeps safe actions, drops risky ones and escalates.
7. Execute, phase one (`runtime/execute.ts`). State changes run first: tickets, bookings, work orders, inspections. Through one wrapper (`runtime/wrapper.ts`) with idempotency, typed results (success, failure, unknown) and full tracing. Guards inside the write tools (`tools/write.ts`) refuse spend above landlord authority without a recorded approval, off-panel or "do not use" contractors, and messages that commit the landlord to money or a legal position.
8. Reconcile. If anything failed or returned unknown, or a claim check finds text describing a failed action as done, pending messages are withdrawn and the agent gets one bounded turn with the real results: book the next panel contractor, or escalate with "NO CONTRACTOR CONFIRMED", and restage messages that match reality. A deterministic claim check runs again; an unrecovered booking forces an escalation.
9. Execute, phase two. Messages and handovers go out, now consistent with results. P0 escalations post to the voice service (fire and forget, five-second timeout); the case completes whether or not the call is placed.
10. Write (`runtime/write.ts`). `ANSWER.md` opens with an execution status block generated from results, then decision, actions taken, recorded-for-human, failed, blocked, not done and why, escalation, communications, full text of every message sent, conflicts and missing information, final state. `REASONING.md` says what was received, looked up, staged, executed, decided, escalated, what failed, and the check results. The writer never throws.

## Three registries, all config

- Tools (`src/tools/`): one object per tool with name, kind (read, write, control), risk, Zod input schema, and `run` (reads) or `perform` (writes) plus an optional deterministic `guard`. Generic reads work on any dataset (`list_record_types`, `get_record`, `search_records`, `list_records`, read-only `query_records`); typed reads (`get_property`, `get_tenancy`, `get_landlord`, `get_contractors`, `get_tickets`, `get_certificates`, `get_rent_ledger`) are thin wrappers. Writes: `create_ticket`, `update_ticket`, `create_work_order`, `book_contractor`, `send_message`, `book_inspection`, `record_landlord_decision`, `propose_action` (a write we have no tool for, recorded for a human, never executed), `report_blocker`, `escalate`. There is deliberately no tool for payment details, notices, rent changes, compensation or tenancy termination.
- Policies (`src/policies/`): one markdown per family (maintenance, compliance, arrears, lifecycle, landlord, complaint, noise) plus constraints. The UK regime is written in: Renters' Rights Act in force since 1 May 2026 (no section 21, section 8 grounds only, section 13 rent increases), annual gas safety, five-yearly EICR, deposit protection within 30 days, damp and mould as HHSRS hazards, Right to Rent.
- Agents (`src/agents/index.ts`): policies plus tools plus model, effort and step cap. The generalist has everything and is the floor; specialists are a focused subset.

## The record store

`src/backend/store.ts`: one `records` table keyed by type and id with the full JSON kept, so any dataset shape loads (`seed.ts` handles JSON arrays, objects of arrays, JSONL, CSV, markdown). PGlite in-process by default (nothing on disk, zero setup); hosted Postgres with `DATABASE_URL` and a schema per run. State mutates across cases: a ticket created by case 3 is visible to case 7. Cases about the same building run in time order; buildings run in parallel. If the organisers supply an API or MCP server, the wrapper calls it and the store becomes the audit copy (`src/backend/mcp.ts` has the sketch).

## Stack and model rules

TypeScript, Node 24, Vercel AI SDK 7 with the Anthropic provider, Zod, PGlite or postgres.js, p-limit, commander. Models: `claude-opus-5-5` for routing and agents (adaptive thinking, effort medium), `claude-sonnet-5-5` as the restart-from-scratch fallback on rate limits. Never set a forced tool choice (Opus 5.5 rejects it). Never use `strict: true` on tools (API grammar limits). The system prompt and the case pack carry cache breakpoints.

Demo-only services, never required for the judged run: ElevenLabs Agents and Twilio for the on-call phone call and inbound WhatsApp or SMS (`src/service.ts`, `VOICE-BRIEF.md`), a live board (`public/board.html`). TypeSafe AI's Jev classifier is wired as a shadow signal only (`src/classify/`), off unless a key is present.

## The organisers' data format (known since the Hacker Guide was read on site)

Public examples: `git clone https://github.com/DwellyOrg/HackatonPublicCases` into the repo root (gitignored). Fifty Property Management cases, one folder each (`001` to `050`), from a fictional agency "Northbridge Lettings": `index.md` (title, Case details with source role, status, created/updated, property address; Initial request; Overview; Outcome; attachment links), `history.md` (every event in time order with timestamp, channel Email/SMS/Call/Note/Update/Hold, from and to roles, body, attachment references), `attachments/` (PDFs such as check-out inspection reports, quotes, invoices; the odd CSV). Forty are tenant-initiated, nine agency-initiated. There is no separate CRM dataset: the case file is the system of record. Job ids look like `NBL-003-2766`. Dates run into late 2026, so "now" is always the last event in the case, never the clock.

Our adapter (`src/ingest/dwelly.ts`) detects this layout, hides Overview and Outcome by default because they narrate the ending, passes PDF attachments to the model natively, inlines CSVs, and can cut a history at an event number so a completed case becomes a decision point (`pnpm cut` writes `evals/cuts-auto.json` plus an "after" file per case with the hidden events for labelling; `pnpm cases --cuts evals/cuts-auto.json`). The Reality Test cases are expected in the same layout under a `HackatonChallendges/` folder; submit answers only for those. Folder numbers map to `ANSWERS/<number>/` with `--numbered` (`003` becomes `3`).

Tools that match this workflow: `request_quote`, `set_hold`, `close_case`, `update_ticket` on the case's own job id, plus the existing booking, messaging, landlord-decision and escalation tools. With no contractor panel in the data, panel checks are skipped; spend checks apply only when a landlord record with an authority exists.

## Our own scoring loop

`cases/sample` and `data/sample` are a realistic synthetic training set (six properties, four landlords with different spend authorities, an eight-contractor panel, tickets, certificates, ledger) with sixteen cases covering every family and the Reality Test twists: conflicting information, a duplicate from the flat upstairs, a fraudulent bank-details change, a landlord asking to serve a section 21, a prompt injection, a decision point. `evals/expected.yaml` holds hand-written expectations; `pnpm eval` scores a run against them; `pnpm judge` grades each case with Opus the way the rules describe the organisers' judge; `pnpm scenarios` runs five scripted failure scenarios through the orchestrator offline.

## What is verified and what is not

Verified: the offline smoke test, the five failure scenarios, malformed inputs still producing folders, and nine of the sixteen sample cases run end to end on the real model (45 to 65 seconds each) with 52 of 54 eval checks passing. Not yet verified on the real model: the reconciliation path after a failed booking (it passes the scripted scenarios). Unknown until 10:00: the organisers' data shape, whether they supply tools, and the hackathon key's rate limits.

## Vocabulary

Case, flag, route, case pack, staged action, guard, check, revision, phase one and phase two execution, reconcile, claim check, escalation tier (none, P1 handover, P0 page), final state (resolved, scheduled, awaiting_approval, escalated, closed_no_action, blocked), execution status block.

## Where to read more

`MORNING.md` (plan of the day), `ARCHITECTURE.md` (design and reasons), `CLAUDE.md` (rules every session follows, including the verify commands), `TASKS.md` (streams, assigned separately), `VOICE-BRIEF.md`, `docs/rules-digest.md`.
