# Property Operations Agent — Dwelly Real-World Agents Hackathon (Property Management track)

An autonomous case-processing system for a UK lettings agency. Inbound emails, calls, messages, tickets and documents become cases. Each case is triaged, worked by a Claude agent with tools over the system of record, checked by deterministic rules, and either actioned or escalated to a human with a complete handover. Urgent escalations ring the on-call manager.

## 1. What we built
A pipeline that takes a case from first contact to a verified outcome without a human, and writes a judge-readable record of what it received, looked up, did, escalated and could not do. Writes are staged, checked and then executed, so nothing happens that the checks did not see. Failures are recovered or escalated, never hidden.

## 2. The operational problem
Lettings agencies run on an inbox: repairs, compliance deadlines, arrears, applicant questions, landlord instructions, complaints and noise, with statutory consequences for getting safety or legal items wrong. The work is a sequence of small decisions with uneven stakes. The system takes the routine decisions, does the safe actions within authority, and hands humans the decisions they must take with everything they need.

## 3. Architecture
See [ARCHITECTURE.md](ARCHITECTURE.md). Short version: generic ingest → deterministic flags → code router → agent (specialist or generalist) with staged writes → deterministic checks → execute → reconcile failures → escalate (fire and forget) → write ANSWER.md, REASONING.md and trace.jsonl. The system of record is a record store (PGlite in-process, or Postgres) that loads any dataset shape.

## 4. How to run
```bash
pnpm install
cp .env.example .env        # set ANTHROPIC_API_KEY
pnpm smoke                  # offline end-to-end check with a mock model (~2 s)
pnpm cases --cases ./cases/sample --data ./data/sample --out ./out/sample --concurrency 8
pnpm eval --out ./out/sample            # scoreboard vs evals/expected.yaml
pnpm judge --out ./out/sample --cases ./cases/sample   # Opus grades each case like the organisers' judge
```
Reproduce the Reality Test exactly as submitted:
```bash
pnpm cases --cases ./cases/reality --data ./data/dwelly --out ./ANSWERS-repro --concurrency 10 --numbered
```
Live board and voice endpoints (demo only): `OUT_DIR=./out/sample pnpm service` then open http://localhost:8787.

## 5. Models, APIs and external services
- Anthropic API: `claude-opus-5-5` for routing and agents (adaptive thinking, effort medium), `claude-sonnet-5-5` as rate-limit fallback.
- Vercel AI SDK 7 with `@ai-sdk/anthropic`; Zod; PGlite (`@electric-sql/pglite`) or `postgres`; p-limit; commander.
- Demo only, never required for the judged run: ElevenLabs Agents and Twilio for the on-call phone call and WhatsApp/SMS; Resend for email. Optional shadow signal: TypeSafe AI Jev (off unless a key is present).

## 6. Assumptions
- A contractor panel exists in the data. If not, bookings become proposed actions plus escalation; no panel is invented.
- "Now" is the case timestamp, never the wall clock.
- Landlord spend authority, when present, bounds autonomous spend; absent authority means the policy decides and the checks record it.
- (Add the data-shape assumptions from the 10:00 briefing.)

## 7. Known limitations
- Flags are regex patterns; they are hints, but a missed pattern means the agent relies on its own reading.
- The record store is a copy of the synthetic data; without a supplied API, write actions change our copy, not an external system.
- The voice loop's spoken decision only feeds back on training cases (demo path), never during the judged run.
- (Add what the day shows.)

## 8. What we would build next
- Wire the organisers' or a real agency's API behind the same wrapper.
- A model verifier only where the judge log shows a class of error the deterministic checks miss.
- Inbound WhatsApp and calls as live case sources with replies on the same channel.

## Repository layout
```
src/tools        one file per tool family; registry.ts
src/policies     operating policy per case family + constraints.md every agent gets
src/agents       agent configs (generalist + specialists)
src/orchestrator runCase.ts: the code orchestrator
src/runtime      router, agent loop, context prefetch, checks, execute, escalate, write, trace, flags
src/backend      record store (PGlite/Postgres), seed loader, failure injector, MCP note
src/ingest       generic case ingest
src/classify     Jev shadow classifier
src/eval.ts, src/judge.ts   our scoring loop
src/service.ts + public/board.html   live board and voice/inbound endpoints (demo path)
cases/ data/ evals/   sample training set and labels; ANSWERS/ generated outputs
docs/rules-digest.md  the organisers' rules, digested
```
