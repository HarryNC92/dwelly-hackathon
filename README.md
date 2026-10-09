# Dwelly Real-World Agents Hackathon — Property Management track

> Skeleton README. Sections 1–8 are required by the rules; fill them in on the day.

## 1. What we built
An autonomous case-processing system for a UK lettings agency: inbound emails, calls, tickets and documents become cases; each case is triaged, worked by a Claude agent with tools over a system of record, checked by deterministic rules, and either actioned or escalated to a human with a full handover. Urgent escalations ring the on-call manager.

## 2. The operational problem
(From the briefing.)

## 3. Architecture
See [ARCHITECTURE.md](ARCHITECTURE.md). In one paragraph: generic ingest → deterministic flags → code router → agent (specialist or generalist) with staged writes → deterministic checks → execute → escalate (fire and forget) → write answer, reasoning and trace. The record store is Postgres (PGlite in-process when no `DATABASE_URL` is set).

## 4. How to run
```bash
pnpm install
cp .env.example .env   # set ANTHROPIC_API_KEY
pnpm cases -- --cases ./cases/<set> --data ./data/<set> --out ./ANSWERS
```
Offline smoke test (no key needed): `pnpm smoke`.
Reproduce the Reality Test: `pnpm cases -- --cases ./cases/reality --data ./data/reality --out ./ANSWERS-repro`.

## 5. Models, APIs and external services
- Claude Opus 5.5 (`claude-opus-5-5`) for routing and agents via the Anthropic API; Sonnet 5.5 as fallback.
- Vercel AI SDK 7 with the Anthropic provider.
- PGlite / Postgres for the record store.
- Demo only, not required for the judged run: ElevenLabs Agents + Twilio for the on-call phone call; Twilio for WhatsApp/SMS; Resend for email.

## 6. Assumptions
- A contractor panel exists in the data. If not, bookings become proposed actions plus escalation.
- "Now" is the case timestamp, not the wall clock.
- (Add the data-shape assumptions from 10:00.)

## 7. Known limitations
(Fill in.)

## 8. What we would build next
(Fill in.)

## Repository layout
```
src/tools        one file per tool family; registry
src/policies     operating policy per case family + constraints every agent gets
src/agents       agent configs (generalist + specialists)
src/orchestrator runCase: the code orchestrator
src/runtime      router, agent loop, checks, execute, escalate, write, trace
src/backend      record store (PGlite/Postgres), seed loader, failure injector
src/ingest       generic case ingest
src/service.ts   voice/inbound HTTP service (demo path)
cases/           case inputs; ANSWERS/ generated outputs
```
