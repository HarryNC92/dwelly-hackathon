import { z } from "zod";
import type { ToolDef } from "./types.js";

/**
 * Every write is staged at request time and performed only after checks pass.
 * `perform` writes to the record store (and, behind env flags, real transports).
 */
const stamp = (ctx: { caseId: string; now: string }) => ({ case_id: ctx.caseId, created_at: ctx.now, created_by: "agent" });
const rid = (prefix: string, ctx: { caseId: string; actionId?: string }) => `${prefix}-${ctx.caseId}-${(ctx.actionId ?? Date.now().toString(36)).replace(/[^A-Za-z0-9_#-]/g, "")}`;

export const createTicket: ToolDef = {
  name: "create_ticket", kind: "write", risk: "low",
  description: "Open a maintenance or operations ticket against a property.",
  input: z.object({ property_id: z.string(), title: z.string(), category: z.string(), urgency: z.enum(["P0", "P1", "P2"]), description: z.string() }),
  perform: async (i, ctx) => ctx.store.upsert("tickets", rid("T", ctx), { ...i, status: "open", ...stamp(ctx) }),
};

export const updateTicket: ToolDef = {
  name: "update_ticket", kind: "write", risk: "low",
  description: "Update the status of, or add a note to, a ticket or job (use the case's Job Id for the case itself).",
  input: z.object({ ticket_id: z.string().describe("Ticket or job id, e.g. the case's Job Id"), status: z.string().optional(), note: z.string().optional() }),
  perform: async (i, ctx) => {
    const existing = await ctx.store.get("tickets", i.ticket_id);
    if (!existing) return ctx.store.upsert("tickets", i.ticket_id, { status: i.status ?? "open", notes: [{ note: i.note, ...stamp(ctx) }], ...stamp(ctx) }); // the case's own job id, not yet in our store
    const notes = Array.isArray(existing.data.notes) ? existing.data.notes : [];
    return ctx.store.patch("tickets", i.ticket_id, { ...(i.status ? { status: i.status } : {}), notes: [...notes, { note: i.note, ...stamp(ctx) }] });
  },
};

export const createWorkOrder: ToolDef = {
  name: "create_work_order", kind: "write", risk: "high",
  description: "Instruct work on a property. Requires an estimated cost; spend above landlord authority without a recorded approval is refused.",
  input: z.object({ property_id: z.string().describe("Property id, or the address as it appears in the case"), ticket_id: z.string().optional(), contractor_id: z.string().optional().describe("Panel id, or the contractor's name as it appears in the case"), scope: z.string(), estimated_cost_gbp: z.number(), approval_ref: z.string().optional().describe("Id of a landlord_decisions record, or the history event in which the landlord approved (e.g. 'event 006')"), emergency: z.boolean().optional().describe("True only for make-safe work under the landlord's emergency authority"), emergency_justification: z.string().optional() }),
  guard: async (i, ctx) => spendGuard(i.property_id, i.estimated_cost_gbp, i.approval_ref, ctx, i.emergency, i.emergency_justification),
  perform: async (i, ctx) => ctx.store.upsert("work_orders", rid("WO", ctx), { ...i, status: "instructed", ...stamp(ctx) }),
};

export const bookContractor: ToolDef = {
  name: "book_contractor", kind: "write", risk: "high",
  description: "Instruct or book a contractor for a slot or next available visit. Use a panel contractor id when a panel exists; when the case file is the system of record, use the contractor named in the case (id or name) and they count as approved.",
  input: z.object({ contractor_id: z.string().describe("Panel contractor id, or the contractor's name exactly as it appears in the case"), property_id: z.string().describe("Property id, or the address as it appears in the case"), slot: z.string().describe("ISO datetime, window, or 'next available'"), scope: z.string(), estimated_cost_gbp: z.number().optional(), approval_ref: z.string().optional().describe("Id of a landlord_decisions record that approves this spend"), emergency: z.boolean().optional().describe("True only for make-safe work under the landlord's emergency authority"), emergency_justification: z.string().optional() }),
  guard: async (i, ctx) => {
    const c = await ctx.store.get("contractors", i.contractor_id);
    const panelKnown = (await ctx.store.list("contractors", 1)).length > 0;
    if (!c && panelKnown) return `contractor ${i.contractor_id} is not on the approved panel`;
    if (c?.data && (c.data as any).on_panel === false) return `contractor ${i.contractor_id} is marked off-panel`;
    const dnu = c ? await doNotUse(i.property_id, c.data as any, ctx) : null;
    if (dnu) return dnu;
    const cost = i.estimated_cost_gbp ?? Number((c?.data as any)?.callout_gbp ?? (c?.data as any)?.callout ?? NaN);
    return Number.isNaN(cost) ? null : spendGuard(i.property_id, cost, i.approval_ref, ctx, i.emergency, i.emergency_justification);
  },
  perform: async (i, ctx) => {
    const f = ctx.failures.take("book_contractor");
    if (f === "fail") throw new Error("contractor booking rejected: no availability");
    if (f === "unknown") throw new UnknownResult("booking request timed out");
    return ctx.store.upsert("bookings", rid("B", ctx), { ...i, status: "confirmed", ...stamp(ctx) });
  },
};

