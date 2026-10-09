import path from "node:path";
import type { Case } from "../schemas/case.js";
import type { Resolution, Route } from "../schemas/resolution.js";
import { pickAgent, generalist } from "../agents/index.js";
import { route as routeCase } from "../runtime/router.js";
import { runAgent, type AgentOutcome } from "../runtime/runAgent.js";
import { runChecks } from "../runtime/checks.js";
import { executeStaged } from "../runtime/execute.js";
import { notifyEscalation } from "../runtime/escalate.js";
import { writeAnswer, type CaseOutput } from "../runtime/write.js";
import { Trace } from "../runtime/trace.js";
import type { ToolContext } from "../tools/types.js";
import type { ModelFactory } from "../runtime/models.js";
import type { CaseRun } from "../runtime/wrapper.js";

export type RunDeps = { models: ModelFactory; ctxFor: (c: Case) => ToolContext; outDir: string; caseTimeoutMs: number };

/**
 * The orchestrator is code. Route, pick an agent, run it, fall back to the generalist on doubt,
 * check, execute, escalate, write. Always writes a folder.
 */
export async function runCase(c: Case, deps: RunDeps): Promise<CaseOutput> {
  const started = Date.now();
  const dir = path.join(deps.outDir, c.id);
  const trace = new Trace(dir, c.id);
  const ctx = deps.ctxFor(c);
  trace.log("case.start", { channel: c.channel, flags: c.flags.map((f) => f.name), files: c.sourceFiles });
  let route: Route | null = null; let res: Resolution | null = null; let run: CaseRun = { staged: [], control: {} };
  let agentName: string | undefined; let error: string | undefined; const checks: string[][] = [];
  try {
    route = await routeCase(c, deps.models, trace);
    let agent = pickAgent(route.families, route.confidence);
    agentName = agent.name;
    const budget = () => Math.max(10_000, deps.caseTimeoutMs - (Date.now() - started));
    let out: AgentOutcome = await runAgent(agent, c, route, ctx, deps.models, trace, { timeoutMs: budget() });
    if (out.kind === "reroute" && agent.name !== generalist.name) {
      agent = generalist; agentName = `${agentName}->generalist`;
      out = await runAgent(agent, c, { ...route, reasons: `${route.reasons} | rerouted: ${out.reason}` }, ctx, deps.models, trace, { timeoutMs: budget() });
    }
    if (out.kind === "failed" && agent.name !== generalist.name) {
      agent = generalist; agentName = `${agentName}->generalist`;
      out = await runAgent(agent, c, route, ctx, deps.models, trace, { timeoutMs: budget() });
    }
    if (out.kind === "resolution") {
      run = out.run; res = out.resolution;
      let problems = runChecks(c, res, run); checks.push(problems);
      trace.log("checks", { pass: 1, problems });
      if (problems.length) {
        const rev = await runAgent(agent, c, route, ctx, deps.models, trace, { revision: { messages: out.messages, feedback: problems.join("; "), run }, timeoutMs: budget() });
        if (rev.kind === "resolution") {
          run = rev.run; res = rev.resolution;
          problems = runChecks(c, res, run); checks.push(problems);
          trace.log("checks", { pass: 2, problems });
        }
        if (problems.length) {
          // Keep the safe actions, drop high-risk ones, escalate with the pack.
          for (const a of run.staged) if (a.status === "staged" && ["create_work_order", "book_contractor"].includes(a.tool)) { a.status = "blocked"; a.error = "dropped after failed checks"; }
          const urgency = c.flags.some((f) => f.minUrgency === "P0") ? "P0" : res.urgency;
          res = { ...res, urgency, finalState: "escalated", escalation: { tier: urgency === "P0" ? "P0" : "P1", reason: `automated checks failed: ${problems.join("; ")}`, decisionRequired: "Review the proposed actions and the check failures; decide what to execute.", handover: res.summaryForHuman } };
          if (!run.staged.some((a) => a.tool === "escalate")) run.staged.push({ actionId: "escalate#auto", tool: "escalate", input: { tier: res.escalation.tier, decision_required: res.escalation.decisionRequired, summary: res.summaryForHuman, what_was_tried: problems.join("; ") }, status: "staged" });
        }
      }
      await executeStaged(run, ctx, trace);
      if (run.staged.some((a) => a.status === "unknown") && res.finalState === "resolved") res = { ...res, finalState: "awaiting_approval" };
      await notifyEscalation(c.id, res, trace, ctx.env);
    } else {
      run = out.run; error = out.kind === "failed" ? out.error : `reroute from generalist: ${out.reason}`;
    }
  } catch (e) {
    error = String(e);
    trace.log("case.error", { error });
  }
  writeAnswer(dir, c, res, run, route, { agent: agentName, error, checks });
  const ms = Date.now() - started;
  trace.log("case.end", { ms, status: res ? res.finalState : "error" });
  return { caseId: c.id, status: res ? res.finalState : "error", family: res?.family, urgency: res?.urgency ?? route?.urgency, escalation: res?.escalation.tier, agent: agentName, error, ms };
}
