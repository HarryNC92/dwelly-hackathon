import fs from "node:fs";
import path from "node:path";

/** Append-only JSONL per case. This file is the repo artefact the judge reads. */
export class Trace {
  private file: string;
  constructor(outDir: string, readonly caseId: string) {
    fs.mkdirSync(outDir, { recursive: true });
    this.file = path.join(outDir, "trace.jsonl");
  }
  log(event: string, data: Record<string, unknown> = {}) {
    const line = JSON.stringify({ ts: new Date().toISOString(), case: this.caseId, event, ...data });
    fs.appendFileSync(this.file, line + "\n");
  }
  read(): Record<string, unknown>[] {
    if (!fs.existsSync(this.file)) return [];
    return fs.readFileSync(this.file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  }
}
