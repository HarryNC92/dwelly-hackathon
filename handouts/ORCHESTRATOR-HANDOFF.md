# Orchestrator handoff (written 10 Oct 2026, ~12:40, for a fresh session taking over this role)

You are the orchestrator for Jeremy's team at the Dwelly Real-World Agents Hackathon, Property Management track, today, in London. Winning is the goal. Jeremy is on site, talks to you in short messages, relays prompts to other sessions, and expects you to act without asking permission for reversible things. Address him plainly, no nicknames. He reads short, direct answers; keep numbers in tables; no em-dashes.

## 0. The previous orchestrator session is still open

Jeremy is keeping the session that wrote this handoff open. If anything here is unclear, or you need a detail that is not written down (why a decision was made, what a run showed, where a file came from), ask Jeremy to put the question to the previous session and paste back its answer, rather than re-deriving it from the code or re-running anything. Say "question for the previous orchestrator:" followed by one precise question. Do not duplicate its work: it is not acting any more, it only answers.

## 1. What you own and how you work

- Repo: `/Users/jeremy/Desktop/code/fabriq/dwelly-hackathon` (this checkout is always on `main`; never switch branches here). Public remote: https://github.com/jeremy-shr/dwelly-hackathon. Two worktrees exist for the sessions: `../wt-state-rules` (branch `stream/state-rules`) and `../wt-policy` (branch `stream/policy`). Vedaant (`stream/voice`) and Harry (`stream/readme`) work in their own clones.
- You own: `src/schemas/*`, `src/orchestrator/*`, `src/runtime/runAgent.ts`, `src/runtime/write.ts`, `src/runtime/execute.ts`, `src/run.ts`, `src/ingest/*`, `src/judge.ts`, `src/eval.ts`, `src/capacity.ts`, `scripts/`, `CONTEXT.md`, `MORNING.md`, `TASKS.md`, `handouts/`, merges, and every real-model verification run. Session 1 owns `src/casefile/`, `src/runtime/rules.ts`, `src/runtime/checks.ts`, `src/runtime/flags.ts` and the guard functions in `src/tools/write.ts`. Session 2 owns `src/policies/*`. Vedaant owns `src/service.ts`, `public/`, `voice/`, `demo/`, `src/transports/`. Harry owns `README.md`, `SUBMISSION.md`, `docs/` (except the organiser-derived files and `docs/evidence/` reports), `scripts/` content he adds.
- Workflow: sessions report to Jeremy, who pastes their reports to you. You merge their branch into main (`git merge -q --no-edit stream/<name>`), run the offline verification, push, and tell Jeremy what to relay back. You write the prompts Jeremy pastes into sessions; keep them verbatim-pasteable, with `git merge main` first when main moved.
- Offline verification after every merge or change: `npx tsc --noEmit && pnpm smoke && pnpm scenarios` (scenarios should print 20 `=====` lines as of now). Real-model verification costs credits: Jeremy is watching spend. The judge is the expensive half. Rule from 12:00: no judge runs until the dress rehearsal; use targeted two-to-four-case runs only when a specific fix needs confirming.
- The API key is in `.env` (gitignored) as `ANTHROPIC_API_KEY`; it is the hackathon key Jeremy pasted in chat at about 10:30. Never print it. The org's own credit ran out overnight; this key works.
- Commands take arguments directly: `pnpm cases --cases …`, `pnpm judge --out …`; no `--` separator (pnpm forwards it and commander then fails). Internally I use `pnpm -s tsx src/run.ts …`.

## 2. What the system is, in one paragraph

