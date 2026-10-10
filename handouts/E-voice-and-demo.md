# Stream E: voice, inbound and demo (Vedaant)

## Goal
Voice inside the operational workflow, an inbound channel for the demo, and a board that makes the 60-second video obvious. Nothing in this stream runs during the judged Reality Test except the fire-and-forget P0 page.

## Read first
`CONTEXT.md`, `CLAUDE.md`, `VOICE-BRIEF.md` (the ElevenLabs steps, verified), `src/service.ts` (endpoints exist: board, status, cases, escalations, inbound, ElevenLabs webhook), `public/board.html`, `src/runtime/escalate.ts` (what the pipeline posts for a P0), `docs/case-breakdown.md` section 6 (safety triggers that should ring).

## You own
`src/service.ts`, `public/*`, `voice/*`, `demo/*`, `.env.example` voice lines.

## Deliverables
1. The on-call page: the ElevenLabs outbound call fires from `POST /api/escalations`, reads the handover, captures the decision via the data-collection field, and the webhook writes `callback.json` next to the case. Test with a real call to Jeremy's phone.
2. Contractor chase call (stronger "voice in the workflow" story given the public cases are full of provider chasing): an agent that rings a contractor about a job id, asks for a visit date or quote status, and posts the answer to `/api/webhooks/elevenlabs` so it lands in the case folder. Same plumbing, different prompt and data-collection fields (`visit_date`, `quote_status`).
3. Inbound: Twilio sandbox WhatsApp or SMS to `/api/inbound` creates a case folder; a runner invocation on `cases/live` answers it; the reply goes back on the same channel through a real transport behind an env flag (`send_message` perform is in `src/tools/write.ts`, which you do not own; request the transport hook from the orchestrator and implement the transport in `src/service.ts` or a new `src/transports/` you own).
4. Board: cases with stage and urgency, state changes animating, a map if addresses geocode (the organisers' addresses are fictional postcodes like ZZ9 0ZZ, so a map may be impossible; if so, a timeline per case instead), and a "ring" event when a P0 fires.
5. The video, recorded during the 15:30 rehearsal, under `demo/`, inside the repo, before the 16:30 freeze.

## Verify
`pnpm typecheck`; a real end-to-end call; the webhook writing `callback.json`; the board rendering `out/public-real-2`.

## Report
Branch `stream/voice`, what works end to end, and the env variables the orchestrator must set for the rehearsal.
