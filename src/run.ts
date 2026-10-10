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
import { writeAnswer, writeSummary, type CaseOutput } from "./runtime/write.js";
import { Trace } from "./runtime/trace.js";
import type { Case } from "./schemas/case.js";

const program = new Command()
  .requiredOption("--cases <dir>", "directory of cases (one file or folder per case)")
  .option("--out <dir>", "output directory", "./ANSWERS")
  .option("--data <dir>", "dataset directory to seed the record store from")
  .option("--backend <kind>", "local (PGlite, in-process) or postgres (DATABASE_URL)", "local")
  .option("--schema <name>", "Postgres schema for this run (isolation)", `run_${Date.now().toString(36)}`)
  .option("--concurrency <n>", "parallel groups", "15")
  .option("--case-timeout <min>", "per-case timeout in minutes", "4")
  .option("--deadline <min>", "global deadline in minutes; no new cases start after it and running ones are cut short", "22")
  .option("--inject <spec>", "failure injection for the whole run, e.g. book_contractor:fail:1,send_message:unknown:1")
  .option("--mock-model", "use a canned model (offline smoke test)", false)
  .option("--numbered", "write folders 1..N in input order (organiser format) with an index.json mapping", false)
  .option("--no-group", "do not serialise cases that share a building")
  .option("--force", "re-run cases that already have a completed folder", false)
  .option("--only <ids>", "comma-separated case ids")
  .option("--show-outcome", "organiser format: keep the Overview/Outcome sections (hidden by default, they reveal the ending)", false)
  .option("--cuts <file>", "organiser format: JSON {caseId: lastEventNumber} to hide later events (decision-point training)")
  .parse();
const o = program.opts();

/** Cases about the same building run in timestamp order so later cases see earlier state. Resolution goes through the record store. */
async function groupKey(c: Case, store: Awaited<ReturnType<typeof openStore>>): Promise<string> {
  const key = (p: { id: string; data: any }) => `bld:${p.data?.building_id ?? p.data?.buildingId ?? p.data?.block_id ?? p.id}`;
  const ids = Object.entries(c.linkedIds).find(([k]) => /propert|address|unit/i.test(k));
  if (ids) { const p = await store.get("properties", ids[1]).catch(() => null); if (p) return key(p as any); return `id:${ids[1]}`; }
  const terms: string[] = [];
  const pc = c.rawText.match(/\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/i); if (pc) terms.push(pc[1].replace(/\s+/g, " ").toUpperCase());
  const addr = c.rawText.match(/\b\d{1,4}[a-z]?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:Street|Road|Lane|Avenue|Close|Crescent|Gardens|Place|Square|Terrace|Way|Drive|Court|Mews|Grove|Hill|Park|Row|Walk)\b/); if (addr) terms.push(addr[0]);
  for (const m of c.rawText.matchAll(/\+44\s?\d[\d ]{8,12}\d|[\w.+-]+@[\w-]+\.[\w.-]+/g)) terms.push(m[0]);
  for (const t of terms.slice(0, 6)) {
    const rows = await store.search(t, undefined, 8).catch(() => []);
    const prop = rows.find((r) => /propert/i.test(r.type)); if (prop) return key(prop as any);
    const ten = rows.find((r) => /tenanc/i.test(r.type)); const pid = ten && ((ten.data as any).property_id ?? (ten.data as any).propertyId);
    if (pid) { const p = await store.get("properties", String(pid)).catch(() => null); if (p) return key(p as any); }
  }
  // Only group on things that resolved in the store; otherwise every case is its own group (no accidental serialisation on an agency signature).
  return `case:${c.id}`;
}

const rank = (c: Case) => (c.flags.some((f) => f.minUrgency === "P0") ? 0 : c.flags.some((f) => f.minUrgency === "P1") ? 1 : 2);

function isComplete(dir: string, caseId: string): boolean {
  if (!fs.existsSync(path.join(dir, "ANSWER.md"))) return false;
  const marker = path.join(dir, ".case_id");
  if (!fs.existsSync(marker) || fs.readFileSync(marker, "utf8").trim() !== caseId) return false;
  const end = [...Trace.readSafe(path.join(dir, "trace.jsonl"))].reverse().find((e) => e.event === "case.end") as any;
  return Boolean(end) && end.status !== "error" && end.status !== "deadline";
}

