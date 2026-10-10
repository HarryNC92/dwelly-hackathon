import type { Case } from "../schemas/case.js";
import type { Resolution } from "../schemas/resolution.js";
import type { CaseRun } from "./wrapper.js";
import type { RecordStore } from "../backend/store.js";

const live = (run: CaseRun) => run.staged.filter((a) => a.status === "staged" || a.status === "success");
const DONE_WORDS = /\b(booked|instructed|on (the|their|its) way|will attend|attending|is coming|are coming|has been sent|have been sent|is being sent|dispatched|arranged for|scheduled for|confirmed for|coming (out|today|tonight|tomorrow))\b/i;
const NEG = /\b(not|no longer|unable|cannot|could not|couldn't|failed|declined|rejected|unavailable|instead|rather than)\b|n't\b/i;
const BOOKING_TOOLS = ["book_contractor", "create_work_order", "book_inspection"];

/** Flags the agent has overruled with a reason. Gas or CO can never be overruled. Flag names are matched loosely. */
export function overruled(c: Case, res: Resolution): Set<string> {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_");
  return new Set(c.flags.filter((f) => f.name !== "gas_or_co" && res.flagAssessments.some((a) => a.falsePositive && a.reason.trim().length >= 5 && norm(a.flag).includes(f.name))).map((f) => f.name));
}

/** Deterministic checks on the proposal. Code, so case content cannot argue with it. */
export function runChecks(c: Case, res: Resolution, run: CaseRun): string[] {
  const problems: string[] = [];
  const actions = live(run);
  const text = JSON.stringify(res).toLowerCase();
  const rejected = overruled(c, res);

  for (const f of c.flags) {
    if (rejected.has(f.name)) continue;
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
  if (c.kind !== "question" && res.finalState !== "blocked" && res.finalState !== "escalated" && actions.length === 0 && res.notDone.length === 0 && !/"family":"noise"|spam|duplicate|no action/.test(text)) {
    problems.push("no actions staged and nothing recorded as deliberately not done; either act, record why not, or escalate");
  }
  if (res.escalation.tier !== "none" && !actions.some((a) => a.tool === "escalate")) problems.push("resolution escalates but no escalate action was staged");
  if (res.finalState === "on_hold" && !actions.some((a) => a.tool === "set_hold")) problems.push("final state on_hold requires a set_hold action naming who is waited on and until when");
  if (res.escalation.tier !== "none" && !res.escalation.decisionRequired) problems.push("escalation must say what decision a human is required to make");
  // A blocked action that the agent then restaged (same tool, later, live) is handled; only unhandled blocks need an explanation.
  const blocked = run.staged.filter((a, i) => a.status === "blocked" && !/withdrawn|superseded/.test(a.error ?? "") && !run.staged.slice(i + 1).some((b) => b.tool === a.tool && (b.status === "staged" || b.status === "success")));
  if (blocked.length && res.escalation.tier === "none" && !res.notDone.length) problems.push(`blocked actions (${blocked.map((b) => b.tool).join(", ")}) were neither escalated nor recorded as not done`);
  return problems;
}

/**
 * Truthfulness check after execution: the resolution and the outgoing messages must not describe a failed,
 * unknown or blocked booking as done, unless the same contractor was successfully booked later.
 */
export async function claimCheck(res: Resolution, run: CaseRun, store: RecordStore): Promise<string[]> {
  const problems: string[] = [];
  const okIds = new Set(run.staged.filter((a) => a.status === "success" && BOOKING_TOOLS.includes(a.tool)).map((a) => String((a.input as any).contractor_id ?? "")));
  const bad = run.staged.filter((a) => BOOKING_TOOLS.includes(a.tool) && (a.status === "failure" || a.status === "unknown" || (a.status === "blocked" && !/withdrawn|superseded|dropped/.test(a.error ?? ""))) && !okIds.has(String((a.input as any).contractor_id ?? "")));
  const outgoing = run.staged.filter((a) => a.tool === "send_message" && (a.status === "staged" || a.status === "success")).map((a) => String((a.input as any).body ?? ""));
  const corpus = [res.decision, res.summaryForHuman, ...res.communications.map((m) => m.gist), ...outgoing].join("\n");
  const sentences = corpus.split(/(?<=[.!?;])\s+|\n+/);
  const hit = (name: string) => { const re = new RegExp(`(?<![\\w-])${escapeRe(name)}(?![\\w-])`, "i"); return sentences.some((s) => !NEG.test(s) && DONE_WORDS.test(s) && re.test(s)); };
  for (const a of bad) {
    const id = String((a.input as any).contractor_id ?? "");
    const names = [id].filter(Boolean);
    if (id) { const rec = await store.get("contractors", id).catch(() => null); const n = rec?.data?.name; if (typeof n === "string" && n.length > 3) names.push(n); }
    for (const name of names) {
      if (hit(name)) { problems.push(`text describes ${a.tool} with ${name} as done, but its result was ${a.status}${a.error ? ` (${a.error})` : ""}`); break; }
    }
  }
  const anyBookingOk = run.staged.some((a) => a.status === "success" && BOOKING_TOOLS.includes(a.tool));
  if (res.finalState === "scheduled" && !anyBookingOk && bad.length) problems.push("final state 'scheduled' but no booking, work order or inspection succeeded");
  return problems;
}

/** Actions that confirm a change of payment details (only outbound or recorded decisions count; a ticket describing the request is fine). */
export function paymentOffenders(run: CaseRun) {
  return live(run).filter((a) => ["send_message", "record_landlord_decision"].includes(a.tool) && /(?<!not )(?<!n't )(?<!never )\b(updated|changed|amended|switched|now (go|be paid|be sent) to|will (be )?(paid|sent) to)\b[^.]{0,60}\b(bank|account|sort code|payment details)\b/i.test(JSON.stringify(a.input)));
}

function escapeRe(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
