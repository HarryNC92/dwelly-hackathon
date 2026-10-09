/**
 * Failure injector for the mock backend. Lets us rehearse the Reality Test's "failed actions"
 * without touching real systems. Configure per tool: fail (error), unknown (timeout-like), or a count.
 */
export type FailureMode = "fail" | "unknown";
export class FailureInjector {
  private plan = new Map<string, { mode: FailureMode; remaining: number }>();
  constructor(spec?: string) {
    // spec example: "book_contractor:fail:1,send_message:unknown:2"
    for (const part of (spec ?? "").split(",").map((s) => s.trim()).filter(Boolean)) {
      const [tool, mode, n] = part.split(":");
      this.plan.set(tool, { mode: (mode as FailureMode) ?? "fail", remaining: Number(n ?? 1) });
    }
  }
  take(tool: string): FailureMode | null {
    const p = this.plan.get(tool);
    if (!p || p.remaining <= 0) return null;
    p.remaining--;
    return p.mode;
  }
}