async function main() {
  const started = Date.now();
  const outDir = path.resolve(o.out);
  fs.mkdirSync(outDir, { recursive: true });
  const store = await openStore({ databaseUrl: o.backend === "postgres" ? process.env.DATABASE_URL : undefined, schema: o.backend === "postgres" ? o.schema : "public" });
  if (o.data) { const counts = await seedFromDirectory(store, path.resolve(o.data)); console.log("seeded:", counts); }
  const models = o.mockModel ? mockModels() : realModels();
  if (!o.mockModel && !process.env.ANTHROPIC_API_KEY) { console.error("ANTHROPIC_API_KEY is not set"); process.exit(2); }

  const cuts = o.cuts ? JSON.parse(fs.readFileSync(path.resolve(o.cuts), "utf8")) : undefined;
  const allCases = await loadCases(path.resolve(o.cases), { showOutcome: Boolean(o.showOutcome), cuts });
  const folderOf = new Map<string, string>();
  allCases.forEach((c, i) => folderOf.set(c.id, o.numbered ? (/^\d+$/.test(c.id) ? String(Number(c.id)) : String(i + 1)) : c.id)); // numbered before any filtering; '003' -> '3'
  fs.writeFileSync(path.join(outDir, "index.json"), JSON.stringify(allCases.map((c) => ({ folder: folderOf.get(c.id), case_id: c.id, files: c.sourceFiles, channel: c.channel, received_at: c.receivedAt ?? null })), null, 2));
  let cases = allCases;
  if (o.only) { const ids = new Set(String(o.only).split(",")); cases = cases.filter((c) => ids.has(c.id)); }
  const pending = cases.filter((c) => o.force || !isComplete(path.join(outDir, folderOf.get(c.id)!), c.id));

  // Group by building; split big groups so one building cannot serialise the run; most urgent groups first.
  const groups = new Map<string, Case[]>();
  for (const c of pending) { const k = o.group === false ? `case:${c.id}` : await groupKey(c, store); groups.set(k, [...(groups.get(k) ?? []), c]); }
  const chunks: Case[][] = [];
  for (const g of groups.values()) {
    g.sort((a, b) => String(a.receivedAt ?? "9").localeCompare(String(b.receivedAt ?? "9")));
    for (let i = 0; i < g.length; i += 4) chunks.push(g.slice(i, i + 4));
  }
  chunks.sort((a, b) => Math.min(...a.map(rank)) - Math.min(...b.map(rank)) || String(a[0].receivedAt ?? "").localeCompare(String(b[0].receivedAt ?? "")));
  const referenceNow = allCases.map((c) => c.receivedAt).filter(Boolean).sort().at(-1) ?? new Date().toISOString();
  console.log(`cases: ${allCases.length}, pending: ${pending.length}, groups: ${chunks.length}, concurrency: ${o.concurrency}`);
  console.log(`groups: ${[...groups.entries()].map(([k, g]) => `${k}(${g.length})`).join(" ")}`);

  const limit = pLimit(Number(o.concurrency));
  const failures = new FailureInjector(o.inject);
  const deadlineAt = started + Number(o.deadline) * 60_000;
  const rows: CaseOutput[] = [];
  const runOne = async (c: Case) => {
    const folder = folderOf.get(c.id)!;
    const dir = path.join(outDir, folder);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, ".case_id"), c.id);
    try {
      if (Date.now() > deadlineAt) {
        const trace = new Trace(dir, c.id); trace.log("case.start", { note: "deadline" });
        writeAnswer(dir, c, null, { staged: [], control: {} }, null, { error: "not processed: the run's global deadline was reached before this case started", checks: [] });
        trace.log("case.end", { ms: 0, status: "deadline" });
        rows.push({ caseId: c.id, folder, status: "deadline", ms: 0 });
        return;
      }
      const row = await runCase(c, {
        models, outDir, folder, caseTimeoutMs: Math.min(Number(o.caseTimeout) * 60_000, Math.max(60_000, deadlineAt + 120_000 - Date.now())),
        ctxFor: (cc) => ({ caseId: cc.id, case: cc, store, failures, now: cc.receivedAt ?? referenceNow, env: process.env }),
      });
      rows.push(row);
      console.log(`${row.folder}=${row.caseId}: ${row.status} ${row.family ?? ""} ${row.urgency ?? ""} esc=${row.escalation ?? "-"} agent=${row.agent ?? "-"} ${(row.ms / 1000).toFixed(0)}s${row.error ? ` ERROR ${row.error.slice(0, 120)}` : ""}`);
    } catch (e) {
      // Last line of defence: the folder must exist whatever happened.
      try { writeAnswer(dir, c, null, { staged: [], control: {} }, null, { error: `runner failure: ${String(e).slice(0, 300)}`, checks: [] }); } catch { /* ignore */ }
      rows.push({ caseId: c.id, folder, status: "error", error: String(e), ms: 0 });
      console.error(`${folder}=${c.id}: runner failure ${String(e).slice(0, 200)}`);
    }
  };
  // Rows for cases completed in an earlier invocation, so summary.md always covers the whole set.
  for (const c of cases) if (!pending.includes(c)) {
    const dir = path.join(outDir, folderOf.get(c.id)!);
    const end = [...Trace.readSafe(path.join(dir, "trace.jsonl"))].reverse().find((e) => e.event === "case.end") as any;
    const submit = [...Trace.readSafe(path.join(dir, "trace.jsonl"))].reverse().find((e) => e.event === "agent.submit") as any;
    rows.push({ caseId: c.id, folder: folderOf.get(c.id)!, status: end?.status ?? "unknown", family: submit?.family, urgency: submit?.urgency, ms: Number(end?.ms ?? 0) });
  }
  await Promise.all(chunks.map((g) => limit(async () => { for (const c of g) await runOne(c); })));
  rows.sort((a, b) => a.folder.localeCompare(b.folder, undefined, { numeric: true }));
  writeSummary(outDir, rows);
  await store.close();
  console.log(`done in ${((Date.now() - started) / 1000).toFixed(0)}s -> ${outDir}/summary.md`);
}
main().catch((e) => { console.error(e); process.exit(1); });