export const sendMessage: ToolDef = {
  name: "send_message", kind: "write", risk: "low",
  description: "Send a message to a tenant, landlord or contractor. Never commit the landlord to money or a legal position; never share more tenant data than the job needs.",
  input: z.object({ to_party: z.enum(["tenant", "landlord", "contractor", "other"]), to_ref: z.string().describe("Record id or contact as held on file"), channel: z.enum(["email", "sms", "whatsapp", "portal"]), subject: z.string().optional(), body: z.string() }),
  guard: async (i) => /\b((we|the landlord|your landlord) will (pay|refund|compensate|reimburse|reduce)|compensat\w*|rent (reduction|rebate|holiday)|section (8|21)|notice (to quit|seeking possession|to leave)|rent increase|evict\w*|you (must|have to|need to) (leave|move out|vacate))\b/i.test(i.body) ? "message commits the landlord to money or a legal position (compensation, rent change, notices, eviction)" : null,
  perform: async (i, ctx) => {
    const f = ctx.failures.take("send_message");
    if (f === "fail") throw new Error("delivery failed: address rejected");
    if (f === "unknown") throw new UnknownResult("delivery status unknown");
    // Real transports (Twilio/Resend) hang here behind env flags for the demo; default is record-only.
    return ctx.store.upsert("messages", rid("M", ctx), { ...i, status: "sent", ...stamp(ctx) });
  },
};

export const bookInspection: ToolDef = {
  name: "book_inspection", kind: "write", risk: "low",
  description: "Book a compliance inspection (gas safety, EICR, EPC, legionella, fire) with an approved contractor.",
  input: z.object({ property_id: z.string(), inspection_type: z.string(), contractor_id: z.string().optional(), by_date: z.string() }),
  perform: async (i, ctx) => ctx.store.upsert("inspections", rid("I", ctx), { ...i, status: "requested", ...stamp(ctx) }),
};

export const recordLandlordDecision: ToolDef = {
  name: "record_landlord_decision", kind: "write", risk: "low",
  description: "Record a decision the landlord has communicated (approval, refusal, instruction) with its source.",
  input: z.object({ landlord_id: z.string(), decision: z.string(), source: z.string().describe("Where the decision came from, e.g. email dated X") }),
  perform: async (i, ctx) => ctx.store.upsert("landlord_decisions", rid("LD", ctx), { ...i, ...stamp(ctx) }),
};

export const proposeAction: ToolDef = {
  name: "propose_action", kind: "write", risk: "none",
  description: "Record an action that should happen but which you have no tool for (e.g. source a contractor outside the panel, raise an insurance claim). It is never executed by the system; it appears in the answer as a recommended human action.",
  input: z.object({ action_type: z.string(), target: z.string(), parameters: z.string(), rationale: z.string() }),
  perform: async (i, ctx) => ctx.store.upsert("proposed_actions", rid("PA", ctx), { ...i, status: "proposed", ...stamp(ctx) }),
};

export const reportBlocker: ToolDef = {
  name: "report_blocker", kind: "write", risk: "none",
  description: "Record that the case cannot be completed because a capability or piece of information does not exist. Say exactly what was needed and why.",
  input: z.object({ needed: z.string(), why: z.string() }),
  perform: async (i, ctx) => ctx.store.upsert("blockers", rid("BL", ctx), { ...i, ...stamp(ctx) }),
};

export const escalate: ToolDef = {
  name: "escalate", kind: "write", risk: "none",
  description: "Record a handover to a human. P1 = same-day handover to the duty manager. P0 = urgent handover; the runtime pages the on-call manager if paging is configured, otherwise it is a record. Do not tell anyone a call has been made. Always do the safe actions within authority first, then escalate the decision you cannot take.",
  input: z.object({ tier: z.enum(["P1", "P0"]), decision_required: z.string(), summary: z.string(), what_was_tried: z.string(), deadline: z.string().optional() }),
  perform: async (i, ctx) => ctx.store.upsert("escalations", rid("E", ctx), { ...i, status: "open", ...stamp(ctx) }),
};

export const assignProvider: ToolDef = {
  name: "assign_provider", kind: "write", risk: "low",
  description: "The agency's normal dispatch step ('Maintenance provider assigned'): assign the contractor who will attend, by panel id or by the name used in the case, once the landlord gate allows it. This is your job, not a human's; do not propose it for someone else. Follow it with the templated contractor and tenant messages.",
  input: z.object({ provider: z.string().describe("Contractor name as used in the case, or panel id"), trade: z.string().optional(), property: z.string(), scope: z.string(), landlord_approval_ref: z.string().optional().describe("History event or decision id showing approval, or 'conditional: <wording>' or 'not required: <why>'") }),
  perform: async (i, ctx) => ctx.store.upsert("assignments", rid("AS", ctx), { ...i, status: "assigned", ...stamp(ctx) }),
};

