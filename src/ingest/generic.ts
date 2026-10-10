import fs from "node:fs/promises";
import path from "node:path";
import { CaseSchema, type Case } from "../schemas/case.js";
import { computeFlags } from "../runtime/flags.js";
import { isDwellyCase, buildDwellyCase, type DwellyOptions } from "./dwelly.js";

const FILE_EXT: Record<string, string> = { ".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif" };
const SKIP = /^(readme|manifest|index|summary|\.ds_store|thumbs\.db)/i;
const MAX_TEXT = 80_000;

/**
 * Generic ingest: each top-level entry in the cases directory is one case (a file or a folder).
 * Files sharing a stem (007.txt + 007.pdf) merge into one case. Text becomes rawText; PDFs and images become
 * attachments passed to the model natively; anything else is read as text if it decodes. Ids come from the
 * organisers' names, never from order. README/manifest files at the top level are not cases.
 */
export async function loadCases(dir: string, opts: DwellyOptions = {}): Promise<Case[]> {
  const entries = (await fs.readdir(dir, { withFileTypes: true })).filter((e) => !e.name.startsWith(".") && !SKIP.test(e.name));
  const byId = new Map<string, string[]>();
  const dwelly = new Map<string, string>();
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (await isDwellyCase(p)) { dwelly.set(e.name, p); continue; }
      const files = (await walkFiles(p)).sort();
      byId.set(e.name, [...(byId.get(e.name) ?? []), ...files]);
    } else {
      const id = path.basename(e.name, path.extname(e.name));
      byId.set(id, [...(byId.get(id) ?? []), p]);
    }
  }
  const ids = [...new Set([...byId.keys(), ...dwelly.keys()])].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const cases: Case[] = [];
  for (const id of ids) cases.push(dwelly.has(id) ? await buildDwellyCase(id, dwelly.get(id)!, opts) : await buildCase(id, byId.get(id)!));
  return cases;
}

async function walkFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walkFiles(p))); else out.push(p);
  }
  return out;
}

const stripBom = (s: string) => s.replace(/^\uFEFF/, "");
const stripBase64 = (s: string) => s.replace(/(?:^|\n)(?:[A-Za-z0-9+/]{60,}={0,2}\n){4,}/g, "\n[binary attachment content removed]\n");

export async function buildCase(id: string, files: string[]): Promise<Case> {
  let rawText = "";
  let structured: Record<string, unknown> | undefined;
  const attachments: Case["attachments"] = [];
  let channel = "unknown"; let receivedAt: string | undefined; const linkedIds: Record<string, string> = {};
  for (const f of files) {
    const ext = path.extname(f).toLowerCase();
    if (FILE_EXT[ext]) { attachments.push({ name: path.basename(f), mediaType: FILE_EXT[ext], path: f }); continue; }
    let text: string;
    try { text = stripBom(await fs.readFile(f, "utf8")); } catch { continue; }
    if (/\uFFFD/.test(text.slice(0, 2000)) && !/\.(txt|md|eml|json|csv|html|vtt|srt|xml|yaml|yml|log|jsonl)$/i.test(f)) { rawText += `\n\n--- ${path.basename(f)} (binary, not readable) ---`; continue; }
    text = stripBase64(text);
    rawText += `\n\n--- ${path.basename(f)} ---\n${text}`;
    if (ext === ".json" || ext === ".jsonl") {
      try {
        const j = ext === ".jsonl" ? text.split("\n").filter(Boolean).map((l) => JSON.parse(l)) : JSON.parse(text);
        const objs = Array.isArray(j) ? j : [j];
        structured = { ...(structured ?? {}), [path.basename(f)]: j };
        for (const obj of objs) {
          for (const k of ["channel", "type", "source"]) if (typeof obj?.[k] === "string" && channel === "unknown") channel = obj[k];
          for (const k of ["received_at", "receivedAt", "timestamp", "created_at", "date", "datetime"]) if (typeof obj?.[k] === "string" && !receivedAt) { const d = new Date(obj[k]); if (!Number.isNaN(d.getTime())) receivedAt = d.toISOString(); }
          for (const [k, v] of Object.entries(obj ?? {})) if (/(_id|Id)$/.test(k) && (typeof v === "string" || typeof v === "number")) linkedIds[k] = String(v);
        }
      } catch { /* keep as text */ }
    }
    if (ext === ".eml") channel = "email";
    if (ext === ".vtt" || ext === ".srt") channel = "call";
    if (!receivedAt) {
      const m = text.match(/^(?:Date|Received|Received at|Timestamp|Sent)\s*:\s*(.+)$/im);
      if (m) { const d = new Date(m[1].trim().replace(/\s*\(.*\)$/, "")); if (!Number.isNaN(d.getTime())) receivedAt = d.toISOString(); }
      const iso = !receivedAt && text.match(/\b(20\d\d-\d\d-\d\dT\d\d:\d\d(?::\d\d)?(?:Z|[+-]\d\d:?\d\d)?)\b/);
      if (iso) receivedAt = new Date(iso[1]).toISOString();
    }
  }
  rawText = rawText.trim();
  if (rawText.length > MAX_TEXT) rawText = `${rawText.slice(0, MAX_TEXT * 0.7)}\n\n[... ${rawText.length - MAX_TEXT} characters omitted from the middle of the input ...]\n\n${rawText.slice(-MAX_TEXT * 0.3)}`;
  const kind = /(^|\n)\s*(question|decision point|what should|should the agent|how should)\b/i.test(rawText) || /\?\s*$/.test(rawText) ? "question" : "event";
  const c = CaseSchema.parse({ id, channel, kind, receivedAt, rawText: rawText || "(no text content; see attachments)", structured, attachments, linkedIds, sourceFiles: files.map((f) => path.basename(f)), flags: [] });
  c.flags = computeFlags(c.rawText);
  return c;
}
