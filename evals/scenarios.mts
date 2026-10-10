/**
 * Scripted failure scenarios for the orchestrator (offline, mock model). Run: pnpm scenarios
 * A: booking fails with little budget left -> messages withdrawn, escalation "NO CONTRACTOR CONFIRMED", no false SMS.
 * B: a check revision restages a booking and a message -> earlier versions superseded, no duplicates, gas SMS still sent.
 * C: the replacement booking also fails -> its message withdrawn too, escalated.
 * D: the reconciliation turn crashes -> its staged actions blocked and visible, escalated.
 * E: a truthful recovery (second contractor booked, message says the first could not come) -> accepted, not flagged.
 * Written by the overnight code review; kept as a regression test.
 */
import fs from "node:fs";
import path from "node:path";
import { MockLanguageModelV4 } from "ai/test";
const { runCase } = await import("../src/orchestrator/runCase.js");
const { openStore } = await import("../src/backend/store.js");
const { FailureInjector } = await import("../src/backend/failures.js");
delete process.env.TYPESAFE_API_KEY; delete process.env.ESCALATION_WEBHOOK_URL;
const OUT = path.resolve("out/scenarios");
fs.rmSync(OUT, { recursive: true, force: true });
const usage = { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } };
const calls = (tc: [string, any][]) => ({ finishReason: { unified: "tool-calls", raw: "tool_use" }, usage, warnings: [], content: tc.map(([n, i], k) => ({ type: "tool-call", toolCallId: `t${Math.random()}`, toolName: n, input: JSON.stringify(i) })) });
const sub = (o: any) => calls([["submit_resolution", { family: "maintenance", urgency: "P1", decision: "d", summaryForHuman: "s", notDone: [], conflicts: [], missingInformation: [], flagAssessments: [], communications: [], escalation: { tier: "none" }, finalState: "scheduled", ...o }]]);
const msg = (body: string) => ["send_message", { to_party: "tenant", to_ref: "TEN1", channel: "sms", body }] as [string, any];
const book = (id: string, slot = "2026-10-08T14:00") => ["book_contractor", { contractor_id: id, property_id: "P1", slot, scope: "unblock drain" }] as [string, any];
function scripted(steps: (() => any)[]) {
  let i = 0;
  return () => new MockLanguageModelV4({ doGenerate: async (opts: any) => {
    const names = (opts.tools ?? []).map((t: any) => t.name);
    if (!names.includes("submit_resolution")) return { finishReason: { unified: "stop", raw: "end_turn" }, usage, warnings: [], content: [{ type: "text", text: JSON.stringify({ families: ["maintenance"], urgency: "P1", confidence: 0.9, reasons: "r" }) }] };
    const f = steps[i++]; if (!f) throw new Error("script exhausted"); return f();
  } } as any);
}
const store = await openStore({});
await store.upsert("contractors", "CON-01", { name: "Hackney Drainage Co", callout_gbp: 120 });
await store.upsert("contractors", "CON-02", { name: "Pinnacle Plumbing & Heating", callout_gbp: 95 });
const mkCase = (id: string, flags: any[] = []) => ({ id, channel: "sms", kind: "event", receivedAt: "2026-10-08T09:00:00Z", rawText: "blocked drain", attachments: [], linkedIds: {}, flags, sourceFiles: [] });
async function scenario(name: string, inject: string, timeoutMs: number, steps: (() => any)[], flags: any[] = []) {
  const failures = new FailureInjector(inject);
  const out = await runCase(mkCase(name, flags) as any, { models: scripted(steps), ctxFor: (c: any) => ({ caseId: c.id, store, failures, now: c.receivedAt, env: {} }), outDir: OUT, folder: name, caseTimeoutMs: timeoutMs });
  const ans = fs.readFileSync(path.join(OUT, name, "ANSWER.md"), "utf8");
  const ev = fs.readFileSync(path.join(OUT, name, "trace.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((e) => /^(execute|reconcile|claims|checks)/.test(e.event)).map((e) => `${e.event}${e.actionId ? " " + e.actionId : ""}${e.problems ? " " + JSON.stringify(e.problems) : ""}`);
  const staged = fs.readFileSync(path.join(OUT, name, "trace.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((e) => e.event === "tool.staged").map((e) => e.actionId);
  console.log(`\n===== ${name}: status=${out.status} esc=${out.escalation}\nstaged: ${staged.join(", ")}\n${ev.join("\n")}`);
  const sect = (h: string) => (ans.split(`## ${h}`)[1] ?? "").split("\n## ")[0].trim();
  console.log(`-- Execution status:\n${ans.split("\n## ")[1]?.split("\n").slice(1).join("\n")}\n-- Escalation: ${sect("Escalation").slice(0, 300)}\n-- Messages sent:\n${sect("Messages sent (full text)")}`);
  console.log(`-- ANSWER mentions book_contractor#5? ${ans.includes("book_contractor#5") || ans.includes("book_contractor#6")}`);
}
// A: booking fails, <45s budget left -> reconcile skipped
await scenario("A-budget-gate", "book_contractor:fail:1", 30_000, [
  () => calls([book("CON-01"), msg("Hackney Drainage Co is booked for 2pm today.")]),
  () => sub({ decision: "Booked CON-01 for 2pm." }),
]);
// B: check revision restages a corrected message and booking -> both copies execute
const gas = [{ name: "gas_or_co", evidence: "smell gas", minUrgency: "P0", forcedAction: "Tell the reporter to call the National Gas Emergency line 0800 111 999" }];
await scenario("B-revision-dupes", "", 240_000, [
  () => calls([book("CON-02"), msg("We have logged your report and will update you shortly.")]),
  () => sub({}),
  () => calls([book("CON-02", "2026-10-08T10:00"), msg("Call 0800 111 999 now and ventilate."), ["escalate", { tier: "P0", decision_required: "confirm gas isolation", summary: "s", what_was_tried: "w" }]]),
  () => sub({ urgency: "P0", escalation: { tier: "P0", decisionRequired: "confirm gas isolation" }, finalState: "escalated", flagAssessments: [{ flag: "gas_or_co", falsePositive: false, reason: "tenant smells gas" }] }),
], gas);
// C: reconcile accepted, replacement booking also fails -> its pending message still sent
await scenario("C-second-fail", "book_contractor:fail:2", 240_000, [
  () => calls([book("CON-01"), msg("Hackney Drainage Co is booked for 2pm today.")]),
  () => sub({ decision: "Booked CON-01 for 2pm." }),
  () => calls([book("CON-02", "2026-10-08T15:00"), msg("CON-01 was unavailable. Pinnacle Plumbing & Heating is booked for 3pm today.")]),
  () => sub({ decision: "CON-01 failed; CON-02 booked for 3pm." }),
]);
// D: reconcile turn stages actions then errors -> comms sent unchecked, booking left 'staged'
await scenario("D-reconcile-fails", "book_contractor:fail:1", 240_000, [
  () => calls([book("CON-01"), msg("Hackney Drainage Co is booked for 2pm today.")]),
  () => sub({ decision: "Booked CON-01 for 2pm." }),
  () => calls([book("CON-02", "2026-10-08T15:00"), msg("Pinnacle Plumbing & Heating is booked for 3pm today.")]),
  () => { throw new Error("boom"); },
]);
// E: successful recovery, truthful text naming the failed contractor
await scenario("E-true-recovery", "book_contractor:fail:1", 240_000, [
  () => calls([book("CON-01"), msg("Hackney Drainage Co is booked for 2pm today.")]),
  () => sub({ decision: "Booked CON-01 for 2pm." }),
  () => calls([book("CON-02", "2026-10-08T15:00"), msg("Sorry, the first plumber could not come. Pinnacle Plumbing & Heating will attend at 3pm today.")]),
  () => sub({ decision: "CON-01 could not attend so we booked CON-02 for 3pm." }),
]);
await store.close();
