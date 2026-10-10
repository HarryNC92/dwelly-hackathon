import path from "node:path";
import type { ModelMessage } from "ai";
import type { Case } from "../schemas/case.js";
import type { Resolution, Route, StagedAction } from "../schemas/resolution.js";
import { pickAgent, generalist } from "../agents/index.js";
import { route as routeCase } from "../runtime/router.js";
import { runAgent, type AgentOutcome } from "../runtime/runAgent.js";
import { runChecks, claimCheck, paymentOffenders, overruled } from "../runtime/checks.js";
import { executeStaged, withdrawPendingComms } from "../runtime/execute.js";
import { notifyEscalation } from "../runtime/escalate.js";
import { writeAnswer, type CaseOutput } from "../runtime/write.js";
import { Trace } from "../runtime/trace.js";
import type { ToolContext } from "../tools/types.js";
import { FALLBACK_MODEL, type ModelFactory } from "../runtime/models.js";
import type { CaseRun } from "../runtime/wrapper.js";
import { shadowClassify } from "../classify/index.js";

export type RunDeps = { models: ModelFactory; ctxFor: (c: Case) => ToolContext; outDir: string; folder: string; caseTimeoutMs: number };

const BOOKING_TOOLS = ["book_contractor", "create_work_order", "book_inspection"];
const SUPERSEDE = new Set(["send_message", "book_contractor", "create_work_order", "create_ticket", "book_inspection", "request_quote", "set_hold", "close_case", "escalate"]);
const supersedeKey = (a: StagedAction) => (SUPERSEDE.has(a.tool) ? `${a.tool}|${(a.input as any).to_ref ?? (a.input as any).contractor_id ?? (a.input as any).property_id ?? ""}` : a.actionId);

/**
 * The orchestrator is code. Route, pick an agent, run it, fall back to the generalist on doubt, check (one revision),
 * execute state changes, reconcile failures truthfully, execute communications, escalate, write. Always writes a folder.
 */
