import type { Case } from "../schemas/case.js";
import type { RecordStore, Row } from "../backend/store.js";

/**
 * Deterministic context prefetch. Pulls the records a property manager would open first,
 * so the agent starts with evidence instead of spending steps on lookups.
 * Best effort: misses are reported, never invented. Works on any dataset shape.
 */
export type Prefetch = { records: Row[]; queries: string[]; misses: string[] };

const UK_POSTCODE = /\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/gi;
const ADDRESS = /\b((?:flat|apartment|unit)\s+\w+,?\s+)?\d{1,4}[a-z]?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:street|st|road|rd|lane|ln|avenue|ave|close|crescent|gardens|place|square|terrace|way|drive|court|mews|grove|hill|park|row|walk)\b/gi;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const REF = /\b(?:[A-Z]{1,3}-?\d{2,6})\b/g; // P12, T-0042, TEN-7, WO1234

export async function prefetchContext(c: Case, store: RecordStore, maxRecords = 22): Promise<Prefetch> {
  const queries: string[] = []; const misses: string[] = [];
  const found = new Map<string, Row>();
  const add = (rows: Row[]) => { for (const r of rows) { const k = `${r.type}:${r.id}`; if (!found.has(k) && found.size < maxRecords) found.set(k, r); } };

  // 1. Linked ids from structured input: look up by id across every type.
  for (const [key, id] of Object.entries(c.linkedIds)) {
    queries.push(`${key}=${id}`);
    const rows = await store.search(id, undefined, 6);
    const exact = rows.filter((r) => r.id === id);
    if (exact.length) add(exact); else if (rows.length) add(rows); else misses.push(`${key}=${id} not found`);
  }
  // 2. Postcodes, addresses, emails, references in the raw text.
  const text = c.rawText;
  const terms = new Set<string>();
  for (const m of text.matchAll(UK_POSTCODE)) terms.add(m[1].replace(/\s+/g, " ").toUpperCase());
  for (const m of text.matchAll(ADDRESS)) terms.add(m[0].replace(/^(flat|apartment|unit)\s+\w+,?\s+/i, "").trim());
  for (const m of text.matchAll(EMAIL)) terms.add(m[0].toLowerCase());
  for (const m of text.matchAll(REF)) terms.add(m[0]);
  for (const t of [...terms].slice(0, 10)) {
    queries.push(t);
    const rows = await store.search(t, undefined, 5);
    if (rows.length) add(rows); else misses.push(`"${t}" matched nothing`);
  }
  // 3. Follow one hop: property -> landlord, tenancy, open tickets, certificates, bookings (by property id in any field),
  //    then the building: sibling properties and their recent tickets, so building-level patterns are visible.
  const propertyRows = [...found.values()].filter((r) => /propert/i.test(r.type));
  for (const p of propertyRows.slice(0, 2)) {
    const rel = await store.search(p.id, undefined, 14);
    add(rel.filter((r) => r.type !== p.type));
    const landlordId = (p.data as any).landlord_id ?? (p.data as any).landlordId;
    if (landlordId) { const ll = await store.search(String(landlordId), undefined, 3); add(ll.filter((r) => /landlord/i.test(r.type))); }
    const building = (p.data as any).building_id ?? (p.data as any).buildingId ?? (p.data as any).block_id;
    if (building) {
      const sib = (await store.search(String(building), undefined, 10)).filter((r) => /propert/i.test(r.type) && r.id !== p.id);
      add(sib);
      for (const sp of sib.slice(0, 3)) add((await store.search(sp.id, undefined, 6)).filter((r) => /ticket|booking|work_order|message/i.test(r.type)));
    }
  }
  return { records: [...found.values()], queries, misses };
}

export function renderPrefetch(p: Prefetch): string {
  if (p.records.length === 0) return `Records found by prefetch: none (searched: ${p.queries.join(", ") || "nothing to search"}). Use search_records and list_record_types yourself.`;
  const lines = p.records.map((r) => `- [${r.type}/${r.id}] ${clip(JSON.stringify(r.data), 900)}`);
  const miss = p.misses.length ? `\nNot found: ${p.misses.join("; ")}` : "";
  return `Records found by prefetch (verify before relying on them; fetch more with the read tools):\n${lines.join("\n")}${miss}`;
}
function clip(s: string, n: number) { return s.length > n ? s.slice(0, n) + "…" : s; }
