# Stream D: eval harness, red-flag linter, judge

## Goal
Give the team a fast, trustworthy scoreboard on the organisers' own data: many decision points per case, a deterministic red-flag linter that also runs inside the pipeline as a final gate, and a judge whose rubric mirrors the breakdown.

## Why it matters for the score
Every prompt or rule change today must be measured, or we will ship regressions at 16:30. The red-flag linter is also a direct line to judgement-and-safety points: it stops a prohibited action before it is written to ANSWERS.

## Read first
`CONTEXT.md`, `CLAUDE.md`, `docs/case-breakdown.md` (sections 3, 6, 7), `evals/cut.ts`, `src/eval.ts`, `src/judge.ts`, `evals/scenarios.mts`, `src/runtime/write.ts` (the ANSWER.md format you will lint), one run under `out/public-real-2/`.

## You own
`evals/*` (except `expected.yaml`), `src/eval.ts`, `src/judge.ts`, `src/runtime/redflags.ts` (new: pure function `lintOutput(input: { caseText, state?, resolution, staged, messagesSent }) => Finding[]` with rule ids matching the breakdown's red-flag list), and the `package.json` script lines for your commands.

## Deliverables
1. Multi-cut decision points: extend `evals/cut.ts` so each case yields several cuts at the breakdown's natural moments (the LL gate, each "Please check if we need to provide a response" interrupt, before dispatch, when a quote arrives, at "No work results", at close-out). Output `evals/cuts-multi.json` as `{ "<caseId>#<cut>": lastEvent }` and teach `src/run.ts`'s consumer nothing new: instead write a small wrapper that materialises each cut as its own case folder under `cases/public-cuts/<caseId>-e<N>/` (index.md and history.md trimmed, attachments copied) so the existing runner works unchanged. Keep the hidden "after" files per cut.
2. The red-flag linter: deterministic findings for each prohibited behaviour in section 6 (dispatch before approval, "no issues" with a defect noted, done without evidence, rent deduction without approval, message to a moved-out tenant, two contractors, tenant details to a third party, wrong address in a message, closing with a safety issue). It reads the resolution, the staged actions and the case state when present. Export it; the orchestrator wires it into the pipeline as a gate.
3. `src/eval.ts`: run the linter over every case in a run and report findings per case alongside the existing checks; add a `--public` mode that scores agreement with the hidden ending on three deterministic axes (same next party contacted, same stage transition, hold vs act) so we get a number without the model judge.
4. `src/judge.ts`: a rubric block built from the breakdown (section 4 rules, section 6 escalation triggers and red flags) added to the system prompt; per-cut scoring; a markdown dashboard that lists the ten worst cuts with the verdicts.

## Verify
`pnpm typecheck && pnpm smoke && pnpm scenarios`; run the linter over `out/public-real-2` and `out/sample-2` and report findings; run the multi-cut materialiser and confirm the runner loads the folders with the mock model (`pnpm cases --cases ./cases/public-cuts --out ./out/cuts-mock --mock-model`).

## Report
Branch `stream/eval`, linter findings on the two existing runs, number of cuts produced, and the commands the team should use from now on.
