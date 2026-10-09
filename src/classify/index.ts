import type { Classifier, Answer } from "./types.js";
import { JevClassifier, TRIAGE_QUESTIONS } from "./jev.js";
import type { Trace } from "../runtime/trace.js";

/** Shadow signal only: logged in the trace, never read by the pipeline unless JEV_MODE=active. */
export async function shadowClassify(state: string, trace: Trace): Promise<Record<string, Answer> | null> {
  const key = process.env.TYPESAFE_API_KEY;
  if (!key) return null;
  const clf: Classifier = new JevClassifier(key);
  try {
    const t0 = Date.now();
    const answers = await clf.ask(state, TRIAGE_QUESTIONS);
    trace.log("classify.jev", { ms: Date.now() - t0, answers });
    return answers;
  } catch (e) {
    trace.log("classify.jev.error", { error: String(e) });
    return null;
  }
}
