/**
 * Business rules as code, keyed by the triage rule ids in docs/triage-rules.md (Harry) and the red flags in
 * docs/case-breakdown.md section 6. Pure functions over CaseState plus the action or resolution under test.
 *
 * Two surfaces:
 *   guardRules(tool, input, state, caseInfo)   -> the first blocking hit, in precedence order, or null (used by write-tool guards)
 *   resolutionRules(state, res, run, caseInfo) -> every hit on a proposed resolution; "block" hits are always problems,
 *                                                "warn" hits are problems only when the resolution does not address them
 * Hard stops are only the prohibited behaviours (addendum): dispatch or works without approval where approval is required,
 * messages with conflicting property details, tenant details to an unauthorised recipient, financial action without a clear
 * route, closing with an open safety risk, data conflict or open quote. Everything else warns.
 */
import type { CaseState } from "../schemas/casestate.js";
import type { Resolution, StagedAction } from "../schemas/resolution.js";

export type Severity = "block" | "warn";
export type RuleHit = { id: string; severity: Severity; defaultAction: string; reason: string };
export type CaseInfo = { channel?: string; now?: string };
type Run = { staged: StagedAction[] };

export const RULE_TABLE: { id: string; precedence: number; title: string; severity: Severity; sources: string }[] = [
  { id: "PM-SAFE-001", precedence: 1, title: "Safety overrides routine workflow", severity: "warn", sources: "014, 015, 023, 031, 034, 035, 040, 044" },
  { id: "PM-SAFE-002", precedence: 1, title: "Do not close with an unresolved safety risk", severity: "block", sources: "breakdown §6" },
  { id: "PM-DATA-001", precedence: 2, title: "Property identity conflicts block outbound messages", severity: "block", sources: "005, 006, 008, 009, 015, 022, 028, 032-034, 037, 038, 045, 048" },
  { id: "PM-DATA-002", precedence: 2, title: "Actor identity conflicts must be resolved before relying on a recipient", severity: "warn", sources: "001, 002, 025, 026, 032, 043, 050" },
  { id: "PM-DATA-003", precedence: 2, title: "Date and amount conflicts block automatic approval, closure or payment", severity: "warn", sources: "019, 039, 043, 050" },
  { id: "PM-PRIV-001", precedence: 2, title: "Tenant contact details only to the assigned contractor, or with consent", severity: "block", sources: "045" },
  { id: "PM-OCC-001", precedence: 3, title: "Not tenanted: no tenant messages or access requests", severity: "block", sources: "006" },
  { id: "PM-AUTH-001", precedence: 4, title: "Landlord approval before provider dispatch", severity: "block", sources: "043, 048" },
  { id: "PM-AUTH-002", precedence: 4, title: "Quote approval before quoted works", severity: "block", sources: "008, 019" },
  { id: "PM-AUTH-003", precedence: 4, title: "Conditional approval is narrow", severity: "warn", sources: "043" },
  { id: "PM-AUTH-004", precedence: 4, title: "Respect the landlord's chosen route", severity: "block", sources: "001, 015, 028, 041, 045, 047, 014, 017, 035, 038, 049" },
  { id: "PM-AUTH-005", precedence: 4, title: "One provider per job", severity: "block", sources: "047 (breakdown §6)" },
  { id: "PM-LIAB-001", precedence: 5, title: "Likely tenant liability: warn or ask before a chargeable visit", severity: "warn", sources: "004, 006, 008, 009, 012, 027, 029, 038" },
  { id: "PM-LIAB-002", precedence: 5, title: "Payment route explicit before financial action", severity: "block", sources: "013" },
  { id: "PM-WORKFLOW-002", precedence: 6, title: "Expired landlord or tenant timer needs a chase, a dated hold or an escalation", severity: "block", sources: "011, 016, 019" },
  { id: "PM-WORKFLOW-003", precedence: 6, title: "Provider silence after repeated reminders needs review", severity: "block", sources: "018, 030, 047" },
  { id: "PM-WORKFLOW-004", precedence: 6, title: "Missed visits are never complete", severity: "block", sources: "030" },
  { id: "PM-DOC-001", precedence: 7, title: "Completion requires evidence", severity: "block", sources: "018, 020, 024" },
  { id: "PM-KEY-001", precedence: 7, title: "Key return confirmed before closing", severity: "block", sources: "022, 043" },
  { id: "PM-CLOSE-001", precedence: 7, title: "Close-out requirements", severity: "block", sources: "003, 008, 027" },
];

