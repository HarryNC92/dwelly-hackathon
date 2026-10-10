import "dotenv/config";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { caseContext, meaningful } from "../voice/context.js";
import { playFor } from "../voice/playbook.js";

/**
 * Minimal HTTP service for the voice loop and inbound demo. No framework, runs anywhere, tunnel-friendly.
 *   GET  /api/cases/:id            handover pack (from the run output)
 *   POST /api/escalations          { case_id, to_number?, summary, decision_required, deadline, recipient_role?, property?, options?, ... } -> places the ElevenLabs outbound call
 *   POST /api/escalations/preview  same body -> the call brief the agent would get (no call placed)
 *   POST /api/webhooks/elevenlabs  post-call webhook (HMAC verified) -> writes <OUT>/<case>/callback.json
 *   GET  /                         live board (public/board.html)
 *   GET  /api/status               per-case status derived from trace files
 *   POST /api/inbound              Twilio SMS/WhatsApp webhook (form-encoded From/Body) or JSON -> writes a case into cases/live/
 *   GET  /health
 */
const OUT = path.resolve(process.env.OUT_DIR ?? "./ANSWERS");
const PORT = Number(process.env.PORT ?? 8787);

/**
 * Turns an escalation into the agent's dynamic variables. Precedence: explicit fields in the POST
 * (recipient_role, property, options, ...), then what the runner already wrote for this case (trace flags,
 * resolution, original report via CASES_DIR), then the per-flag playbook in voice/playbook.ts.
 */
function callBrief(body: any): Record<string, string> {
  const caseId = String(body.case_id ?? "unknown");
  const ctx = caseContext(OUT, caseId);
  const res = ctx.resolution ?? {};
  const play = playFor(ctx.flags);
  const pick = (...vals: unknown[]) => vals.find(meaningful) as string | undefined;
  const reported = ctx.report ? `The tenant reported: "${ctx.report}"` : undefined;
  const assessed = pick(body.issue, body.summary, res.summaryForHuman);
  const unknowns = [...(res.missingInformation ?? []), ...(res.conflicts ?? []).map((c: any) => c.facts)].filter(meaningful);
  return {
    case_id: caseId,
    recipient_role: (pick(body.recipient_role) ?? "property manager").replace("_", " "),
    recipient_name: pick(body.recipient_name) ?? "there",
    property: pick(body.property, ctx.property) ?? "one of our managed properties (the address is in the case file)",
    tenant_name: pick(body.tenant_name) ?? "the tenant",
    issue: [reported, assessed].filter(Boolean).join(" Our assessment: ") || "An urgent case needs a decision; the details are in the case file.",
    why_urgent: (pick(body.why_urgent, res.escalation?.reason && !/^Automated checks failed/.test(res.escalation.reason) ? res.escalation.reason : undefined) ?? play.why_urgent) + (body.deadline ? ` A decision is needed by ${body.deadline}.` : ""),
    risk_if_delayed: pick(body.risk_if_delayed) ?? play.risk_if_delayed,
    facts_uncertain: pick(body.facts_uncertain) ?? (unknowns.length ? unknowns.slice(0, 3).join(". ") : "Anything not in this summary is unconfirmed."),
    options: pick(body.options) ?? play.options,
    recommended_option: pick(body.recommended_option) ?? play.recommended_option,
    recommendation_reason: pick(body.recommendation_reason) ?? play.recommendation_reason,
    authority_limit: pick(body.authority_limit) ?? "the agency's emergency spending limit",
  };
}

async function placeCall(body: any) {
  const key = process.env.ELEVENLABS_API_KEY, agent = process.env.ELEVENLABS_AGENT_ID, phone = process.env.ELEVENLABS_PHONE_NUMBER_ID;
  const byRole = body.recipient_role === "landlord" ? process.env.LANDLORD_PHONE_NUMBER : undefined;
  const to = body.to_number ?? byRole ?? process.env.ONCALL_PHONE_NUMBER;
  if (!key || !agent || !phone || !to) return { placed: false, reason: "voice not configured" };
  const r = await fetch("https://api.elevenlabs.io/v1/convai/twilio/outbound-call", {
    method: "POST", headers: { "xi-api-key": key, "content-type": "application/json" },
    body: JSON.stringify({
      agent_id: agent, agent_phone_number_id: phone, to_number: to,
      conversation_initiation_client_data: { dynamic_variables: callBrief(body) },
    }),
    signal: AbortSignal.timeout(8000),
  });
  const text = await r.text();
  return { placed: r.ok, status: r.status, body: text.slice(0, 500) };
}

