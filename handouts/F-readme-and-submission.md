# Stream F: README, submission and runbook (Harry)

## Goal
The repo itself is worth up to 40 of the 70 technical points (the technical evaluation of the submission, separate from the Reality Test results). An independent engineer and a Claude judging agent must understand what we built, why, how to run it, and see evidence of execution, without talking to us.

## Read first
`CONTEXT.md`, `CLAUDE.md`, `ARCHITECTURE.md`, `docs/rules-digest.md` (what the README must contain, sections 1 to 8), `docs/case-breakdown.md`, `README.md` as it stands, `MORNING.md`, one output folder under `out/sample-2/` and one under `out/public-real-2/`.

## You own
`README.md`, `SUBMISSION.md`, `docs/*` (except `case-breakdown.md` and `rules-digest.md`), `scripts/*` (new), `LICENSE` (verify only), `.gitignore` (verify only).

## Deliverables
1. `README.md` with the eight required sections written for a reader who has not spoken to us: what we built, the operational problem, architecture (link ARCHITECTURE.md and give the ten-stage pipeline in a paragraph), how to run (install, env, smoke, scenarios, sample run, eval, judge, Reality Test reproduce), models and services with versions, assumptions, limitations, next steps. Plus: a "How to read an answer" section that walks through one real ANSWER.md and REASONING.md, and an "Evidence" section pointing at committed eval and judge reports.
2. `docs/evidence/`: copy the eval and judge reports from the runs the orchestrator names (do not fabricate), with a one-paragraph note on each.
3. `scripts/reality-test.sh`: the 16:30 runbook as a script: pull the organisers' repo, print the challenge folder layout and one index head, run with `--numbered --deadline 22`, commit `ANSWERS/` only, print the commit hash. Dry-run it against the public cases.
4. `SUBMISSION.md` filled except the links; a checklist of the submission form fields.
5. Repo hygiene: `git grep` for secrets, no `out/` or `.env` committed, LICENSE present, `pnpm install` from a clean clone works (test in a temp directory).

## Verify
A clean clone in a temp directory: `pnpm install && pnpm smoke && pnpm scenarios` must pass from the README instructions alone.

## Report
Branch `stream/readme`, the clean-clone result, and anything in the README you could not verify.
