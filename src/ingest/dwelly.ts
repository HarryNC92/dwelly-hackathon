import fs from "node:fs/promises";
import path from "node:path";
import { CaseSchema, type Case } from "../schemas/case.js";
import { computeFlags } from "../runtime/flags.js";
import { extractCaseState } from "../casefile/index.js";

/**
 * Adapter for the organisers' case format (github.com/DwellyOrg/HackatonPublicCases):
 *   <case>/index.md      title, "Case details" bullets, "Initial request", "Overview", "Outcome", attachment links
 *   <case>/history.md    events in time order: "<a id=\"event-001\"></a>\n## <ts> UTC — event 001" + Channel/From/To bullets + body
 *   <case>/attachments/  PDFs, images, CSVs
 * Overview and Outcome narrate the ending, so they are hidden unless `showOutcome` is set. A cut (event number) hides later events,
 * which is how we turn a completed case into a decision point for training. "Now" is the last included event.
 */
export type DwellyOptions = { showOutcome?: boolean; cuts?: Record<string, number> };
export type HistoryEvent = { n: number; ts: string; channel: string; from: string; to: string; body: string; attachments: string[] };

export async function isDwellyCase(dir: string): Promise<boolean> {
  try { await fs.access(path.join(dir, "index.md")); await fs.access(path.join(dir, "history.md")); return true; } catch { return false; }
}

const FILE_EXT: Record<string, string> = { ".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif" };

export function parseHistory(md: string): HistoryEvent[] {
  const parts = md.split(/<a id="event-\d+"><\/a>\s*/).slice(1);
  return parts.map((p, i) => {
    const head = p.match(/^##\s*(.+?)\s+UTC\s+—\s+event\s+(\d+)/m);
    const ts = head ? new Date(head[1].replace(" ", "T") + "Z") : null;
    const field = (k: string) => (p.match(new RegExp(`^- \\*\\*${k}:\\*\\*\\s*(.*)$`, "m"))?.[1] ?? "").trim();
    const bodyStart = p.search(/\n\n(?!- \*\*)/);
    let body = bodyStart >= 0 ? p.slice(bodyStart).trim() : "";
    body = body.replace(/^##.*$/m, "").replace(/^- \*\*(Channel|From|To):\*\*.*$/gm, "").trim();
    const attachments = [...body.matchAll(/\]\((attachments\/[^)]+)\)/g)].map((m) => m[1]);
    return { n: head ? Number(head[2]) : i + 1, ts: ts && !Number.isNaN(ts.getTime()) ? ts.toISOString() : "", channel: field("Channel"), from: field("From"), to: field("To"), body, attachments };
  });
}

