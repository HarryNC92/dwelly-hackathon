export type AgentConfig = {
  name: string;
  description: string;
  policies: string[];   // filenames in src/policies without .md; constraints is always included
  tools: string[];      // tool names from the registry; submit_resolution and reroute are always added
  model: string;
  effort: "low" | "medium" | "high";
  maxSteps: number;
};
