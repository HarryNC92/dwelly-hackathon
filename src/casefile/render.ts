/** Compact markdown rendering of a CaseState for the case pack. Only non-empty facts; every claim carries its event number. */
import type { CaseState } from "../schemas/casestate.js";

const fmtTs = (iso?: string) => (iso ? iso.replace("T", " ").replace(/:\d{2}(?:\.\d+)?Z?$/, "").replace(/Z$/, "") + (iso.endsWith("Z") ? " UTC" : "") : "unknown");
const money = (n?: number) => (n === undefined ? "" : `£${n.toLocaleString("en-GB", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`);

export function renderCaseState(s: CaseState): string {
  const L: string[] = [];
  const d = s.difficulty;
  L.push(`- Job ${s.jobId ?? "unknown"} at ${s.propertyAddress ?? "address unknown"}. Occupancy: ${s.occupancy.replace("_", " ")}. Last event: ${fmtTs(s.lastEventTs)}.`);
  L.push(`- Stage: **${s.stage.replace(/_/g, " ")}**${s.stageEvidenceEventN ? ` (from event ${s.stageEvidenceEventN})` : ""}.${s.postClosureMessages ? " Messages arrived after the case was closed." : ""}`);
  if (d) L.push(`- Difficulty: ${d.tier} (${d.score}/10)${d.reasons.length ? `: ${d.reasons.join("; ")}` : ""}.`);
  for (const p of s.parties) {
    const bits = [p.names.length ? p.names.map((n, i) => (i === 0 ? n : `aka ${n}`)).join(", ") : "unnamed"];
    if (p.emails.length) bits.push(p.emails.join(", ")); if (p.phones.length) bits.push(p.phones.join(", "));
    if (p.isAssignedProvider) bits.push("assigned provider"); if (p.isLandlordsOwnContractor) bits.push("landlord's own contractor");
    L.push(`- ${p.role[0].toUpperCase()}${p.role.slice(1)}: ${bits.join(" | ")}`);
  }
  const a = s.landlordApproval;
  L.push(`- Landlord approval: **${a.status.replace(/_/g, " ")}**${a.eventN ? ` (event ${a.eventN})` : ""}${a.text ? `: "${a.text.slice(0, 120)}"` : ""}${a.amountGbp ? ` for ${money(a.amountGbp)}` : ""}${a.conditions ? `. Conditions: ${a.conditions}` : ""}`);
  if (s.providerAssigned) L.push(`- Provider assigned: ${s.providerAssigned.name} (event ${s.providerAssigned.eventN}). Reminders sent: ${s.remindersSent}.`);
  else L.push(`- Provider assigned: none.${s.remindersSent ? ` Reminders sent: ${s.remindersSent}.` : ""}`);
  if (s.quotes.length) L.push(`- Quotes: ${s.quotes.map((q) => `${q.provider} ${money(q.amountGbp)}${q.vat === "plus" ? " +VAT" : q.vat === "inc" ? " inc VAT" : ""} (event ${q.eventN}${q.sentToLandlordEventN ? `, to landlord at ${q.sentToLandlordEventN}` : ""}${q.approvedEventN ? `, approved at ${q.approvedEventN}` : ""}${q.superseded ? ", superseded" : ""})`).join("; ")}`);
  if (s.visit.date) L.push(`- Visit: ${fmtTs(s.visit.date)} as written (event ${s.visit.eventN})${s.visit.confirmedBothSides ? ", confirmed to tenant and provider" : ""}${s.visit.missed ? ", **missed by the provider**" : ""}.`);
  if (s.workResults.present) L.push(`- Work results: event ${s.workResults.eventN}: ${s.workResults.summary ?? ""}`);
  if (s.invoice.present) L.push(`- Invoice: ${money(s.invoice.amountGbp) || "amount unknown"} (event ${s.invoice.eventN})${s.invoice.sentToLandlord ? ", sent to landlord" : ""}${s.invoice.paid ? ", landlord says paid" : ""}.`);
  if (s.keys.issued || s.keys.returned) L.push(`- Keys: ${[s.keys.issued ? "issued" : "", s.keys.returned ? "returned" : s.keys.issued ? "return not confirmed" : ""].filter(Boolean).join(", ")}.`);
  L.push(`- Who pays: ${s.whoPays}${s.paymentRoute !== "unknown" ? ` via ${s.paymentRoute.replace(/_/g, " ")}` : ""}. Tenant liability: ${s.tenantLiability}. Work status: ${s.workStatus.replace(/_/g, " ")}.`);
  if (s.documents.length) L.push(`- Documents: ${s.documents.map((d) => `${d.kind.replace(/_/g, " ")}${d.name ? ` ${d.name}` : ""}${d.eventN ? ` (event ${d.eventN})` : ""}${d.available ? "" : " UNAVAILABLE"}`).join("; ")}`);
  const open = s.holds.filter((h) => !h.released);
  if (open.length) L.push(`- Open hold: ${open.map((h) => `event ${h.eventN}${h.by ? ` by ${h.by}` : ""}, waiting for ${h.waitingFor}: ${h.reason}${h.comment ? ` — ${h.comment.slice(0, 120)}` : ""}`).join("; ")}`);
  else if (s.holds.length) L.push(`- Holds: ${s.holds.length}, none open.`);
  if (s.openInterrupt) L.push(`- Open system prompt: ${s.openInterrupt}`);
  const t = s.timers; const timers: string[] = [];
  const due = (label: string, iso?: string) => { if (!iso) return; const expired = s.lastEventTs && new Date(iso).getTime() < new Date(s.lastEventTs).getTime(); timers.push(`${label} ${fmtTs(iso)}${expired ? " (expired)" : ""}`); };
  due("landlord reply due", t.landlordReplyDue); due("provider visit date due", t.providerVisitDateDue); due("results check due", t.resultsCheckDue); due("close warning due", t.closeWarningDue);
  if (timers.length) L.push(`- Timers: ${timers.join("; ")}.`);
  if (s.lastInbound) L.push(`- Last inbound: event ${s.lastInbound.eventN} ${s.lastInbound.channel} from ${s.lastInbound.from}: "${s.lastInbound.gist}"`);
  if (s.safetySignals.length) L.push(`- Safety signals: ${s.safetySignals.join("; ")}`);
  if (s.dataConflicts.length) L.push(`- Data conflicts (verify before sending anything): ${s.dataConflicts.map((c) => `\n  - ${c}`).join("")}`);
  if (s.offTopic.length) L.push(`- Off-topic or other-property messages: ${s.offTopic.map((c) => `\n  - ${c}`).join("")}`);
  if (s.notes.length) L.push(`- Notes: ${s.notes.map((c) => `\n  - ${c}`).join("")}`);
  return L.join("\n");
}
