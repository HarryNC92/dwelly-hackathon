import "dotenv/config";
import path from "node:path";
import fs from "node:fs";
import { Command } from "commander";
import pLimit from "p-limit";
import { loadCases } from "./ingest/generic.js";
import { openStore } from "./backend/store.js";
import { seedFromDirectory } from "./backend/seed.js";
import { FailureInjector } from "./backend/failures.js";
import { runCase } from "./orchestrator/runCase.js";
import { realModels } from "./runtime/models.js";
import { mockModels } from "./runtime/mock.js";
import { writeSummary, type CaseOutput } from "./runtime/write.js";
import type { Case } from "./schemas/case.js";

const program = new Command()
  .requiredOption("--cases <dir>", "directory of cases (one file or folder per case)")
  .option("--out <dir>", "output directory", "./ANSWERS")
  .option("--data <dir>", "dataset directory to seed the record store from")
  .option("--backend <kind>", "local (PGlite, in-process) or postgres (DATABASE_URL)", "local")
  .option("--schema <name>", "Postgres schema for this run (isolation)", `run_${Date.now().toString(36)}`)
  .option("--concurrency <n>", "parallel cases", "15")
  .option("--case-timeout <min>", "per-case timeout in minutes", "4")
  .option("--deadline <min>", "global deadline in minutes; no new cases start after it", "22")
  .option("--inject <spec>", "failure injection, e.g. book_contractor:fail:1,send_message:unknown:1")
  .option("--mock-model", "use a canned model (offline smoke test)", false)
  .option("--numbered", "write folders 1..N in input order (organiser format) with an index.json mapping", false)
  .option("--no-group", "do not serialise cases that share a property")
  .option("--only <ids>", "comma-separated case ids")
  .parse();
const o = program.opts();

/** Cases about the same property run in timestamp order so later cases see earlier state. */
function groupKey(c: Case): string {
  const ids = Object.entries(c.linkedIds).find(([k]) => /propert|address|unit/i.test(k));
  if (ids) return `id:${ids[1]}`;
  const pc = c.rawText.match(/\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/i);
  if (pc) return `pc:${pc[1].replace(/\s+/g, "").toUpperCase()}`;
  const addr = c.rawText.match(/\b\d{1,4}[a-z]?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:Street|Road|Lane|Avenue|Close|Crescent|Gardens|Place|Square|Terrace|Way|Drive|Court|Mews|Grove|Hill|Park|Row|Walk)\b/);
  if (addr) return `addr:${addr[0].toLowerCase()}`;
  return `case:${c.id}`;
}

async function main() {
  const started = Date.now();
  const outDir = path.resolve(o.out);
  fs.mkdirSync(outDir, { recursive: true });
  const store = await openStore({ databaseUrl: o.backend === "postgres" ? process.env.DATABASE_URL : undefined, schema: o.backend === "postgres" ? o.schema : "public" });
  if (o.data) { const counts = await seedFromDirectory(store, path.resolve(o.data)); console.log("seeded:", counts); }
  const models = o.mockModel ? mockModels() : realModels();
  if (!o.mockModel && !process.env.ANTHROPIC_API_KEY) { console.error("ANTHROPIC_API_KEY is not set"); process.exit(2); }

  let cases = await loadCases(path.resolve(o.cases));
  if (o.only) { const ids = new Set(String(o.only).split(",")); cases = cases.filter((c) => ids.has(c.id)); }
  const folderOf = new Map<string, string>();
  cases.forEach((c, i) => folderOf.set(c.id, o.numbered ? String(i + 1) : c.id));
  fs.writeFileSync(path.join(outDir, "index.json"), JSON.stringify(cases.map((c) => ({ folder: folderOf.get(c.id), case_id: c.id, files: c.sourceFiles, channel: c.channel, received_at: c.receivedAt ?? null })), null, 2));

  // Resume: skip cases that already have an ANSWER.md
  const pending = cases.filter((c) => !fs.existsSync(path.join(outDir, folderOf.get(c.id)!, "ANSWER.md")));
  // Urgent first, then by time
  const rank = (c: Case) => (c.flags.some((f) => f.minUrgency === "P0") ? 0 : c.flags.some((f) => f.minUrgency === "P1") ? 1 : 2);
  pending.sort((a, b) => rank(a) - rank(b) || String(a.receivedAt ?? "").localeCompare(String(b.receivedAt ?? "")));
  // Group by property: each group runs sequentially in time order; groups run in parallel.
  const groups = new Map<string, Case[]>();
  for (const c of pending) { const k = o.group === false ? `case:${c.id}` : groupKey(c); groups.set(k, [...(groups.get(k) ?? []), c]); }
  for (const g of groups.values()) g.sort((a, b) => String(a.receivedAt ?? "").localeCompare(String(b.receivedAt ?? "")));
  console.log(`cases: ${cases.length}, pending: ${pending.length}, groups: ${groups.size}, concurrency: ${o.concurrency}`);

  const limit = pLimit(Number(o.concurrency));
  const failures = new FailureInjector(o.inject); // one injector per run: "tool:mode:count" means count failures in total
  const deadlineMs = Number(o.deadline) * 60_000;
  const rows: CaseOutput[] = [];
  const runOne = async (c: Case) => {
    const folder = folderOf.get(c.id)!;
    if (Date.now() - started > deadlineMs) {
      const dir = path.join(outDir, folder); fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, "ANSWER.md"), `# Case ${c.id}\n\n## Decision\nNot processed: the run's global deadline was reached before this case started.\n\n## Escalation\nTier P1. A human must process this case.\n\n## Final state\nescalated (deadline)\n`);
      rows.push({ caseId: c.id, folder, status: "deadline", ms: 0 });
      return;
    }
    const row = await runCase(c, {
      models, outDir, folder, caseTimeoutMs: Number(o.caseTimeout) * 60_000,
      ctxFor: (cc) => ({ caseId: cc.id, store, failures, now: cc.receivedAt ?? new Date().toISOString(), env: process.env }),
    });
    rows.push(row);
    console.log(`${row.folder}=${row.caseId}: ${row.status} ${row.family ?? ""} ${row.urgency ?? ""} esc=${row.escalation ?? "-"} agent=${row.agent ?? "-"} ${(row.ms / 1000).toFixed(0)}s${row.error ? ` ERROR ${row.error.slice(0, 120)}` : ""}`);
  };
  await Promise.all([...groups.values()].map((g) => limit(async () => { for (const c of g) await runOne(c); })));
  rows.sort((a, b) => a.folder.localeCompare(b.folder, undefined, { numeric: true }));
  writeSummary(outDir, rows);
  await store.close();
  console.log(`done in ${((Date.now() - started) / 1000).toFixed(0)}s -> ${outDir}/summary.md`);
}
main().catch((e) => { console.error(e); process.exit(1); });
