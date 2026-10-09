/**
 * A classifier answers fixed typed questions about a case and returns probabilities.
 * Implementations: regex (always available), Jev (TypeSafe AI, if a key is present).
 * The pipeline treats classifier output as hints and shadow signals, never as verdicts.
 */
export type Question =
  | { type: "noul"; instructions: string }
  | { type: "choice"; instructions: string; options: string[] }
  | { type: "score"; instructions: string; levels: string[] };

export type Answer = { type: "noul"; noul: number } | { type: "choice"; choice: string; probabilities: Record<string, number> } | { type: "score"; score: number; level: string };

export interface Classifier {
  name: string;
  ask(state: string, questions: Record<string, Question>): Promise<Record<string, Answer>>;
}
