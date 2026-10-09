import fs from "node:fs";
import path from "node:path";

/** Append-only JSONL per case. This file is the repo artefact the judge reads. A fresh run of a case truncates it. */
export class Trace {
  private file: string;
  constructor(outDir: string, readonly caseId: string, fresh = true) {
    fs.mkdirSync(outDir, { recursive: true });
    this.file = path.join(outDir, "trace.jsonl");
    if (fresh) fs.writeFileSync(this.file, "");
  }
  log(event: string, data: Record<string, unknown> = {}) {
    const line = JSON.stringify({ ts: new Date().toISOString(), case: this.caseId, event, ...data });
    fs.appendFileSync(this.file, line + "\n");
  }
  static readSafe(file: string): Record<string, unknown>[] {
    if (!fs.existsSync(file)) return [];
    return fs.readFileSync(file, "utf8").split("\n").filter(Boolean).flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } });
  }
}
