import fs from "node:fs";
import path from "node:path";

/**
 * What the service can learn about a case from disk at escalation time, without importing the pipeline:
 * the trace the runner is writing (<out>/<case>/trace.jsonl) and the original report in the cases directory.
 */
export type CaseContext = { flags: string[]; report?: string; property?: string; tenant?: string; resolution?: any };

const PLACEHOLDER = /^mock\b/i;

function readTrace(file: string): any[] {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8").split("\n").filter(Boolean).flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } });
}

/** Address for a property id from DATA_DIR/properties.json (the dataset the runner was seeded with). */
function lookupProperty(id: unknown): string | undefined {
  const dataDir = process.env.DATA_DIR;
  if (!id || !dataDir) return undefined;
  try {
    const rows = JSON.parse(fs.readFileSync(path.join(dataDir, "properties.json"), "utf8"));
    const p = rows.find((r: any) => r.id === id);
    return p ? [p.address, p.postcode].filter(Boolean).join(", ") : undefined;
  } catch { return undefined; }
}

/** Text of the original case: Dwelly index.md (initial request) or any text-like files in the case folder. */
function readReport(casesDir: string, caseId: string): { text?: string; property?: string } {
  const dir = path.join(casesDir, caseId);
  const files = fs.existsSync(dir) && fs.statSync(dir).isDirectory()
    ? fs.readdirSync(dir).map((f) => path.join(dir, f))
    : fs.existsSync(casesDir) ? fs.readdirSync(casesDir).filter((f) => f.startsWith(caseId + ".")).map((f) => path.join(casesDir, f)) : [];
  let property: string | undefined;
  const parts: string[] = [];
  for (const f of files) {
    if (!/\.(md|txt|eml|json)$/i.test(f) || !fs.statSync(f).isFile()) continue;
    let t = fs.readFileSync(f, "utf8");
    if (f.endsWith(".json")) {
      try { const j = JSON.parse(t); property ??= lookupProperty(j.property_id); t = String(j.transcript ?? j.message ?? j.body ?? t); } catch { /* keep raw */ }
    }
    property ??= t.match(/\*\*Property:\*\*\s*(.+)/)?.[1]?.trim();
    const initial = t.match(/## Initial request\s+([\s\S]*?)\n## /)?.[1];
    parts.push((initial ?? t).trim());
  }
  const text = parts.join("\n").replace(/^(From|To|Subject|Date):.*$/gim, "").replace(/\s+/g, " ").trim();
  property ??= text.match(/\b(Flat \d+[A-Z]?,?\s+\d+\s+[A-Z][a-z]+(?:\s[A-Z][a-z]+)*(?:\s(?:Street|Road|Row|Lane|Avenue|Close|Court|View|Way|Place|Gardens|Drive|Terrace))?)/)?.[1];
  return { text: text ? text.slice(0, 500) : undefined, property };
}

export function caseContext(outDirs: string[], caseId: string, casesDirs: string[]): CaseContext {
  const traceFile = outDirs.map((d) => path.join(d, caseId, "trace.jsonl")).find((f) => fs.existsSync(f));
  const events = traceFile ? readTrace(traceFile) : [];
  const start = events.find((e) => e.event === "case.start");
  const submits = events.filter((e) => e.event === "tool.control" && e.tool === "submit_resolution");
  const resolution = submits.at(-1)?.input;
  const report = casesDirs.map((d) => readReport(path.resolve(d), caseId)).find((r) => r.text) ?? {};
  return { flags: start?.flags ?? [], report: report.text, property: report.property, resolution };
}

export const meaningful = (v: unknown): v is string => typeof v === "string" && v.trim() !== "" && !PLACEHOLDER.test(v.trim());
