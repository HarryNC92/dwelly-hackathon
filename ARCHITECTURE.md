# Dwelly hackathon, property management track: architecture v3

9 Oct 2026, night before. v3 after an adversarial review; the changes it forced are marked (RT). Data format and supplied tools unknown until 10:00.

## 1. What is scored, and what that forces

The technical 70 is a Claude judge reading our repo against a per-case rubric: required outcomes, acceptable alternatives, red flags, prohibited actions, critical failures. The Reality Test is tens of unseen cases processed with no human in 30 minutes. Inside the 70: outcomes 35, coverage 20, judgement 20, engineering 15, applicability 10. Demo 30 is humans.

Forced consequences:

- Correctness per case outweighs everything. Every component that can misroute or block a case costs outcome points, so fewer cascade points beats more layers.
- Every case emits a folder, always, with organiser case IDs. A missing or misnumbered folder is a zero.
- The judge reads REASONING.md and the trace. Those files are the product.
- Every dependency the judge cannot obtain is a reproducibility risk unless the fallback is the default path.
- No human in the loop during the test. Escalation is an output, never a wait. (RT)
- Simple systems that work beat elaborate ones. Rules, section 15.

## 2. Jev: considered, kept off the critical path

Jev (TypeSafe AI) is a discriminative model: state plus typed questions in, probabilities out, 70 to 500 ms, waitlisted early access since 15 Sep, self-reported accuracy about Sonnet 5 level.

Steelman: our weakest component in v2 was a self-reported confidence number from the resolver, which is uncalibrated and clusters around 0.8 to 0.9. A separate discriminative model gives roughly calibrated probabilities and makes different mistakes from Opus, which is the only thing that makes a second opinion worth anything. Opus checking Opus does not.

Verdict: still off the critical path. Speed and cost are not scored. It is waitlisted, so neither we nor a judge can rely on a key. It cannot extract text, so it removes no vendor. And the underlying problem is better fixed by replacing the confidence number with explicit escalation criteria per family (section 4). If a key arrives, Jev scores are logged in the trace as a shadow signal only, never read by the pipeline, and it does not appear in the README as a dependency.

## 3. Framework choice

Decision (revised 9 Oct, late): TypeScript, Vercel AI SDK 7 with the Anthropic provider, Zod schemas, Node 22. One repo, one language, the voice webhook and the demo board live in the same app.

Why a framework after all: requirements change at 10:00 and at 16:30, and having typed tools, a step-limited tool loop, provider options for thinking and effort, step callbacks for tracing and streaming for the board already in hand is worth more than the sixty lines it saves. Why this one and not LangGraph.js: no state graph exists, and LangChain's Anthropic package has an open bug sending forced tool choice to Opus 5.5 (issue #40777). Why TypeScript: the team is faster in it, the Fabriq frontend is TypeScript, and the demo board is cheap in Next.js.

Guardrails that make the AI SDK safe on Opus 5.5 (all verified 9 Oct):

