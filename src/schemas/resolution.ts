import { z } from "zod";

export const FAMILIES = ["maintenance", "compliance", "arrears", "lifecycle", "landlord", "complaint", "noise", "unknown"] as const;
export const FamilySchema = z.enum(FAMILIES);
export type Family = z.infer<typeof FamilySchema>;
export const UrgencySchema = z.enum(["P0", "P1", "P2"]);
export type Urgency = z.infer<typeof UrgencySchema>;

export const RouteSchema = z.object({
  families: z.array(FamilySchema).min(1),
  urgency: UrgencySchema,
  confidence: z.number().min(0).max(1),
  reasons: z.string(),
});
export type Route = z.infer<typeof RouteSchema>;

/** A write the agent asked for. Recorded at request time, executed only after checks pass. */
export const StagedActionSchema = z.object({
  actionId: z.string(),
  tool: z.string(),
  input: z.record(z.string(), z.unknown()),
  status: z.enum(["staged", "success", "failure", "unknown", "blocked"]).default("staged"),
  result: z.unknown().optional(),
  error: z.string().optional(),
});
export type StagedAction = z.infer<typeof StagedActionSchema>;

export const EscalationSchema = z.object({
  tier: z.enum(["none", "P1", "P0"]),
  reason: z.string().optional(),
  decisionRequired: z.string().optional(),
  deadline: z.string().optional(),
  handover: z.string().optional(),
});

/** The payload of the submit_resolution tool. Strict-schema friendly: no min/max, no recursion. */
export const ResolutionSchema = z.object({
  family: FamilySchema,
  urgency: UrgencySchema,
  decision: z.string().describe("One paragraph: what the agent decided and why"),
  summaryForHuman: z.string().describe("Two sentences a property manager can read in five seconds"),
  notDone: z.array(z.object({ action: z.string(), reason: z.string() })).describe("Actions deliberately not taken"),
  conflicts: z.array(z.object({ facts: z.string(), resolution: z.string() })).describe("Conflicting information and how it was weighed"),
  missingInformation: z.array(z.string()),
  communications: z.array(z.object({ party: z.string(), channel: z.string(), gist: z.string() })),
  escalation: EscalationSchema,
  finalState: z.enum(["resolved", "scheduled", "awaiting_approval", "escalated", "closed_no_action", "blocked"]),
});
export type Resolution = z.infer<typeof ResolutionSchema>;

export const RerouteSchema = z.object({
  reason: z.string(),
  suggestedFamily: FamilySchema.optional(),
});
