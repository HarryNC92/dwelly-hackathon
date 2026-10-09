import fs from "node:fs/promises";
import path from "node:path";
import type { RecordStore } from "./store.js";

/**
 * Loads a dataset directory into the record store. Shape-agnostic and never throws for one bad file:
 *  - foo.json containing an array  -> type "foo"
 *  - foo.json containing an object -> every array-valued key becomes a type; otherwise one record of type "foo"
 *  - foo.csv / foo.jsonl -> type "foo"
 *  - .md/.txt/.eml/.html -> type "document" with the text in data.text
 * Ids: id/ID/_id/uuid/ref/reference, then "<singular>_id" (certificates -> certificate_id), then any *_id key whose
 * values are unique across the rows, then the row index. Unknown fields are kept verbatim.
 */
export async function seedFromDirectory(store: RecordStore, dir: string): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  const bump = (t: string, n: number) => (counts[t] = (counts[t] ?? 0) + n);
  for (const file of await walk(dir)) {
    const ext = path.extname(file).toLowerCase();
    const stem = path.basename(file, ext).toLowerCase().replace(/[^a-z0-9_]+/g, "_");
    try {
      if (ext === ".json" || ext === ".jsonl") {
        const text = (await fs.readFile(file, "utf8")).replace(/^\uFEFF/, "");
        const parsed = ext === ".jsonl" ? text.split("\n").filter(Boolean).map((l) => JSON.parse(l)) : JSON.parse(text);
        if (Array.isArray(parsed)) bump(stem, await putAll(store, stem, parsed));
        else if (parsed && typeof parsed === "object") {
          let any = false;
          for (const [k, v] of Object.entries(parsed)) if (Array.isArray(v)) { any = true; const t = k.toLowerCase().replace(/[^a-z0-9_]+/g, "_"); bump(t, await putAll(store, t, v)); }
          if (!any) bump(stem, await putAll(store, stem, [parsed]));
        }
      } else if (ext === ".csv") {
        bump(stem, await putAll(store, stem, parseCsv((await fs.readFile(file, "utf8")).replace(/^\uFEFF/, ""))));
      } else if ([".md", ".txt", ".eml", ".html", ".yaml", ".yml"].includes(ext)) {
        const text = await fs.readFile(file, "utf8");
        await store.upsert("document", path.relative(dir, file), { name: path.basename(file), text });
        bump("document", 1);
      }
    } catch (e) {
      console.error(`seed: skipped ${file}: ${String(e).slice(0, 120)}`);
      bump("_skipped", 1);
    }
  }
  return counts;
}

function pickIdKey(type: string, items: Record<string, unknown>[]): string | null {
  const keys = new Set(items.flatMap((o) => Object.keys(o)));
  for (const k of ["id", "ID", "Id", "_id", "uuid", "ref", "reference"]) if (keys.has(k)) return k;
  const singular = type.replace(/ies$/, "y").replace(/s$/, "");
  for (const k of keys) if (k.toLowerCase() === `${singular}_id` || k.toLowerCase() === `${singular}id` || k.toLowerCase() === `${type}_id`) return k;
  for (const k of keys) {
    if (!/_id$|Id$|_ref$|_number$/.test(k)) continue;
    const vals = items.map((o) => o[k]).filter((v) => v != null);
    if (vals.length === items.length && new Set(vals.map(String)).size === items.length) return k;
  }
  return null;
}

async function putAll(store: RecordStore, type: string, items: unknown[]): Promise<number> {
  const objs = items.filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === "object");
  const idKey = pickIdKey(type, objs);
  let n = 0;
  for (let i = 0; i < objs.length; i++) {
    const obj = objs[i];
    const id = idKey && obj[idKey] != null ? String(obj[idKey]) : `${type}-${i + 1}`;
    await store.upsert(type, id, obj);
    n++;
  }
  return n;
}

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out.sort();
}

export function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const header = splitCsvLine(lines[0]);
  return lines.slice(1).map((l) => {
    const cells = splitCsvLine(l);
    const row: Record<string, string> = {};
    header.forEach((h, i) => (row[h.trim()] = cells[i] ?? ""));
    return row;
  });
}

function splitCsvLine(line: string): string[] {
  const out: string[] = []; let cur = ""; let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true; else if (c === ",") { out.push(cur); cur = ""; } else cur += c;
  }
  out.push(cur);
  return out;
}