- No structured output in the same call as tools (open issue #21992). Every agent ends by calling a `submit_resolution` tool with a Zod schema. The tool loop stops when that tool has been called or the step limit is hit.
- Never set a forced tool choice; the provider silently downgrades it on Opus 5.5 anyway.
- Adaptive thinking and effort medium via `providerOptions.anthropic`; `strict` on every tool.
- Staged writes live inside our own tool execute functions, so the staging and checks are framework-independent.
- Our JSONL trace is written from the step-finish callback. That file is the repo artefact.
- Fallback to Sonnet 5.5 restarts the case from scratch; never switch models mid-loop.

Pydantic AI is the equivalent choice if the team ends up in Python; the raw SDK remains the zero-dependency fallback.

## 3a. Composition model: how the orchestrator stays thin

The requirement: agents and tools are independent units that can be rearranged, several agents share tools, unanticipated case types and unanticipated tool needs degrade gracefully, and no single component carries the whole system.

Three registries, all config, no inheritance:

- **Tools.** One file per tool: name, Zod input schema, `kind` (read or write), `risk` (none, low, high, prohibited), `execute`. Write tools return "staged" and never touch the backend directly. The runtime wraps every tool identically: trace, retries, idempotency, staging. Any agent may list any tool by name.
- **Policies.** One markdown file per family (maintenance, compliance, arrears, lifecycle, landlord relations, complaints, noise) plus `constraints.md` which every agent gets. Policies are text; moving one between agents is a list edit.
- **Agents.** One config object each: name, which policies, which tools, model, effort, step limit. A specialist is a short policy list and a focused tool list. The **generalist** has every policy and every tool.

The orchestrator is code, not a model. It makes one cheap routing call with a schema (family or families, urgency, confidence, reasons), then calls `runAgent(config, case)`. It holds no conversation and accumulates no context, so it is trivially parallel and cannot become a long-running bottleneck. The alternative pattern, a model orchestrator that calls specialists as tools, is rejected: it serialises the case, bloats one context, and that model has to understand every domain anyway.

Three fallbacks make the route never load-bearing:

1. Low routing confidence, or more than one family in the case, goes straight to the generalist.
2. A specialist can return `reroute` with a reason instead of a resolution. The runtime sends the case to the generalist. One reroute allowed, then the generalist's answer stands.
3. Anything that throws goes to the generalist with the error in context.

The worst case of a wrong route is therefore the generalist with all tools, which is exactly what a no-orchestrator design would have been. Specialists are an optimisation on top of that floor, not the floor.

Unanticipated objects and missing tools:

- **Unknown case shapes.** The generic ingest turns any file into a `Case` with raw content. The generalist reads raw content. Typed adapters are optional.
- **Unknown data.** The backend is a record store, not a hand-coded schema. At 10:00 we load whatever they give us by record type. Three generic tools work on any dataset: `list_record_types` (with a sample of each), `get_record(type, id)`, `search_records(type?, query)`. Typed convenience tools such as `get_tenancy` are thin wrappers added only where they help the prompt.
- **A write we have no tool for.** `propose_action` is a generic staged write: action type, target, parameters, rationale. It is never executed by us. It appears in ANSWER.md as a recommended action needing human execution, which is honest, judge-legible and counts as handling the case rather than failing it.
- **A capability that does not exist.** `report_blocker(what was needed, why)` records the gap, and the resolution becomes a partial outcome plus escalation with the blocker named. No fabrication, no silent drop.
- **No self-written tools.** An agent that invents and runs its own tool during the judged run is a fabrication risk. The two tools above are the honest version of that flexibility.

Runtime shape:

```
runCase(case):
  route   = router(case)                      // one schema call, cheap
  agent   = pickAgent(route)                  // config lookup, generalist on doubt
  result  = runAgent(agent, case)             // tool loop, ends on submit_resolution
  if result.reroute: result = runAgent(generalist, case, result.reason)
  checks(result)                              // deterministic, may request one revision
  execute(result.stagedActions)               // writes happen here, through the wrapper
  escalate(result)                            // fire and forget
  write(result)                               // always
```

Adding an agent is a new config file. Adding a tool is a new file and a registry line. Moving a tool between agents is a list edit. Nothing in the runtime knows the domain.

## 4. Pipeline per case

Parallelism is across cases: asyncio, semaphore of about 15, flagged-urgent cases scheduled first. Within a case the pipeline is sequential.

1. Ingest. A generic adapter first: any file becomes text or JSON inside a `Case` (organiser case ID, channel, raw content, attachments, dataset timestamp, any record IDs). Typed adapters for known shapes are written at 10:00 and are optional. If a typed adapter throws, the generic one runs. PDFs and images go to Opus natively as document blocks; there is no separate extraction model. (RT) Case IDs and grouping come from the organisers' structure, never from input order. (RT) "Now" is the case or dataset timestamp, never the wall clock, or certificate-expiry logic breaks. (RT)

2. Flags, not verdicts. Deterministic pattern matching sets flags the resolver and the checks see: possible gas or CO, fire, water near electrics, structural danger, person at risk, self-harm language, legal threat, payment-detail change request, notice or eviction request, possible duplicate of an open ticket. Flags are inputs. Forced outcomes exist for a tiny high-precision set only: gas smell or CO reading means the emergency line is the first action and the case is urgent. At 11:00 we measure flag precision on the training data and prune. (RT)

3. Context assembly, best effort. Reads by ID where IDs exist: property, tenancy and terms, landlord profile with spend authority and contact rules, contractor roster, open and historic tickets, certificates with expiry, rent ledger. Plus a fuzzy `search_records` read tool for address and name variants, because exact-ID lookups fail on "Flat 3, 12 High St" versus "12 High Street, Flat 3". (RT) Misses are recorded as not found, never invented.

4. Resolve. The router picks an agent (section 3a); the agent runs an Opus 5.5 tool loop, adaptive thinking, effort medium set explicitly, policy block cached. The generalist handles anything the router is unsure about. Read tools execute live. Write tools do not execute: they return "staged" and the runner records the proposal. (RT) Tool loop capped at ten calls. Output is the `submit_resolution` payload (Zod schema `Resolution`): family, urgency, decision, staged actions, actions deliberately not taken with reasons, conflicts and how they were reconciled, missing information, communications drafted for every party, escalation (none, P1 handover, P0 call) with a handover pack, and a plain-English summary.

   Escalation is additive. For a safety case the required outcomes will be things like make safe, instruct the emergency contractor, tell the tenant, and escalate the spend decision. An escalation-only answer misses most of those. The policy says: do every safe action within authority, then escalate the decision you cannot take. (RT)

   Explicit escalation criteria per family replace any confidence threshold. Examples: spend above landlord authority with no recorded approval; conflicting facts from two parties that change the action; a legal threat, complaint or harassment allegation; a payment-detail change from any channel; a request to serve notice or end a tenancy; a vulnerability disclosure; a write tool returning unknown. (RT)

5. Checks, deterministic, before any write executes. (RT) Every staged action has a trace entry. No staged action is on the prohibited list. Spend within authority or paired with a recorded approval. Every flag is addressed somewhere in the resolution. No claimed fact lacks a source in the trace. Any write result of unknown means the case cannot be marked resolved. A failed check sends one revision request back to the resolver, appended to the conversation, never edited in (Opus 5.5 rejects edited history on newer accounts). A second fail keeps the safe actions, drops the failing one, and escalates with the pack. A model verifier is deferred until the 13:00 eval shows errors the deterministic checks miss. (RT)

6. Execute. Staged writes run through the wrapper with retries. Idempotency key is case ID plus action type plus target, not the arguments, so a retry with slightly different wording cannot double-book. (RT) Results of success, failure or unknown go into the trace and the answer.

7. Escalate, fire and forget. (RT) P1 writes a handover through the messaging tool. P0 additionally posts to the voice service with a five-second timeout and logs the call ID. The run never waits for the call, never re-resolves on its answer during the test, places at most one call per two minutes, and completes the case whether or not the call succeeds. The loop where the manager's spoken decision feeds back into the case exists as a demo path on training cases only, and is labelled as such in the README.

8. Write. `ANSWERS/<id>/ANSWER.md` with fixed sections in the rubric's own vocabulary: Decision, Actions taken, Not done and why, Escalation, Communications, Conflicts and missing information, Final state. `REASONING.md`: what was received, what was looked up, what the flags were, how conflicts were weighed, why this decision. `trace.jsonl`: every model and tool call. `ANSWERS/summary.md` is a coverage table with status per case. (RT) The writer never fails: an exception still produces the folder, the partial trace and an escalation outcome.

## 4a. Database: the source of truth

The record store in section 3a is a shared hosted Postgres (Neon or Supabase, whichever is fastest to provision tonight), not a file on anyone's laptop. Several people run the code and the board against the same state, and a dashboard view of the tables is useful on the day. Accessed through Drizzle with one `DATABASE_URL`. Loaded from whatever the organisers give us at 10:00: one table per record type, extracted columns plus the raw JSON kept beside them so unknown fields are never lost.

State mutates: when a case's staged writes execute, the ticket, work order or message row exists for every later case. That is what makes duplicate detection, "already booked" and building-level patterns possible.

Isolation: each run gets its own schema (or a Neon branch) seeded from the clean load, so the 16:30 Reality Test starts from pristine state and nobody's afternoon testing leaks into it.

Reproduction for judges: PGlite (Postgres in WASM, in process, no server) runs the same schema and seed script locally when no `DATABASE_URL` is set. Same SQL, same tools, zero setup.

Agents never touch the database directly. They reach it through tools only:

- Generic reads that work on any schema: `list_record_types`, `get_record`, `search_records`, and `query_records` (read-only SQL, row-limited, for the generalist when the typed tools do not fit the question).
- Typed reads where they help the prompt: `get_property`, `get_tenancy`, `get_landlord`, `get_contractors`, `get_tickets`, `get_certificates`, `get_rent_ledger`.
- Typed writes only, all staged, all through the wrapper. There is no write SQL tool.

If the organisers supply their own API or MCP server as the system of record, the database becomes a cache and audit copy, and the write tools call their API through the same wrapper.

## 4b. Geospatial, as a stretch

Unknown until we see the data. If properties carry addresses or postcodes, we geocode once at load time (postcodes.io is free and keyless for UK postcodes) and store latitude and longitude on the property row. That enables two things: a `nearest_contractors` read tool if contractors have locations, and a map on the demo board with cases pinned to properties, which is a strong demo image for the 30 human-judged points. It also supports a building-level pattern: several reports from one block in one batch is one issue, not several. None of this is on the critical path, and nothing is built for it tonight beyond the two columns.

## 4c. What resolving a case means: a worked example

The system does not fix toilets. It takes the actions a competent property manager would take in the first thirty minutes, records them truthfully, and hands off what it cannot decide. A verified outcome is "contractor confirmed for tomorrow 9 to 12, tenant informed, landlord notified, ticket in scheduled", not "toilet unblocked".

Case: tenant emails, "the toilet is blocked and it is the only one in the flat, water nearly overflowing".

1. Ingest: Case with the email text, the tenant's identifier if the email matches a contact on record.
2. Flags: none forced. A loss-of-only-WC pattern raises minimum urgency to P1 (fix within 24 hours).
3. Router: maintenance specialist, high confidence.
4. Agent reads: the property, the tenancy (any clause on tenant-caused blockages), the landlord profile (spend authority, say £300 pre-approved for repairs, emergency authority higher, contact preference email), ticket history on the property (a drainage ticket three months ago changes the diagnosis to a building problem), the contractor roster filtered to drainage or plumbing in the area with rates and availability.
5. Agent decides and stages: create ticket (P1, drainage), book the approved drainage contractor for the earliest slot, send the tenant a message with the slot, access arrangements and "do not use chemical unblockers", send the landlord a notification within authority (or an approval request if the expected cost exceeds it). It records "possible tenant recharge if the engineer reports misuse, to be decided after the visit", which is an action deliberately not taken now. It submits the resolution.
6. Checks: every staged action has a trace entry, spend within authority, the urgency flag was honoured. Pass.
7. Execute: the writes run. The booking returns success and a reference; the messages return sent. Had the booking failed, the wrapper reports it, the agent is given one more turn to book the second contractor, and if that also fails the case escalates with "no contractor available" and the tenant message is amended.
8. Escalation: none. Answer and reasoning written. Final state: scheduled.

Variants the same machinery handles: the tenant says they flushed wipes (still fix, flag the recharge); no landlord authority on file (book within the standard emergency authority if the policy allows, otherwise request approval and tell the tenant the timeline); the tenant refuses access (escalate, do not force); the email also mentions mould (compliance policy applies in parallel); a second email from the flat upstairs about the same stack (building-level issue, one work order, both tenants informed).

What it does not do: search the internet for plumbers. A lettings agency uses its approved panel. If the roster has nobody suitable, the agent stages `propose_action("source a drainage contractor for postcode X")` and escalates, which is honest and is what a human would do. Finding an unvetted tradesperson online and sending them tenant details would be a red flag, not initiative.

The full action vocabulary: create or update a ticket, create a work order, book a contractor from the panel, request a quote, book an inspection, send a message to tenant, landlord or contractor, record a landlord decision, propose an action we have no tool for, report a blocker, escalate, place the on-call phone call. Everything else is a read.

## 4d. Messaging transports and inbound channels

`send_message(channel, to, body)` is one tool with a swappable transport. Default transport writes to the messages table and the trace; that is the only transport active during the Reality Test, since synthetic tenants have no real numbers and the judge reads the trace. Real transports sit behind environment flags for the demo: WhatsApp through the Twilio sandbox (recipients join with a code first; a production sender needs Meta approval and days we do not have), SMS through Twilio, email through Resend. No iMessage, there is no official API.

Inbound is the demo: a WhatsApp or SMS to the Twilio number hits `/api/inbound`, becomes a Case through the generic ingest, runs the pipeline, and the reply goes back on the same channel. P0 additionally rings the on-call manager. Same Twilio account as the voice work.

Assumption to state in the README: a contractor panel exists in the data. If it does not, booking becomes `propose_action` plus escalation, and no panel is invented for the judged run. A seeded panel may be used on training data for the demo, labelled as ours.

## 5. Tool layer

One package, one backend interface. Tonight: the interface, the wrapper and a failure injector. The in-memory backend is written at 10:00 once the data shape is known. (RT) If the organisers supply an MCP server, we connect as an MCP client in process and expose its tools through our wrapper, so guards, staging, retries and tracing still apply. If they supply a write tool for anything on our prohibited list, the wrapper blocks it. (RT)

Wrapper behaviour: staging for writes, idempotency key, bounded retries on transient errors, result typed as success, failure or unknown, trace append. Unknown is surfaced to the model with an instruction to verify state before retrying.

Read tools: list_record_types, get_record, search_records, query_records (read-only SQL), get_property, get_tenancy, get_landlord, get_contractors, get_tickets, get_certificates, get_rent_ledger.
Write tools: create_ticket, update_ticket, create_work_order, book_contractor, send_message, book_inspection, record_landlord_decision, escalate.
Prohibited and absent: payment details, notices, rent levels, compensation, tenancy termination. Contractor messages carry only what the job needs. (RT)

Prompt injection: case content is data. An email "from the landlord" asking to change bank details is a flag, verified only through the contacts on record, never actioned. (RT)

## 6. Policy prompt, written tonight (RT)

One cached system block with the operating policy for all families and the constraints. The UK regime it must get right, verified by us tonight and not left to the 10:00 briefing: Renters' Rights Act in force since 1 May 2026 (no section 21, section 8 grounds only, section 13 rent increases once a year with notice, periodic tenancies), gas safety record annual, EICR five-yearly, smoke and CO alarm duties, deposit protection and prescribed information within 30 days, Right to Rent, damp and mould and HHSRS hazards, repair timescales by urgency, data minimisation. Plus the per-family escalation criteria and the forced-outcome set.

## 7. Models

| Step | Model | Settings |
|---|---|---|
| Resolve | claude-opus-5-5 | adaptive thinking, effort medium, tools with strict schemas, cached policy block, documents passed natively |
| Fallback | claude-sonnet-5-5 | same prompts; a case restarts from scratch on Sonnet after a 429, never mid-loop, since Sonnet cannot read Opus thinking blocks (RT) |

Run resilience (RT): one `max_tokens: 0` cache pre-warm before fanning out; handle `stop_reason` refusal with `fallbacks: "default"`; a global deadline at T+22 minutes after which no new turns start and every open case is finalised with what it has; per-case timeout of four minutes; check the Anthropic credit balance and rate tier tonight, because the Vabel runs have failed on exactly that before.

## 8. Runner and reproducibility

```
npm run cases -- --cases ./cases --out ./ANSWERS --backend mock --concurrency 15
```

Per-case isolation, resumable by skipping complete folders, always-emit on failure, organiser IDs for folder names. `make reproduce` re-runs the committed Reality Test inputs. Lockfile committed, one environment variable.

Our own eval during the day: expected outcomes for the training cases, hand-written in `evals/expected.yaml`, scored by a small script. The afternoon is spent on outcomes, not speed.

## 9. Demo surface

Baseline: terminal output from the runner plus a static HTML trace viewer that renders a case's JSONL. Screen-record a run on the training set, cut to the phone ringing, then the ANSWER.md. A live board is a stretch goal after the core is green, not tonight. (RT)

## 10. Repo shape (Apache 2.0, nothing from the Fabriq engine)

```
README.md  LICENSE  SUBMISSION.md  package.json  package-lock.json
src/
  tools/        one file per tool + registry
  policies/     one .md per family + constraints.md
  agents/       one config per agent (specialists + generalist)
  orchestrator/ router, pickAgent, runAgent, fallbacks
  runtime/      tool wrapper (trace, staging, retries), checks, execute, escalate, write
  ingest/       generic adapter + optional typed adapters
  backend/      record store interface, mock + dwelly implementations, failure injector
  run.ts        CLI runner (concurrency, deadline, resume)
app/            Next.js: live board (stretch), voice trigger + webhook routes
voice/      agent prompt, setup notes
cases/      synthetic data (10:00)
evals/      expected.yaml, score.py
ANSWERS/    generated at 16:30, committed at 17:00
demo/       video
```

## 11. Tonight

1. Repo skeleton in TypeScript, `Case` and `Resolution` Zod schemas, generic adapter, record-store backend interface with the three generic tools and the failure injector, tool wrapper with staging, router, runAgent with reroute, generalist config, checks, writers, runner with deadline and Sonnet restart. Smoke test on ten invented cases including a malformed file.
2. Policy prompt draft with the UK regime and escalation criteria.
3. Vedaant: voice escalation per VOICE-BRIEF.md, fire-and-forget contract.
4. README with the eight required sections drafted, LICENSE in place.
5. Check Anthropic credit and rate limits.

## 12. Tomorrow

10:00 read the data and supplied tools, write the backend and any typed adapters, hand-label expected outcomes. 11:00 measure flag precision. 13:00 first full run and eval; decide on a model verifier only if the eval shows a need. Iterate on outcomes until 15:30. 15:45 timed dress rehearsal: full Reality Test procedure on a held-out subset with failure injection on and a malformed input, including the git commit. 16:15 freeze. 16:30 run, commit ANSWERS, 17:00 push.
