import { createAnthropic } from "@ai-sdk/anthropic";
import type { LanguageModel } from "ai";

export type ModelFactory = (id: string) => LanguageModel;

export function realModels(): ModelFactory {
  const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return (id) => anthropic(id);
}
