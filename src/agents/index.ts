import type { AgentConfig } from "./types.js";
import { ALL_READ, ALL_WRITE } from "../tools/registry.js";
import type { Family } from "../schemas/resolution.js";

const OPUS = "claude-opus-5-5";

export const generalist: AgentConfig = {
  name: "generalist",
  description: "Handles any case. Every policy, every tool. The floor the specialists stand on.",
  policies: ["maintenance", "compliance", "arrears", "lifecycle", "landlord", "complaint", "noise"],
  tools: [...ALL_READ, ...ALL_WRITE],
  model: OPUS, effort: "medium", maxSteps: 12,
};

export const maintenance: AgentConfig = {
  name: "maintenance",
  description: "Repairs, contractors, access, make-safe.",
  policies: ["maintenance"],
  tools: [...ALL_READ, "create_ticket", "update_ticket", "create_work_order", "book_contractor", "send_message", "record_landlord_decision", "propose_action", "report_blocker", "escalate"],
  model: OPUS, effort: "medium", maxSteps: 12,
};

export const compliance: AgentConfig = {
  name: "compliance",
  description: "Certificates, inspections, statutory duties.",
  policies: ["compliance"],
  tools: [...ALL_READ, "create_ticket", "update_ticket", "book_inspection", "send_message", "record_landlord_decision", "propose_action", "report_blocker", "escalate"],
  model: OPUS, effort: "medium", maxSteps: 10,
};

export const AGENTS: Record<string, AgentConfig> = { generalist, maintenance, compliance };

/** Specialists are an optimisation. Any doubt lands on the generalist. */
export function pickAgent(families: Family[], confidence: number): AgentConfig {
  if (families.length !== 1 || confidence < 0.75) return generalist;
  return AGENTS[families[0]] ?? generalist;
}
