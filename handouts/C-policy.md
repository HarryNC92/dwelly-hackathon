# Stream C: agency policy and conventions

## Goal
Make the agent behave like Northbridge Lettings' best property manager on the next step of a case: right stage, right party, right wording, right timing, and the agency's own rules about who pays and who approves. Prompts only, no code.

## Why it matters for the score
The judge compares our next step with what the agency actually did. On the first fifteen public cases we scored 7.3/10 on outcomes, and the recurring verdict was "safe but slower than the agency: asked for more information or escalated where the agency forwarded the quote, instructed the provider, or closed". House style closes that gap.

## Read first
`CONTEXT.md`, `CLAUDE.md`, `docs/case-breakdown.md` (all sections), `src/policies/constraints.md` (every agent gets this; you may edit it carefully), `src/policies/agency.md` if it exists (a first mining pass over the fifty cases; improve it, do not restart), the other policy files, `out/public-real-2-judge.md` and `out/public-real-3-judge.md` (judge verdicts naming what we got wrong), and at least fifteen public cases end to end, prioritising the ones the breakdown cites.

## You own
`src/policies/*.md` only. Keep the total system prompt under about 9,000 words across constraints, agency and one family policy; measure with `wc -w`.

## Deliverables
1. `src/policies/agency.md`: the workflow stages with the exact system strings and what the agent does at each; the landlord's options and how each is handled; who pays, with the breakdown's case citations; timers and what to do when each expires; message templates (tenant, landlord, contractor, SMS) in the agency's voice with the Job Id and address header; noise handling (aliases, wrong addresses, emoji approvals, IVR-only calls, duplicate updates, post-closure messages, intake misclassification); "doing nothing" cases (hold with a date and a reason) and how to express them.
2. `src/policies/constraints.md`: fold in the breakdown's prohibited list as plain rules, and the "separate fact from inference" and "faster safe path" rules already there; remove anything that contradicts the agency's observed behaviour (for example, the agency approves small cleaning estimates itself on agency-initiated jobs).
3. A short `src/policies/README.md` explaining which file does what, so a judge reading the repo sees the policy layer.

## Verify
Run the fifteen-case public set before and after your changes and compare judge scores:
```bash
pnpm cases --cases "HackatonPublicCases/Property Management" --out ./out/policy-1 --numbered --cuts evals/cuts-auto.json --only 001,004,008,010,012,015,019,020,022,030,033,038,041,047,050 --concurrency 6
pnpm judge --out ./out/policy-1 --cases "HackatonPublicCases/Property Management" --cuts evals/cuts-auto.json --after-dir evals/after-auto --report ./out/policy-1-judge.md
```
Baseline is `out/public-real-2-judge.md` (mean outcome 7.3, judgement 7.4). Also `pnpm smoke` (the sample set must not regress: `pnpm cases --cases ./cases/sample --data ./data/sample --out ./out/policy-sample --concurrency 8` then `pnpm eval --out ./out/policy-sample`, baseline 92/100).

## Report
Branch `stream/policy`, before and after judge means, the three verdicts that improved most and the three that got worse, and the word count of the prompt.
