import { MockLanguageModelV4 } from "ai/test";
import type { ModelFactory } from "./models.js";

/**
 * Offline smoke model: the router call gets a JSON route; the agent call stages one ticket and
 * one message on step 1, then submits on step 2. Exercises every pipeline stage without an API key.
 */
export function mockModels(): ModelFactory {
  return () => new MockLanguageModelV4({
    doGenerate: async (opts: any) => {
      const toolNames: string[] = (opts.tools ?? []).map((t: any) => t.name);
      const usage = { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 10, text: 10, reasoning: 0 } };
      const base = { finishReason: { unified: "stop", raw: "end_turn" }, usage, warnings: [] };
      if (!toolNames.includes("submit_resolution")) {
        return { ...base, content: [{ type: "text", text: JSON.stringify({ families: ["maintenance"], urgency: "P1", confidence: 0.9, reasons: "mock route" }) }] };
      }
      const alreadyStaged = JSON.stringify(opts.prompt).includes("Staged, not executed");
      if (!alreadyStaged) {
        return { ...base, finishReason: { unified: "tool-calls", raw: "tool_use" }, content: [
          { type: "tool-call", toolCallId: "c1", toolName: "create_ticket", input: JSON.stringify({ property_id: "P1", title: "Mock ticket", category: "plumbing", urgency: "P1", description: "mock" }) },
          { type: "tool-call", toolCallId: "c2", toolName: "send_message", input: JSON.stringify({ to_party: "tenant", to_ref: "TEN1", channel: "email", body: "We have logged your report and will update you shortly." }) },
        ] };
      }
      return { ...base, finishReason: { unified: "tool-calls", raw: "tool_use" }, content: [{ type: "tool-call", toolCallId: "c3", toolName: "submit_resolution", input: JSON.stringify({
        family: "maintenance", urgency: "P1", decision: "Mock decision.", summaryForHuman: "Mock summary.", notDone: [], conflicts: [], missingInformation: [], flagAssessments: [], communications: [{ party: "tenant", channel: "email", gist: "acknowledged" }], escalation: { tier: "none" }, finalState: "scheduled" }) }] };
    },
  } as any);
}
