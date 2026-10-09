import { getTool } from "../tools/registry.js";
import type { ToolContext } from "../tools/types.js";
import { UnknownResult } from "../tools/write.js";
import type { CaseRun } from "./wrapper.js";
import type { Trace } from "./trace.js";

/** Performs staged writes, in order. Idempotency: one execution per actionId; retries only on transient errors. */
export async function executeStaged(run: CaseRun, ctx: ToolContext, trace: Trace): Promise<void> {
  for (const a of run.staged) {
    if (a.status !== "staged") continue;
    const def = getTool(a.tool);
    if (!def.perform) { a.status = "failure"; a.error = "tool has no perform"; continue; }
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        a.result = await def.perform(a.input as any, ctx);
        a.status = "success";
        trace.log("execute.success", { actionId: a.actionId, tool: a.tool, attempt });
        break;
      } catch (e) {
        if (e instanceof UnknownResult) { a.status = "unknown"; a.error = String(e.message); trace.log("execute.unknown", { actionId: a.actionId, tool: a.tool, error: a.error }); break; }
        a.status = "failure"; a.error = String((e as Error).message ?? e);
        trace.log("execute.failure", { actionId: a.actionId, tool: a.tool, attempt, error: a.error });
        if (!/timeout|ECONN|503|502|429/i.test(a.error)) break;
      }
    }
  }
}
