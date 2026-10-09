import { tool, type ToolSet } from "ai";
import type { ToolDef, ToolContext } from "../tools/types.js";
import type { StagedAction } from "../schemas/resolution.js";
import type { Trace } from "./trace.js";

/**
 * Turns our ToolDefs into AI SDK tools with one uniform behaviour:
 *  - every call is traced
 *  - read/control tools run live, with bounded retries on transient errors
 *  - write tools are guarded, then staged; nothing is performed here
 */
export type CaseRun = { staged: StagedAction[]; control: { submit?: unknown; reroute?: unknown } };

export function wrapTools(defs: ToolDef[], ctx: ToolContext, trace: Trace, run: CaseRun) {
  const out: ToolSet = {};
  for (const def of defs) {
    out[def.name] = tool({
      description: def.description,
      inputSchema: def.input as any,
      strict: true,
      execute: async (input: any) => {
        const started = Date.now();
        if (def.kind === "write") {
          const reason = def.guard ? await def.guard(input, ctx).catch((e) => `guard error: ${String(e)}`) : null;
          const actionId = `${def.name}#${run.staged.length + 1}`;
          if (reason) {
            run.staged.push({ actionId, tool: def.name, input, status: "blocked", error: reason });
            trace.log("tool.blocked", { tool: def.name, input, reason });
            return { blocked: true, reason, hint: "Adjust the action, obtain approval, or escalate the decision." };
          }
          run.staged.push({ actionId, tool: def.name, input, status: "staged" });
          trace.log("tool.staged", { tool: def.name, actionId, input });
          return { staged: true, actionId, note: "Recorded. Executes after checks pass." };
        }
        if (def.kind === "control") {
          if (def.name === "submit_resolution") run.control.submit = input;
          if (def.name === "reroute") run.control.reroute = input;
          trace.log("tool.control", { tool: def.name, input });
          return { accepted: true };
        }
        let lastErr: unknown;
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            const result = await def.run!(input, ctx);
            trace.log("tool.read", { tool: def.name, input, ms: Date.now() - started, attempt, resultPreview: preview(result) });
            return result;
          } catch (e) {
            lastErr = e;
            trace.log("tool.read.error", { tool: def.name, input, attempt, error: String(e) });
            if (!isTransient(e)) break;
            await new Promise((r) => setTimeout(r, 200 * attempt));
          }
        }
        return { error: String(lastErr), hint: "The lookup failed. Try another tool or record the gap; do not invent the data." };
      },
    });
  }
  return out;
}

function isTransient(e: unknown) { return /timeout|ECONN|EAI_AGAIN|503|502|429/i.test(String(e)); }
function preview(v: unknown) { const s = JSON.stringify(v); return s.length > 600 ? s.slice(0, 600) + "…" : s; }
