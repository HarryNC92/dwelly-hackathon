# Stream B: business rules as deterministic guards and checks

## Goal
Encode the breakdown's business rules (section 4) and red flags (section 6) as code the agent cannot talk its way around: guards inside write tools and checks on the proposed resolution, both reading `CaseState`.

## Why it matters for the score
Judgement and safety (20% of the technical score) and the Best Exception Handling award are scored on exactly these behaviours: not dispatching before landlord approval, not messaging a tenant who moved out, not sending two contractors, not quoting the wrong property, not closing with a safety issue open. Deterministic code is also what makes the "safe escalation" story credible in the README.

## Read first
`CONTEXT.md`, `CLAUDE.md`, `docs/case-breakdown.md` (sections 4, 5, 6), `src/tools/write.ts` (guards live on the tool objects; see `spendGuard`, `doNotUse`, the `send_message` guard), `src/runtime/checks.ts` (`runChecks`, `claimCheck`, `paymentOffenders`), `src/runtime/flags.ts`, `src/schemas/casestate.ts`. The case state will arrive on `ctx.case.state` (the orchestrator adds `case` to `ToolContext`; until then write your guards against an optional `state?: CaseState` argument and keep them no-ops when it is absent).

## You own
`src/tools/write.ts` guard functions and tool descriptions (not the perform bodies), `src/runtime/checks.ts`, `src/runtime/flags.ts`, `src/runtime/rules.ts` (new: pure functions, one per rule, each returning a reason string or null, with a table of rule id, source case numbers and severity).

## Rules to implement (minimum)
Guards (block at staging time, reason returned to the agent):
- Dispatch or work order before landlord approval when `state.landlordApproval.status` is none or pending, unless conditional pre-authorisation covers it (quote the condition). Source 043, 048.
- Second contractor while one is assigned and not released. Source 047.
- Any message to the tenant when `occupancy` is not_tenanted. Source 006.
- A message whose body contains a property address that is not the header address. Source: the wrong-address list.
- Tenant contact details (phone or email) in a message to anyone other than the assigned provider, unless the history shows tenant consent. Source 045.
- Any wording that deducts from rent or commits the landlord to pay without an approval event. Source 013.
- `close_case` while a safety signal is open, while keys are issued and not returned, while landlord confirmation is absent, or while an invoice is referenced but not present. Source: close-out rules.
Checks (on the resolution):
- "Work done" or "completed" claims require `workResults.present`. Source 018, 024.
- A landlord update must not say "no issues" when an inspection attachment or event reports a defect. Source 020 (implement as: if the state notes a defect and the landlord message says no issues).
- Silence rules: landlord no reply for 3 or more days, or 3 or more provider reminders, or a missed visit, require either a chase, a hold with a date, or an escalation; a resolution that does none is rejected.
- A data conflict in `state.dataConflicts` that touches the recipient or the address of any outgoing message requires the message to be held or the conflict resolved explicitly in the decision.
Flags (patterns over the raw text, hints with minimum urgency): door glass may shatter, water near a smoke detector or electrics, scalding, door or window that will not lock or open on an escape route, rotting door, no isolation valves, leak known for more than two weeks (compute from dates when possible).

## Verify
`pnpm typecheck && pnpm smoke && pnpm scenarios`; add scripted scenarios for at least six rules to `evals/scenarios.mts` (the orchestrator will merge; keep them at the bottom of the file in a clearly marked block); then a real run on cut public cases 006, 008, 013, 020, 043, 045, 047, 048 with `pnpm cases -- --cases "HackatonPublicCases/Property Management" --out ./out/rules-1 --numbered --cuts evals/cuts-auto.json --only 006,008,013,020,043,045,047,048` and `pnpm judge` on that output; report the judge delta against `out/public-real-2-judge.md` where the cases overlap.

## Report
Branch `stream/rules`, the rule table, scenario results, judge delta, and any CaseState fields you needed that do not exist.
