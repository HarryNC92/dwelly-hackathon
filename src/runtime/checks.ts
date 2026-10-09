import type { Case } from "../schemas/case.js";
import type { Resolution } from "../schemas/resolution.js";
import type { CaseRun } from "./wrapper.js";
import type { RecordStore } from "../backend/store.js";

const live = (run: CaseRun) => run.staged.filter((a) => a.status === "staged" || a.status === "success");
const DONE_WORDS = /\b(booked|instructed|on (the|their|its) way|will attend|attending|is coming|are coming|has been sent|have been sent|is being sent|dispatched|arranged for|scheduled for|confirmed for|coming (out|today|tonight|tomorrow))\b/i;

/** Deterministic checks on the proposal. Code, so case content cannot argue with it. */
export function runChecks(c: Case, res: Resolution, run: CaseRun): string[] {
  const problems: string[] = [];
  const actions = live(run);
  const text = JSON.stringify(res).toLowerCase();

  const rejected = new Set(res.flagAssessments.filter((a) => a.falsePositive && a.reason.trim().length > 10).map((a) => a.flag));
  for (const f of c.flags) {
    if (rejected.has(f.name) && f.name !== "gas_or_co") continue; // the agent may overrule a pattern match with a reason; gas never
    if (f.minUrgency === "P0" && res.urgency !== "P0") problems.push(`flag ${f.name} requires urgency P0, resolution says ${res.urgency} (mark it a false positive with a reason if the pattern is wrong)`);
    if (f.forcedAction) {
      const mentioned = /0800 111 999|gas emergency|national gas/i.test(JSON.stringify([res, run.staged]));
      if (!mentioned) problems.push(`flag ${f.name} has a forced action that is not reflected anywhere: ${f.forcedAction}`);
    }
    if (f.name === "payment_details_change") {
      for (const a of paymentOffenders(run)) problems.push(`action ${a.actionId} (${a.tool}) appears to confirm or action a payment-details change; it must only be recorded and escalated`);
    }
    if (["legal_threat", "self_harm_language"].includes(f.name) && res.escalation.tier === "none") problems.push(`flag ${f.name} present but no escalation`);
  }

  if (res.urgency === "P0" && res.escalation.tier !== "P0") problems.push("P0 urgency must escalate at tier P0");
  if (res.finalState === "resolved" && run.staged.some((a) => a.status === "unknown")) problems.push("cannot be resolved while a write result is unknown");
  if (res.finalState !== "blocked" && res.finalState !== "escalated" && actions.length === 0 && res.notDone.length === 0 && !/noise|spam|duplicate|no action/.test(text)) {
    problems.push("no actions staged and nothing recorded as deliberately not done; either act, record why not, or escalate");
  }
  if (res.escalation.tier !== "none" && !actions.some((a) => a.tool === "escalate")) problems.push("resolution escalates but no escalate action was staged");
  if (res.escalation.tier !== "none" && !res.escalation.decisionRequired) problems.push("escalation must say what decision a human is required to make");
  const blocked = run.staged.filter((a) => a.status === "blocked" && !/withdrawn/.test(a.error ?? ""));
  if (blocked.length && res.escalation.tier === "none" && !res.notDone.length) problems.push(`blocked actions (${blocked.map((b) => b.tool).join(", ")}) were neither escalated nor recorded as not done`);
  return problems;
}

/**
 * Truthfulness check after execution: the resolution and the outgoing messages must not describe a failed,
 * unknown or blocked action as done. Returns problems; the caller decides whether to revise or to annotate.
 */
export async function claimCheck(res: Resolution, run: CaseRun, store: RecordStore): Promise<string[]> {
  const problems: string[] = [];
  const bad = run.staged.filter((a) => (a.status === "failure" || a.status === "unknown" || (a.status === "blocked" && !/withdrawn/.test(a.error ?? ""))) && ["book_contractor", "create_work_order", "book_inspection"].includes(a.tool));
  const outgoing = run.staged.filter((a) => a.tool === "send_message" && (a.status === "staged" || a.status === "success")).map((a) => String((a.input as any).body ?? ""));
  const corpus = [res.decision, res.summaryForHuman, ...res.communications.map((m) => m.gist), ...outgoing].join("\n");
  for (const a of bad) {
    const id = String((a.input as any).contractor_id ?? "");
    let names = [id].filter(Boolean);
    if (id) { const rec = await store.get("contractors", id).catch(() => null); const n = rec?.data?.name; if (typeof n === "string") names.push(n, n.split(" ")[0]); }
    for (const name of names) {
      const re = new RegExp(`${escapeRe(name)}[^.\\n]{0,120}${DONE_WORDS.source}|${DONE_WORDS.source}[^.\\n]{0,120}${escapeRe(name)}`, "i");
      if (re.test(corpus)) { problems.push(`text describes ${a.tool} with ${name} as done, but its result was ${a.status}${a.error ? ` (${a.error})` : ""}`); break; }
    }
  }
  const anyBookingOk = run.staged.some((a) => a.status === "success" && ["book_contractor", "create_work_order", "book_inspection"].includes(a.tool));
  if (res.finalState === "scheduled" && !anyBookingOk && bad.length) problems.push("final state 'scheduled' but no booking, work order or inspection succeeded");
  return problems;
}

/** Actions that confirm a change of payment details. Used by the checks and to block exactly those actions. */
export function paymentOffenders(run: CaseRun) {
  return live(run).filter((a) => a.tool !== "escalate" && a.tool !== "report_blocker" && /(?<!not )(?<!n't )(?<!never )\b(updated|changed|amended|switched|now (go|be paid|be sent) to|will (be )?(paid|sent) to)\b[^.]{0,60}\b(bank|account|sort code|payment details)\b/i.test(JSON.stringify(a.input)));
}

function escapeRe(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
