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
const submittedValidly = (run: CaseRun): StopCondition<ToolSet> => () => run.control.submit !== undefined || run.control.reroute !== undefined;

export type AgentOutcome =
  | { kind: "resolution"; resolution: Resolution; run: CaseRun; messages: ModelMessage[]; modelId: string }
  | { kind: "reroute"; reason: string; run: CaseRun; modelId: string }
  | { kind: "failed"; error: string; run: CaseRun; retryable?: boolean; modelId: string };

export function systemPrompt(agent: AgentConfig): string {
  return [policy("constraints"), ...agent.policies.map(policy)].join("\n\n---\n\n");
}

export async function buildCasePack(c: Case, route: Route, ctx: ToolContext, trace: Trace): Promise<string> {
  const flags = c.flags.map((f) => `- ${f.name} (evidence: "${f.evidence}")${f.forcedAction ? ` FORCED: ${f.forcedAction}` : ""}`).join("\n") || "- none";
  let prefetch = "Prefetch skipped.";
  let policyDocs = "";
  try {
    const p = await prefetchContext(c, ctx.store);
    trace.log("prefetch", { found: p.records.map((r) => `${r.type}/${r.id}`), queries: p.queries, misses: p.misses });
    prefetch = renderPrefetch(p);
  } catch (e) { trace.log("prefetch.error", { error: String(e) }); }
  try {
    const docs = await ctx.store.list("document", 5);
    const texts = docs.map((d) => String((d.data as any).text ?? "")).filter((t) => /polic|procedure|rule|authority|sla|guide/i.test(t)).map((t) => t.slice(0, 4000));
    if (texts.length) policyDocs = `\n## Agency documents in the system of record (these override defaults in your policy)\n${texts.join("\n\n")}\n`;
  } catch { /* none */ }
  const kindNote = c.kind === "question"
    ? "This case is phrased as a question or decision point rather than a raw inbound event. Answer it directly in `decision` (first sentence = the answer), then still stage any actions the answer implies."
    : "This case is an inbound event. Work it as the property manager on duty.";
  return `# Case ${c.id}
Channel: ${c.channel}
Case time ("now", UTC): ${c.receivedAt ?? `unknown; use the run reference time ${ctx.now}`}. Write times in messages as Europe/London local time.
Linked ids: ${JSON.stringify(c.linkedIds)}
Triage: families=${route.families.join(",")} urgency=${route.urgency} (${route.reasons})
Flags (deterministic hints from pattern matching; address each in your work and give a flagAssessment for each. A flag can be wrong; if so, mark it a false positive with the reason):
${flags}

${kindNote}

## Raw content
${c.rawText}

## System of record
${prefetch}
${policyDocs}
Work the case: verify the records, look up anything else you need, stage the actions you would take, then call submit_resolution once.`;
}

