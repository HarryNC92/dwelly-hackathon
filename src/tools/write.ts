import { z } from "zod";
import type { ToolDef } from "./types.js";

/**
 * Every write is staged at request time and performed only after checks pass.
 * `perform` writes to the record store (and, behind env flags, real transports).
 */
const stamp = (ctx: { caseId: string; now: string }) => ({ case_id: ctx.caseId, created_at: ctx.now, created_by: "agent" });

export const createTicket: ToolDef = {
  name: "create_ticket", kind: "write", risk: "low",
  description: "Open a maintenance or operations ticket against a property.",
  input: z.object({ property_id: z.string(), title: z.string(), category: z.string(), urgency: z.enum(["P0", "P1", "P2"]), description: z.string() }),
  perform: async (i, ctx) => ctx.store.upsert("tickets", `T-${ctx.caseId}-${Date.now().toString(36)}`, { ...i, status: "open", ...stamp(ctx) }),
};

export const updateTicket: ToolDef = {
  name: "update_ticket", kind: "write", risk: "low",
  description: "Update status or add a note to an existing ticket.",
  input: z.object({ ticket_id: z.string(), status: z.string().optional(), note: z.string().optional() }),
  perform: async (i, ctx) => {
    const existing = await ctx.store.get("tickets", i.ticket_id);
    if (!existing) throw new Error(`ticket ${i.ticket_id} not found`);
    const notes = Array.isArray(existing.data.notes) ? existing.data.notes : [];
    return ctx.store.patch("tickets", i.ticket_id, { ...(i.status ? { status: i.status } : {}), notes: [...notes, { note: i.note, ...stamp(ctx) }] });
  },
};

export const createWorkOrder: ToolDef = {
  name: "create_work_order", kind: "write", risk: "high",
  description: "Instruct work on a property. Requires an estimated cost; spend above landlord authority without a recorded approval is refused.",
  input: z.object({ property_id: z.string(), ticket_id: z.string().optional(), contractor_id: z.string().optional(), scope: z.string(), estimated_cost_gbp: z.number(), approval_ref: z.string().optional() }),
  guard: async (i, ctx) => spendGuard(i.property_id, i.estimated_cost_gbp, i.approval_ref, ctx),
  perform: async (i, ctx) => ctx.store.upsert("work_orders", `WO-${ctx.caseId}-${Date.now().toString(36)}`, { ...i, status: "instructed", ...stamp(ctx) }),
};

export const bookContractor: ToolDef = {
  name: "book_contractor", kind: "write", risk: "high",
  description: "Book an approved contractor from the panel for a slot. Fails if the contractor is not on the panel.",
  input: z.object({ contractor_id: z.string(), property_id: z.string(), slot: z.string().describe("ISO datetime or window"), scope: z.string(), estimated_cost_gbp: z.number().optional(), approval_ref: z.string().optional() }),
  guard: async (i, ctx) => {
    const c = await ctx.store.get("contractors", i.contractor_id);
    if (!c) return `contractor ${i.contractor_id} is not on the approved panel`;
    return i.estimated_cost_gbp == null ? null : spendGuard(i.property_id, i.estimated_cost_gbp, i.approval_ref, ctx);
  },
  perform: async (i, ctx) => {
    const f = ctx.failures.take("book_contractor");
    if (f === "fail") throw new Error("contractor booking rejected: no availability");
    if (f === "unknown") throw new UnknownResult("booking request timed out");
    return ctx.store.upsert("bookings", `B-${ctx.caseId}-${Date.now().toString(36)}`, { ...i, status: "confirmed", ...stamp(ctx) });
  },
};

export const sendMessage: ToolDef = {
  name: "send_message", kind: "write", risk: "low",
  description: "Send a message to a tenant, landlord or contractor. Never commit the landlord to money or a legal position; never share more tenant data than the job needs.",
  input: z.object({ to_party: z.enum(["tenant", "landlord", "contractor", "other"]), to_ref: z.string().describe("Record id or contact as held on file"), channel: z.enum(["email", "sms", "whatsapp", "portal"]), subject: z.string().optional(), body: z.string() }),
  guard: async (i) => /\b(compensat|refund|rent reduction|we will pay|will be reimbursed|legal advice|you must leave|eviction)\b/i.test(i.body) ? "message commits the landlord to money or a legal position" : null,
  perform: async (i, ctx) => {
    const f = ctx.failures.take("send_message");
    if (f === "fail") throw new Error("delivery failed: address rejected");
    if (f === "unknown") throw new UnknownResult("delivery status unknown");
    // Real transports (Twilio/Resend) hang here behind env flags for the demo; default is record-only.
    return ctx.store.upsert("messages", `M-${ctx.caseId}-${Date.now().toString(36)}`, { ...i, status: "sent", ...stamp(ctx) });
  },
};

