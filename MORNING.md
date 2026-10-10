# Morning brief (written overnight, 10 Oct 2026, read this on the tube)

## Do these before anything else
0. **Timing correction from the Hacker Guide (read on site):** code AND the 60-second video freeze at 16:30, not 17:00. Only the Reality Test results go in by 17:00. The video must be recorded before 16:30, so Stream D's recording happens during the 15:45 rehearsal, not after. Anthropic API credits were emailed to the registration address; check that inbox.
1. **Anthropic credit.** Your org ran out of API credit at 00:33 last night, mid-run (same failure as the Vabel sandbox). Nine of sixteen sample cases completed, seven died with "credit balance too low". Top up now, or get the hackathon key at onboarding and put it in `.env`. Nothing runs without this.
2. **Twilio upgrade** for Vedaant's outbound call (trial accounts only dial verified numbers). The ElevenLabs steps are in VOICE-BRIEF.md; the backend endpoints exist and are tested.
3. **Public GitHub repo: done**, https://github.com/jeremy-shr/dwelly-hackathon (origin). Sessions branch from it. There is nothing from the Fabriq engine in it, the LICENSE is Apache 2.0 and no secrets are committed. A fresh repo tomorrow would throw away a tested pipeline for no gain.

## The honest answer to "is it ambitious enough to win"
The 70 technical points are scored by a Claude judge reading per-case markdown against a hidden rubric. What wins that is not a bigger system but one that does the right actions, tells the truth about what happened, escalates with a full handover, and never leaves a case without a folder. We now have that pipeline, and it has been run against the real model on realistic cases. The judge simulation overnight (an independent agent grading our real outputs with the organisers' criteria) scored the nine completed cases 4 to 10 out of 10 on outcomes, and found one systematic defect worth most of the lost points: the agent wrote "contractor booked" before the booking executed, and in six of six cases the injected booking failure meant tenants were told someone was coming. That is fixed (see below). A rival would have to beat us on truthful recovery from failed actions, on treating the inbox as one timeline across cases, and on handover with proof. Those are now our three strongest features, not our weaknesses.

Where ambition still pays, for the human-judged 30 and the category awards: the live board plus the inbound WhatsApp loop plus the on-call phone ringing in the video. That is Stream D and E today.

## What exists and is verified
- `pnpm smoke` runs the whole pipeline offline on a mock model in two seconds: flags, routing, staging, checks, revision, two-phase execution with an injected unknown result, reconciliation, writers. `pnpm scenarios` runs five scripted failure scenarios through the orchestrator (all passing). Malformed inputs (binary, broken JSON, stray README) still produce folders.
- The real model ran nine sample cases end to end at 45 to 65 seconds each with concurrency 8. The gas emergency, the break-in, water through a light fitting, arrears hardship, the expired gas certificate with refused access, the solicitor complaint, mould with a newborn and spam all resolved the way an operations manager would want. Full output is in `out/sample-1/`; read `S02-gas-smell-call/ANSWER.md` for the flavour.
- Deterministic eval: 52 of 54 checks on those nine. The two misses were the false-booking defect.
- The board serves live status from the trace files (`pnpm service`, http://localhost:8787).

## What changed overnight after the reviews (all committed)
Three independent reviews ran overnight: a judge simulation grading our nine real answers with the organisers' criteria, a code review that reproduced bugs by running the modules, and a second review of the rewritten orchestrator that scripted five failure scenarios. More than forty findings between them, all but a handful of cosmetic ones fixed:
- Writes execute in two phases: state changes first (tickets, bookings, work orders), then messages and handovers. If a booking fails, the agent gets one reconciliation turn with the real results, its pending messages are withdrawn, it books the next panel contractor or escalates with "NO CONTRACTOR CONFIRMED", and restages messages that match reality. A deterministic claim check then refuses any text that still describes a failed action as done.
- Every ANSWER.md now opens with an execution status block generated from results, not from the agent's prose, and ends with the full text of every message actually sent.
- Cases are grouped by building through the record store, run in time order inside a group, and the prefetch pulls sibling flats and their tickets, so the flat 3 ceiling leak sees the flat 5 waste pipe.
- Dates are parsed from email headers; "now" is never the wall clock.
- Landlord emergency authority and approval references are enforced in the spend guard. Seeded agency policy documents go into every case pack.
- The escalate tool no longer lets the agent promise a phone call; the page result (placed, not configured, failed) is written into the answer.
- Flags can be overruled: the agent must assess every flag and may mark one a false positive with a reason, which the checks honour (gas never). The patterns themselves were tightened so "fire risk assessment", "Albion Court", "carbon monoxide regulations" and "electric shower" no longer force P0.
- Record ids are built from the action id, not the clock, so six messages in one step no longer collapse into three rows; references like "create_ticket#1" are mapped to the created ticket id at execution.
- The runner cannot be killed by one case: a last-line-of-defence writer, safe trace parsing, per-file try/catch in seeding, ids merged by stem in ingest, README and manifest files ignored, binary and broken files still produce folders. Resume only trusts a folder whose marker matches the case and whose trace ended cleanly. Numbering happens before any filtering.
- An agent that runs out of steps gets one "submit now" turn instead of losing its work. Oversized or unreadable attachments are retried without. The model never switches mid-conversation.
- Groups larger than four are split and the most urgent group starts first, so one building cannot serialise the run. The read-only SQL tool refuses sleeps and other stalls.
- Spend guard: approval references must match a recorded landlord decision; "do not use" instructions on the landlord record block that contractor; emergency authority applies only with a justification.

## Speed, and where Jev sits
Measured: 45 to 65 seconds per case, dominated by the agent's 6 to 10 steps on Opus 5.5. Forty cases at concurrency 10 is about five minutes, well inside the 30-minute window, so speed is not where points are. The levers if rate limits bite: lower concurrency and let the Sonnet restart handle 429s (automatic), or set `ROUTER_MODEL=claude-sonnet-5-5` for routing. Jev would make triage sub-second, which nobody scores, and its key is waitlisted. It is wired as a shadow signal only (`TYPESAFE_API_KEY`); if a key arrives it logs into the trace, nothing else changes. Do not spend time on it today.

## Scores so far on their data (judge simulator, hidden endings as rubric)
Fifteen cut public cases: 7.3 outcome / 7.4 judgement at the morning baseline; 8.3 / 8.1 with the state layer (session 1) and the agency policy (session 2) merged, no critical failures in any run (`out/public-real-2-judge.md` to `out/public-real-7-judge.md`). Remaining miss in most verdicts: not assigning or instructing the provider at intake, which the agency does immediately. Sample set with injected booking failure: 92/100 deterministic checks, reconciliation verified live.

## Their data, now that we have seen it
The public cases (fifty per track, already cloned into `HackatonPublicCases/`) are case files, not a CRM: `index.md` + `history.md` + `attachments/`, Northbridge Lettings, tenant or agency initiated, with the ending narrated in Overview and Outcome. The adapter hides those two sections, cuts histories at a decision point, and all fifty load with timestamps and numbered folders. The Reality Test will almost certainly be the same layout in a `HackatonChallendges/` folder. At 16:30: `git -C HackatonPublicCases pull`, confirm the folder name, then
```bash
pnpm cases -- --cases "HackatonPublicCases/HackatonChallendges/Property Management" --out ./ANSWERS --numbered --concurrency 10 --deadline 22
```
Look at one challenge `index.md` first: if it has a Question or Task section the adapter already surfaces it; if its Overview is context rather than an ending, add `--show-outcome`.

## How you test it today
```bash
pnpm smoke && pnpm scenarios                                 # offline sanity, run after every merge
pnpm cases -- --cases ./cases/sample --data ./data/sample --out ./out/<name> --concurrency 8 --inject "book_contractor:fail:1"
pnpm eval  -- --out ./out/<name>                             # scoreboard
pnpm cut -- --src "HackatonPublicCases/Property Management"  # decision points + hidden endings for labelling
pnpm cases -- --cases "HackatonPublicCases/Property Management" --out ./out/public-<name> --numbered --cuts evals/cuts-auto.json --only 003,027,045
pnpm judge -- --out ./out/<name> --cases ./cases/sample --report ./out/<name>-judge.md   # Opus grades like the organisers
```
The first real run today should be the full sixteen with the injection, then read the judge report, then open their data.

## The day, in one paragraph
10:00 read the briefing and the data layout; Stream A adapts seed and ingest to their files and gets a first full run; Streams B, C, D, E, F run in parallel per TASKS.md. 11:00 check flag and routing precision; if routing is poor, send everything to the generalist. 13:00 eval and judge on their training cases, fix the worst ten through policies, flags and checks. 15:30 dress rehearsal on a held-out subset with failure injection and a malformed file, including the commit; record the demo video during it. 16:15 final commit, 16:30 submit the form with the commit hash and the video path (code and video freeze). 16:30 run the Reality Test with `--numbered --deadline 22`, commit ANSWERS only, 17:00 push. Nobody edits ANSWERS by hand.

## Risks I could not retire overnight
- Their data shape. Everything is generic, but id detection, date fields and the property or building link need ten minutes of adapter work at 10:00 (Stream A).
- Supplied tools. If they give an API or MCP server, the wrapper calls it; the sketch is in `src/backend/mcp.ts`. Budget an hour.
- Rate limits on the hackathon key are unknown. The Sonnet restart and resumable runner cover a bad case; test concurrency 10 on their training set first.
- The voice page has never been placed for real. It is fire-and-forget and the case completes without it, so the scored run is safe either way.
- The reconciliation and claim-check path is now verified on the real model too (sample run two: the injected booking failure on the mould case produced a quote request, honest messages to tenant and landlord, and one escalation), as well as on five scripted failure scenarios (`pnpm scenarios`: budget gate, revision duplicates, second failure, crashed reconciliation, genuine recovery), all passing. The first real run this morning (sixteen sample cases with `--inject "book_contractor:fail:1"`) is specifically to watch S01, S04, S13 and S16 recover by booking the second contractor, and to read the judge report on them. If the reconciliation turn misbehaves, the safety net still holds: the execution status block is generated from results, and an unrecovered booking forces an escalation headed "NO CONTRACTOR CONFIRMED".
- Question-style Reality Test cases. The rules hint the test may be "difficult questions and decision points" rather than raw events. The ingest detects that shape and the answer leads with the direct answer, but it is tested on one sample case only (S14).

## Coding agents in parallel
Open one Claude Code session per stream in a worktree (`git worktree add ../wt-<stream> -b <stream>`), paste the brief from TASKS.md, and require `pnpm typecheck && pnpm smoke` plus an eval delta before merging. CLAUDE.md in the repo carries the rules every session reads first. The streams touch disjoint directories by design.
