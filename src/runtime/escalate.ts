import type { Resolution } from "../schemas/resolution.js";
import type { Trace } from "./trace.js";

/** Fire and forget. Never waits for a human, never blocks the case. P0 posts to the voice webhook if configured. */
export async function notifyEscalation(caseId: string, res: Resolution, trace: Trace, env: Record<string, string | undefined>): Promise<void> {
  if (res.escalation.tier !== "P0") return;
  const url = env.ESCALATION_WEBHOOK_URL;
  if (!url) { trace.log("escalate.p0.recorded", { note: "no ESCALATION_WEBHOOK_URL; call not placed" }); return; }
  try {
    const r = await fetch(url, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ case_id: caseId, to_number: env.ONCALL_PHONE_NUMBER, summary: res.summaryForHuman, decision_required: res.escalation.decisionRequired, deadline: res.escalation.deadline }),
      signal: AbortSignal.timeout(5000),
    });
    trace.log("escalate.p0.call", { status: r.status, body: (await r.text()).slice(0, 300) });
  } catch (e) {
    trace.log("escalate.p0.call_failed", { error: String(e) });
  }
}
