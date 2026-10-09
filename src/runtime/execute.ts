import { getTool } from "../tools/registry.js";
import type { ToolContext } from "../tools/types.js";
import { UnknownResult } from "../tools/write.js";
import type { CaseRun } from "./wrapper.js";
import type { Trace } from "./trace.js";

/** Phase 1: actions that change state (tickets, bookings, work orders). Phase 2: communications and handovers, sent only once phase 1 results are known. */
export const STATE_TOOLS = new Set(["create_ticket", "update_ticket", "create_work_order", "book_contractor", "book_inspection", "record_landlord_decision", "propose_action", "report_blocker"]);
export const COMMS_TOOLS = new Set(["send_message", "escalate", "call_on_call_manager"]);

/** Performs staged writes of one phase, in order. One execution per actionId; retries only on transient errors. */
export async function executeStaged(run: CaseRun, ctx: ToolContext, trace: Trace, phase: "state" | "comms" | "all" = "all"): Promise<void> {
  for (const a of run.staged) {
    if (a.status !== "staged") continue;
    if (phase === "state" && !STATE_TOOLS.has(a.tool)) continue;
    if (phase === "comms" && !COMMS_TOOLS.has(a.tool)) continue;
    const def = getTool(a.tool);
    if (!def.perform) { a.status = "failure"; a.error = "tool has no perform"; continue; }
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        a.result = await def.perform(a.input as any, ctx);
        a.status = "success";
        trace.log("execute.success", { actionId: a.actionId, tool: a.tool, attempt, phase });
        break;
      } catch (e) {
        if (e instanceof UnknownResult) { a.status = "unknown"; a.error = String(e.message); trace.log("execute.unknown", { actionId: a.actionId, tool: a.tool, error: a.error, phase }); break; }
        a.status = "failure"; a.error = String((e as Error).message ?? e);
        trace.log("execute.failure", { actionId: a.actionId, tool: a.tool, attempt, error: a.error, phase });
        if (!/timeout|ECONN|503|502|429/i.test(a.error)) break;
      }
    }
  }
}

/** Withdraws not-yet-executed communications so they can be restaged against real results. */
export function withdrawPendingComms(run: CaseRun, trace: Trace): string[] {
  const withdrawn: string[] = [];
  for (const a of run.staged) {
    if (a.status === "staged" && COMMS_TOOLS.has(a.tool)) { a.status = "blocked"; a.error = "withdrawn before sending: restaged after execution results"; withdrawn.push(a.actionId); }
  }
  if (withdrawn.length) trace.log("reconcile.withdrawn", { withdrawn });
  return withdrawn;
}
