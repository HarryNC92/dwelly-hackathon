import { READ_TOOLS } from "./read.js";
import { WRITE_TOOLS } from "./write.js";
import { submitResolution, reroute } from "./control.js";
import type { ToolDef } from "./types.js";

const ALL: ToolDef[] = [...READ_TOOLS, ...WRITE_TOOLS, submitResolution, reroute];
const byName = new Map(ALL.map((t) => [t.name, t]));

export function getTool(name: string): ToolDef {
  const t = byName.get(name);
  if (!t) throw new Error(`unknown tool ${name}`);
  return t;
}
export function getTools(names: string[]): ToolDef[] { return names.map(getTool); }
export const ALL_READ = READ_TOOLS.map((t) => t.name);
export const ALL_WRITE = WRITE_TOOLS.map((t) => t.name);
