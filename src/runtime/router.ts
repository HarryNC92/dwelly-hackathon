import { generateText, Output } from "ai";
import { RouteSchema, type Route } from "../schemas/resolution.js";
import type { Case } from "../schemas/case.js";
import type { ModelFactory } from "./models.js";
import type { Trace } from "./trace.js";

const SYSTEM = `You triage one inbound case for a UK lettings agency. Return the families it touches (maintenance, compliance, arrears, lifecycle, landlord, complaint, noise, unknown), the urgency (P0 immediate danger / P1 within 24h / P2 routine), your confidence 0-1 that a single specialist can handle it, and one sentence of reasons. Flags were computed deterministically and are hints. If in doubt, lower confidence; a generalist will take over.`;

export async function route(c: Case, models: ModelFactory, trace: Trace, modelId = "claude-opus-5-5"): Promise<Route> {
  try {
    const r = await generateText({
      model: models(modelId),
      system: SYSTEM,
      prompt: `Flags: ${JSON.stringify(c.flags.map((f) => f.name))}\nChannel: ${c.channel}\nReceived: ${c.receivedAt ?? "unknown"}\n\n${c.rawText.slice(0, 12000)}`,
      output: Output.object({ schema: RouteSchema }),
      providerOptions: { anthropic: { thinking: { type: "adaptive" }, effort: "low" } },
      maxRetries: 2,
    });
    const route = r.output;
    const bump = c.flags.map((f) => f.minUrgency).filter(Boolean) as string[];
    if (bump.includes("P0")) route.urgency = "P0"; else if (bump.includes("P1") && route.urgency === "P2") route.urgency = "P1";
    trace.log("route", { ...route, usage: r.usage });
    return route;
  } catch (e) {
    trace.log("route.error", { error: String(e) });
    return { families: ["unknown"], urgency: c.flags.some((f) => f.minUrgency === "P0") ? "P0" : "P2", confidence: 0, reasons: `router failed: ${String(e)}` };
  }
}
