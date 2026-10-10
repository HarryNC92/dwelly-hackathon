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

// ===================== Stream B: triage-rule scenarios (guards and checks reading CaseState) =====================
// Each scenario builds a case with an extracted state and asserts that the named rule id appears where expected:
// in a tool.blocked reason (guard) or in a checks problem list (resolution rule). Positive controls assert the opposite.
const { CaseStateSchema } = await import("../src/schemas/casestate.js");
const ADDR = "Flat 8, 118 Meadow Row, Alderwick, ZZ3 6ZZ";
const baseState = (over: any = {}) => CaseStateSchema.parse({ jobId: "NBL-043-0001", propertyAddress: ADDR, stage: "landlord_gate", occupancy: "tenanted", landlordApproval: { status: "pending", eventN: 2 },
  parties: [{ role: "tenant", names: ["Isaac Quinn"], phones: ["07700 900844"], emails: [] }, { role: "landlord", names: ["Ava Rowan"] }], lastEventTs: "2026-04-13T06:45:00Z", workStatus: "not_started", ...over });
const ruleResults: string[] = [];
async function ruleScenario(name: string, state: any, steps: (() => any)[], expect: { blocked?: string; notBlocked?: string; check?: string; noCheck?: string }, channel = "tenant request", rawText?: string) {
  const failures = new FailureInjector("");
  const c = { ...mkCase(name), channel, receivedAt: state.lastEventTs, state, ...(rawText ? { rawText } : {}) } as any;
  await runCase(c, { models: scripted(steps), ctxFor: (cc: any) => ({ caseId: cc.id, case: cc, store, failures, now: cc.receivedAt, env: {} }), outDir: OUT, folder: name, caseTimeoutMs: 240_000 });
  const trace = fs.readFileSync(path.join(OUT, name, "trace.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const blocked = trace.filter((e) => e.event === "tool.blocked").map((e) => `${e.tool}: ${e.reason}`);
  const checks = trace.filter((e) => e.event === "checks").flatMap((e) => e.problems ?? []);
  const results: string[] = [];
  if (expect.blocked) results.push(blocked.some((b) => b.includes(expect.blocked!)) ? `PASS blocked by ${expect.blocked}` : `FAIL expected a block citing ${expect.blocked}; blocked=${JSON.stringify(blocked)}`);
  if (expect.notBlocked) results.push(blocked.some((b) => b.startsWith(expect.notBlocked! + ":")) ? `FAIL ${expect.notBlocked} was blocked: ${JSON.stringify(blocked)}` : `PASS ${expect.notBlocked} staged`);
  if (expect.check) results.push(checks.some((p) => p.includes(expect.check!)) ? `PASS check cites ${expect.check}` : `FAIL expected a check problem citing ${expect.check}; checks=${JSON.stringify(checks)}`);
  if (expect.noCheck) results.push(checks.some((p) => p.includes(expect.noCheck!)) ? `FAIL unexpected check ${expect.noCheck}: ${JSON.stringify(checks)}` : `PASS no ${expect.noCheck} problem`);
  console.log(`\n===== ${name}\nblocked: ${blocked.map((b) => b.slice(0, 160)).join(" | ") || "none"}\nchecks: ${checks.map((p) => p.slice(0, 160)).join(" | ") || "none"}\n${results.join("\n")}`);
  ruleResults.push(...results.map((r) => `${name}: ${r}`));
}
const assign = (provider: string, extra: any = {}) => ["assign_provider", { provider, property: ADDR, scope: "washing machine not draining", ...extra }] as [string, any];
const toLL = (body: string) => ["send_message", { to_party: "landlord", to_ref: "LL1", channel: "email", body }] as [string, any];
const toTenant = (body: string) => ["send_message", { to_party: "tenant", to_ref: "TEN1", channel: "email", body }] as [string, any];
const hold = ["set_hold", { reason: "waiting for landlord approval", waiting_for: "landlord", until: "2026-04-16T09:00:00Z" }] as [string, any];
const okSub = (o: any = {}) => sub({ finalState: "awaiting_approval", notDone: [{ action: "dispatch", reason: "blocked by rule, waiting for landlord" }], ...o });

// F: dispatch before approval is a hard stop (043, 048)
await ruleScenario("F-dispatch-before-approval", baseState(), [() => calls([assign("Oakfield Homes"), hold]), () => okSub()], { blocked: "PM-AUTH-001" });
// G: approved -> dispatch allowed (positive control; the judge's misses were all "too slow")
await ruleScenario("G-dispatch-approved", baseState({ landlordApproval: { status: "approved", eventN: 13, text: "Yes, that is fine to send out a contractor." }, stage: "dispatch" }), [() => calls([assign("Oakfield Homes", { landlord_approval_ref: "event 13" })]), () => sub({ finalState: "scheduled" })], { notBlocked: "assign_provider" });
// G2: agency-raised job (no landlord gate) -> dispatch allowed
await ruleScenario("G2-dispatch-agency-job", baseState({ landlordApproval: { status: "none" }, stage: "intake", occupancy: "not_tenanted" }), [() => calls([assign("Cedar Solutions")])], { notBlocked: "assign_provider" }, "agency manager request");
// H: tenant message when the property is not tenanted (006)
await ruleScenario("H-not-tenanted", baseState({ occupancy: "not_tenanted", landlordApproval: { status: "approved", eventN: 2 } }), [() => calls([toTenant("Our contractor will attend on Monday."), hold]), () => okSub()], { blocked: "PM-OCC-001" });
// I: message quoting another property (wrong-address list)
await ruleScenario("I-wrong-address", baseState(), [() => calls([toLL("Hi Ava, the washing machine at Flat 7, 177 Beacon Close, Kingshaven, ZZ7 3ZZ is not draining. Are you happy for us to send a contractor?"), hold]), () => okSub()], { blocked: "PM-DATA-001" });
// J: tenant phone number sent to the landlord (045)
await ruleScenario("J-tenant-details", baseState(), [() => calls([toLL("Hi Ava, the tenant Isaac Quinn can be reached on 07700 900844 if your contractor wants to arrange access."), hold]), () => okSub()], { blocked: "PM-PRIV-001" });
// K: rent deduction without landlord approval of that route (013)
await ruleScenario("K-rent-deduction", baseState({ landlordApproval: { status: "approved", eventN: 13, text: "Yes please go ahead" } }), [() => calls([toLL("Hi Ava, we will deduct the £95 from the next rent payment."), hold]), () => okSub()], { blocked: "PM-LIAB-002" });
// L: closing while a safety signal is open and nothing is complete
await ruleScenario("L-close-with-safety", baseState({ stage: "awaiting_visit_date", safetySignals: ["glass may shatter or broken glass (event 1)"], landlordApproval: { status: "approved", eventN: 5 }, providerAssigned: { name: "Oakfield Homes", eventN: 8 } }), [() => calls([["close_case", { reason: "tenant stopped replying", outcome: "closed" }], hold]), () => okSub()], { blocked: "PM-SAFE-002" });
// M: a second contractor while one is assigned and the work is not complete (047)
await ruleScenario("M-second-contractor", baseState({ stage: "awaiting_visit_date", landlordApproval: { status: "approved", eventN: 5 }, providerAssigned: { name: "Oakfield Homes", eventN: 8 }, parties: [{ role: "contractor", names: ["Oakfield Homes"], isAssignedProvider: true }] }), [() => calls([assign("Riverside Works", { landlord_approval_ref: "event 5" }), hold]), () => okSub()], { blocked: "PM-AUTH-005" });
// N: "work completed" claim with no results on file (018, 024) -> check problem, fixed on revision
await ruleScenario("N-done-claim", baseState({ stage: "awaiting_results", landlordApproval: { status: "approved", eventN: 5 }, providerAssigned: { name: "Oakfield Homes", eventN: 8 }, visit: { date: "2026-04-10T10:00:00", eventN: 9 } }), [
  () => calls([toLL("Hi Ava, the washing machine repair has been completed.")]),
  () => sub({ decision: "Told the landlord the repair has been completed.", finalState: "resolved" }),
  () => calls([toLL("Hi Ava, we are awaiting the contractor's report on the washing machine visit and will confirm once we have it."), ["send_message", { to_party: "contractor", to_ref: "CON", channel: "email", body: "Please send the completion report and photos for the washing machine job." }]]),
  () => sub({ decision: "Asked the provider for the completion report; told the landlord it is awaited.", finalState: "awaiting_approval" }),
], { check: "PM-DOC-001" });
// O: landlord silent past the 3-day timer and the resolution does nothing (011, 016, 019)
await ruleScenario("O-landlord-silent", baseState({ timers: { landlordReplyDue: "2026-04-10T20:27:00Z" } }), [
  () => sub({ decision: "Waiting for the landlord.", finalState: "awaiting_approval", notDone: [{ action: "dispatch", reason: "no approval" }] }),
  () => calls([toLL("Hi Ava, following up on the washing machine: are you happy for us to send our appliance contractor?"), hold]),
  () => okSub({ decision: "Chased the landlord and set a dated hold." }),
], { check: "PM-WORKFLOW-002" });
// P: conditional approval covers a triage visit (043) -> dispatch allowed, no spurious check
await ruleScenario("P-conditional-covers-visit", baseState({ landlordApproval: { status: "conditional", eventN: 11, conditions: "easy and cheap fixes OK, quote if parts needed" }, stage: "dispatch" }), [() => calls([assign("Oakfield Homes", { landlord_approval_ref: "conditional: easy and cheap fixes OK" })]), () => sub({ finalState: "scheduled", rulesApplied: ["PM-AUTH-003"] })], { notBlocked: "assign_provider", noCheck: "PM-AUTH-003" });

// Q: the extractor left approval pending, but the agent cites a landlord-authored event after the ask (023 "Yes that sounds like it needs sorting") -> allowed
const packWith = (from: string) => `# Case\n### event 002 — 2025-07-25T10:00:00Z — Update — from Northbridge Lettings to Not specified\nPlease approve selection of provider and category\n### event 006 — 2025-07-25T12:00:00Z — Email — from ${from} to Northbridge Lettings\nHi Oliver\n\nYes that sounds like it needs sorting fairly soon.`;
await ruleScenario("Q-cited-landlord-event", baseState(), [() => calls([assign("Juniper Surveying", { landlord_approval_ref: "event 6" })]), () => sub({ finalState: "scheduled" })], { notBlocked: "assign_provider" }, "tenant request", packWith("Landlord"));
// R: the same citation pointing at a tenant-authored event is not approval
await ruleScenario("R-cited-tenant-event", baseState(), [() => calls([assign("Juniper Surveying", { landlord_approval_ref: "event 6" }), hold]), () => okSub()], { blocked: "PM-AUTH-001" }, "tenant request", packWith("Tenant"));

const fails = ruleResults.filter((r) => r.includes("FAIL"));
console.log(`\n===== rule scenarios: ${ruleResults.length - fails.length}/${ruleResults.length} passed${fails.length ? "\n" + fails.join("\n") : ""}`);
if (fails.length) process.exitCode = 1;
await store.close();
