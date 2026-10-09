import type { Case } from "../schemas/case.js";
import type { Resolution } from "../schemas/resolution.js";
import type { CaseRun } from "./wrapper.js";

/** Deterministic checks on the proposal, before any write executes. Code, so case content cannot argue with it. */
export function runChecks(c: Case, res: Resolution, run: CaseRun): string[] {
  const problems: string[] = [];
  const staged = run.staged.filter((a) => a.status === "staged");
  const text = JSON.stringify(res).toLowerCase();

  for (const f of c.flags) {
    if (f.minUrgency === "P0" && res.urgency !== "P0") problems.push(`flag ${f.name} requires urgency P0, resolution says ${res.urgency}`);
    if (f.forcedAction) {
      const mentioned = /0800 111 999|gas emergency|national gas/i.test(JSON.stringify([res, run.staged]));
      if (!mentioned) problems.push(`flag ${f.name} has a forced action that is not reflected anywhere: ${f.forcedAction}`);
    }
    if (f.name === "payment_details_change" && staged.some((a) => /bank|sort code|account number/i.test(JSON.stringify(a.input)) && a.tool !== "escalate" && a.tool !== "report_blocker")) {
      problems.push("a payment-details change appears to be actioned; it must only be recorded and escalated");
    }
    if (["legal_threat", "self_harm_language"].includes(f.name) && res.escalation.tier === "none") problems.push(`flag ${f.name} present but no escalation`);
  }

  if (res.urgency === "P0" && res.escalation.tier !== "P0") problems.push("P0 urgency must escalate at tier P0");
  if (res.finalState === "resolved" && run.staged.some((a) => a.status === "unknown")) problems.push("cannot be resolved while a write result is unknown");
  if (res.finalState !== "blocked" && res.finalState !== "escalated" && staged.length === 0 && res.notDone.length === 0 && !/noise|spam|duplicate|no action/.test(text)) {
    problems.push("no actions staged and nothing recorded as deliberately not done; either act, record why not, or escalate");
  }
  if (res.escalation.tier !== "none" && !staged.some((a) => a.tool === "escalate")) problems.push("resolution escalates but no escalate action was staged");
  if (res.escalation.tier !== "none" && !res.escalation.decisionRequired) problems.push("escalation must say what decision a human is required to make");
  const blocked = run.staged.filter((a) => a.status === "blocked");
  if (blocked.length && res.escalation.tier === "none" && !res.notDone.length) problems.push(`blocked actions (${blocked.map((b) => b.tool).join(", ")}) were neither escalated nor recorded as not done`);
  return problems;
}
