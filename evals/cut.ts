import fs from "node:fs";
import path from "node:path";
import { Command } from "commander";
import { parseHistory } from "../src/ingest/dwelly.js";

/**
 * Turns the organisers' completed cases into decision points for training and labelling.
 * Writes evals/cuts-<name>.json ({caseId: lastEvent}) for `pnpm cases -- --cuts ...`, and for each case an
 * "after" file with the hidden events, Overview and Outcome, so a human can write expectations without opening the model's answer.
 * Auto cut = just before the first substantive inbound event from a tenant, landlord or contractor after the request
 * (the natural "what do we do now" moment); if none, after the first event.
 */
const o = new Command().requiredOption("--src <dir>").option("--name <name>", "cuts file name", "auto").option("--ids <ids>").option("--at <n>", "fixed event number for every case").parse().opts();
const src = path.resolve(o.src);
const only = o.ids ? new Set(String(o.ids).split(",")) : null;
const cuts: Record<string, number> = {};
const afterDir = path.resolve("evals", `after-${o.name}`); fs.mkdirSync(afterDir, { recursive: true });
for (const id of fs.readdirSync(src).filter((d) => /^\d+$/.test(d)).sort()) {
  if (only && !only.has(id)) continue;
  const dir = path.join(src, id);
  if (!fs.existsSync(path.join(dir, "history.md"))) continue;
  const events = parseHistory(fs.readFileSync(path.join(dir, "history.md"), "utf8"));
  let cut = o.at ? Number(o.at) : 1;
  if (!o.at) {
    const inbound = events.findIndex((e, i) => i > 0 && /tenant|landlord|contractor|provider/i.test(e.from) && e.body.length > 20);
    cut = inbound > 0 ? events[inbound].n : events[Math.min(1, events.length - 1)].n;
  }
  cuts[id] = cut;
  const index = fs.readFileSync(path.join(dir, "index.md"), "utf8");
  const sect = (n: string) => index.match(new RegExp(`^## ${n}\\s*\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, "m"))?.[1]?.trim() ?? "";
  const hidden = events.filter((e) => e.n > cut).map((e) => `### event ${e.n} — ${e.ts} — ${e.channel} — from ${e.from} to ${e.to}\n${e.body}`).join("\n\n");
  fs.writeFileSync(path.join(afterDir, `${id}.md`), `# Case ${id}: hidden part (cut after event ${cut} of ${events.length})\n\n## What actually happened next\n${hidden || "(nothing)"}\n\n## Overview (as exported)\n${sect("Overview")}\n\n## Outcome (as exported)\n${sect("Outcome")}\n`);
}
const out = path.resolve("evals", `cuts-${o.name}.json`);
fs.writeFileSync(out, JSON.stringify(cuts, null, 2));
console.log(`wrote ${out} (${Object.keys(cuts).length} cases) and ${afterDir}/`);
