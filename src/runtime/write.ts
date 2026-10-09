import fs from "node:fs";
import path from "node:path";
import type { Case } from "../schemas/case.js";
import type { Resolution, Route } from "../schemas/resolution.js";
import type { CaseRun } from "./wrapper.js";

export type CaseOutput = { caseId: string; status: string; family?: string; urgency?: string; escalation?: string; agent?: string; error?: string; ms: number };

export function writeAnswer(dir: string, c: Case, res: Resolution | null, run: CaseRun, route: Route | null, meta: { agent?: string; error?: string; checks: string[][] }) {
  fs.mkdirSync(dir, { recursive: true });
  const actions = run.staged.map((a) => `- ${a.tool} [${a.status}] ${JSON.stringify(a.input)}${a.error ? ` — ${a.error}` : ""}`).join("\n") || "- none";
  const answer = res ? `# Case ${c.id}

## Decision
${res.decision}

## Actions taken
${actions}

## Not done and why
${res.notDone.map((n) => `- ${n.action}: ${n.reason}`).join("\n") || "- none"}

## Escalation
${res.escalation.tier === "none" ? "None." : `Tier ${res.escalation.tier}. Decision required: ${res.escalation.decisionRequired ?? "n/a"}. Reason: ${res.escalation.reason ?? ""}${res.escalation.deadline ? ` Deadline: ${res.escalation.deadline}.` : ""}\n\nHandover: ${res.escalation.handover ?? res.summaryForHuman}`}

## Communications
${res.communications.map((m) => `- ${m.party} via ${m.channel}: ${m.gist}`).join("\n") || "- none"}

## Conflicts and missing information
${res.conflicts.map((x) => `- Conflict: ${x.facts} → ${x.resolution}`).join("\n") || "- no conflicts"}
${res.missingInformation.map((m) => `- Missing: ${m}`).join("\n")}

## Final state
${res.finalState} (family: ${res.family}, urgency: ${res.urgency})
` : `# Case ${c.id}

## Decision
The system could not complete this case autonomously. ${meta.error ?? ""}

## Actions taken
${actions}

## Escalation
Tier P1. Decision required: a human must review this case from the handover below.

## Final state
escalated (automatic, pipeline failure)
`;
  fs.writeFileSync(path.join(dir, "ANSWER.md"), answer);

  const reasoning = `# Reasoning for case ${c.id}

## What was received
Channel: ${c.channel}. Case time: ${c.receivedAt ?? "unknown"}. Source files: ${c.sourceFiles.join(", ") || "n/a"}.
Flags (deterministic): ${c.flags.map((f) => `${f.name} ("${f.evidence}")`).join("; ") || "none"}.

## Triage
${route ? `Families: ${route.families.join(", ")}. Urgency: ${route.urgency}. Confidence: ${route.confidence}. ${route.reasons}` : "Router did not run."} Agent: ${meta.agent ?? "n/a"}.

## What was looked up and decided
${res ? res.summaryForHuman : "No resolution was produced."}

${res ? `Decision in full: ${res.decision}` : ""}

## Automated checks
${meta.checks.length === 0 ? "Not run." : meta.checks.map((p, i) => `Pass ${i + 1}: ${p.length === 0 ? "clean" : p.map((x) => `\n- ${x}`).join("")}`).join("\n")}

## Trace
See trace.jsonl in this folder for every model step, tool call, guard decision and execution result.
`;
  fs.writeFileSync(path.join(dir, "REASONING.md"), reasoning);
}

export function writeSummary(outDir: string, rows: CaseOutput[]) {
  const lines = ["# Run summary", "", `Cases: ${rows.length}. Completed: ${rows.filter((r) => r.status !== "error").length}. Errors: ${rows.filter((r) => r.status === "error").length}.`, "",
    "| Case | Status | Family | Urgency | Escalation | Agent | Seconds |", "|---|---|---|---|---|---|---|",
    ...rows.map((r) => `| ${r.caseId} | ${r.status} | ${r.family ?? ""} | ${r.urgency ?? ""} | ${r.escalation ?? ""} | ${r.agent ?? ""} | ${(r.ms / 1000).toFixed(0)} |`)];
  fs.writeFileSync(path.join(outDir, "summary.md"), lines.join("\n") + "\n");
}
