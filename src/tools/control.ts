import { z } from "zod";
import { ResolutionSchema, RerouteSchema } from "../schemas/resolution.js";
import type { ToolDef } from "./types.js";

export const submitResolution: ToolDef = {
  name: "submit_resolution", kind: "control", risk: "none",
  description: "Finish the case. Call this exactly once when you have taken every safe action and decided what to escalate. Your staged actions are attached automatically; do not list them here.",
  input: ResolutionSchema,
  run: async () => ({ accepted: true }),
};

export const reroute: ToolDef = {
  name: "reroute", kind: "control", risk: "none",
  description: "Use only if this case is outside your remit and you cannot handle it safely. A generalist will take over. Do not use for cases you can handle.",
  input: RerouteSchema,
  run: async () => ({ accepted: true }),
};
