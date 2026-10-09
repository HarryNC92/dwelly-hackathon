/**
 * The record store: one `records` table keyed by (type, id) with the full JSON kept.
 * Works on any dataset shape. Two drivers share the same SQL: PGlite in-process (zero setup)
 * and postgres.js against a hosted Postgres (shared team state).
 */
export type Row = { type: string; id: string; data: Record<string, unknown>; updated_at?: string };

export interface SqlDriver {
  query<T = any>(text: string, params?: unknown[]): Promise<T[]>;
  close(): Promise<void>;
}

export class RecordStore {
  constructor(private sql: SqlDriver, readonly schema = "public") {}

  async init(): Promise<void> {
    await this.sql.query(`CREATE SCHEMA IF NOT EXISTS "${this.schema}"`);
    await this.sql.query(`CREATE TABLE IF NOT EXISTS "${this.schema}".records (
      type TEXT NOT NULL, id TEXT NOT NULL, data JSONB NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now(),
      PRIMARY KEY (type, id))`);
    await this.sql.query(`CREATE INDEX IF NOT EXISTS records_type_idx ON "${this.schema}".records (type)`);
  }

  private t() { return `"${this.schema}".records`; }

  async listTypes(): Promise<{ type: string; count: number; sample: Record<string, unknown> | null }[]> {
    const rows = await this.sql.query<{ type: string; count: string }>(`SELECT type, count(*)::text AS count FROM ${this.t()} GROUP BY type ORDER BY type`);
    const out = [];
    for (const r of rows) {
      const s = await this.sql.query<Row>(`SELECT data FROM ${this.t()} WHERE type = $1 LIMIT 1`, [r.type]);
      out.push({ type: r.type, count: Number(r.count), sample: s[0]?.data ?? null });
    }
    return out;
  }

  async get(type: string, id: string): Promise<Row | null> {
    const rows = await this.sql.query<Row>(`SELECT type, id, data, updated_at::text FROM ${this.t()} WHERE type = $1 AND id = $2`, [type, id]);
    return rows[0] ?? null;
  }

  /** Case-insensitive substring search over the JSON text. Good enough for address and name variants. */
  async search(q: string, type?: string, limit = 20): Promise<Row[]> {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return [];
    const conds = terms.map((_, i) => `lower(data::text) LIKE $${i + 1}`);
    const params: unknown[] = terms.map((t) => `%${t.replace(/[%_]/g, "")}%`);
    let where = conds.join(" AND ");
    if (type) { params.push(type); where += ` AND type = $${params.length}`; }
    params.push(q.trim()); const qi = params.length;
    params.push(limit);
    return this.sql.query<Row>(`SELECT type, id, data FROM ${this.t()} WHERE ${where} ORDER BY (id = $${qi}) DESC, (data ? 'case_id') ASC, type, id LIMIT $${params.length}`, params);
  }

  async list(type: string, limit = 50): Promise<Row[]> {
    return this.sql.query<Row>(`SELECT type, id, data FROM ${this.t()} WHERE type = $1 ORDER BY id LIMIT $2`, [type, limit]);
  }

  /** Read-only SQL for the generalist. Rejects anything that is not a single SELECT. */
  async readOnlyQuery(text: string, limit = 50): Promise<Record<string, unknown>[]> {
    const t = text.trim().replace(/;+$/, "");
    if (!/^select\s/i.test(t) || /;|\b(insert|update|delete|drop|alter|create|truncate|grant|pg_sleep|generate_series|dblink|pg_read|lo_|copy|vacuum)\b/i.test(t)) {
      throw new Error("query_records accepts a single SELECT statement only");
    }
    return this.sql.query(`SELECT * FROM (${t}) AS q LIMIT ${Math.min(limit, 200)}`);
  }

  async upsert(type: string, id: string, data: Record<string, unknown>): Promise<Row> {
    const rows = await this.sql.query<Row>(
      `INSERT INTO ${this.t()} (type, id, data) VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (type, id) DO UPDATE SET data = EXCLUDED.data, updated_at = now() RETURNING type, id, data`,
      [type, id, JSON.stringify(data)]);
    return rows[0];
  }

  async patch(type: string, id: string, patch: Record<string, unknown>): Promise<Row | null> {
    const rows = await this.sql.query<Row>(
      `UPDATE ${this.t()} SET data = data || $3::jsonb, updated_at = now() WHERE type = $1 AND id = $2 RETURNING type, id, data`,
      [type, id, JSON.stringify(patch)]);
    return rows[0] ?? null;
  }

  async close() { await this.sql.close(); }
}

export async function openStore(opts: { databaseUrl?: string; schema?: string }): Promise<RecordStore> {
  const schema = opts.schema ?? "public";
  let driver: SqlDriver;
  if (opts.databaseUrl) {
    const postgres = (await import("postgres")).default;
    const sql = postgres(opts.databaseUrl, { max: 10, prepare: false });
    driver = {
      query: async (text, params = []) => (await sql.unsafe(text, params as any[])) as any[],
      close: async () => { await sql.end(); },
    };
  } else {
    const { PGlite } = await import("@electric-sql/pglite");
    const db = new PGlite(); // in-memory, nothing on disk
    driver = {
      query: async (text, params = []) => (await db.query(text, params as any[])).rows as any[],
      close: async () => { await db.close(); },
    };
  }
  const store = new RecordStore(driver, schema);
  await store.init();
  return store;
}
