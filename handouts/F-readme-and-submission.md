# Stream F: README, submission and runbook (Harry)

## Goal
The repo itself is worth up to 40 of the 70 technical points (the technical evaluation of the submission, separate from the Reality Test results). An independent engineer and a Claude judging agent must understand what we built, why, how to run it, and see evidence of execution, without talking to us.

## Read first
`CONTEXT.md`, `CLAUDE.md`, `ARCHITECTURE.md`, `docs/rules-digest.md` (what the README must contain, sections 1 to 8), `docs/case-breakdown.md`, `README.md` as it stands, `MORNING.md`, one output folder under `out/sample-2/` and one under `out/public-real-2/`.

## You own
`README.md`, `SUBMISSION.md`, `docs/*` (except `case-breakdown.md`, `rules-digest.md`, `triage-rules.md` and the report files in `docs/evidence/`), `scripts/*`, `LICENSE` (verify only), `.gitignore` (verify only).

Hard boundary: nothing under `src/`, `evals/` or `handouts/`. Work on branch `stream/readme`; the orchestrator merges.

## Deliverables
1. `README.md` with the eight required sections written for a reader who has not spoken to us: what we built, the operational problem, architecture (link ARCHITECTURE.md and give the ten-stage pipeline in a paragraph), how to run (install, env, smoke, scenarios, sample run, eval, judge, Reality Test reproduce), models and services with versions, assumptions, limitations, next steps. Plus: a "How to read an answer" section that walks through one real ANSWER.md and REASONING.md, and an "Evidence" section pointing at committed eval and judge reports.
2. `docs/evidence/` already contains the eval, judge and capacity reports from real runs with a README; add a one-paragraph reading of each in the main README's Evidence section (do not alter the reports).
3. `scripts/reality-test.sh` exists; dry-run it against the public cases (`scripts/reality-test.sh "HackatonPublicCases/Property Management" 6` with the commit step disabled by setting a temporary branch) and fix anything that fails; document it in the README.
4. `SUBMISSION.md` filled except the links; a checklist of the submission form fields.
5. Repo hygiene: `git grep` for secrets, no `out/` or `.env` committed, LICENSE present, `pnpm install` from a clean clone works (test in a temp directory).

## Verify
A clean clone in a temp directory: `pnpm install && pnpm smoke && pnpm scenarios` must pass from the README instructions alone.

## Report
Branch `stream/readme`, the clean-clone result, and anything in the README you could not verify.
