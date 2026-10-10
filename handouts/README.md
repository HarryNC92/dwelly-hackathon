# Handouts: how the sessions work together

One Claude Code session per stream. Paste the stream's handout as the first message. Every session reads `CONTEXT.md`, `CLAUDE.md` and `docs/case-breakdown.md` before touching anything; the handout tells it what else to read.

Rules for every session:
- Work in your own worktree and branch: `git worktree add ../wt-<stream> -b stream/<stream>` from the repo root, then `pnpm install` there.
- Only edit the files your handout says you own. If you need a change elsewhere, write it as a request in your report; the orchestrator makes it.
- The shared interface is `src/schemas/casestate.ts` (CaseState) and `src/schemas/case.ts`. Do not change them; request changes.
- Before reporting: `pnpm typecheck && pnpm smoke && pnpm scenarios` must pass, and anything that touches prompts, guards or checks also needs a real run and a judge delta (commands in your handout).
- Report back with: branch name, what changed (outcomes, not files), the verification output, open questions, and any requests for files you do not own. Commit small with messages that say what outcome changed.
- Never hand-edit anything under `ANSWERS/` or `out/`. Never add text aimed at the judge.

The orchestrator (Jeremy's main session) owns: `src/schemas/*`, `src/orchestrator/*`, `src/runtime/runAgent.ts`, `src/run.ts`, `src/ingest/*`, `CONTEXT.md`, `MORNING.md`, `TASKS.md`, merges, and the real-model verification runs.

Sessions actually open today (keep it to these):
- Session 1 "state and rules": do handout A first, then B, in the same worktree (branch `stream/state-rules`). B's scenario tests go in `evals/scenarios.mts` as agreed.
- Session 2 "policy": handout C (branch `stream/policy`).
- Vedaant: handout E. Harry: handout F.
- Handout D is folded: the orchestrator wires the red-flag gate and the capacity model; Session 1 adds the scripted scenarios; multi-cut materialisation is deferred unless time allows.

Streams (reference):
- A `handouts/A-case-state.md`: case state extraction and stage machine (`src/casefile/`).
- B `handouts/B-rules-and-guards.md`: business rules as deterministic guards and checks (`src/tools/write.ts` guards, `src/runtime/checks.ts`, `src/runtime/flags.ts`).
- C `handouts/C-policy.md`: agency policy and conventions (`src/policies/`).
- D `handouts/D-eval-harness.md`: multi-cut eval, red-flag linter, judge improvements (`evals/`, `src/eval.ts`, `src/judge.ts`, `src/runtime/redflags.ts`).
- E `handouts/E-voice-and-demo.md`: voice, inbound, board, video (`src/service.ts`, `public/`, `voice/`, `demo/`).
- F `handouts/F-readme-and-submission.md`: README, submission, runbook (`README.md`, `SUBMISSION.md`, `docs/`, `scripts/`).
