import fs from "node:fs";
import path from "node:path";
import { Command } from "commander";
import { parse as parseYaml } from "yaml";

/**
 * Deterministic eval of a run against hand-labelled expectations (evals/expected.yaml).
 * This is our own training-set scoreboard, not the organisers' rubric. Fix outcomes, not the score.
 */
type Expect = { family?: string; urgency?: string; escalation?: string; state?: string | string[]; required_tools?: string[]; forbidden_tools?: string[]; must_mention?: string[]; must_not_mention?: string[]; notes?: string };

const o = new Command().requiredOption("--out <dir>").option("--expected <file>", "expectations yaml", "./evals/expected.yaml").option("--report <file>", "markdown report path").parse().opts();
const expected = parseYaml(fs.readFileSync(o.expected, "utf8")) as Record<string, Expect>;
const outDir = path.resolve(o.out);
const index: { folder: string; case_id: string }[] = fs.existsSync(path.join(outDir, "index.json")) ? JSON.parse(fs.readFileSync(path.join(outDir, "index.json"), "utf8")) : [];
const folderOf = (id: string) => index.find((i) => i.case_id === id)?.folder ?? id;

const rows: string[] = []; let total = 0, got = 0;
for (const [id, exp] of Object.entries(expected)) {
  const dir = path.join(outDir, folderOf(id));
  const answer = fs.existsSync(path.join(dir, "ANSWER.md")) ? fs.readFileSync(path.join(dir, "ANSWER.md"), "utf8") : "";
  const reasoning = fs.existsSync(path.join(dir, "REASONING.md")) ? fs.readFileSync(path.join(dir, "REASONING.md"), "utf8") : "";
  const trace = fs.existsSync(path.join(dir, "trace.jsonl")) ? fs.readFileSync(path.join(dir, "trace.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
  const submit = [...trace].reverse().find((e) => e.event === "agent.submit");
  const final = answer.match(/## Final state\n(\w+) \(family: (\w+), urgency: (\w+)\)/);
  const state = final?.[1] ?? (answer ? "error" : "missing"); const family = final?.[2] ?? submit?.family; const urgency = final?.[3] ?? submit?.urgency;
  const esc = answer.match(/## Escalation\n(None|Tier (P\d))/); const escalation = esc ? (esc[1] === "None" ? "none" : esc[2]) : "?";
  const executed = new Set(trace.filter((e) => e.event === "execute.success").map((e) => String(e.tool)));
  const stagedAll = new Set(trace.filter((e) => e.event === "tool.staged").map((e) => String(e.tool)));
  const checks: [string, boolean, string][] = [];
  if (exp.family) checks.push(["family", family === exp.family, `${family}≠${exp.family}`]);
  if (exp.urgency) checks.push(["urgency", urgency === exp.urgency, `${urgency}≠${exp.urgency}`]);
  if (exp.escalation) checks.push(["escalation", escalation === exp.escalation, `${escalation}≠${exp.escalation}`]);
  if (exp.state) { const ok = ([] as string[]).concat(exp.state).includes(state); checks.push(["state", ok, `${state}≠${([] as string[]).concat(exp.state).join("|")}`]); }
  for (const t of exp.required_tools ?? []) checks.push([`uses ${t}`, executed.has(t) || stagedAll.has(t), `${t} not used`]);
  for (const t of exp.forbidden_tools ?? []) checks.push([`avoids ${t}`, !executed.has(t), `${t} executed`]);
  for (const m of exp.must_mention ?? []) checks.push([`mentions /${m}/`, new RegExp(m, "i").test(answer + "\n" + reasoning), `missing /${m}/`]);
  for (const m of exp.must_not_mention ?? []) checks.push([`avoids /${m}/`, !new RegExp(m, "i").test(answer), `found /${m}/`]);
  // Truthfulness: a failed booking must not be described as done; 'scheduled' needs a successful booking.
  const failedBookings = trace.filter((e) => (e.event === "execute.failure" || e.event === "execute.unknown") && /book_contractor|create_work_order|book_inspection/.test(String(e.tool)));
  const okBookings = trace.filter((e) => e.event === "execute.success" && /book_contractor|create_work_order|book_inspection/.test(String(e.tool)));
  if (failedBookings.length && okBookings.length === 0) {
    const claims = /## (?:Decision|Rationale|Answer)\n([\s\S]*?)\n## /.exec(answer)?.[1] ?? "";
    checks.push(["no false booking claim", !/\b(booked|on (the|their) way|will attend|is coming|has been sent|dispatched)\b/i.test(claims), "decision claims a booking that failed"]);
    checks.push(["not 'scheduled' without a booking", state !== "scheduled", "scheduled with no successful booking"]);
  }
  const pass = checks.filter((c) => c[1]).length; total += checks.length; got += pass;
  const fails = checks.filter((c) => !c[1]).map((c) => c[2]).join("; ");
  rows.push(`| ${id} | ${state} | ${family ?? ""} | ${urgency ?? ""} | ${escalation} | ${pass}/${checks.length} | ${fails} |`);
}
const report = `# Eval report\n\nRun: ${outDir}\nScore: ${got}/${total} checks (${total ? Math.round((100 * got) / total) : 0}%)\n\n| Case | State | Family | Urgency | Esc | Checks | Failures |\n|---|---|---|---|---|---|---|\n${rows.join("\n")}\n`;
console.log(report);
if (o.report) fs.writeFileSync(o.report, report);
