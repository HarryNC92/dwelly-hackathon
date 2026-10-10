import { z } from "zod";

/**
 * CaseState: the structured state of a case file, extracted deterministically from the history's system strings
 * (plus a bounded model pass for names, aliases and amounts). This is the interface between the extraction session
 * (fills it), the rules session (guards and checks read it) and the agent (sees it rendered in the case pack).
 * Keep it stable: add optional fields rather than renaming.
 */
export const PartySchema = z.object({
  role: z.enum(["tenant", "landlord", "contractor", "agency", "other"]),
  names: z.array(z.string()).describe("All aliases seen for this party, first is the canonical one"),
  emails: z.array(z.string()).default([]),
  phones: z.array(z.string()).default([]),
  isAssignedProvider: z.boolean().optional().describe("Contractor: currently assigned on this job"),
  isLandlordsOwnContractor: z.boolean().optional(),
  notes: z.array(z.string()).default([]),
});
export type Party = z.infer<typeof PartySchema>;

export const StageSchema = z.enum([
  "intake", "landlord_gate", "paused_not_tenanted", "dispatch", "awaiting_visit_date", "visit_scheduled",
  "awaiting_results", "quote_loop", "close_out", "completed", "completed_without_payment", "unknown",
]);
export type Stage = z.infer<typeof StageSchema>;

export const ApprovalSchema = z.object({
  status: z.enum(["none", "pending", "approved", "declined", "conditional", "own_contractor", "tenant_to_fix", "landlord_self_fix"]),
  eventN: z.number().optional(),
  text: z.string().optional().describe("Verbatim approval wording, e.g. 'Yes please go ahead' or '👍'"),
  conditions: z.string().optional().describe("e.g. 'easy and cheap fixes OK, quote needed if parts required'"),
  amountGbp: z.number().optional(),
});

export const QuoteSchema = z.object({ provider: z.string(), amountGbp: z.number().optional(), vat: z.enum(["inc", "plus", "unknown"]).default("unknown"), eventN: z.number(), sentToLandlordEventN: z.number().optional(), approvedEventN: z.number().optional(), superseded: z.boolean().default(false) });

export const HoldSchema = z.object({ eventN: z.number(), by: z.string().optional(), reason: z.string(), waitingFor: z.enum(["landlord", "provider", "tenant", "other", "unknown"]), comment: z.string().optional(), released: z.boolean().default(false) });

export const CaseStateSchema = z.object({
  jobId: z.string().optional(),
  propertyAddress: z.string().optional().describe("From the case header"),
  addressesMentioned: z.array(z.object({ address: z.string(), eventNs: z.array(z.number()) })).default([]),
  parties: z.array(PartySchema).default([]),
  stage: StageSchema.default("unknown"),
  stageEvidenceEventN: z.number().optional(),
  occupancy: z.enum(["tenanted", "not_tenanted", "unknown"]).default("unknown"),
  landlordApproval: ApprovalSchema.default({ status: "none" }),
  quotes: z.array(QuoteSchema).default([]),
  providerAssigned: z.object({ name: z.string(), eventN: z.number() }).optional(),
  remindersSent: z.number().default(0),
  visit: z.object({ date: z.string().optional(), eventN: z.number().optional(), confirmedBothSides: z.boolean().optional(), missed: z.boolean().optional() }).default({}),
  workResults: z.object({ present: z.boolean().default(false), eventN: z.number().optional(), summary: z.string().optional() }).default({ present: false }),
  invoice: z.object({ present: z.boolean().default(false), amountGbp: z.number().optional(), eventN: z.number().optional(), sentToLandlord: z.boolean().optional(), paid: z.boolean().optional() }).default({ present: false }),
  keys: z.object({ issued: z.boolean().optional(), returned: z.boolean().optional() }).default({}),
  holds: z.array(HoldSchema).default([]),
  openInterrupt: z.string().optional().describe("Latest unresolved 'Please check if we need to provide a response to X' or 'please review manually'"),
  timers: z.object({ landlordReplyDue: z.string().optional(), providerVisitDateDue: z.string().optional(), resultsCheckDue: z.string().optional(), closeWarningDue: z.string().optional() }).default({}),
  lastEventTs: z.string().optional(),
  lastInbound: z.object({ from: z.string(), eventN: z.number(), channel: z.string(), gist: z.string() }).optional(),
  whoPays: z.enum(["landlord", "tenant", "split", "unknown"]).default("unknown"),
  paymentRoute: z.enum(["landlord_rent_deduction", "landlord_direct", "tenant_chargeable", "warranty_or_free", "unknown"]).default("unknown"),
  tenantLiability: z.enum(["yes", "no", "unknown"]).default("unknown"),
  workStatus: z.enum(["not_started", "visit_scheduled", "visit_completed", "work_completed", "disputed", "unknown"]).default("unknown"),
  documents: z.array(z.object({ kind: z.enum(["quote", "invoice", "photo", "inspection_report", "completion_evidence", "other"]), name: z.string().optional(), eventN: z.number().optional(), available: z.boolean() })).default([]),
  safetySignals: z.array(z.string()).default([]).describe("e.g. 'door glass may shatter', 'leak known for 15 days'"),
  dataConflicts: z.array(z.string()).default([]).describe("Addresses, names, phones, dates, amounts that disagree within the case"),
  offTopic: z.array(z.string()).default([]),
  postClosureMessages: z.boolean().default(false),
  notes: z.array(z.string()).default([]),
  difficulty: z.object({
    score: z.number().describe("0 easy to 10 hard, deterministic: conflicts, safety signals, silence timers, missing approvals, disputes, length"),
    reasons: z.array(z.string()),
    tier: z.enum(["routine", "standard", "hard"]).describe("routine: unambiguous stage transition; standard: judgement needed; hard: conflicts, safety, disputes or silence"),
  }).optional(),
});
export type CaseState = z.infer<typeof CaseStateSchema>;
