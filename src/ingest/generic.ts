import fs from "node:fs/promises";
import path from "node:path";
import { CaseSchema, type Case } from "../schemas/case.js";
import { computeFlags } from "../runtime/flags.js";

const TEXT_EXT = new Set([".txt", ".md", ".eml", ".json", ".csv", ".html", ".vtt", ".srt"]);
const FILE_EXT: Record<string, string> = { ".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };

/**
 * Generic ingest: each top-level entry in the cases directory is one case (a file or a folder).
 * Text becomes rawText; PDFs and images become attachments passed to the model natively.
 * Case ids come from the organisers' names, never from order.
 */
export async function loadCases(dir: string): Promise<Case[]> {
  const entries = (await fs.readdir(dir, { withFileTypes: true })).filter((e) => !e.name.startsWith("."));
  entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const cases: Case[] = [];
  for (const e of entries) {
    const p = path.join(dir, e.name);
    const files = e.isDirectory() ? (await fs.readdir(p)).filter((f) => !f.startsWith(".")).sort().map((f) => path.join(p, f)) : [p];
    const id = e.isDirectory() ? e.name : path.basename(e.name, path.extname(e.name));
    cases.push(await buildCase(id, files));
  }
  return cases;
}

export async function buildCase(id: string, files: string[]): Promise<Case> {
  let rawText = "";
  let structured: Record<string, unknown> | undefined;
  const attachments: Case["attachments"] = [];
  let channel = "unknown"; let receivedAt: string | undefined; const linkedIds: Record<string, string> = {};
  for (const f of files) {
    const ext = path.extname(f).toLowerCase();
    if (TEXT_EXT.has(ext)) {
      const text = await fs.readFile(f, "utf8");
      rawText += `\n\n--- ${path.basename(f)} ---\n${text}`;
      if (ext === ".json") {
        try {
          const j = JSON.parse(text);
          structured = { ...(structured ?? {}), [path.basename(f)]: j };
          for (const k of ["channel", "type", "source"]) if (typeof j?.[k] === "string") channel = j[k];
          for (const k of ["received_at", "timestamp", "created_at", "date"]) if (typeof j?.[k] === "string") receivedAt = j[k];
          for (const [k, v] of Object.entries(j ?? {})) if (/_id$/.test(k) && (typeof v === "string" || typeof v === "number")) linkedIds[k] = String(v);
        } catch { /* keep as text */ }
      }
      if (ext === ".eml") channel = "email";
      if (ext === ".vtt" || ext === ".srt") channel = "call";
    } else if (FILE_EXT[ext]) {
      attachments.push({ name: path.basename(f), mediaType: FILE_EXT[ext], path: f });
    }
  }
  const c = CaseSchema.parse({ id, channel, receivedAt, rawText: rawText.trim() || "(no text content; see attachments)", structured, attachments, linkedIds, sourceFiles: files.map((f) => path.basename(f)), flags: [] });
  c.flags = computeFlags(c.rawText);
  return c;
}
