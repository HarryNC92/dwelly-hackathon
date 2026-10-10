# Addendum for sessions 1 and 2: Harry's triage rules

Read `docs/triage-rules.md`. It is a rule set with ids, a precedence order and a default action per rule, derived from the same fifty cases as `docs/case-breakdown.md` and `src/policies/agency.md`. Use it as follows.

Session 1 (state and rules):
- Map its state fields onto `CaseState`. The schema now has `tenantLiability`, `paymentRoute`, `workStatus` and `documents`; everything else was already there under other names (occupancy, landlordApproval, providerAssigned, quotes, holds, timers, keys, dataConflicts, safetySignals).
- Implement the rules in `src/runtime/rules.ts` keyed by these ids (PM-SAFE-001 and so on), in the stated precedence, each returning `{ id, severity: "block" | "warn", defaultAction, reason }`. Guards and checks cite the id in their reason string so it appears in the trace and in REASONING.md.
- Hard stops are only the prohibited behaviours: dispatch or works without approval where approval is required, messages with conflicting property details, tenant details to an unauthorised recipient, financial action without a clear route, closing with an open safety risk, data conflict or open quote. Everything else is a warning the agent must address.

Session 2 (policy):
- Fold the precedence, the default actions and the "safe defaults" into the policy, and have the resolution state the current stage, the blocking rule ids, the evidence relied on and the confidence (the schema has `nextAction` and `rulesApplied` for this).
- Counterweight, from the judge results so far: every miss we have is "too slow": the agency assigns the provider, forwards the quote and acknowledges within minutes whenever approval exists or the job is agency-initiated. The rules are hard stops where they say "do not"; where approval is present, conditional and covered, or the agency is its own approver, the policy must say act now. "no_action_timer_not_expired" is the right answer only when a timer is genuinely running and nothing else is owed to anyone.

Orchestrator: the schema additions, the "Next action" header in ANSWER.md, and rule ids in the judge rubric.
