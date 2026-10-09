import path from "node:path";
import type { Case } from "../schemas/case.js";
import type { Resolution, Route } from "../schemas/resolution.js";
import { pickAgent, generalist } from "../agents/index.js";
import { route as routeCase } from "../runtime/router.js";
import { runAgent, type AgentOutcome } from "../runtime/runAgent.js";
import { runChecks, claimCheck } from "../runtime/checks.js";
import { executeStaged, withdrawPendingComms } from "../runtime/execute.js";
import { notifyEscalation } from "../runtime/escalate.js";
import { writeAnswer, type CaseOutput } from "../runtime/write.js";
import { Trace } from "../runtime/trace.js";
import type { ToolContext } from "../tools/types.js";
import { FALLBACK_MODEL, type ModelFactory } from "../runtime/models.js";
import type { CaseRun } from "../runtime/wrapper.js";
import { shadowClassify } from "../classify/index.js";

export type RunDeps = { models: ModelFactory; ctxFor: (c: Case) => ToolContext; outDir: string; folder: string; caseTimeoutMs: number };

/**
 * The orchestrator is code. Route, pick an agent, run it, fall back to the generalist on doubt,
 * check, execute, escalate, write. Always writes a folder.
 */
export async function runCase(c: Case, deps: RunDeps): Promise<CaseOutput> {
  const started = Date.now();
  const dir = path.join(deps.outDir, deps.folder);
  const trace = new Trace(dir, c.id);
  const ctx = deps.ctxFor(c);
  trace.log("case.start", { channel: c.channel, flags: c.flags.map((f) => f.name), files: c.sourceFiles });
  let route: Route | null = null; let res: Resolution | null = null; let run: CaseRun = { staged: [], control: {} };
  let agentName: string | undefined; let error: string | undefined; const checks: string[][] = []; let page: string | undefined;
  try {
    const [r, jev] = await Promise.all([routeCase(c, deps.models, trace), shadowClassify(c.rawText, trace)]);
    route = r;
    if (jev && process.env.JEV_MODE === "active" && jev.urgency?.type === "score" && jev.urgency.level === "P0" && route.urgency !== "P0") { trace.log("classify.jev.override", { from: route.urgency, to: "P0" }); route = { ...route, urgency: "P0" }; }
    let agent = pickAgent(route.families, route.confidence);
    agentName = agent.name;
    const budget = () => Math.max(10_000, deps.caseTimeoutMs - (Date.now() - started));
    let out: AgentOutcome = await runAgent(agent, c, route, ctx, deps.models, trace, { timeoutMs: budget() });
    if (out.kind === "reroute" && agent.name !== generalist.name) {
      agent = generalist; agentName = `${agentName}->generalist`;
      out = await runAgent(agent, c, { ...route, reasons: `${route.reasons} | rerouted: ${out.reason}` }, ctx, deps.models, trace, { timeoutMs: budget() });
    }
    if (out.kind === "failed" && out.retryable) {
      // Rate limit or transport failure: restart the case from scratch on the fallback model (never mid-loop).
      trace.log("agent.fallback_model", { from: agent.model, to: FALLBACK_MODEL, reason: out.error.slice(0, 200) });
      agentName = `${agentName}(${FALLBACK_MODEL})`;
      out = await runAgent(agent, c, route, ctx, deps.models, trace, { timeoutMs: budget(), modelOverride: FALLBACK_MODEL });
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
      // Phase 1: state-changing actions (tickets, bookings, work orders). Messages wait until results are known.
      await executeStaged(run, ctx, trace, "state");
      const troubled = () => run.staged.filter((a) => a.status === "failure" || a.status === "unknown");
      let claims = await claimCheck(res, run, ctx.store);
      if ((troubled().length || claims.length) && out.kind === "resolution") {
        // Reconciliation: one bounded turn with the real results. Pending messages are withdrawn so they can be restaged truthfully.
        const feedback = troubled().map((a) => `${a.tool} (${a.actionId}) -> ${a.status}: ${a.error ?? ""}`).join("; ") || "none";
        const withdrawn = withdrawPendingComms(run, trace);
        trace.log("reconcile.start", { troubled: troubled().map((a) => a.actionId), claims, withdrawn });
        const rec = await runAgent(agent, c, route, ctx, deps.models, trace, { revision: { messages: out.messages, feedback:
          `Execution results for your state-changing actions: ${feedback}. ${claims.length ? `Your text described failed actions as done: ${claims.join("; ")}. ` : ""}` +
          `Your pending messages and escalation (${withdrawn.join(", ") || "none"}) were withdrawn before sending. ` +
          `Now: (1) recover where you can, for example stage the next suitable panel contractor; if none is suitable, escalate with "NO CONTRACTOR CONFIRMED" as the first words of the decision required; ` +
          `(2) restage every message you still want to send, written against what has actually happened (a failed booking is not a booking; an unknown result may or may not have happened, verify or escalate, never repeat it blindly); ` +
          `(3) resubmit a resolution whose decision, summary and communications match reality, including any failure that remains.`, run }, timeoutMs: budget() });
        if (rec.kind === "resolution") {
          const problems = runChecks(c, rec.resolution, rec.run); checks.push(problems);
          trace.log("checks", { pass: checks.length, stage: "reconcile", problems });
          if (problems.length === 0) {
            run = rec.run; res = rec.resolution;
            await executeStaged(run, ctx, trace, "state");
          } else trace.log("reconcile.rejected", { problems });
        }
        claims = await claimCheck(res, run, ctx.store);
        if (claims.length) {
          trace.log("claims.unresolved", { claims });
          // Last resort: never let a false claim go out. Block unsent messages that still make the claim and escalate.
          for (const a of run.staged) if (a.status === "staged" && a.tool === "send_message" && claims.some((cl) => cl.includes("done"))) { /* keep: writer prepends the truthful status block */ }
          res = { ...res, finalState: res.finalState === "scheduled" ? "escalated" : res.finalState, escalation: res.escalation.tier === "none" ? { tier: "P1", reason: `claim check: ${claims.join("; ")}`, decisionRequired: "A human must confirm the contractor arrangements; the system could not confirm them.", handover: res.summaryForHuman } : res.escalation };
          if (!run.staged.some((a) => a.tool === "escalate" && a.status !== "blocked")) run.staged.push({ actionId: "escalate#claims", tool: "escalate", input: { tier: res.escalation.tier === "P0" ? "P0" : "P1", decision_required: res.escalation.decisionRequired, summary: res.summaryForHuman, what_was_tried: claims.join("; ") }, status: "staged" });
        }
      }
      // Phase 2: communications and handovers, now consistent with results.
      await executeStaged(run, ctx, trace, "comms");
      if (run.staged.some((a) => a.status === "unknown") && res.finalState === "resolved") res = { ...res, finalState: "awaiting_approval" };
      page = await notifyEscalation(c.id, res, trace, ctx.env);
    } else {
      run = out.run; error = out.kind === "failed" ? out.error : `reroute from generalist: ${out.reason}`;
    }
  } catch (e) {
    error = String(e);
    trace.log("case.error", { error });
  }
  writeAnswer(dir, c, res, run, route, { agent: agentName, error, checks, page });
  const ms = Date.now() - started;
  trace.log("case.end", { ms, status: res ? res.finalState : "error" });
  return { caseId: c.id, folder: deps.folder, status: res ? res.finalState : "error", family: res?.family, urgency: res?.urgency ?? route?.urgency, escalation: res?.escalation.tier, agent: agentName, error, ms };
}