export async function runAgent(agent: AgentConfig, c: Case, route: Route, ctx: ToolContext, models: ModelFactory, trace: Trace,
  opts: { revision?: { messages: ModelMessage[]; feedback: string; run: CaseRun }; timeoutMs?: number; modelOverride?: string; withAttachments?: boolean } = {}): Promise<AgentOutcome> {
  const t0 = Date.now();
  const remaining = () => Math.max(30_000, (opts.timeoutMs ?? 240_000) - (Date.now() - t0));
  const run: CaseRun = opts.revision?.run ?? { staged: [], control: {} };
  run.control = {};
  const modelId = opts.modelOverride ?? agent.model;
  const toolNames = [...agent.tools, "submit_resolution", ...(agent.name === "generalist" ? [] : ["reroute"])];
  const tools = wrapTools(getTools(toolNames), ctx, trace, run);
  const instructions: SystemModelMessage = { role: "system", content: systemPrompt(agent), providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } } };
  trace.log("agent.start", { agent: agent.name, model: modelId, revision: Boolean(opts.revision), attachments: opts.withAttachments !== false ? c.attachments.length : 0 });
  try {
    const attachments = opts.withAttachments === false ? [] : c.attachments.flatMap((a) => {
      try { const data = fs.readFileSync(a.path); if (data.length > 20 * 1024 * 1024) { trace.log("attachment.skipped", { name: a.name, reason: "over 20MB" }); return []; } return [{ type: "file" as const, data, mediaType: a.mediaType, filename: a.name }]; }
      catch (e) { trace.log("attachment.skipped", { name: a.name, reason: String(e) }); return []; }
    });
    const messages: ModelMessage[] = opts.revision
      ? [...opts.revision.messages, { role: "user", content: opts.revision.feedback }]
      : [{ role: "user", content: [{ type: "text", text: await buildCasePack(c, route, ctx, trace), providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } } }, ...attachments] }];
    const common = { model: models(modelId), instructions, tools, providerOptions: { anthropic: { thinking: { type: "adaptive" as const }, effort: agent.effort } }, maxRetries: 4 as const };
    let result = await generateText({
      ...common, messages,
      stopWhen: [stepCountIs(agent.maxSteps), submittedValidly(run)],
      abortSignal: opts.timeoutMs ? AbortSignal.timeout(opts.timeoutMs) : undefined,
      onStepFinish: (s) => trace.log("agent.step", { agent: agent.name, finish: s.finishReason, tools: s.toolCalls.map((t) => t.toolName), usage: s.usage }),
    });
    let all = [...messages, ...result.responseMessages];
    if (!run.control.submit && !run.control.reroute) {
      // Out of steps or ended in prose: one short turn with only submit_resolution available, so the work is not thrown away.
      trace.log("agent.submit_now", { agent: agent.name, finish: result.finishReason });
      const submitOnly = wrapTools(getTools(["submit_resolution"]), ctx, trace, run);
      const nudge: ModelMessage = { role: "user", content: "You are out of steps. Call submit_resolution now with your best resolution of the case so far. Do not describe staged actions as done." };
      result = await generateText({ ...common, tools: submitOnly, messages: [...all, nudge], stopWhen: [stepCountIs(2), submittedValidly(run)], abortSignal: AbortSignal.timeout(Math.min(120_000, remaining())) });
      all = [...all, nudge, ...result.responseMessages];
    }
    if (run.control.reroute) {
      const r = run.control.reroute as { reason: string };
      trace.log("agent.reroute", { agent: agent.name, reason: r.reason });
      return { kind: "reroute", reason: r.reason, run, modelId };
    }
    if (!run.control.submit) {
      trace.log("agent.no_submit", { agent: agent.name, finish: result.finishReason, text: result.text.slice(0, 500) });
      return { kind: "failed", error: `agent finished (${result.finishReason}) without calling submit_resolution`, run, modelId };
    }
    const parsed = ResolutionSchema.safeParse(run.control.submit);
    if (!parsed.success) return { kind: "failed", error: `submit_resolution payload invalid: ${parsed.error.message}`, run, modelId };
    trace.log("agent.submit", { agent: agent.name, family: parsed.data.family, urgency: parsed.data.urgency, finalState: parsed.data.finalState, staged: run.staged.length });
    return { kind: "resolution", resolution: parsed.data, run, messages: all, modelId };
  } catch (e) {
    const msg = String(e);
    trace.log("agent.error", { agent: agent.name, error: msg.slice(0, 600) });
    const ourTimeout = /TimeoutError|operation was aborted|AbortError/i.test(msg);
    if (!ourTimeout && !opts.revision && opts.withAttachments !== false && c.attachments.length && /image|pdf|document|too long|prompt is too long|media/i.test(msg)) {
      trace.log("agent.retry_without_attachments", {});
      return runAgent(agent, c, route, ctx, models, trace, { ...opts, withAttachments: false, timeoutMs: remaining() });
    }
    return { kind: "failed", error: msg, run, modelId, retryable: !ourTimeout && /429|rate.?limit|overloaded|529|503|ECONNRESET|socket hang up|fetch failed/i.test(msg) };
  }
}
