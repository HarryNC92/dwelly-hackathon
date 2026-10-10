/**
 * Stage machine over the organisers' exact system strings (docs/case-breakdown.md section 3, extended with the strings
 * found across the fifty public cases). Every Update/Note/Hold event is classified into a SystemKind; some kinds move the
 * stage, others only annotate. The current stage is the latest decisive event.
 */
import type { HistoryEvent } from "../ingest/dwelly.js";
import type { Stage } from "../schemas/casestate.js";

export type SystemKind =
  | "intake_request" | "intake_classification" | "description_changed"
  | "ll_gate_start" | "ll_wait_3d" | "ll_no_response_3d" | "ll_message_received" | "ll_approved_confirmed"
  | "not_tenanted"
  | "provider_assigned" | "provider_reassigned" | "reminders_3plus" | "resumed_wait_visit"
  | "visit_selected" | "visit_confirmed" | "visit_time_approved" | "visit_rescheduled"
  | "no_results" | "results_present" | "provider_email_unparseable"
  | "quote_approved" | "back_to_start"
  | "moved_to_result" | "marked_completed" | "skipped_docs" | "need_ll_confirmation" | "key_check" | "keys_confirmed" | "closed"
  | "completed_without_payment" | "completed_by_supervisor" | "resolved_no_contractor"
  | "interrupt_response" | "post_closure_message" | "paused_deadline"
  | "hold" | "change_mode" | "manual_update" | "priority_update" | "doc_added" | "text_unavailable"
  | "inspection_results_requested" | "inspection_uploaded"
  | "completed_manual"
  | "unknown_system";

export type Classified = { kind: SystemKind; stage?: Stage; party?: "landlord" | "tenant" | "provider"; date?: string; detail?: string };

