/**
 * If the organisers supply tools as an MCP server, connect as a client in-process and expose each
 * tool through our wrapper (so staging, guards, tracing still apply). Uses @ai-sdk/mcp.
 * Wiring sketch (verify the package API on the day):
 *
 *   import { createMCPClient } from "@ai-sdk/mcp";
 *   const client = await createMCPClient({ transport: { type: "http", url: process.env.MCP_URL! } });
 *   const remote = await client.tools();             // Record<string, Tool>
 *   // For each remote tool: build a ToolDef with kind "read" (safe) or "write" (anything that mutates),
 *   // risk from a name heuristic (create|update|send|book|pay => high), run/perform = remote.execute.
 *
 * Not wired tonight: no server to test against.
 */
export const MCP_NOTE = "see comments";