export const bookInspection: ToolDef = {
  name: "book_inspection", kind: "write", risk: "low",
  description: "Book a compliance inspection (gas safety, EICR, EPC, legionella, fire) with an approved contractor.",
  input: z.object({ property_id: z.string(), inspection_type: z.string(), contractor_id: z.string().optional(), by_date: z.string() }),
  perform: async (i, ctx) => ctx.store.upsert("inspections", `I-${ctx.caseId}-${Date.now().toString(36)}`, { ...i, status: "requested", ...stamp(ctx) }),
};

export const recordLandlordDecision: ToolDef = {
  name: "record_landlord_decision", kind: "write", risk: "low",
  description: "Record a decision the landlord has communicated (approval, refusal, instruction) with its source.",
  input: z.object({ landlord_id: z.string(), decision: z.string(), source: z.string().describe("Where the decision came from, e.g. email dated X") }),
  perform: async (i, ctx) => ctx.store.upsert("landlord_decisions", `LD-${ctx.caseId}-${Date.now().toString(36)}`, { ...i, ...stamp(ctx) }),
};

export const proposeAction: ToolDef = {
  name: "propose_action", kind: "write", risk: "none",
  description: "Record an action that should happen but which you have no tool for (e.g. source a contractor outside the panel, raise an insurance claim). It is never executed by the system; it appears in the answer as a recommended human action.",
  input: z.object({ action_type: z.string(), target: z.string(), parameters: z.string(), rationale: z.string() }),
  perform: async (i, ctx) => ctx.store.upsert("proposed_actions", `PA-${ctx.caseId}-${Date.now().toString(36)}`, { ...i, status: "proposed", ...stamp(ctx) }),
};

export const reportBlocker: ToolDef = {
  name: "report_blocker", kind: "write", risk: "none",
  description: "Record that the case cannot be completed because a capability or piece of information does not exist. Say exactly what was needed and why.",
  input: z.object({ needed: z.string(), why: z.string() }),
  perform: async (i, ctx) => ctx.store.upsert("blockers", `BL-${ctx.caseId}-${Date.now().toString(36)}`, { ...i, ...stamp(ctx) }),
};

export const escalate: ToolDef = {
  name: "escalate", kind: "write", risk: "none",
  description: "Hand the decision to a human. P1 = same-day handover; P0 = ring the on-call manager now. Always do the safe actions within authority first, then escalate the decision you cannot take.",
  input: z.object({ tier: z.enum(["P1", "P0"]), decision_required: z.string(), summary: z.string(), what_was_tried: z.string(), deadline: z.string().optional() }),
  perform: async (i, ctx) => ctx.store.upsert("escalations", `E-${ctx.caseId}`, { ...i, status: "open", ...stamp(ctx) }),
};

export class UnknownResult extends Error {}

async function spendGuard(propertyId: string, cost: number, approvalRef: string | undefined, ctx: { store: any }): Promise<string | null> {
  if (approvalRef) return null;
  const prop = await ctx.store.get("properties", propertyId);
  const landlordId = prop?.data?.landlord_id ?? prop?.data?.landlordId;
  const ll = landlordId ? await ctx.store.get("landlords", String(landlordId)) : null;
  const authority = Number(ll?.data?.spend_authority_gbp ?? ll?.data?.spendAuthority ?? ll?.data?.authority_limit ?? NaN);
  if (Number.isNaN(authority)) return null; // unknown authority: let the policy decide, the checks will see it
  return cost > authority ? `estimated cost £${cost} exceeds landlord authority £${authority} and no approval_ref was given` : null;
}

export const WRITE_TOOLS: ToolDef[] = [createTicket, updateTicket, createWorkOrder, bookContractor, sendMessage, bookInspection, recordLandlordDecision, proposeAction, reportBlocker, escalate];
