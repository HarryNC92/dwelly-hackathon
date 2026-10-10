import fs from "node:fs";
import path from "node:path";
import type { Case } from "../schemas/case.js";
import type { Resolution, Route } from "../schemas/resolution.js";
import type { CaseRun } from "./wrapper.js";
import { Trace } from "./trace.js";

export type CaseOutput = { caseId: string; folder: string; status: string; family?: string; urgency?: string; escalation?: string; agent?: string; error?: string; ms: number };

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) + "…" : s);

export function writeAnswer(dir: string, c: Case, res: Resolution | null, run: CaseRun, route: Route | null, meta: { agent?: string; error?: string; checks: string[][]; page?: string }) {
  fs.mkdirSync(dir, { recursive: true });
  const label = (a: CaseRun["staged"][number]) => (a.status === "success" && ["propose_action", "report_blocker", "escalate"].includes(a.tool) ? "recorded for human" : a.status);
  const actionLine = (a: CaseRun["staged"][number]) => `- ${a.actionId} ${a.tool} [${label(a)}] ${clip(JSON.stringify(a.input), 400)}${a.error ? ` — ${a.error}` : ""}`;
  const statusBlock = () => {
    const ok = run.staged.filter((a) => a.status === "success" && !["propose_action", "report_blocker", "escalate"].includes(a.tool)); const bad = run.staged.filter((a) => a.status === "failure" || a.status === "unknown");
    const blocked = run.staged.filter((a) => a.status === "blocked" && !/withdrawn/.test(a.error ?? ""));
    const lines = [
      `- Executed: ${ok.length ? ok.map((a) => `${a.tool}${(a.input as any).contractor_id ? ` (${(a.input as any).contractor_id})` : ""}`).join(", ") : "nothing"}`,
      `- Failed or unknown: ${bad.length ? bad.map((a) => `${a.tool}${(a.input as any).contractor_id ? ` (${(a.input as any).contractor_id})` : ""} → ${a.status}: ${a.error ?? ""}`).join("; ") : "none"}`,
      `- Blocked by guards or checks: ${blocked.length ? blocked.map((a) => `${a.tool}: ${a.error ?? ""}`).join("; ") : "none"}`,
      `- Human handover: ${meta.page ?? (res && res.escalation.tier !== "none" ? `tier ${res.escalation.tier} recorded` : "not required")}`,
    ];
    return `## Execution status (generated from execution results, not from the agent's text)\n${lines.join("\n")}`;
  };
  const messages = run.staged.filter((a) => a.tool === "send_message" && a.status === "success").map((a) => { const i = a.input as any; return `### To ${i.to_party} (${i.to_ref}) via ${i.channel}${i.subject ? ` — ${i.subject}` : ""}\n${String(i.body).trim()}`; });
  const HUMAN = new Set(["propose_action", "report_blocker", "escalate"]);
  const executed = run.staged.filter((a) => a.status === "success" && !HUMAN.has(a.tool));
  const recorded = run.staged.filter((a) => a.status === "success" && HUMAN.has(a.tool));
  const failed = run.staged.filter((a) => a.status === "failure" || a.status === "unknown");
  const blocked = run.staged.filter((a) => a.status === "blocked");

  const answer = res ? `# Case ${c.id}

${statusBlock()}

## ${c.kind === "question" ? "Answer" : "Decision"}
${res.decision}

## Actions taken
${executed.map(actionLine).join("\n") || "- none executed"}
${recorded.length ? `\n### Recorded for a human (not executed by the system)\n${recorded.map(actionLine).join("\n")}` : ""}
${failed.length ? `\n### Actions that failed or returned unknown\n${failed.map(actionLine).join("\n")}` : ""}
${blocked.length ? `\n### Actions blocked by guards or checks\n${blocked.map(actionLine).join("\n")}` : ""}
${run.staged.filter((a) => a.status === "staged").length ? `\n### Proposed but not executed\n${run.staged.filter((a) => a.status === "staged").map(actionLine).join("\n")}` : ""}

## Not done and why
${res.notDone.map((n) => `- ${n.action}: ${n.reason}`).join("\n") || "- none"}

## Escalation
${res.escalation.tier === "none" ? "None required." : `Tier ${res.escalation.tier}. Decision required from a human: ${String(res.escalation.decisionRequired ?? "n/a").replace(/\.$/, "")}. ${res.escalation.reason ? `Reason: ${String(res.escalation.reason).replace(/\.$/, "")}.` : ""}${res.escalation.deadline ? ` Deadline: ${res.escalation.deadline}.` : ""}\n\nHandover: ${res.escalation.handover ?? res.summaryForHuman}`}

## Communications
${res.communications.map((m) => `- ${m.party} via ${m.channel}: ${m.gist}`).join("\n") || "- none"}

## Messages sent (full text)
${messages.join("\n\n") || "- none sent"}

## Conflicts and missing information
${res.conflicts.map((x) => `- Conflict: ${x.facts} → ${x.resolution}`).join("\n") || "- no conflicting information identified"}
${res.missingInformation.map((m) => `- Missing: ${m}`).join("\n")}

## Final state
${res.finalState} (family: ${res.family}, urgency: ${res.urgency})

## Summary
${res.summaryForHuman}
` : `# Case ${c.id}

${statusBlock()}

## Decision
The system could not complete this case autonomously and has escalated it. ${meta.error ? `Failure: ${clip(meta.error, 300)}` : ""}

## Actions taken
${executed.map(actionLine).join("\n") || "- none executed"}
${run.staged.filter((a) => a.status === "staged").length ? `\n### Actions proposed but not executed\n${run.staged.filter((a) => a.status === "staged").map(actionLine).join("\n")}` : ""}

## Escalation
Tier ${c.flags.some((f) => f.minUrgency === "P0") ? "P0" : "P1"}. Decision required from a human: review this case from the raw content and the trace, and process it manually${c.flags.some((f) => f.minUrgency === "P0") ? " now; a P0 safety flag was raised" : ""}.

## Final state
escalated (automatic: pipeline failure)
`;
  fs.writeFileSync(path.join(dir, "ANSWER.md"), answer);

  // Compact tool table from the trace, so the reasoning is readable without opening the JSONL.
  const traceFile = path.join(dir, "trace.jsonl");
  const events = Trace.readSafe(traceFile) as any[];
  const toolRows = events.filter((e) => String(e.event).startsWith("tool.") || String(e.event).startsWith("execute.")).map((e) => {
    const kind = String(e.event).replace("tool.", "").replace("execute.", "exec:");
    const what = e.actionId ? `${e.actionId}` : (e.tool ?? "");
    const detail = e.reason ?? e.error ?? (e.input ? clip(JSON.stringify(e.input), 160) : "");
    return `| ${kind} | ${what} | ${detail.replace(/\|/g, "/")} |`;
  });
  const prefetch = events.find((e) => e.event === "prefetch");

  const reasoning = `# Reasoning for case ${c.id}

## What the system received
Channel: ${c.channel}. Kind: ${c.kind}. Case time: ${c.receivedAt ?? "unknown"}. Source files: ${c.sourceFiles.join(", ") || "n/a"}.
Deterministic flags: ${c.flags.map((f) => `${f.name} ("${f.evidence}")`).join("; ") || "none"}.

> ${clip(c.rawText.replace(/\n+/g, " "), 700)}

## Triage and routing
${route ? `Families: ${route.families.join(", ")}. Urgency: ${route.urgency}. Router confidence: ${route.confidence}. ${route.reasons}` : "Router did not run."}
Agent: ${meta.agent ?? "n/a"}.
${prefetch ? `Records prefetched from the system of record: ${(prefetch.found as string[]).join(", ") || "none"}.${(prefetch.misses as string[])?.length ? ` Not found: ${(prefetch.misses as string[]).join("; ")}.` : ""}` : ""}

## What it looked up, staged and executed
| step | tool / action | detail |
|---|---|---|
${toolRows.join("\n") || "| – | – | no tool activity |"}

## What it decided and why
${res ? res.decision : "No resolution was produced; see the failure below."}

## What it escalated
${res ? (res.escalation.tier === "none" ? "Nothing. The case was within authority and policy." : `Tier ${res.escalation.tier}: ${res.escalation.decisionRequired ?? ""} (${res.escalation.reason ?? ""}). ${meta.page ?? ""}`) : "Escalated automatically because the pipeline failed."}

## What failed
${failed.length ? failed.map(actionLine).join("\n") : "No executed action failed."}${blocked.length ? `\nBlocked before execution: ${blocked.map((b) => `${b.tool} (${b.error})`).join("; ")}` : ""}${meta.error ? `\nPipeline error: ${clip(meta.error, 400)}` : ""}

## Automated checks
${meta.checks.length === 0 ? "Not run." : meta.checks.map((p, i) => `Pass ${i + 1}: ${p.length === 0 ? "clean" : p.map((x) => `\n- ${x}`).join("")}`).join("\n")}

## Final result
${res ? `${res.finalState} (family ${res.family}, urgency ${res.urgency}).` : "escalated (pipeline failure)."}

Full machine trace: trace.jsonl in this folder (every model step, tool call, guard decision and execution result).
`;
  fs.writeFileSync(path.join(dir, "REASONING.md"), reasoning);
}

export function writeSummary(outDir: string, rows: CaseOutput[]) {
  const lines = ["# Run summary", "", `Cases: ${rows.length}. Completed: ${rows.filter((r) => r.status !== "error" && r.status !== "deadline").length}. Pipeline errors: ${rows.filter((r) => r.status === "error").length}. Deadline skips: ${rows.filter((r) => r.status === "deadline").length}.`, "",
    "| Folder | Case | Status | Family | Urgency | Escalation | Agent | Seconds |", "|---|---|---|---|---|---|---|---|",
    ...rows.map((r) => `| ${r.folder} | ${r.caseId} | ${r.status} | ${r.family ?? ""} | ${r.urgency ?? ""} | ${r.escalation ?? ""} | ${r.agent ?? ""} | ${(r.ms / 1000).toFixed(0)} |`)];
  fs.writeFileSync(path.join(outDir, "summary.md"), lines.join("\n") + "\n");
}