/** ElevenLabs-Signature: "t=<unix>,v0=<hex hmac-sha256 of `${t}.${rawBody}`>". Unset secret => accept (local dev only). */
function verifySignature(raw: string, header: string | undefined): boolean {
  const secret = process.env.ELEVENLABS_WEBHOOK_SECRET;
  if (!secret) return true;
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
  if (!parts.t || !parts.v0 || Math.abs(Date.now() / 1000 - Number(parts.t)) > 30 * 60) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${parts.t}.${raw}`).digest("hex");
  return expected.length === parts.v0.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v0));
}

function json(res: http.ServerResponse, code: number, data: unknown) {
  res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(data));
}
function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => resolve(b)); });
}

http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  try {
    if (req.method === "GET" && url.pathname === "/health") return json(res, 200, { ok: true });
    if (req.method === "GET" && url.pathname === "/") { res.writeHead(200, { "content-type": "text/html" }); return res.end(fs.readFileSync(path.join(process.cwd(), "public", "board.html"))); }
    if (req.method === "GET" && url.pathname === "/api/status") {
      const cases = fs.existsSync(OUT) ? fs.readdirSync(OUT, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => {
        const tf = path.join(OUT, e.name, "trace.jsonl");
        const events = fs.existsSync(tf) ? fs.readFileSync(tf, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
        const end = events.find((x) => x.event === "case.end"); const route = events.find((x) => x.event === "route"); const submit = [...events].reverse().find((x) => x.event === "agent.submit");
        const start = events.find((x) => x.event === "agent.start");
        const answer = fs.existsSync(path.join(OUT, e.name, "ANSWER.md")) ? fs.readFileSync(path.join(OUT, e.name, "ANSWER.md"), "utf8") : "";
        const summary = answer.match(/## Summary\n([\s\S]*?)$/)?.[1]?.trim() ?? "";
        return { id: e.name, status: end ? end.status : events.length ? "running" : "queued", urgency: submit?.urgency ?? route?.urgency, family: submit?.family ?? route?.families?.[0], agent: start?.agent, summary, events: events.map((x) => ({ event: x.event, tool: x.tool, problems: x.problems })) };
      }) : [];
      return json(res, 200, { cases });
    }
    const m = url.pathname.match(/^\/api\/cases\/([^/]+)$/);
    if (req.method === "GET" && m) {
      const dir = path.join(OUT, decodeURIComponent(m[1]));
      if (!fs.existsSync(dir)) return json(res, 404, { error: "no such case" });
      const answer = fs.existsSync(path.join(dir, "ANSWER.md")) ? fs.readFileSync(path.join(dir, "ANSWER.md"), "utf8") : "";
      return json(res, 200, { case_id: m[1], answer });
    }
    if (req.method === "POST" && url.pathname === "/api/escalations/preview") {
      return json(res, 200, callBrief(JSON.parse((await readBody(req)) || "{}")));
    }
    if (req.method === "POST" && url.pathname === "/api/escalations") {
      const body = JSON.parse((await readBody(req)) || "{}");
      const result = await placeCall(body);
      const dir = path.join(OUT, String(body.case_id ?? "unknown")); fs.mkdirSync(dir, { recursive: true });
      fs.appendFileSync(path.join(dir, "calls.jsonl"), JSON.stringify({ ts: new Date().toISOString(), request: body, result }) + "\n");
      return json(res, 200, result);
    }
    if (req.method === "POST" && url.pathname === "/api/inbound") {
      const raw = await readBody(req);
      let from = "", body = "", channel = "sms";
      if ((req.headers["content-type"] ?? "").includes("application/json")) { const j = JSON.parse(raw || "{}"); from = String(j.from ?? j.From ?? ""); body = String(j.body ?? j.Body ?? ""); channel = String(j.channel ?? "sms"); }
      else { const p = new URLSearchParams(raw); from = p.get("From") ?? ""; body = p.get("Body") ?? ""; channel = from.startsWith("whatsapp:") ? "whatsapp" : "sms"; }
      const id = `live-${new Date().toISOString().replace(/[:.]/g, "-")}`;
      const dir = path.join(process.cwd(), "cases", "live", id); fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, "message.json"), JSON.stringify({ channel, received_at: new Date().toISOString(), from: from.replace(/^whatsapp:/, ""), message: body }, null, 2));
      console.log(`inbound ${channel} from ${from}: case ${id}`);
      // The runner picks it up: pnpm cases -- --cases ./cases/live --data ./data/<set> --out ./out/live
      res.writeHead(200, { "content-type": "text/xml" }); return res.end("<Response></Response>");
    }
    if (req.method === "POST" && url.pathname === "/api/webhooks/elevenlabs") {
      const raw = await readBody(req);
      if (!verifySignature(raw, req.headers["elevenlabs-signature"] as string | undefined)) return json(res, 401, { error: "bad signature" });
      const payload = JSON.parse(raw || "{}");
      const data = payload.data ?? {};
      const caseId = data.conversation_initiation_client_data?.dynamic_variables?.case_id ?? "unknown";
      const r = data.analysis?.data_collection_results ?? {};
      const chosen = r.chosen_option?.value ?? null;
      const status = payload.type === "call_initiation_failure" ? "no_answer" : chosen && chosen !== "none" ? "decided" : "undecided";
      const callback = {
        received_at: new Date().toISOString(), type: payload.type, status,
        chosen_option: chosen, decision: r.decision_summary?.value ?? null, spend_limit_gbp: r.spend_limit_gbp?.value ?? null,
        callback_requested: r.callback_requested?.value ?? null, failure_reason: data.failure_reason ?? null,
        summary: data.analysis?.transcript_summary ?? null, conversation_id: data.conversation_id ?? null,
      };
      const dir = path.join(OUT, String(caseId)); fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, "callback.json"), JSON.stringify(callback, null, 2));
      console.log(`callback for ${caseId}: ${status} option=${chosen}`);
      return json(res, 200, { ok: true });
    }
    json(res, 404, { error: "not found" });
  } catch (e) {
    json(res, 500, { error: String(e) });
  }
}).listen(PORT, () => console.log(`service on :${PORT}, output dir ${OUT}`));
