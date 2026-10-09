import fs from "node:fs/promises";
import path from "node:path";
import type { RecordStore } from "./store.js";

/**
 * Loads a dataset directory into the record store. Shape-agnostic:
 *  - foo.json containing an array  -> type "foo", id from id/ID/_id/reference or index
 *  - foo.json containing an object of arrays -> one type per key
 *  - foo.csv -> type "foo" (simple CSV, quoted fields supported)
 *  - .md/.txt/.eml/.html -> type "document" with the text in data.text
 * Unknown fields are kept verbatim.
 */
export async function seedFromDirectory(store: RecordStore, dir: string): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  const files = await walk(dir);
  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    const stem = path.basename(file, ext).toLowerCase().replace(/[^a-z0-9_]+/g, "_");
    if (ext === ".json") {
      const parsed = JSON.parse(await fs.readFile(file, "utf8"));
      if (Array.isArray(parsed)) counts[stem] = (counts[stem] ?? 0) + (await putAll(store, stem, parsed));
      else if (parsed && typeof parsed === "object") {
        for (const [k, v] of Object.entries(parsed)) {
          if (Array.isArray(v)) { const t = k.toLowerCase(); counts[t] = (counts[t] ?? 0) + (await putAll(store, t, v)); }
          else { counts[stem] = (counts[stem] ?? 0) + (await putAll(store, stem, [parsed])); break; }
        }
      }
    } else if (ext === ".csv") {
      const rows = parseCsv(await fs.readFile(file, "utf8"));
      counts[stem] = (counts[stem] ?? 0) + (await putAll(store, stem, rows));
    } else if ([".md", ".txt", ".eml", ".html"].includes(ext)) {
      const text = await fs.readFile(file, "utf8");
      await store.upsert("document", path.relative(dir, file), { name: path.basename(file), text });
      counts.document = (counts.document ?? 0) + 1;
    }
  }
  return counts;
}

async function putAll(store: RecordStore, type: string, items: unknown[]): Promise<number> {
  let n = 0;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const id = String(obj.id ?? obj.ID ?? obj._id ?? obj.reference ?? obj.ref ?? obj.ticket_id ?? obj.property_id ?? `${type}-${i + 1}`);
    await store.upsert(type, id, obj);
    n++;
  }
  return n;
}

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
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