export async function runCase(c: Case, deps: RunDeps): Promise<CaseOutput> {
  const started = Date.now();
  const dir = path.join(deps.outDir, deps.folder);
  const trace = new Trace(dir, c.id);
  const ctx = deps.ctxFor(c);
  trace.log("case.start", { channel: c.channel, kind: c.kind, flags: c.flags.map((f) => f.name), files: c.sourceFiles });
  let route: Route | null = null; let res: Resolution | null = null; let run: CaseRun = { staged: [], control: {} };
  let agentName: string | undefined; let error: string | undefined; const checks: string[][] = []; let page: string | undefined;
  const budget = () => Math.max(10_000, deps.caseTimeoutMs - (Date.now() - started));
  /** Earlier staged actions replaced by a later one of the same kind are withdrawn, so a revision does not double-book or double-send. */
  const supersede = (before: number) => {
    const fresh = new Set(run.staged.slice(before).map(supersedeKey));
    for (const a of run.staged.slice(0, before)) if (a.status === "staged" && fresh.has(supersedeKey(a))) { a.status = "blocked"; a.error = "withdrawn: superseded by a later action"; }
  };
  const blockNew = (before: number, reason: string) => { for (const a of run.staged.slice(before)) if (a.status === "staged") { a.status = "blocked"; a.error = reason; } };
  const troubled = () => run.staged.filter((a) => a.status === "failure" || a.status === "unknown");
  const pushEscalate = (id: string, tier: "P0" | "P1", decisionRequired: string, fact: string) => run.staged.push({ actionId: id, tool: "escalate", input: { tier, decision_required: decisionRequired, summary: fact, what_was_tried: fact }, status: "staged" });

  try {
    const [r, jev] = await Promise.all([routeCase(c, deps.models, trace), shadowClassify(c.rawText, trace)]);
    route = r;
    if (jev && process.env.JEV_MODE === "active" && jev.urgency?.type === "score" && jev.urgency.level === "P0" && route.urgency !== "P0") { trace.log("classify.jev.override", { from: route.urgency, to: "P0" }); route = { ...route, urgency: "P0" }; }
    let agent = pickAgent(route.families, route.confidence);
    agentName = agent.name;
    let modelId: string | undefined;
    let out: AgentOutcome = await runAgent(agent, c, route, ctx, deps.models, trace, { timeoutMs: budget() });
    modelId = out.modelId;
    if (out.kind === "failed" && out.retryable) {
      // Rate limit or transport failure: restart the case from scratch on the fallback model (never mid-loop).
      trace.log("agent.fallback_model", { from: agent.model, to: FALLBACK_MODEL, reason: out.error.slice(0, 200) });
      agentName = `${agentName}(${FALLBACK_MODEL})`;
      out = await runAgent(agent, c, route, ctx, deps.models, trace, { timeoutMs: budget(), modelOverride: FALLBACK_MODEL });
      modelId = out.modelId;
    }
    if (out.kind === "reroute" && agent.name !== generalist.name) {
      agent = generalist; agentName = `${agentName}->generalist`;
      out = await runAgent(agent, c, { ...route, reasons: `${route.reasons} | rerouted: ${out.reason}` }, ctx, deps.models, trace, { timeoutMs: budget(), modelOverride: modelId });
    }
    if (out.kind === "failed" && agent.name !== generalist.name && budget() > 60_000) {
      agent = generalist; agentName = `${agentName}->generalist`;
      out = await runAgent(agent, c, route, ctx, deps.models, trace, { timeoutMs: budget(), modelOverride: modelId });
    }

    if (out.kind === "resolution") {
      run = out.run; res = out.resolution; modelId = out.modelId;
      let lastMessages: ModelMessage[] = out.messages;

      // ---- Checks, one revision, then a safe fallback ----
      let problems = runChecks(c, res, run); checks.push(problems);
      trace.log("checks", { pass: 1, problems });
      if (problems.length) {
        const before = run.staged.length;
        const rev = await runAgent(agent, c, route, ctx, deps.models, trace, { revision: { messages: lastMessages, run, feedback:
          `Automated checks failed: ${problems.join("; ")}\nRevise. If you restage an action of the same kind to the same party or contractor, the earlier staged version is withdrawn automatically; otherwise your earlier staged actions remain. Then call submit_resolution again.` }, timeoutMs: budget(), modelOverride: modelId });
        if (rev.kind === "resolution") { res = rev.resolution; lastMessages = rev.messages; supersede(before); problems = runChecks(c, res, run); checks.push(problems); trace.log("checks", { pass: 2, problems }); }
        else { blockNew(before, `revision did not complete (${rev.kind})`); trace.log("revision.failed", { kind: rev.kind }); }
        if (problems.length) {
          // Keep the safe actions, drop high-risk and offending ones, escalate with the pack.
          const offenders = new Set(paymentOffenders(run).map((a) => a.actionId));
          for (const a of run.staged) if (a.status === "staged" && (["create_work_order", "book_contractor"].includes(a.tool) || offenders.has(a.actionId))) { a.status = "blocked"; a.error = "dropped after failed checks"; }
          const forcedP0 = c.flags.some((f) => f.minUrgency === "P0" && !overruled(c, res!).has(f.name));
          const urgency = forcedP0 ? "P0" : res.urgency;
          const tier = urgency === "P0" ? "P0" : "P1";
          const fact = `Automated checks failed: ${problems.join("; ")}.`;
          res = { ...res, urgency, finalState: "escalated", escalation: { tier, reason: fact, decisionRequired: "Review the proposed actions and the check failures; decide what to execute.", handover: res.summaryForHuman } };
          pushEscalate("escalate#auto", tier, res.escalation.decisionRequired!, fact);
        }
      }

      // ---- Phase 1: state-changing actions. Messages wait until results are known. ----
      await executeStaged(run, ctx, trace, "state");
      let claims = await claimCheck(res, run, ctx.store);
      if (troubled().length || claims.length) {
        // Truth repair: withdraw pending messages, one bounded reconciliation turn, re-check, and never let a false claim out.
        const withdrawn = withdrawPendingComms(run, trace);
        const before = run.staged.length; let accepted = false;
        trace.log("reconcile.start", { troubled: troubled().map((a) => a.actionId), claims, withdrawn, budgetMs: budget() });
        if (budget() > 45_000) {
          const feedback = troubled().map((a) => `${a.tool} (${a.actionId}) -> ${a.status}: ${a.error ?? ""}`).join("; ") || "none";
          const rec = await runAgent(agent, c, route, ctx, deps.models, trace, { revision: { messages: lastMessages, run, feedback:
            `Execution results for your state-changing actions: ${feedback}. ${claims.length ? `Your text described failed actions as done: ${claims.join("; ")}. ` : ""}` +
            `Your pending messages (${withdrawn.join(", ") || "none"}) were withdrawn before sending. ` +
            `Now: (1) recover where you can, for example stage the next suitable panel contractor; if none is suitable, escalate with "NO CONTRACTOR CONFIRMED" as the first words of the decision required; ` +
            `(2) restage every message you still want to send, written against what has actually happened (a failed booking is not a booking; an unknown result may or may not have happened, verify or escalate, never repeat it blindly); ` +
            `(3) resubmit a resolution whose decision, summary and communications match reality, including any failure that remains.` }, timeoutMs: budget(), modelOverride: modelId });
          const p = rec.kind === "resolution" ? runChecks(c, rec.resolution, run) : [`reconcile turn ${rec.kind}${rec.kind === "failed" ? `: ${rec.error.slice(0, 160)}` : ""}`];
          checks.push(p); trace.log("checks", { pass: checks.length, stage: "reconcile", problems: p });
          if (rec.kind === "resolution" && p.length === 0) { accepted = true; res = rec.resolution; lastMessages = rec.messages; supersede(before); await executeStaged(run, ctx, trace, "state"); }
        }
        if (!accepted) blockNew(before, "reconcile not accepted");
        claims = await claimCheck(res, run, ctx.store);
        const unrecovered = troubled().some((a) => BOOKING_TOOLS.includes(a.tool)) && !run.staged.some((a) => a.status === "success" && BOOKING_TOOLS.includes(a.tool));
        if (claims.length || unrecovered || !accepted) {
          const fact = `Execution check: ${[...claims, ...troubled().map((a) => `${a.actionId} ${a.status}${a.error ? ` (${a.error})` : ""}`)].join("; ") || "reconciliation not accepted"}.`;
          if (claims.length) withdrawPendingComms(run, trace); // only messages that still make a false claim are held back; honest restaged messages go out
          const tier: "P0" | "P1" = res.escalation.tier !== "none" ? res.escalation.tier : res.urgency === "P0" ? "P0" : "P1";
          const existing = res.escalation.decisionRequired ?? "Correct what the tenant and landlord were told and confirm the arrangements.";
          const decisionRequired = unrecovered && !/NO CONTRACTOR CONFIRMED/i.test(existing) ? `NO CONTRACTOR CONFIRMED. ${existing}` : existing;
          trace.log("claims.unresolved", { claims, unrecovered, accepted });
          res = { ...res, decision: /^Execution check:/.test(res.decision) ? res.decision : `${fact} ${res.decision}`, finalState: res.finalState === "scheduled" || res.finalState === "resolved" ? "escalated" : res.finalState, escalation: { tier, reason: fact, decisionRequired, deadline: res.escalation.deadline, handover: res.escalation.handover ?? res.summaryForHuman } };
          const agentEscalation = run.staged.find((a) => a.tool === "escalate" && (a.status === "staged" || a.status === "success"));
          if (!agentEscalation) pushEscalate("escalate#claims", tier, decisionRequired, fact);
          else if (agentEscalation.status === "staged") (agentEscalation.input as any).what_was_tried = `${(agentEscalation.input as any).what_was_tried ?? ""} ${fact}`.trim();
        }
      }

      // ---- Phase 2: communications and handovers, now consistent with results. ----
      await executeStaged(run, ctx, trace, "comms");
      const badComms = run.staged.filter((a) => a.tool === "send_message" && (a.status === "failure" || a.status === "unknown"));
      if (badComms.length) {
        const fact = `Message delivery: ${badComms.map((a) => `${a.actionId} to ${(a.input as any).to_party} ${a.status}${a.error ? ` (${a.error})` : ""}`).join("; ")}.`;
        const tier: "P0" | "P1" = res.escalation.tier === "P0" ? "P0" : "P1";
        const decisionRequired = "Re-contact the parties whose messages did not confirm delivery, by the channel on file.";
        if (res.escalation.tier === "none") res = { ...res, escalation: { tier, reason: fact, decisionRequired, handover: fact }, finalState: res.finalState === "resolved" ? "awaiting_approval" : res.finalState };
        else res = { ...res, escalation: { ...res.escalation, reason: `${res.escalation.reason ?? ""} ${fact}`.trim() } };
        pushEscalate("escalate#comms", tier, decisionRequired, fact);
        await executeStaged(run, ctx, trace, "comms");
      }
      if (run.staged.some((a) => a.status === "unknown") && res.finalState === "resolved") res = { ...res, finalState: "awaiting_approval" };
      page = await notifyEscalation(c.id, res, trace, ctx.env);
    } else {
      run = out.run; error = out.kind === "failed" ? out.error : `reroute from generalist: ${out.reason}`;
    }
  } catch (e) {
    error = String(e);
    trace.log("case.error", { error: error.slice(0, 600) });
  }
  try { writeAnswer(dir, c, res, run, route, { agent: agentName, error, checks, page }); }
  catch (e) { trace.log("write.error", { error: String(e) }); try { writeAnswer(dir, c, null, { staged: [], control: {} }, route, { agent: agentName, error: `writer failed: ${String(e)}`, checks, page }); } catch { /* nothing left to do */ } }
  const ms = Date.now() - started;
  trace.log("case.end", { ms, status: res ? res.finalState : "error" });
  return { caseId: c.id, folder: deps.folder, status: res ? res.finalState : "error", family: res?.family, urgency: res?.urgency ?? route?.urgency, escalation: res?.escalation.tier, agent: agentName, error, ms };
}
