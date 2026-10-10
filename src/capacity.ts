import fs from "node:fs";
import path from "node:path";
import { Command } from "commander";
import { Trace } from "./runtime/trace.js";

/**
 * Capacity model from real traces: per-case wall time and token use, by tier when known, then throughput at a given
 * concurrency and the time to clear N cases. Best case = fastest quartile, average = mean, worst = slowest decile.
 * Usage: pnpm capacity -- --out out/public-real-3 [--out out/sample-2 ...] [--concurrency 10] [--cases 50] [--window 30]
 */
const o = new Command().option("--out <dirs...>", "run directories", ["out/public-real-3"]).option("--concurrency <n>", "", "10").option("--cases <n>", "cases to clear", "50").option("--window <min>", "window in minutes", "30").option("--md", "markdown output", false).parse().opts();

type Row = { id: string; ms: number; steps: number; inTok: number; outTok: number; tier: string; status: string };
const rows: Row[] = [];
for (const dir of o.out as string[]) {
  const root = path.resolve(dir);
  if (!fs.existsSync(root)) continue;
  for (const d of fs.readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory())) {
    const ev = Trace.readSafe(path.join(root, d.name, "trace.jsonl")) as any[];
    const end = ev.find((e) => e.event === "case.end"); if (!end || end.status === "error" || end.status === "deadline") continue;
    const steps = ev.filter((e) => e.event === "agent.step");
    const inTok = steps.reduce((a, e) => a + Number(e.usage?.inputTokens?.total ?? e.usage?.inputTokens ?? 0), 0);
    const outTok = steps.reduce((a, e) => a + Number(e.usage?.outputTokens?.total ?? e.usage?.outputTokens ?? 0), 0);
    const start = ev.find((e) => e.event === "case.start");
    const tier = start?.tier ?? (start?.flags?.length ? "flagged" : "unflagged");
    rows.push({ id: `${path.basename(root)}/${d.name}`, ms: Number(end.ms), steps: steps.length, inTok, outTok, tier, status: end.status });
  }
}
if (!rows.length) { console.error("no completed cases found"); process.exit(1); }
const sorted = [...rows].sort((a, b) => a.ms - b.ms);
const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)))].ms;
const mean = rows.reduce((a, r) => a + r.ms, 0) / rows.length;
const best = q(0.25), p50 = q(0.5), worst = q(0.9), max = sorted.at(-1)!.ms;
const C = Number(o.concurrency), N = Number(o.cases), W = Number(o.window) * 60_000;
const clear = (perCase: number) => (Math.ceil(N / C) * perCase) / 60_000;
const perMin = (perCase: number) => (C * 60_000) / perCase;
const byTier = new Map<string, Row[]>(); for (const r of rows) byTier.set(r.tier, [...(byTier.get(r.tier) ?? []), r]);
const fmt = (ms: number) => `${(ms / 1000).toFixed(0)}s`;
const lines = [
  `# Capacity model (${rows.length} completed cases from ${(o.out as string[]).join(", ")})`, "",
  `| Scenario | Per case | Cases/min at concurrency ${C} | Minutes to clear ${N} | Fits ${o.window}-min window |`, `|---|---|---|---|---|`,
  `| Best (fastest quartile) | ${fmt(best)} | ${perMin(best).toFixed(1)} | ${clear(best).toFixed(1)} | ${clear(best) * 60_000 < W ? "yes" : "no"} |`,
  `| Median | ${fmt(p50)} | ${perMin(p50).toFixed(1)} | ${clear(p50).toFixed(1)} | ${clear(p50) * 60_000 < W ? "yes" : "no"} |`,
  `| Average | ${fmt(mean)} | ${perMin(mean).toFixed(1)} | ${clear(mean).toFixed(1)} | ${clear(mean) * 60_000 < W ? "yes" : "no"} |`,
  `| Worst (slowest decile) | ${fmt(worst)} | ${perMin(worst).toFixed(1)} | ${clear(worst).toFixed(1)} | ${clear(worst) * 60_000 < W ? "yes" : "no"} |`,
  `| Slowest observed | ${fmt(max)} | ${perMin(max).toFixed(1)} | ${clear(max).toFixed(1)} | ${clear(max) * 60_000 < W ? "yes" : "no"} |`, "",
  `Mean model steps per case: ${(rows.reduce((a, r) => a + r.steps, 0) / rows.length).toFixed(1)}. Mean tokens per case: ${Math.round(rows.reduce((a, r) => a + r.inTok, 0) / rows.length).toLocaleString()} in, ${Math.round(rows.reduce((a, r) => a + r.outTok, 0) / rows.length).toLocaleString()} out.`, "",
  `Throughput is linear in concurrency until the API rate limit; per-case time is bounded by the step cap (${"10 to 12"} steps) and the per-case timeout (4 min), so the worst case is bounded, not open-ended.`, "",
  `| Tier | Cases | Mean per case | Mean steps |`, `|---|---|---|---|`,
  ...[...byTier.entries()].map(([t, rs]) => `| ${t} | ${rs.length} | ${fmt(rs.reduce((a, r) => a + r.ms, 0) / rs.length)} | ${(rs.reduce((a, r) => a + r.steps, 0) / rs.length).toFixed(1)} |`),
];
console.log(lines.join("\n"));
