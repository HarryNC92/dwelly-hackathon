import { createAnthropic } from "@ai-sdk/anthropic";
import type { LanguageModel } from "ai";

export type ModelFactory = (id: string) => LanguageModel;

export function realModels(): ModelFactory {
  const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return (id) => anthropic(id);
}

export const ROUTER_MODEL = process.env.ROUTER_MODEL ?? "claude-opus-5-5";
export const FALLBACK_MODEL = process.env.FALLBACK_MODEL ?? "claude-sonnet-5-5";
