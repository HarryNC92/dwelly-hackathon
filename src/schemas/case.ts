import { z } from "zod";

/** A deterministic label attached at ingest. Flags are hints, never verdicts. */
export const FlagSchema = z.object({
  name: z.string(),
  evidence: z.string(),
  minUrgency: z.enum(["P0", "P1", "P2"]).optional(),
  forcedAction: z.string().optional(),
});
export type Flag = z.infer<typeof FlagSchema>;

export const AttachmentSchema = z.object({
  name: z.string(),
  mediaType: z.string(),
  path: z.string(),
});

/** Whatever the organisers give us becomes one of these. Raw content is never dropped. */
export const CaseSchema = z.object({
  id: z.string(),
  channel: z.string().default("unknown"),
  kind: z.enum(["event", "question"]).default("event"),
  receivedAt: z.string().optional(),
  rawText: z.string(),
  structured: z.record(z.string(), z.unknown()).optional(),
  attachments: z.array(AttachmentSchema).default([]),
  linkedIds: z.record(z.string(), z.string()).default({}),
  flags: z.array(FlagSchema).default([]),
  sourceFiles: z.array(z.string()).default([]),
});
export type Case = z.infer<typeof CaseSchema>;
