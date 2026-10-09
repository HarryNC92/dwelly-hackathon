import type { z } from "zod";
import type { RecordStore } from "../backend/store.js";
import type { FailureInjector } from "../backend/failures.js";

export type ToolKind = "read" | "write" | "control";
export type ToolRisk = "none" | "low" | "high" | "prohibited";

export type ToolContext = {
  caseId: string;
  store: RecordStore;
  failures: FailureInjector;
  now: string; // dataset "now", never the wall clock
  actionId?: string; // set during execution of a staged write
  env: Record<string, string | undefined>;
};

/**
 * A tool is a plain object. Read tools run live. Write tools are staged at request time and
 * `perform` is called by the runtime only after the checks pass. Nothing here knows the domain.
 */
export type ToolDef<I extends z.ZodTypeAny = any> = {
  name: string;
  description: string;
  kind: ToolKind;
  risk: ToolRisk;
  input: I;
  /** read + control tools: executed immediately */
  run?: (input: z.infer<I>, ctx: ToolContext) => Promise<unknown>;
  /** write tools: executed in the execute phase */
  perform?: (input: z.infer<I>, ctx: ToolContext) => Promise<unknown>;
  /** write tools: deterministic guard at staging time; return a reason to block */
  guard?: (input: z.infer<I>, ctx: ToolContext) => Promise<string | null>;
};
