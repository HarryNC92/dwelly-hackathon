import "dotenv/config";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

/**
 * Minimal HTTP service for the voice loop and inbound demo. No framework, runs anywhere, tunnel-friendly.
 *   GET  /api/cases/:id            handover pack (from the run output)
 *   POST /api/escalations          { case_id, to_number, summary, decision_required } -> places the ElevenLabs outbound call
 *   POST /api/webhooks/elevenlabs  post-call webhook -> writes out/<case>/callback.json
 *   GET  /                         live board (public/board.html)
 *   GET  /api/status               per-case status derived from trace files
 *   GET  /health
 */
const OUT = path.resolve(process.env.OUT_DIR ?? "./ANSWERS");
const PORT = Number(process.env.PORT ?? 8787);

async function placeCall(body: any) {
  const key = process.env.ELEVENLABS_API_KEY, agent = process.env.ELEVENLABS_AGENT_ID, phone = process.env.ELEVENLABS_PHONE_NUMBER_ID;
  const to = body.to_number ?? process.env.ONCALL_PHONE_NUMBER;
  if (!key || !agent || !phone || !to) return { placed: false, reason: "voice not configured" };
  const r = await fetch("https://api.elevenlabs.io/v1/convai/twilio/outbound-call", {
    method: "POST", headers: { "xi-api-key": key, "content-type": "application/json" },
    body: JSON.stringify({
      agent_id: agent, agent_phone_number_id: phone, to_number: to,
      conversation_initiation_client_data: { dynamic_variables: {
        case_id: String(body.case_id ?? ""), property: String(body.property ?? "the property"),
        summary: String(body.summary ?? ""), options: String(body.options ?? body.decision_required ?? "approve, attend yourself, or ask us to call the tenant"),
      } },
    }),
    signal: AbortSignal.timeout(8000),
  });
  const text = await r.text();
  return { placed: r.ok, status: r.status, body: text.slice(0, 500) };
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
    if (req.method === "POST" && url.pathname === "/api/escalations") {
      const body = JSON.parse((await readBody(req)) || "{}");
      const result = await placeCall(body);
      const dir = path.join(OUT, String(body.case_id ?? "unknown")); fs.mkdirSync(dir, { recursive: true });
      fs.appendFileSync(path.join(dir, "calls.jsonl"), JSON.stringify({ ts: new Date().toISOString(), request: body, result }) + "\n");
      return json(res, 200, result);
    }
    if (req.method === "POST" && url.pathname === "/api/webhooks/elevenlabs") {
      const raw = await readBody(req);
      // Signature verification: HMAC over the raw body with ELEVENLABS_WEBHOOK_SECRET (add before the demo).
      const payload = JSON.parse(raw || "{}");
      const data = payload.data ?? {};
      const caseId = data.conversation_initiation_client_data?.dynamic_variables?.case_id ?? "unknown";
      const decision = data.analysis?.data_collection_results?.decision?.value ?? null;
      const dir = path.join(OUT, String(caseId)); fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, "callback.json"), JSON.stringify({ received_at: new Date().toISOString(), type: payload.type, decision, summary: data.analysis?.transcript_summary ?? null, conversation_id: data.conversation_id ?? null }, null, 2));
      console.log(`callback for ${caseId}: decision=${decision}`);
      return json(res, 200, { ok: true });
    }
    json(res, 404, { error: "not found" });
  } catch (e) {
    json(res, 500, { error: String(e) });
  }
}).listen(PORT, () => console.log(`service on :${PORT}, output dir ${OUT}`));
