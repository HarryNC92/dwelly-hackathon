import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateText, stepCountIs, type ModelMessage, type SystemModelMessage, type StopCondition, type ToolSet } from "ai";
import type { AgentConfig } from "../agents/types.js";
import type { Case } from "../schemas/case.js";
import { ResolutionSchema, type Resolution, type Route } from "../schemas/resolution.js";
import { getTools } from "../tools/registry.js";
import type { ToolContext } from "../tools/types.js";
import { wrapTools, type CaseRun } from "./wrapper.js";
import type { ModelFactory } from "./models.js";
import type { Trace } from "./trace.js";
import { prefetchContext, renderPrefetch } from "./context.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const policy = (name: string) => fs.readFileSync(path.join(here, "..", "policies", `${name}.md`), "utf8");

export type AgentOutcome =
  | { kind: "resolution"; resolution: Resolution; run: CaseRun; messages: ModelMessage[] }
  | { kind: "reroute"; reason: string; run: CaseRun }
  | { kind: "failed"; error: string; run: CaseRun; retryable?: boolean };

const submittedValidly = (run: CaseRun): StopCondition<ToolSet> => () => run.control.submit !== undefined || run.control.reroute !== undefined;

export function systemPrompt(agent: AgentConfig): string {
  const blocks = [policy("constraints"), ...agent.policies.map(policy)];
  return blocks.join("\n\n---\n\n");
}

export async function buildCasePack(c: Case, route: Route, ctx: ToolContext, trace: Trace): Promise<string> {
  const flags = c.flags.map((f) => `- ${f.name} (evidence: "${f.evidence}")${f.forcedAction ? ` FORCED: ${f.forcedAction}` : ""}`).join("\n") || "- none";
  let prefetch = "Prefetch skipped.";
  try {
    const p = await prefetchContext(c, ctx.store);
    trace.log("prefetch", { found: p.records.map((r) => `${r.type}/${r.id}`), queries: p.queries, misses: p.misses });
    prefetch = renderPrefetch(p);
  } catch (e) { trace.log("prefetch.error", { error: String(e) }); }
  const kindNote = c.kind === "question"
    ? "This case is phrased as a question or decision point rather than a raw inbound event. Answer it directly in `decision` (first sentence = the answer), then still stage any actions the answer implies."
    : "This case is an inbound event. Work it as the property manager on duty.";
  return `# Case ${c.id}
Channel: ${c.channel}
Case time ("now"): ${c.receivedAt ?? "unknown"}
Linked ids: ${JSON.stringify(c.linkedIds)}
Triage: families=${route.families.join(",")} urgency=${route.urgency} (${route.reasons})
Flags (deterministic hints; address each one explicitly in your resolution, and say if you judge one to be a false positive):
${flags}

${kindNote}

## Raw content
${c.rawText}
${c.structured ? `\n## Structured fields\n${JSON.stringify(c.structured, null, 2)}` : ""}

## System of record
${prefetch}

Work the case: verify the records, look up anything else you need, stage the actions you would take, then call submit_resolution once.`;
}

export async function runAgent(agent: AgentConfig, c: Case, route: Route, ctx: ToolContext, models: ModelFactory, trace: Trace, opts: { revision?: { messages: ModelMessage[]; feedback: string; run: CaseRun }; timeoutMs?: number; modelOverride?: string } = {}): Promise<AgentOutcome> {
  const run: CaseRun = opts.revision?.run ?? { staged: [], control: {} };
  run.control = {};
  const tools = wrapTools(getTools([...agent.tools, "submit_resolution", "reroute"]), ctx, trace, run);
  const attachments = c.attachments.map((a) => ({ type: "file" as const, data: fs.readFileSync(a.path), mediaType: a.mediaType, filename: a.name }));
  const instructions: SystemModelMessage = { role: "system", content: systemPrompt(agent), providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } } };
  const messages: ModelMessage[] = opts.revision
    ? [...opts.revision.messages, { role: "user", content: `Automated checks failed: ${opts.revision.feedback}\nRevise. Your previously staged actions remain recorded; stage replacements only where needed, then call submit_resolution again.` }]
    : [{ role: "user", content: [{ type: "text", text: await buildCasePack(c, route, ctx, trace) }, ...attachments] }];
  const modelId = opts.modelOverride ?? agent.model;
  trace.log("agent.start", { agent: agent.name, model: modelId, revision: Boolean(opts.revision) });
  try {
    const result = await generateText({
      model: models(modelId),
      instructions,
      messages,
      tools,
      stopWhen: [stepCountIs(agent.maxSteps), submittedValidly(run)],
      providerOptions: { anthropic: { thinking: { type: "adaptive" }, effort: agent.effort } },
      abortSignal: opts.timeoutMs ? AbortSignal.timeout(opts.timeoutMs) : undefined,
      maxRetries: 4,
      onStepFinish: (s) => trace.log("agent.step", { agent: agent.name, finish: s.finishReason, tools: s.toolCalls.map((t) => t.toolName), usage: s.usage }),
    });
    const all = [...messages, ...result.responseMessages];
    if (run.control.reroute) {
      const r = run.control.reroute as { reason: string };
      trace.log("agent.reroute", { agent: agent.name, reason: r.reason });
      return { kind: "reroute", reason: r.reason, run };
    }
    if (!run.control.submit) {
      trace.log("agent.no_submit", { agent: agent.name, finish: result.finishReason, text: result.text.slice(0, 500) });
      return { kind: "failed", error: `agent finished (${result.finishReason}) without calling submit_resolution`, run };
    }
    const parsed = ResolutionSchema.safeParse(run.control.submit);
    if (!parsed.success) return { kind: "failed", error: `submit_resolution payload invalid: ${parsed.error.message}`, run };
    trace.log("agent.submit", { agent: agent.name, family: parsed.data.family, urgency: parsed.data.urgency, finalState: parsed.data.finalState, staged: run.staged.length });
    return { kind: "resolution", resolution: parsed.data, run, messages: all };
  } catch (e) {
    const msg = String(e);
    trace.log("agent.error", { agent: agent.name, error: msg });
    return { kind: "failed", error: msg, run, retryable: /429|rate.?limit|overloaded|529|503|ECONNRESET|timeout|aborted/i.test(msg) };
  }
}