export const requestQuote: ToolDef = {
  name: "request_quote", kind: "write", risk: "low",
  description: "Ask a contractor or provider for an estimate for described works (no commitment to spend). Use before instructing work that needs a landlord decision.",
  input: z.object({ contractor_ref: z.string().describe("Contractor id, or name as it appears in the case"), property: z.string(), scope: z.string(), by_date: z.string().optional() }),
  perform: async (i, ctx) => ctx.store.upsert("quotes", rid("Q", ctx), { ...i, status: "requested", ...stamp(ctx) }),
};

export const setHold: ToolDef = {
  name: "set_hold", kind: "write", risk: "none",
  description: "Put the case on hold while waiting for a named party or event (e.g. waiting for landlord approval, waiting for provider quote). Say who you are waiting for and until when.",
  input: z.object({ reason: z.string(), waiting_for: z.enum(["tenant", "landlord", "contractor", "agency", "other"]), until: z.string().optional() }),
  perform: async (i, ctx) => ctx.store.upsert("holds", rid("H", ctx), { ...i, status: "on_hold", ...stamp(ctx) }),
};

export const closeCase: ToolDef = {
  name: "close_case", kind: "write", risk: "low",
  description: "Close the case when the work is genuinely complete and every party has what they need. Not for cases with open questions, unpaid invoices awaiting a decision, or unknown results.",
  input: z.object({ reason: z.string(), outcome: z.string() }),
  guard: async (i) => /unknown|not sure|pending|awaiting|unconfirmed/i.test(i.reason) ? "do not close a case with an unresolved or unknown element; escalate or hold instead" : null,
  perform: async (i, ctx) => ctx.store.upsert("closures", rid("CL", ctx), { ...i, status: "closed", ...stamp(ctx) }),
};

export class UnknownResult extends Error {}

async function doNotUse(propertyId: string, contractor: any, ctx: { store: any }): Promise<string | null> {
  const prop = await ctx.store.get("properties", propertyId).catch(() => null);
  const landlordId = prop?.data?.landlord_id ?? prop?.data?.landlordId;
  const ll = landlordId ? await ctx.store.get("landlords", String(landlordId)).catch(() => null) : null;
  const instr = String(ll?.data?.instructions ?? ll?.data?.notes ?? "");
  const name = String(contractor?.name ?? "");
  const m = instr.match(/do not (use|instruct|send)\s+([^.;\n]+)/i);
  if (m && name && m[2].toLowerCase().includes(name.toLowerCase().split(" ")[0])) return `landlord instruction on file: "${m[0].trim()}"`;
  return null;
}

async function spendGuard(propertyId: string, cost: number, approvalRef: string | undefined, ctx: { store: any }, emergency?: boolean, justification?: string): Promise<string | null> {
  if (approvalRef) {
    if (/^event\s*\d+/i.test(approvalRef)) return null; // approval given in the case history
    const dec = await ctx.store.get("landlord_decisions", approvalRef).catch(() => null);
    if (!dec) return `approval_ref ${approvalRef} does not match a recorded landlord decision or a history event; record the decision (record_landlord_decision) or cite the event, or escalate`;
    return null;
  }
  const prop = await ctx.store.get("properties", propertyId);
  const landlordId = prop?.data?.landlord_id ?? prop?.data?.landlordId;
  const ll = landlordId ? await ctx.store.get("landlords", String(landlordId)) : null;
  const num = (v: unknown) => (v == null || v === "" ? NaN : Number(v));
  const authority = num(ll?.data?.spend_authority_gbp ?? ll?.data?.spendAuthority ?? ll?.data?.authority_limit);
  const emergencyAuthority = num(ll?.data?.emergency_authority_gbp ?? ll?.data?.emergencyAuthority);
  if (emergency) {
    if (!justification) return "emergency spend needs an emergency_justification";
    if (Number.isNaN(emergencyAuthority)) return Number.isNaN(authority) || cost <= authority ? null : `estimated cost £${cost} exceeds landlord authority £${authority} and no emergency authority is on file`;
    return cost <= emergencyAuthority ? null : `estimated cost £${cost} exceeds the landlord's emergency authority £${emergencyAuthority}`;
  }
  if (Number.isNaN(authority)) return null; // unknown authority: the policy decides and the checks record it
  return cost > authority ? `estimated cost £${cost} exceeds landlord authority £${authority}; obtain approval (record_landlord_decision + approval_ref), use emergency=true with a justification if this is make-safe work, or escalate` : null;
}

export const WRITE_TOOLS: ToolDef[] = [createTicket, updateTicket, createWorkOrder, bookContractor, assignProvider, requestQuote, setHold, closeCase, sendMessage, bookInspection, recordLandlordDecision, proposeAction, reportBlocker, escalate];
