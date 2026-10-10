/**
 * Public surface of the case-file extraction (stream A).
 *   extractCaseState(events, header, attachmentsText?, opts?) → CaseState, never throws
 *   renderCaseState(state) → compact markdown for the case pack
 *   parseCaseHeader(indexMd) → the header fields the extractor wants
 */
import type { LanguageModel } from "ai";
import type { HistoryEvent } from "../ingest/dwelly.js";
import { CaseStateSchema, type CaseState } from "../schemas/casestate.js";
import { extractCaseStateSync, type CaseHeader } from "./extract.js";
import { enrichWithModel } from "./entities.js";
export { renderCaseState } from "./render.js";
export { extractCaseStateSync, type CaseHeader } from "./extract.js";
export { deriveStage, classifySystemEvent } from "./stage.js";

export type ExtractOptions = { model?: LanguageModel; modelTimeoutMs?: number };

export async function extractCaseState(events: HistoryEvent[], header: CaseHeader = {}, attachmentsText?: string, opts: ExtractOptions = {}): Promise<CaseState> {
  let state: CaseState;
  try {
    state = extractCaseStateSync(events ?? [], header ?? {}, attachmentsText ?? "");
  } catch (e) {
    state = CaseStateSchema.parse({ jobId: header?.jobId, propertyAddress: header?.propertyAddress, lastEventTs: [...(events ?? [])].reverse().find((x) => x.ts)?.ts, notes: [`extraction failed, state is partial: ${String(e).slice(0, 200)}`], difficulty: { score: 5, reasons: ["extraction failed; treat as standard"], tier: "standard" } });
  }
  if (opts.model) { try { await enrichWithModel(state, events ?? [], opts.model, opts.modelTimeoutMs); } catch { /* optional */ } }
  return state;
}

/** Header fields from the organisers' index.md. Tolerates a missing file or sections. */
export function parseCaseHeader(indexMd: string, historyMd = ""): CaseHeader {
  const md = indexMd.replace(/^﻿/, "");
  const details = md.match(/^## Case details\s*\n([\s\S]*?)(?=^## |(?![\s\S]))/m)?.[1] ?? "";
  const detail = (k: string) => (details.match(new RegExp(`\\*\\*${k}:\\*\\*\\s*(.*)`))?.[1] ?? "").trim() || undefined;
  const jobId = (historyMd.match(/Job Id:\s*([A-Z0-9-]+)/) ?? md.match(/Job Id:\s*([A-Z0-9-]+)/))?.[1];
  return { jobId, propertyAddress: detail("Property"), sourceRole: detail("Source role"), created: detail("Created"), title: md.match(/^#\s+(.+)$/m)?.[1]?.trim() };
}
