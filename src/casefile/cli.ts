/**
 * pnpm casestate -- --case "HackatonPublicCases/Property Management/008" [--cut 20] [--json] [--model]
 * pnpm casestate -- --all "HackatonPublicCases/Property Management" [--expected evals/casestate/expected] [--cut-auto]
 * The first prints the state as JSON and the rendering. The second runs every case, compares the fields in the expected
 * files that exist, and prints the distribution of stage, approval, provider, occupancy and conflicts.
 */
import fs from "node:fs";
import path from "node:path";
import { Command } from "commander";
import { config as dotenv } from "dotenv";
import { parseHistory } from "../ingest/dwelly.js";
import type { CaseState } from "../schemas/casestate.js";
import { extractCaseState, parseCaseHeader, renderCaseState } from "./index.js";

dotenv({ quiet: true } as any);
const o = new Command().option("--case <dir>").option("--cut <n>").option("--json").option("--model").option("--all <root>").option("--expected <dir>", "expected states", "evals/casestate/expected").option("--quiet").parse(process.argv.filter((a, i) => !(i >= 2 && a === "--"))).opts();

async function load(dir: string, cut?: number) {
  const index = fs.existsSync(path.join(dir, "index.md")) ? fs.readFileSync(path.join(dir, "index.md"), "utf8") : "";
  const history = fs.readFileSync(path.join(dir, "history.md"), "utf8");
  let events = parseHistory(history);
  if (cut) events = events.filter((e) => e.n <= cut);
  let attachmentsText = "";
  const attDir = path.join(dir, "attachments");
  if (fs.existsSync(attDir)) for (const f of fs.readdirSync(attDir)) if (/\.(csv|txt|md)$/i.test(f)) attachmentsText += `\n--- ${f} ---\n` + fs.readFileSync(path.join(attDir, f), "utf8").slice(0, 20_000);
  const header = parseCaseHeader(index, history);
  let model;
  if (o.model) { const { realModels } = await import("../runtime/models.js"); model = realModels()("claude-opus-5-5"); }
  const state = await extractCaseState(events, header, attachmentsText, { model });
  return { state, events, header };
}

type Expected = Partial<{ stage: string; approval: string; provider: string | null; occupancy: string; conflicts: string[]; conflictsMin: number; safetyMin: number; tier: string; cut: number }>;
const FIELDS = ["stage", "approval", "provider", "occupancy", "conflicts"] as const;

function compare(id: string, s: CaseState, x: Expected): Record<(typeof FIELDS)[number], boolean | undefined> {
  const r: Record<string, boolean | undefined> = {};
  if (x.stage !== undefined) r.stage = s.stage === x.stage;
  if (x.approval !== undefined) r.approval = s.landlordApproval.status === x.approval;
  if (x.provider !== undefined) r.provider = x.provider === null ? !s.providerAssigned : (s.providerAssigned?.name ?? "").toLowerCase().includes(x.provider.toLowerCase());
  if (x.occupancy !== undefined) r.occupancy = s.occupancy === x.occupancy;
  if (x.conflicts !== undefined || x.conflictsMin !== undefined) {
    const have = s.dataConflicts.join("\n").toLowerCase();
    const all = (x.conflicts ?? []).every((c) => have.includes(c.toLowerCase()));
    r.conflicts = all && s.dataConflicts.length >= (x.conflictsMin ?? 0);
  }
  return r as any;
}

(async () => {
  if (o.case) {
    const { state } = await load(o.case, o.cut ? Number(o.cut) : undefined);
    if (o.json) { console.log(JSON.stringify(state, null, 2)); return; }
    console.log(JSON.stringify(state, null, 2));
    console.log("\n---- rendering ----\n" + renderCaseState(state));
    return;
  }
  if (!o.all) { console.error("use --case <dir> or --all <root>"); process.exit(2); }
  const root = path.resolve(o.all);
  const ids = fs.readdirSync(root).filter((d) => fs.existsSync(path.join(root, d, "history.md"))).sort();
  const dist = { stage: new Map<string, number>(), approval: new Map<string, number>(), occupancy: new Map<string, number>(), tier: new Map<string, number>(), provider: 0, conflicts: 0, safety: 0 };
  const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
  const hits: Record<string, { ok: number; n: number }> = Object.fromEntries(FIELDS.map((f) => [f, { ok: 0, n: 0 }]));
  const misses: string[] = []; let crashes = 0;
  const rows: string[] = [];
  for (const id of ids) {
    const expFile = path.join(path.resolve(o.expected), `${id}.json`);
    const expected: Expected | undefined = fs.existsSync(expFile) ? JSON.parse(fs.readFileSync(expFile, "utf8")) : undefined;
    let s: CaseState;
    try { s = (await load(path.join(root, id), expected?.cut)).state; } catch (e) { crashes++; console.error(`${id}: CRASH ${e}`); continue; }
    if (s.notes.some((n) => n.startsWith("extraction failed"))) crashes++;
    bump(dist.stage, s.stage); bump(dist.approval, s.landlordApproval.status); bump(dist.occupancy, s.occupancy); bump(dist.tier, s.difficulty?.tier ?? "none");
    if (s.providerAssigned) dist.provider++; if (s.dataConflicts.length) dist.conflicts++; if (s.safetySignals.length) dist.safety++;
    rows.push(`${id}${expected?.cut ? `@${expected.cut}` : ""} ${s.stage.padEnd(24)} ${s.landlordApproval.status.padEnd(17)} ${(s.providerAssigned?.name ?? "-").slice(0, 22).padEnd(22)} ${s.occupancy.padEnd(12)} conf=${s.dataConflicts.length} safe=${s.safetySignals.length} ${s.difficulty?.tier ?? ""}(${s.difficulty?.score ?? ""})`);
    if (expected) {
      const r = compare(id, s, expected);
      for (const f of FIELDS) if (r[f] !== undefined) { hits[f].n++; if (r[f]) hits[f].ok++; else misses.push(`${id} ${f}: got ${f === "stage" ? s.stage : f === "approval" ? s.landlordApproval.status : f === "provider" ? s.providerAssigned?.name ?? "none" : f === "occupancy" ? s.occupancy : s.dataConflicts.join(" | ")} expected ${JSON.stringify((expected as any)[f] ?? expected.conflictsMin)}`); }
      if (expected.tier && expected.tier !== s.difficulty?.tier) misses.push(`${id} tier: got ${s.difficulty?.tier} expected ${expected.tier}`);
    }
  }
  if (!o.quiet) console.log(rows.join("\n"));
  console.log(`\n${ids.length} cases, ${crashes} crashes`);
  const show = (m: Map<string, number>) => [...m].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(" ");
  console.log(`stage: ${show(dist.stage)}\napproval: ${show(dist.approval)}\noccupancy: ${show(dist.occupancy)}\ntier: ${show(dist.tier)}\nprovider assigned: ${dist.provider}, with conflicts: ${dist.conflicts}, with safety signals: ${dist.safety}`);
  const withExp = Object.values(hits).some((h) => h.n);
  if (withExp) {
    console.log("\nprecision against expected states:");
    for (const f of FIELDS) if (hits[f].n) console.log(`  ${f.padEnd(10)} ${hits[f].ok}/${hits[f].n}`);
    if (misses.length) console.log("misses:\n  " + misses.join("\n  "));
    if (misses.length) process.exitCode = 1;
  }
})();