export const formatHit = (h: RuleHit) => `[${h.id}] ${h.reason} Default: ${h.defaultAction}.`;

const DISPATCH_TOOLS = new Set(["assign_provider", "book_contractor", "create_work_order"]);
const ADDRESS_RE = /(?:Flat\s+\d+[A-Za-z]?,\s*)?\d+[A-Za-z]?\s+[A-Z][A-Za-z']+(?:\s+[A-Z][A-Za-z']+){0,3},\s*[A-Z][A-Za-z']+,\s*[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/g;
const normAddr = (a: string) => a.toLowerCase().replace(/\s+/g, " ").replace(/[.;:]+$/, "").trim();
const normPhone = (p: string) => p.replace(/\D/g, "").replace(/^44/, "0");
const tokens = (n: string) => new Set(n.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2));
const related = (a: string, b: string) => { const tb = tokens(b); for (const t of tokens(a)) if (tb.has(t)) return true; return false; };
const text = (i: unknown) => JSON.stringify(i ?? "");
const agencyInitiated = (info?: CaseInfo) => /agency|manager|staff|internal/i.test(info?.channel ?? "");
const RENT_DEDUCTION = /\b(?:deduct(?:ed|ing|ion)?\b[^.]{0,40}\brent|rent deduction|take (?:it |this )?(?:out of|from) (?:the |your )?rent|offset(?:ting)? against (?:the )?rent|withhold(?:ing)? (?:from )?(?:the )?rent)/i;
const DEFINITE_CHARGE = /\b(?:you will be (?:charged|billed|invoiced|liable)|we will (?:charge|bill|invoice) you|the tenant will be (?:charged|billed)|charged to (?:you|the tenant)\b(?! if)|will be deducted from (?:your|the) deposit)/i;
const INVOICE_US = /\b(?:invoice (?:us|the agency|northbridge)|send (?:the|your) invoice to (?:us|the agency)|we will (?:pay|settle) (?:the|your) invoice|the landlord will pay)\b/i;
const NO_ISSUES = /\b(?:no (?:issues|problems|defects|concerns|damage)|all (?:fine|good|ok|in order)|nothing to report|in good (?:order|condition))\b/i;
const DONE_CLAIM = /\b(?:has been (?:completed|repaired|fixed|replaced|resolved)|have been (?:completed|repaired|fixed|replaced)|work (?:is|was) (?:done|complete|completed)|works? (?:are|is) (?:now )?complete|job (?:is )?(?:done|complete|completed)|repair (?:is |was )?(?:complete|completed|done)|(?:is|was|been) (?:now )?fixed|issue (?:is|has been) resolved)\b/i;
const NOT_CLAIM = /\b(?:once|when|after|if|will|until|should|not|hasn'?t|has not|yet to|awaiting|confirm(?:ed)? (?:that|whether)|reports? that|says?|said|claims?|told us|let us know|informed us|advised(?: us)?|according to|states?|(?:tenant|landlord|contractor|provider)s? (?:has |have )?(?:said|says|reported|confirmed|advised|let|told|mentioned))\b/i;

function consentOnFile(state: CaseState): boolean {
  const corpus = [...state.notes, ...state.holds.map((h) => `${h.reason} ${h.comment ?? ""}`), state.landlordApproval.text ?? ""].join("\n");
  return /consent|authoris(?:ed|ation) to (?:pass|share)|happy for (?:you|us) to (?:share|pass)|gave (?:permission|authorisation)|permission to (?:share|pass)/i.test(corpus);
}
function tenantContacts(state: CaseState): string[] {
  const t = state.parties.filter((p) => p.role === "tenant");
  return [...t.flatMap((p) => p.phones.map(normPhone)), ...t.flatMap((p) => p.emails.map((e) => e.toLowerCase()))].filter((x) => x.length > 5);
}
function providerName(input: any): string { return String(input?.provider ?? input?.contractor_id ?? input?.contractor_ref ?? ""); }
function isKnownContractor(state: CaseState, name: string): boolean {
  const c = state.parties.filter((p) => p.role === "contractor").flatMap((p) => p.names);
  return !!name && (c.some((n) => related(n, name)) || (!!state.providerAssigned && related(state.providerAssigned.name, name)));
}
function partyConflicts(state: CaseState, role: "tenant" | "landlord" | "contractor"): string[] { return state.dataConflicts.filter((c) => new RegExp(`^${role}\\b`, "i").test(c)); }
const expired = (iso: string | undefined, now: string | undefined) => !!iso && !!now && new Date(iso).getTime() < new Date(now).getTime();

/** First blocking rule for a staged write, in precedence order. Returns null when the action is allowed. */
export function guardRules(tool: string, input: any, state: CaseState | undefined, info: CaseInfo = {}): RuleHit | null {
  if (!state) return null;
  const body = String(input?.body ?? "");
  const refText = `${input?.landlord_approval_ref ?? ""} ${input?.approval_ref ?? ""} ${input?.scope ?? ""} ${input?.emergency_justification ?? ""}`;
  const emergency = input?.emergency === true && state.safetySignals.length > 0 && !!input?.emergency_justification;

  // 2 data conflicts and privacy
  if (tool === "send_message") {
    if (state.propertyAddress) {
      const ref = normAddr(state.propertyAddress);
      const wrong = [...body.matchAll(ADDRESS_RE)].map((m) => m[0]).filter((a) => normAddr(a) !== ref);
      if (wrong.length) return { id: "PM-DATA-001", severity: "block", defaultAction: "escalate_human_review", reason: `message quotes "${wrong[0]}" but this case is ${state.propertyAddress}.` };
    }
    const contacts = tenantContacts(state);
    const leaks = contacts.filter((c) => (c.includes("@") ? body.toLowerCase().includes(c) : normPhone(body).includes(c)));
    if (leaks.length) {
      const consent = consentOnFile(state);
      if (input?.to_party !== "contractor") return { id: "PM-PRIV-001", severity: "block", defaultAction: "message_tenant", reason: `message to ${input?.to_party} contains the tenant's contact details (${leaks.join(", ")}); tenant details go only to the assigned contractor${consent ? "" : " or with the tenant's consent"}.` };
      if (state.landlordApproval.status === "own_contractor" && !consent) return { id: "PM-PRIV-001", severity: "block", defaultAction: "message_tenant", reason: `the landlord is using their own contractor and the tenant has not consented to their details being shared; ask the tenant first.` };
    }
  }
  // 3 occupancy
  if (tool === "send_message" && input?.to_party === "tenant" && state.occupancy === "not_tenanted") {
    return { id: "PM-OCC-001", severity: "block", defaultAction: "hold_waiting_for_landlord", reason: `the property is recorded as not tenanted; do not message a tenant or ask for access. Use the agency access path or the landlord.` };
  }
  // 4 landlord authority
  if (DISPATCH_TOOLS.has(tool)) {
    const a = state.landlordApproval;
    const name = providerName(input);
    const continuing = !!state.providerAssigned && related(state.providerAssigned.name, name);
    const routeOwner = ["own_contractor", "tenant_to_fix", "landlord_self_fix"].includes(a.status);
    if (routeOwner && !emergency && !(a.status === "own_contractor" && isKnownContractor(state, name) && state.parties.some((p) => p.role === "contractor" && p.isLandlordsOwnContractor)) && !/landlord (?:now |has )?(?:asked|wants|agreed|changed|instructed)|route changed/i.test(refText)) {
      return { id: "PM-AUTH-004", severity: "block", defaultAction: a.status === "own_contractor" ? "hold_waiting_for_provider" : "hold_waiting_for_tenant", reason: `the landlord's route is ${a.status.replace(/_/g, " ")} (event ${a.eventN ?? "?"}: "${(a.text ?? "").slice(0, 100)}"); do not dispatch an agency provider. Coordinate that route or cite the landlord's change of instruction in the approval reference.` };
    }
    if (state.stage === "quote_loop" && tool !== "assign_provider" && !emergency) {
      const q = state.quotes.filter((x) => x.sentToLandlordEventN !== undefined).pop();
      return { id: "PM-AUTH-002", severity: "block", defaultAction: "hold_waiting_for_landlord", reason: `a quote${q ? ` (${q.provider} £${q.amountGbp}${q.vat === "plus" ? " +VAT" : ""}, sent at event ${q.sentToLandlordEventN})` : ""} is with the landlord and not yet approved; works cannot be instructed. Attendance to triage is not approval for the works.` };
    }
    if (["none", "pending", "declined"].includes(a.status) && !emergency && !agencyInitiated(info) && !continuing) {
      const detail = a.status === "declined" ? `the landlord declined (event ${a.eventN})` : a.status === "pending" ? `landlord approval is pending${a.eventN ? ` since event ${a.eventN}` : ""}${state.timers.landlordReplyDue ? `, reply due ${state.timers.landlordReplyDue.slice(0, 16)}` : ""}` : "no landlord approval is recorded in the case";
      return { id: "PM-AUTH-001", severity: "block", defaultAction: a.status === "pending" && !expired(state.timers.landlordReplyDue, info.now) ? "no_action_timer_not_expired" : "request_landlord_approval", reason: `${detail}; ${tool} is dispatch and needs it first. Approval may be a landlord message or the system line "Landlord approval confirmed".` };
    }
    if (a.status === "conditional" && tool === "create_work_order" && /\b(?:part|parts|replace|replacement|new |supply|install|motor|pump|board|unit)\b/i.test(String(input?.scope ?? ""))) {
      return { id: "PM-AUTH-003", severity: "block", defaultAction: "request_quote", reason: `the landlord's approval is conditional ("${(a.conditions ?? a.text ?? "").slice(0, 120)}") and this scope involves parts or replacement; obtain a quote or fresh approval first.` };
    }
    if (tool !== "create_work_order" && state.providerAssigned && !continuing && state.workStatus !== "work_completed" && !/\b(?:second|comparison|another|alternative|additional) (?:quote|estimate)|reassign|replac(?:e|ing) (?:the )?(?:provider|contractor)|instead of|released|stood down|no longer attending/i.test(refText)) {
      return { id: "PM-AUTH-005", severity: "block", defaultAction: "message_provider", reason: `${state.providerAssigned.name} is already assigned to this job (event ${state.providerAssigned.eventN}) and the work is not complete; a second contractor is not sent for the same job. Chase or release the assigned provider first, or say in the scope that this is a comparison quote or a replacement.` };
    }
  }
  // 5 payment route
  if (tool === "send_message" || tool === "record_landlord_decision" || tool === "update_ticket") {
    const t = `${body} ${input?.decision ?? ""} ${input?.note ?? ""}`;
    const llSaidRent = /rent/i.test(`${state.landlordApproval.text ?? ""} ${state.notes.join(" ")}`) || state.paymentRoute === "landlord_rent_deduction";
    if (RENT_DEDUCTION.test(t) && !(state.landlordApproval.status === "approved" && llSaidRent)) return { id: "PM-LIAB-002", severity: "block", defaultAction: "message_landlord", reason: `the text deducts from rent but the landlord has not approved that route in this case; a rent deduction needs the landlord's explicit instruction.` };
    if (DEFINITE_CHARGE.test(t) && state.tenantLiability !== "yes" && state.paymentRoute !== "tenant_chargeable") return { id: "PM-LIAB-002", severity: "block", defaultAction: "message_tenant", reason: `the text tells the tenant they will be charged, but tenant liability is ${state.tenantLiability} in the case; warn of a possible charge or ask, do not bill.` };
    if (INVOICE_US.test(t) && state.paymentRoute === "unknown" && state.landlordApproval.status !== "approved") return { id: "PM-LIAB-002", severity: "block", defaultAction: "message_landlord", reason: `the text commits to paying or receiving the invoice but no payment route or landlord approval is recorded.` };
  }
  // 7 close-out
  if (tool === "close_case") {
    const words = `${input?.reason ?? ""} ${input?.outcome ?? ""}`;
    const partyish = state.dataConflicts.filter((c) => /^(?:address|tenant|landlord)\b/i.test(c));
    if (state.safetySignals.length && state.workStatus !== "work_completed" && !/safety (?:issue|risk|signal)[^.]{0,60}(?:resolved|closed|false positive|not present)/i.test(words)) return { id: "PM-SAFE-002", severity: "block", defaultAction: "escalate_human_review", reason: `safety signal open (${state.safetySignals[0]}) and no completed work is recorded.` };
    if (partyish.length && !/conflict/i.test(words)) return { id: "PM-CLOSE-001", severity: "block", defaultAction: "escalate_human_review", reason: `an unresolved data conflict remains (${partyish[0].slice(0, 100)}); resolve it or say in the close reason how it was resolved.` };
    if (state.stage === "quote_loop") return { id: "PM-CLOSE-001", severity: "block", defaultAction: "hold_waiting_for_landlord", reason: `a quote is with the landlord and undecided; the case cannot close.` };
    if (state.keys.issued && !state.keys.returned && !/keys? (?:returned|back|received)/i.test(words)) return { id: "PM-KEY-001", severity: "block", defaultAction: "message_provider", reason: `keys were issued for this job and their return is not confirmed.` };
    const evidenced = state.workResults.present || state.workStatus === "work_completed" || ["tenant_to_fix", "landlord_self_fix", "own_contractor"].includes(state.landlordApproval.status) || ["close_out", "completed", "completed_without_payment"].includes(state.stage);
    if (!evidenced) return { id: "PM-DOC-001", severity: "block", defaultAction: "message_provider", reason: `no completion evidence in the case (stage ${state.stage.replace(/_/g, " ")}, work status ${state.workStatus.replace(/_/g, " ")}); closing needs a completion report, invoice, photos or a party's confirmation.` };
    if (state.invoice.present && !state.documents.some((d) => d.kind === "invoice" && d.available) && !/invoice/i.test(words)) return { id: "PM-CLOSE-001", severity: "block", defaultAction: "message_provider", reason: `an invoice is referenced (event ${state.invoice.eventN}) but not on file; obtain it or record why it is skipped in the close reason.` };
    if (!agencyInitiated(info) && ["none", "pending"].includes(state.landlordApproval.status) && state.whoPays === "landlord" && !/landlord (?:confirmed|confirmation|informed|notified|agreed)/i.test(words)) return { id: "PM-CLOSE-001", severity: "block", defaultAction: "message_landlord", reason: `the landlord pays and has not confirmed; closing needs landlord confirmation or a recorded reason.` };
  }
  return null;
}

/** Rule hits on a proposed resolution. Blocks are always problems; warns are problems unless addressed. */
export function resolutionRules(state: CaseState | undefined, res: Resolution, run: Run, info: CaseInfo = {}): RuleHit[] {
  if (!state) return [];
  const hits: RuleHit[] = [];
  const live = run.staged.filter((a) => a.status === "staged" || a.status === "success");
  const has = (tool: string, pred: (i: any) => boolean = () => true) => live.some((a) => a.tool === tool && pred(a.input));
  const outgoing = live.filter((a) => a.tool === "send_message");
  const addressed = (id: string, re: RegExp) => (res.rulesApplied ?? []).some((r) => r.toUpperCase().includes(id)) || re.test(`${res.decision} ${res.notDone.map((n) => `${n.action} ${n.reason}`).join(" ")} ${res.conflicts.map((c) => `${c.facts} ${c.resolution}`).join(" ")} ${res.missingInformation.join(" ")}`);
  const now = info.now ?? state.lastEventTs;

  // 1 safety
  if (state.safetySignals.length && state.workStatus !== "work_completed") {
    const acted = res.escalation.tier !== "none" || res.urgency !== "P2" || has("book_contractor") || has("assign_provider") || has("create_work_order");
    if (!acted && !addressed("PM-SAFE-001", /safety|hazard|risk|urgent|not dangerous|no (?:immediate )?danger/i)) hits.push({ id: "PM-SAFE-001", severity: "warn", defaultAction: "escalate_safety", reason: `safety signals present (${state.safetySignals.slice(0, 2).join("; ")}) but the resolution neither raises urgency, dispatches nor escalates, and does not say why.` });
    if (["resolved", "closed_no_action"].includes(res.finalState) && !addressed("PM-SAFE-002", /safety (?:issue|risk|signal)[^.]{0,60}(?:resolved|false positive|not present|no longer)/i)) hits.push({ id: "PM-SAFE-002", severity: "block", defaultAction: "escalate_human_review", reason: `final state ${res.finalState} with a safety signal open (${state.safetySignals[0]}).` });
  }
  // 2 data conflicts
  for (const role of ["tenant", "landlord"] as const) {
    const conf = partyConflicts(state, role);
    if (conf.length && outgoing.some((a) => (a.input as any).to_party === role) && !addressed("PM-DATA-002", new RegExp(`${role}[^.]{0,80}(?:name|phone|conflict|differ|two|which)|conflict[^.]{0,80}${role}`, "i")) && res.conflicts.length === 0) {
      hits.push({ id: "PM-DATA-002", severity: "warn", defaultAction: "request_clarification", reason: `${conf[0].slice(0, 140)}; a message to the ${role} is staged without the conflict being weighed in \`conflicts\` or the decision.` });
    }
  }
  const dateAmount = state.dataConflicts.filter((c) => /^(?:"|quote from|invoice at|visit date|case header|£)/i.test(c));
  if (dateAmount.length && (has("close_case") || has("create_work_order") || res.finalState === "resolved") && !addressed("PM-DATA-003", /date|amount|vat|quote[^.]{0,40}(?:changed|differ)|invoice[^.]{0,40}(?:before|predates)/i)) {
    hits.push({ id: "PM-DATA-003", severity: "warn", defaultAction: "escalate_human_review", reason: `date or amount conflict (${dateAmount[0].slice(0, 120)}) with a closure, work order or resolved state; weigh it explicitly.` });
  }
  // 4 authority
  if (state.landlordApproval.status === "conditional" && has("create_work_order") && !addressed("PM-AUTH-003", /conditional|easy and cheap|simple|low.?cost|within the condition/i)) {
    hits.push({ id: "PM-AUTH-003", severity: "warn", defaultAction: "request_quote", reason: `work order under a conditional approval ("${(state.landlordApproval.conditions ?? "").slice(0, 100)}"); state that the scope is within the condition.` });
  }
  // 5 liability
  if (state.tenantLiability === "yes" && (has("assign_provider") || has("book_contractor")) && !outgoing.some((a) => (a.input as any).to_party === "tenant" && /charge|cost|bill|liab|responsib|pay/i.test(String((a.input as any).body))) && !addressed("PM-LIAB-001", /tenant[^.]{0,60}(?:liab|responsib|charge|cost)/i)) {
    hits.push({ id: "PM-LIAB-001", severity: "warn", defaultAction: "message_tenant", reason: `the case points to tenant liability, and a contractor is being sent without the tenant being told of the possible charge.` });
  }
  // 6 workflow and timers
  const chased = outgoing.length > 0 || has("escalate") || has("set_hold", (i) => !!i.until) || has("assign_provider") || has("book_contractor") || has("request_quote");
  if (expired(state.timers.landlordReplyDue, now) && state.landlordApproval.status === "pending" && !chased) hits.push({ id: "PM-WORKFLOW-002", severity: "block", defaultAction: "message_landlord", reason: `the landlord has not replied and the 3-day timer expired at ${state.timers.landlordReplyDue!.slice(0, 16)}; a chase, a dated hold or an escalation is required. Silence is not approval.` });
  if (state.remindersSent >= 3 && !state.visit.date && state.workStatus !== "work_completed" && !chased) hits.push({ id: "PM-WORKFLOW-003", severity: "block", defaultAction: "escalate_human_review", reason: `${state.remindersSent} reminders have gone to the provider with no visit date; chase by another channel, reassign or escalate rather than wait.` });
  if (state.visit.missed) {
    if (!chased) hits.push({ id: "PM-WORKFLOW-004", severity: "block", defaultAction: "message_provider", reason: `the provider missed the confirmed visit; chase the provider and update the tenant, or escalate.` });
    if (["resolved", "closed_no_action"].includes(res.finalState) || has("close_case")) hits.push({ id: "PM-WORKFLOW-004", severity: "block", defaultAction: "message_provider", reason: `a missed visit is never marked complete.` });
  }
  // 7 documents and completion claims
  if (!state.workResults.present && state.workStatus !== "work_completed") {
    const corpus = [res.decision, res.summaryForHuman, ...res.communications.map((c) => c.gist), ...outgoing.map((a) => String((a.input as any).body ?? ""))].join("\n");
    const claim = corpus.split(/(?<=[.!?])\s+|\n+/).find((s) => DONE_CLAIM.test(s) && !NOT_CLAIM.test(s));
    if (claim) hits.push({ id: "PM-DOC-001", severity: "block", defaultAction: "message_provider", reason: `the text says the work is done ("${claim.trim().slice(0, 100)}") but the case holds no work results or completion evidence.` });
  }
  const defect = state.safetySignals.length > 0 || state.documents.some((d) => d.kind === "inspection_report") || state.notes.some((n) => /defect|damage|fault/i.test(n));
  if (defect && outgoing.some((a) => (a.input as any).to_party === "landlord" && NO_ISSUES.test(String((a.input as any).body)))) hits.push({ id: "PM-DOC-001", severity: "block", defaultAction: "message_landlord", reason: `a landlord message says there are no issues while the case records a defect, safety signal or inspection report.` });
  return hits;
}
