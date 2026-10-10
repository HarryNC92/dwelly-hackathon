import type { Resolution } from "../schemas/resolution.js";
import type { Trace } from "./trace.js";

let lastPageAt = 0;
/** Fire and forget. Never waits for a human, never blocks the case. If the webhook is configured, P0 pages (call + WhatsApp) and P1 messages the duty manager (WhatsApp only). */
export async function notifyEscalation(caseId: string, res: Resolution, trace: Trace, env: Record<string, string | undefined>): Promise<string | undefined> {
  if (res.escalation.tier === "none") return undefined;
  const url = env.ESCALATION_WEBHOOK_URL;
  if (res.escalation.tier !== "P0") {
    if (!url) return "P1 handover recorded for the duty manager (no page required)";
    try {
      const r = await fetch(url, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ tier: "P1", case_id: caseId, summary: res.summaryForHuman, decision_required: res.escalation.decisionRequired, deadline: res.escalation.deadline }),
        signal: AbortSignal.timeout(5000),
      });
      trace.log("escalate.p1.message", { status: r.status });
      return r.ok ? "P1 handover recorded; duty manager messaged on WhatsApp" : `P1 handover recorded; WhatsApp message FAILED (HTTP ${r.status})`;
    } catch (e) {
      trace.log("escalate.p1.message_failed", { error: String(e) });
      return "P1 handover recorded; WhatsApp message FAILED";
    }
  }
  if (!url) { trace.log("escalate.p0.recorded", { note: "no ESCALATION_WEBHOOK_URL; call not placed" }); return "P0 handover recorded; on-call page NOT placed (voice not configured in this run)"; }
  if (Date.now() - lastPageAt < 120_000) { trace.log("escalate.p0.rate_limited", {}); return "P0 handover recorded; on-call page skipped (another page was placed under two minutes ago)"; }
  lastPageAt = Date.now();
  try {
    const r = await fetch(url, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ tier: "P0", case_id: caseId, to_number: env.ONCALL_PHONE_NUMBER, summary: res.summaryForHuman, decision_required: res.escalation.decisionRequired, deadline: res.escalation.deadline }),
      signal: AbortSignal.timeout(5000),
    });
    const body = (await r.text()).slice(0, 300);
    trace.log("escalate.p0.call", { status: r.status, body });
    return r.ok ? `P0 on-call page placed (HTTP ${r.status})` : `P0 on-call page FAILED (HTTP ${r.status}); handover recorded`;
  } catch (e) {
    trace.log("escalate.p0.call_failed", { error: String(e) });
    return `P0 on-call page FAILED (${String(e).slice(0, 80)}); handover recorded`;
  }
}