Organiser case files (index.md + history.md + attachments, from a fictional agency "Northbridge Lettings") are parsed by `src/ingest/dwelly.ts`, which hides the Overview and Outcome (they narrate the ending), can cut the history at an event number for decision-point training, treats a "Question", "Next action at escalation" or similar section as the task, and runs the deterministic extractor (`src/casefile/`, Session 1) to fill a `CaseState` (stage from the platform's exact strings, parties with aliases, landlord approval incl. informal assent and third-party routes, quotes, provider, holds, timers, documents, keys, occupancy, data conflicts, safety signals, difficulty tier). The router (Sonnet 5.5, low effort) picks a specialist or the generalist; the agent (Opus 5.5, effort medium) sees the history, the state, the rule findings, the agency conventions policy (`src/policies/agency.md`, mined from the fifty public cases) and Harry's triage rules, and stages actions through tools (assign_provider incl. by trade, request_quote, book_contractor, set_hold, close_case, send_message with attachments, update_ticket on the job id, record_landlord_decision, propose_action, report_blocker, escalate). Writes are staged, guarded by rules with Harry's ids (`src/runtime/rules.ts`), checked (`checks.ts`), executed in two phases (state changes, then messages, close_case last), reconciled truthfully if anything fails (claim check: no text may describe a failed action as done), then written: `ANSWER.md` opens with "Next action" and "Rationale" (what the organisers said they grade), then an execution status block generated from results, actions, recorded-for-human items, failures, not-done, escalation, full message texts, conflicts, final state (resolved, scheduled, on_hold, awaiting_approval, escalated, closed_no_action, blocked). `REASONING.md` and `trace.jsonl` sit beside it. Every case always gets a folder; folders are numbered 1..N (`--numbered`) with `index.json` mapping.

## 3. Measured state (all on the real model, judge = our simulator with hidden endings as rubric)

| Set | Outcome | Judgement | Critical | Notes |
|---|---|---|---|---|
| 15 public cut cases, morning baseline (run 2) | 7.3 | 7.4 | 0 | before any session work |
| same 15, state + policy merged (run 7) | 8.3 | 8.1 | 0 | |
| same 15, plus rule guards (run 8) | 8.3 | 7.8 | 0 | no guard misfires |
| all 50 public cut cases (public-full-1) | 8.2 | 8.0 | 0 | 177 s at concurrency 10; 39/50 at 8+; lowest 6 |
| 4 unnamed-provider cases after policy alignment (run 9) | 8.6 | 8.0 | 0 | assign-by-trade works |
| 023 and 025 after approval fix (run 10) | 023 ≈ 8.6; 025 = 5 | | 0 | 025: assigned the intermediary instead of identifying the contractor; policy line requested from Session 2 |
| sample set (16 synthetic cases, injected booking failure) | 92/98 deterministic checks | | | reconciliation verified live on the mould case |

Judge noise is about ±0.5 per case per run; treat mean deltas under 0.2 as noise. Reports are in `out/*-judge.md` and copied to `docs/evidence/`. `out/` is gitignored; `docs/evidence/` is committed.

## 4. Decisions already made (do not reopen)

- Framework: TypeScript, Vercel AI SDK 7 + Anthropic provider; no LangGraph; no strict tool schemas (API caps at 20 and rejects big grammars); never a forced tool choice (Opus 5.5 rejects it); no Jev on the critical path (waitlisted; shadow adapter only in `src/classify/`).
- Orchestrator is code, generalist is the floor; specialists are config. Writes staged, two-phase execution, truthfulness check, additive escalation, fire-and-forget P0 page (voice off during the judged run: `ESCALATION_WEBHOOK_URL` unset).
- Case file is the system of record in this format: no database records, named parties count as known, history approvals count as approval, never escalate for missing records. Unnamed provider: `assign_provider` by trade, mirroring the platform's "Maintenance provider assigned" step (decided conflict with the policy; aligned 12:12).
- Hard stops only for the prohibited list (dispatch without approval, works while a quote is with the landlord, parts under conditional approval, dispatch against the landlord's own route, second contractor, wrong address in a message, tenant details to a third party, financial action without a route, closing with safety/conflict/quote/keys/evidence open). Everything else is a warning the agent must address or overrule with a reason (gas/CO never overrulable).
- Agent stays on Opus 5.5 for the judged run (outcomes 35 points); router on Sonnet; tiering by difficulty exists in the schema but is not wired to model choice (not measured; leave it unless credits force it).
- Judge frequency: milestones only. Rehearsal at 15:15 is the next judge run.

## 5. Open items at handoff (check which have landed)

1. Session 1: tenant-promise check (a tenant message promising a provider needs a live assignment) on `stream/state-rules`. Merge when reported, verify offline, push.
2. Session 2: third-party-route policy line from case 025 on `stream/policy`, plus rationale guidance (stage, rule ids, evidence). Merge, verify, push. Prompt size is ~9,400 words for the generalist; acceptable (cached, 83% cache hits measured).
3. Vedaant: first report (real call end to end, env values for the rehearsal, video during the rehearsal, committed under `demo/` before 16:15). His branch `stream/voice`; files per handout E; merge when reported.
4. Harry: README on `stream/readme` (eight sections, Evidence, "How to read an answer" using `out/public-full-1/8/ANSWER.md` as example; the `out/` folder is local only, send him the file), clean-clone test, SUBMISSION.md. He also committed `docs/landlord-agency-contract-inferences.md` already (merged).
5. Known weaknesses not yet addressed: quote figure/document not attached in some agency-initiated cases (003, 004); thanking the wrong contractor when two firms appear (018); over-escalating a landlord-known recurrent issue (014). All are policy nuances; only act if a session is idle and credits allow a two-case check.
6. The capacity model (`pnpm capacity --out out/public-full-1 …`) and `docs/evidence/capacity-model.md` are evidence for the README.

Landed:
- 12:50 Item 1 merged (6d23a04): PM-GEN-002 check in `src/runtime/rules.ts`, a tenant message promising a provider fails checks unless the same resolution assigns or books one, or the case state already shows a provider assigned with work incomplete (Session 1's deliberate reading; strict variant is one line in `providerPromiseRule`). Scenarios now print 22 `=====` lines, 18/18 rule scenarios.
- 12:50 Item 2 merged (429a3f9): `src/policies/agency.md` section 5 bullet and rule 16 on third-party contractor routes (025); section 10 requires the rationale to name stage, rule ids and evidence events. Generalist prompt 9,642 words.
- Carried notes from Session 1, not acted on: policies do not mention `rulesApplied` or rule ids (agents learn them via check feedback); the PM-AUTH-001 approval note reaches trace and checks but not the agent's prompt for that turn.

## 6. The afternoon (London time; code and video freeze 16:30, results by 17:00)

- 15:00 feature freeze on every branch; final merges by 15:10; `npx tsc --noEmit && pnpm smoke && pnpm scenarios` green on main; push.
- 15:15 dress rehearsal: `DRY_RUN=1 INJECT="book_contractor:fail:1" CUTS=evals/cuts-auto.json scripts/reality-test.sh "HackatonPublicCases/Property Management" 10` plus one malformed folder dropped into a copy of the cases dir (binary file, broken JSON, stray README). Then `pnpm judge --out out/rehearsal --cases "HackatonPublicCases/Property Management" --cuts evals/cuts-auto.json --after-dir evals/after-auto --report out/rehearsal-judge.md`. Vedaant records the video during this. Expect ~3 minutes for fifty cases; the budget is 22 minutes of the 30.
- 16:15 final commit on main, push, submit the form (repo URL, team, track, names, commit hash, video path `demo/…`, post links) with the hash of main at that moment.
- 16:30 the organisers publish a NEW repo (new link). Run `scripts/reality-test.sh <git-url> 10`. It clones into `HackatonChallendges/` (gitignored), finds the Property Management folder, prints one index head (if its Overview is context not an ending, re-run with `SHOW_OUTCOME=1`), runs with `--numbered --deadline 22`, checks every folder has `ANSWER.md`, commits only `ANSWERS/`, pushes, prints the hash. Nobody hand-edits ANSWERS. Folder names 1, 2, 3 per the rules (confirmed by the organisers via Harry).
- If something breaks at 16:30: `pnpm cases --cases <dir> --out ./ANSWERS --numbered --concurrency 10 --deadline 22` is the whole runbook; the runner is resumable (re-running skips completed folders); a stuck case times out at 4 minutes and escalates on its own; the writer never throws.

## 7. Organisers' answers (via Harry, ~12:25)

Reality Test arrives through a new repo (new link). Property cases will carry a next-action or question section like the other tracks; what is graded is the rationale and the next action; voice and the rest are flourish that adds. No API tools. ANSWERS folder naming is 1, 2, 3 as in the rules.

## 8. Reference files

`CONTEXT.md` (system brief for any session; status paragraph at the top), `MORNING.md` (plan and scores), `ARCHITECTURE.md` (design v4; predates the state layer but still right on principles), `docs/case-breakdown.md` (Vedaant's agent's analysis of the fifty cases: workflow strings, rules, noise, red flags), `docs/triage-rules.md` (Harry's rule set with ids), `docs/landlord-agency-contract-inferences.md`, `docs/rules-digest.md` (the organisers' rules), `handouts/` (A to F plus the triage addendum), `CLAUDE.md` (rules every session follows; file ownership map), `VOICE-BRIEF.md`, `docs/evidence/`, `evals/cuts-auto.json` and `evals/after-auto/` (decision points and hidden endings), `evals/scenarios.mts` (20 scripted failure scenarios), `evals/expected.yaml` (sample-set labels).

## 9. How Jeremy wants you to behave

Short answers, tables for numbers, no asking permission for reversible work, confirm before anything outward-facing (publishing, posting). Be honest about noise and what is unverified. When he pastes a session report, merge and verify first, then tell him exactly what to relay, as a paste-ready block. When he asks "is X safe", answer with the file boundary. He dislikes session sprawl: two code sessions plus Vedaant and Harry is the agreed shape. Keep your own context lean: offload reading and reviewing to sessions or subagents, and keep this handoff updated at milestones (append a dated line under "Open items" when something lands).
- 13:00 Item 3 part one merged (stream/voice 38661f0): real call end to end proven; service fills the brief from trace, case folder and dataset; P0 also WhatsApps the on-call manager; inbound WhatsApp becomes a case via `--only`. escalate.ts unchanged (P1 WhatsApp commit reverted by Vedaant's session). Video still to come: sample set S02 on Vedaant's machine, `demo/demo.mp4` under 50 MB, by 16:15. None of the fifty public cases reaches P0, so the rehearsal places no call.
- 12:55 Item 4: Harry's README and SUBMISSION.md are on his fork (HarryNC92, stream/readme); six corrections sent; he opens a PR and Jeremy merges it on GitHub. Example output folder committed at `docs/evidence/example-case-008/`.
- 13:15 Voice test on the real model passed end to end (S02 on Vedaant's machine: pipeline P0 placed the call, brief named the address, problem and options). Brief quality fixes in progress in src/service.ts and voice/ only: options built from the engine's decision_required, playbook as fallback, no options for actions already executed, names instead of ids, deadline spoken.
- 13:15 Decision: the three-view demo dashboard (queue, case workflow timeline, escalation panel) is built by a separate session, not Vedaant's. To avoid two sessions editing src/service.ts, that session owns public/ and a separate small server (src/board.ts, own port) that reads <OUT>/<case>/trace.jsonl, ANSWER.md and callback.json. Hard stop 15:00; fallback is the current board.
