import { z } from "zod";
import type { ToolDef } from "./types.js";

const limit = z.number().optional().describe("Max rows, default 20");

export const listRecordTypes: ToolDef = {
  name: "list_record_types", kind: "read", risk: "none",
  description: "List every record type in the system of record with a count and one sample row. Call this first if you do not know the data shape.",
  input: z.object({}),
  run: async (_i, ctx) => ctx.store.listTypes(),
};

export const getRecord: ToolDef = {
  name: "get_record", kind: "read", risk: "none",
  description: "Fetch one record by type and id.",
  input: z.object({ type: z.string(), id: z.string() }),
  run: async (i, ctx) => (await ctx.store.get(i.type, i.id)) ?? { notFound: true, type: i.type, id: i.id },
};

export const searchRecords: ToolDef = {
  name: "search_records", kind: "read", risk: "none",
  description: "Fuzzy search across records (addresses, names, references, free text). Optionally restrict to a type. Use this when exact ids are missing or formatted differently.",
  input: z.object({ query: z.string(), type: z.string().optional(), limit }),
  run: async (i, ctx) => ctx.store.search(i.query, i.type, i.limit ?? 20),
};

export const listRecords: ToolDef = {
  name: "list_records", kind: "read", risk: "none",
  description: "List records of one type (e.g. contractors, certificates).",
  input: z.object({ type: z.string(), limit }),
  run: async (i, ctx) => ctx.store.list(i.type, i.limit ?? 50),
};

export const queryRecords: ToolDef = {
  name: "query_records", kind: "read", risk: "none",
  description: "Read-only SQL over the records table (columns: type TEXT, id TEXT, data JSONB). Single SELECT only. Example: SELECT id, data->>'expiry' FROM records WHERE type='certificates' AND data->>'property_id'='P12'.",
  input: z.object({ sql: z.string(), limit }),
  run: async (i, ctx) => ctx.store.readOnlyQuery(i.sql.replace(/\brecords\b/g, `"${ctx.store.schema}".records`), i.limit ?? 50),
};

/** Typed convenience reads. Thin wrappers; the generic tools above work on any dataset. */
function byType(name: string, type: string, description: string): ToolDef {
  return {
    name, kind: "read", risk: "none", description,
    input: z.object({ id: z.string().optional().describe("Record id if known"), query: z.string().optional().describe("Otherwise a search string") }),
    run: async (i, ctx) => {
      if (i.id) return (await ctx.store.get(type, i.id)) ?? (i.query ? ctx.store.search(i.query, type, 10) : { notFound: true });
      if (i.query) return ctx.store.search(i.query, type, 10);
      return ctx.store.list(type, 20);
    },
  };
}
export const getProperty = byType("get_property", "properties", "Property record: address, landlord, units, access notes.");
export const getTenancy = byType("get_tenancy", "tenancies", "Tenancy record: tenants, dates, rent, deposit, terms.");
export const getLandlord = byType("get_landlord", "landlords", "Landlord profile: spend authority, contact preferences, instructions.");
export const getContractors = byType("get_contractors", "contractors", "Approved contractor panel: trade, area, rates, availability.");
export const getTickets = byType("get_tickets", "tickets", "Maintenance tickets, open and historic.");
export const getCertificates = byType("get_certificates", "certificates", "Compliance certificates with expiry dates.");
export const getRentLedger = byType("get_rent_ledger", "rent_ledger", "Rent ledger entries and arrears.");

export const READ_TOOLS: ToolDef[] = [
  listRecordTypes, getRecord, searchRecords, listRecords, queryRecords,
  getProperty, getTenancy, getLandlord, getContractors, getTickets, getCertificates, getRentLedger,
];