/** Exact strings first, then tolerant variants seen in the corpus. Order matters: first match wins. */
const RULES: Array<[RegExp, Classified]> = [
  [/^Request description:/i, { kind: "intake_request", stage: "intake" }],
  [/\[?AI Intake Classification\]?/i, { kind: "intake_classification", stage: "intake" }],
  [/^Changed original task description/i, { kind: "description_changed" }],
  [/^Please complete landlord approval step first/i, { kind: "ll_gate_start", stage: "landlord_gate" }],
  [/^Please approve selection of provider and category/i, { kind: "ll_gate_start", stage: "landlord_gate" }],
  [/^Waiting for landlord\/tenant response before provider selection/i, { kind: "ll_wait_3d", stage: "landlord_gate" }],
  [/^No landlord\/tenant response after \d+ days?\. Please review manually/i, { kind: "ll_no_response_3d", stage: "landlord_gate" }],
  [/^Message received from landlord\/tenant\. Please review and proceed manually/i, { kind: "ll_message_received", stage: "landlord_gate" }],
  [/^Landlord approval confirmed\. Proceed to provider selection/i, { kind: "ll_approved_confirmed", stage: "dispatch" }],
  [/NOT TENANTED/i, { kind: "not_tenanted", stage: "paused_not_tenanted" }],
  [/^Maintenance provider assigned/i, { kind: "provider_assigned", stage: "awaiting_visit_date" }],
  [/^New provider has been assigned/i, { kind: "provider_reassigned", stage: "awaiting_visit_date" }],
  [/^\d\+ reminders have been sent to provider/i, { kind: "reminders_3plus", stage: "awaiting_visit_date" }],
  [/^Resumed auto waiting for provider visit date/i, { kind: "resumed_wait_visit", stage: "awaiting_visit_date" }],
  [/^Visit date selected\s*-\s*(.+)$/im, { kind: "visit_selected", stage: "visit_scheduled" }],
  [/^Task has been moved to Visit date confirmed\/rescheduled\s*-\s*(.+)$/im, { kind: "visit_confirmed", stage: "visit_scheduled" }],
  [/^Visit time approved:\s*(.+)$/im, { kind: "visit_time_approved", stage: "visit_scheduled" }],
  [/^Rescheduled visit time to:\s*(.+)$/im, { kind: "visit_rescheduled", stage: "visit_scheduled" }],
  [/^No work results; we need to check what is happening/i, { kind: "no_results", stage: "awaiting_results" }],
  [/^Work results isset, please select next stage/i, { kind: "results_present", stage: "close_out" }],
  [/^Email received from provider, but expected data could not be extracted/i, { kind: "provider_email_unparseable" }],
  [/^Quote was approved by landlord/i, { kind: "quote_approved", stage: "awaiting_visit_date" }],
  [/^(?:The request was updated to the start stage to arrange a visit|Job was updated to start stage to arrange visit)/i, { kind: "back_to_start", stage: "awaiting_visit_date" }],
  [/^Task has been moved to Result/i, { kind: "moved_to_result", stage: "close_out" }],
  [/^Request marked as completed, lets do the final checks/i, { kind: "marked_completed", stage: "close_out" }],
  [/^Skipped uploading one or more documents/i, { kind: "skipped_docs", stage: "close_out" }],
  [/^Need confirmation from landlord/i, { kind: "need_ll_confirmation", stage: "close_out" }],
  [/^We need to check the key return before completing the request/i, { kind: "key_check", stage: "close_out" }],
  [/^Keys return confirmed/i, { kind: "keys_confirmed", stage: "close_out" }],
  [/^All checks have been completed; the request is now closed/i, { kind: "closed", stage: "completed" }],
  [/^Task has been completed without payment/i, { kind: "completed_without_payment", stage: "completed_without_payment" }],
  [/^Task has been completed by supervisor/i, { kind: "completed_by_supervisor", stage: "completed" }],
  [/^Resolved following instructions\. No contractor required/i, { kind: "resolved_no_contractor", stage: "close_out" }],
  [/^Please check if we need to provide a response to (landlord|tenant|provider)/i, { kind: "interrupt_response" }],
  [/^This task is closed, but we have received an email from the (tenant|landlord|provider|contractor)/i, { kind: "post_closure_message" }],
  [/^Paused automatically: exceeded .* deadline by (\d+) days?/i, { kind: "paused_deadline" }],
  [/^Manually updated via Change Mode/i, { kind: "change_mode" }],
  [/^Manually updated(?: via .*)?$/im, { kind: "manual_update" }],
  [/^Task manager was manually updated/i, { kind: "manual_update" }],
  [/^Task priority was manually updated/i, { kind: "priority_update" }],
  [/^Please add results of inspection/i, { kind: "inspection_results_requested", stage: "awaiting_results" }],
  [/^Inspection document uploaded/i, { kind: "inspection_uploaded", stage: "close_out" }],
  [/^Added document\(s\)/i, { kind: "doc_added" }],
  [/^\[?(?:No )?[Tt]ext\/transcription (?:is )?(?:unavailable|absent|missing|not present|available)/i, { kind: "text_unavailable" }],
];

export function classifySystemEvent(e: HistoryEvent): Classified | undefined {
  if (!["Update", "Note", "Hold"].includes(e.channel)) return undefined;
  const body = e.body.trim();
  if (e.channel === "Hold") return { kind: "hold" };
  for (const [re, c] of RULES) {
    const m = body.match(re);
    if (!m) continue;
    const out: Classified = { ...c };
    if (m[1] && /interrupt_response|post_closure_message/.test(c.kind)) out.party = m[1].toLowerCase().replace("contractor", "provider") as Classified["party"];
    else if (m[1] && /^visit_/.test(c.kind)) out.date = m[1].trim();
    else if (m[1]) out.detail = m[1].trim();
    return out;
  }
  // Agency-written free-text notes that mean the job finished without a system transition.
  if (e.channel === "Update" && /^(?:done complete|complete done|completed?[-.]? ?(?:no further action)?$)/i.test(body)) return { kind: "completed_manual", stage: "completed", detail: body.slice(0, 80) };
  return e.channel === "Update" ? { kind: "unknown_system", detail: body.split("\n")[0].slice(0, 120) } : undefined;
}

export type StageTrace = { n: number; stage: Stage; kind: SystemKind };

/** Latest decisive system event wins. Returns every transition so the rendering can explain the stage. */
export function deriveStage(events: HistoryEvent[]): { stage: Stage; evidenceEventN?: number; transitions: StageTrace[]; closedAtN?: number; unknownStrings: string[] } {
  const transitions: StageTrace[] = [];
  const unknownStrings: string[] = [];
  let closedAtN: number | undefined;
  for (const e of events) {
    const c = classifySystemEvent(e);
    if (!c) continue;
    if (c.kind === "unknown_system" && c.detail) unknownStrings.push(`event ${e.n}: ${c.detail}`);
    if (c.stage) {
      // A closed case stays closed unless a later system event explicitly reopens it (any stage-bearing event after closure counts).
      transitions.push({ n: e.n, stage: c.stage, kind: c.kind });
      if (c.stage === "completed" || c.stage === "completed_without_payment") closedAtN = e.n; else if (closedAtN && e.n > closedAtN) closedAtN = undefined;
    }
  }
  const last = transitions[transitions.length - 1];
  return { stage: last?.stage ?? (events.length ? "intake" : "unknown"), evidenceEventN: last?.n ?? events[0]?.n, transitions, closedAtN, unknownStrings };
}