function section(md: string, name: string): string {
  const m = md.match(new RegExp(`^## ${name}\\s*\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, "m"));
  return (m?.[1] ?? "").trim();
}

export async function buildDwellyCase(id: string, dir: string, opts: DwellyOptions = {}): Promise<Case> {
  const index = (await fs.readFile(path.join(dir, "index.md"), "utf8")).replace(/^﻿/, "");
  const history = (await fs.readFile(path.join(dir, "history.md"), "utf8")).replace(/^﻿/, "");
  const title = index.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? `Case ${id}`;
  const details = section(index, "Case details");
  const detail = (k: string) => (details.match(new RegExp(`\\*\\*${k}:\\*\\*\\s*(.*)`))?.[1] ?? "").trim();
  const request = section(index, "Initial request");
  const question = section(index, "Question") || section(index, "Questions") || section(index, "Decision point") || section(index, "Task") || section(index, "Your task")
    || section(index, "Next action at escalation") || section(index, "Next action") || section(index, "Escalation") || section(index, "What should happen next");
  const overview = section(index, "Overview"); const outcome = section(index, "Outcome");
  // Any other section the organisers add (e.g. "Current situation", "Constraints", "Notes for the agent") is kept verbatim.
  const KNOWN = new Set(["case details", "initial request", "overview", "outcome", "history", "attachments", "question", "questions", "decision point", "task", "your task", "next action at escalation", "next action", "escalation", "what should happen next"]);
  const extraSections = [...index.matchAll(/^## (.+?)\s*\n([\s\S]*?)(?=^## |(?![\s\S]))/gm)].filter((m) => !KNOWN.has(m[1].trim().toLowerCase())).map((m) => `\n## ${m[1].trim()}\n${m[2].trim()}`);
  let events = parseHistory(history);
  const cut = opts.cuts?.[id];
  if (cut) events = events.filter((e) => e.n <= cut);
  const jobId = (history.match(/Job Id:\s*([A-Z0-9-]+)/) ?? index.match(/Job Id:\s*([A-Z0-9-]+)/))?.[1];
  const property = detail("Property");
  const created = detail("Created");
  const lastTs = [...events].reverse().find((e) => e.ts)?.ts ?? (created ? new Date(created.replace(" ", "T").replace(/ UTC$/, "") + "Z").toISOString() : undefined);
  const sourceRole = detail("Source role");

  const lines: string[] = [];
  lines.push(`# ${title}`);
  lines.push(`Source role: ${sourceRole || "unknown"} | Status at export: ${detail("Status") || "unknown"} | Created: ${created || "unknown"} | Property: ${property || "unknown"}${jobId ? ` | Job id: ${jobId}` : ""}`);
  if (request) lines.push(`\n## Initial request\n${request}`);
  if (opts.showOutcome) { if (overview) lines.push(`\n## Overview (as exported)\n${overview}`); if (outcome) lines.push(`\n## Outcome (as exported)\n${outcome}`); }
  if (extraSections.length) lines.push(...extraSections);
  if (question) lines.push(`\n## The task set by the organisers (answer this first: the next action and the rationale)\n${question}`);
  lines.push(`\n## History (${events.length} events, oldest first${cut ? `, cut at event ${cut}` : ""})`);
  for (const e of events) {
    lines.push(`\n### event ${String(e.n).padStart(3, "0")} — ${e.ts || "time unknown"} — ${e.channel || "?"} — from ${e.from || "?"} to ${e.to || "?"}`);
    if (e.body) lines.push(e.body);
  }
  if (events.length) lines.push(`\nThe case is open at the last event above. Decide what should happen next and do it.`);
  const rawText = lines.join("\n");

  // Attachments: every file under attachments/ that the included events reference (or all, when nothing references them).
  const attDir = path.join(dir, "attachments");
  const attachments: Case["attachments"] = [];
  const indexed = [...index.matchAll(/\]\((attachments\/[^)]+)\)/g)].map((m) => m[1]);
  const referenced = new Set([...events.flatMap((e) => e.attachments), ...(cut ? [] : indexed)]);
  try {
    for (const f of (await fs.readdir(attDir)).sort()) {
      const ext = path.extname(f).toLowerCase();
      if (!FILE_EXT[ext]) continue;
      if (referenced.size && !referenced.has(`attachments/${f}`)) continue; // hidden with the later events
      attachments.push({ name: f, mediaType: FILE_EXT[ext], path: path.join(attDir, f) });
    }
  } catch { /* no attachments */ }
  // CSV attachments are text: inline them.
  let extra = "";
  try {
    for (const f of (await fs.readdir(attDir)).sort()) if (f.toLowerCase().endsWith(".csv") && (!referenced.size || referenced.has(`attachments/${f}`))) extra += `\n\n--- attachments/${f} ---\n${(await fs.readFile(path.join(attDir, f), "utf8")).slice(0, 20_000)}`;
  } catch { /* none */ }

  const linkedIds: Record<string, string> = {};
  if (jobId) linkedIds.job_id = jobId;
  if (property) linkedIds.property_address = property;
  // Deterministic case state (stream A): stage, parties, approvals, quotes, holds, timers, conflicts, safety, difficulty. Never throws.
  const state = await extractCaseState(events, { jobId, propertyAddress: property, sourceRole, created, title }, extra);
  const c = CaseSchema.parse({
    id, channel: sourceRole ? `${sourceRole.toLowerCase()} request` : "case-file", kind: question ? "question" : "event", receivedAt: lastTs,
    rawText: rawText + extra, structured: { format: "case-file", title, source_role: sourceRole, status: detail("Status"), created, property, job_id: jobId ?? null, events: events.length, cut: cut ?? null },
    attachments, linkedIds, sourceFiles: ["index.md", "history.md", ...attachments.map((a) => `attachments/${a.name}`)], flags: [], state,
  });
  c.flags = computeFlags(c.rawText);
  return c;
}
