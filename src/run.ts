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
  .option("--only <ids>", "comma-separated case ids")
  .parse();
const o = program.opts();

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
  // Resume: skip cases that already have an ANSWER.md
  const pending = cases.filter((c) => !fs.existsSync(path.join(outDir, c.id, "ANSWER.md")));
  // Urgent first
  const rank = (c: typeof cases[number]) => (c.flags.some((f) => f.minUrgency === "P0") ? 0 : c.flags.some((f) => f.minUrgency === "P1") ? 1 : 2);
  pending.sort((a, b) => rank(a) - rank(b));
  console.log(`cases: ${cases.length}, pending: ${pending.length}, concurrency: ${o.concurrency}`);

  const limit = pLimit(Number(o.concurrency));
  const deadlineMs = Number(o.deadline) * 60_000;
  const rows: CaseOutput[] = [];
  await Promise.all(pending.map((c) => limit(async () => {
    if (Date.now() - started > deadlineMs) {
      fs.mkdirSync(path.join(outDir, c.id), { recursive: true });
      fs.writeFileSync(path.join(outDir, c.id, "ANSWER.md"), `# Case ${c.id}\n\n## Decision\nNot processed: global deadline reached before this case started.\n\n## Escalation\nTier P1. A human must process this case.\n\n## Final state\nescalated (deadline)\n`);
      rows.push({ caseId: c.id, status: "deadline", ms: 0 });
      return;
    }
    const row = await runCase(c, {
      models, outDir, caseTimeoutMs: Number(o.caseTimeout) * 60_000,
      ctxFor: (cc) => ({ caseId: cc.id, store, failures: new FailureInjector(o.inject), now: cc.receivedAt ?? new Date().toISOString(), env: process.env }),
    });
    rows.push(row);
    console.log(`${row.caseId}: ${row.status} ${row.family ?? ""} ${row.urgency ?? ""} esc=${row.escalation ?? "-"} agent=${row.agent ?? "-"} ${(row.ms / 1000).toFixed(0)}s${row.error ? ` ERROR ${row.error.slice(0, 120)}` : ""}`);
  })));
  rows.sort((a, b) => a.caseId.localeCompare(b.caseId, undefined, { numeric: true }));
  writeSummary(outDir, rows);
  await store.close();
  console.log(`done in ${((Date.now() - started) / 1000).toFixed(0)}s -> ${outDir}/summary.md`);
}
main().catch((e) => { console.error(e); process.exit(1); });
