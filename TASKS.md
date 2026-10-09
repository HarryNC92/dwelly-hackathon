# Day plan and parallel streams (10 Oct 2026)

Each stream is one coding agent in its own worktree. Briefs are written to be pasted as the first message. Every stream ends with `pnpm typecheck && pnpm smoke`, and any stream that touches prompts or pipeline logic also runs the real sample and the eval and reports the score delta. Jeremy merges.

## 10:00 to 10:45 — everyone reads the briefing, then

### Stream A — Data and tools adapter (the critical path; Jeremy or the strongest agent)
Brief: "Dwelly's synthetic data for the Property Management track is in `./data/dwelly` and the case inputs are in `./cases/dwelly` (I will tell you the exact layout). Goal: our pipeline runs end to end on their data. 1) Make `src/backend/seed.ts` load every file they gave us so `list_record_types` shows one type per entity with sensible ids (fix id detection per file if needed). 2) Make `src/ingest/generic.ts` produce one Case per organiser case with the organiser's id, the right channel and `receivedAt`, and attachments passed through. 3) If they supplied an API or MCP server for actions, implement a `dwelly` backend in `src/backend/` so the write tools call it through the existing wrapper (see `src/backend/mcp.ts`); reads can keep using the record store seeded from their data. 4) Update `src/runtime/context.ts` id-key patterns and `groupKey` in `src/run.ts` so prefetch and property grouping work on their field names. 5) Run `pnpm cases -- --cases ./cases/dwelly --data ./data/dwelly --out ./out/dwelly-1 --concurrency 8` and report which cases errored and why. Do not touch policies or agents."

### Stream B — Policy from the briefing
Brief: "Read the organisers' briefing notes in `./docs/briefing.md` (I will paste them). Update `src/policies/*.md` so our operating policy matches Dwelly's stated rules: spend authorities, urgency definitions, contractor rules, communication rules, anything they say about escalation or what the agent must never do. Keep each policy operational and short. Add any new family they describe as a new policy file and a new agent config in `src/agents/index.ts`. Then run the real sample (`pnpm cases` on `./cases/sample`) and `pnpm eval`, and report the score before and after. Do not change the pipeline code."

### Stream C — Labels and judge loop
Brief: "Write `evals/expected-dwelly.yaml` for the organisers' training cases in `./cases/dwelly`, in the same format as `evals/expected.yaml` (family, urgency, escalation, required/forbidden tools, must/must-not mention, and a `notes` line that states what a competent UK lettings operations manager would expect). Be specific about safety cases, conflicting information and anything that must not be actioned. Then run `pnpm eval -- --out ./out/dwelly-1 --expected ./evals/expected-dwelly.yaml` and `pnpm judge -- --out ./out/dwelly-1 --cases ./cases/dwelly --expected ./evals/expected-dwelly.yaml --report ./out/dwelly-1-judge.md`. Report the ten worst cases with the reason each lost points. Do not change code."

### Stream D — Demo and board
Brief: "The live board is `public/board.html` served by `src/service.ts` (`pnpm service`, then open http://localhost:8787 with `OUT_DIR` pointing at a run). Make it demo-ready: a map panel (Leaflet from a CDN) with one pin per property when the data has postcodes (geocode once via postcodes.io at seed time and store lat/lng on the property record; add `--geocode` to `src/run.ts`), pins coloured by the worst open case urgency, cards that animate state changes, and a header counter. Keep it one HTML file plus one endpoint. Then record a 25-second screen capture of a full run on `./cases/sample` for the demo video and put it in `demo/`."

### Stream E — Voice and inbound (Vedaant)
Brief: see `VOICE-BRIEF.md`. Backend side: `src/service.ts` already has `/api/escalations` and `/api/webhooks/elevenlabs`. Add `/api/inbound` for Twilio WhatsApp/SMS webhooks that writes a new case folder into `./cases/live/<id>` and triggers `runCase` for it, and replies on the same channel from the resolution's tenant communication. Verify the signature on the ElevenLabs webhook before the demo.

### Stream F — README and submission
Brief: "Fill in README.md sections 1 to 8 from ARCHITECTURE.md and the briefing, in plain English, for an engineer who has not spoken to us. Keep it honest: assumptions, limitations, what we would build next. Add the reproduce command for the Reality Test. Fill SUBMISSION.md except the links. Check LICENSE is Apache 2.0 and that no secrets are committed (`git grep -i 'sk-ant'`)."

## 11:00 checkpoint
Stream A has the first full run on their data. Measure: how many cases error, flag precision (grep `trace.jsonl` for flags on cases where they are wrong), routing precision (how many `->generalist` reroutes). If routing precision is poor, set `pickAgent` to always return the generalist.

## 13:00 checkpoint
Eval and judge scores on their training cases. Fix the worst ten by changing policies, flags or checks, in that order. Do not add a model verifier unless the judge report shows a class of error the checks miss.

## 15:30 freeze features. 15:45 dress rehearsal
On a held-out subset with `--inject "book_contractor:fail:1,send_message:unknown:1"` and one malformed file dropped into the cases directory. Time the whole thing including `git add ANSWERS && git commit`. Fix anything that breaks the rehearsal; nothing else.

## 16:15 code freeze. 16:30 Reality Test
```bash
pnpm cases -- --cases ./cases/reality --data ./data/dwelly --out ./ANSWERS --concurrency 10 --numbered --deadline 22
git add ANSWERS && git commit -m "Reality Test results" && git push
```
Watch `out` for errors; if a case is stuck past 4 minutes it times out and escalates on its own. Do not hand-edit anything in ANSWERS.
