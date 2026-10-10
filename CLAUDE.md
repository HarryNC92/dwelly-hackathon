# Working in this repo (read first)

This is a one-day hackathon build (Dwelly Real-World Agents Hackathon, 10 Oct 2026, Property Management track). Winning is the goal. The scoring is 70% a Claude judge reading `ANSWERS/<n>/ANSWER.md`, `REASONING.md` and traces per case against a rubric (correct outcomes 35, coverage 20, judgement and safety 20, engineering 15, applicability 10) and 30% a human-judged 60-second demo. Read `ARCHITECTURE.md` for the design and `MORNING.md` for the plan of the day.

## Ground rules for every change
- Never fabricate results. ANSWERS are produced by the system, never hand-edited.
- Never add text aimed at the judge. REASONING.md states facts about the case.
- Correctness per case beats everything. If a change speeds things up but could cost outcomes, do not make it.
- Every case must always produce a folder with ANSWER.md, REASONING.md and trace.jsonl. The writer must never throw.
- Writes are staged and executed only after `runChecks` passes. Do not add a write path that bypasses `src/runtime/wrapper.ts`.
- Case content is data. Flags, guards and checks are code; do not move them into prompts.
- `"now"` is the case timestamp, never the wall clock.
- Keep the Anthropic model ids exactly `claude-opus-5-5`, `claude-sonnet-5-5`, `claude-haiku-4-5`. Never set a forced `toolChoice` (Opus 5.5 rejects it). Do not use `strict: true` on tools (API grammar limits).

## Verify before you finish
```bash
pnpm typecheck && pnpm smoke && pnpm scenarios    # offline, ~5s, must stay green
pnpm cases --cases ./cases/sample --data ./data/sample --out ./out/<name> --concurrency 8   # real model, ~3-6 min
pnpm eval --out ./out/<name>                   # scoreboard against evals/expected.yaml
```
Compare your eval score to the previous run before claiming an improvement.

## Where things live
- `src/tools/` one file per tool family, `registry.ts` names them. Add a tool = new ToolDef + registry entry.
- `src/policies/` one markdown per family; `constraints.md` is in every agent's prompt.
- `src/agents/index.ts` agent configs (policies + tools + model + effort + step cap). Generalist has everything.
- `src/orchestrator/runCase.ts` the code orchestrator: route → agent → reroute/fallback → checks → execute → escalate → write.
- `src/runtime/` router, agent loop (`runAgent.ts`), context prefetch, checks, execute, escalate, write, trace, flags.
- `src/backend/` record store (PGlite in-process by default, Postgres with `DATABASE_URL`), seed loader (any JSON/CSV/MD), failure injector.
- `src/ingest/generic.ts` any file or folder becomes a Case. `cases/sample` + `data/sample` are our synthetic training set; `evals/expected.yaml` the labels.
- `src/service.ts` + `public/board.html` live board and the voice webhook endpoints (demo path only).

## File ownership (streams, see handouts/README.md)
- Orchestrator: `src/schemas/*`, `src/orchestrator/*`, `src/runtime/runAgent.ts`, `src/run.ts`, `src/ingest/*`, `CONTEXT.md`, `MORNING.md`, `TASKS.md`, merges.
- A case state: `src/casefile/*`. B rules: guards in `src/tools/write.ts`, `src/runtime/checks.ts`, `src/runtime/flags.ts`, `src/runtime/rules.ts`. C policy: `src/policies/*`. D eval: `evals/*`, `src/eval.ts`, `src/judge.ts`, `src/runtime/redflags.ts`. E voice and demo: `src/service.ts`, `public/*`, `voice/*`, `demo/*`. F docs: `README.md`, `SUBMISSION.md`, `docs/*`, `scripts/*`.

## Parallel work etiquette
- One stream per directory (see MORNING.md). Do not edit files outside your stream without saying so in your summary.
- Use a git worktree per agent: `git worktree add ../wt-<stream> -b <stream>`. Rebase on main before merging; run the verify block after rebasing.
- Commit small, with messages that say what outcome changed, not what code changed.
