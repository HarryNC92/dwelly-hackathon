import type { Flag } from "../schemas/case.js";

/** Deterministic labels. Hints to the router, the agent and the checks. Only gas/CO forces an action. */
const RULES: { name: string; re: RegExp; minUrgency?: Flag["minUrgency"]; forcedAction?: string }[] = [
  { name: "gas_or_co", re: /\b(smell(s|ing)? (of )?gas|gas leak|carbon monoxide|\bCO alarm)\b/i, minUrgency: "P0", forcedAction: "Tell the reporter to call the National Gas Emergency line 0800 111 999 immediately and ventilate; do not operate switches. Then proceed." },
  { name: "fire", re: /\b(fire|smoke (coming|filling)|burning smell)\b/i, minUrgency: "P0" },
  { name: "water_near_electrics", re: /\b(water|leak|flood)\b[^.]{0,80}\b(electric|socket|light fitting|fuse|consumer unit)\b/i, minUrgency: "P0" },
  { name: "structural", re: /\b(ceiling (is )?(collapsing|coming down|falling)|crack(s)? (in|across) the (wall|ceiling)|subsidence)\b/i, minUrgency: "P0" },
  { name: "person_at_risk", re: /\b(disabled|wheelchair|elderly|newborn|baby|pregnant|oxygen|dialysis|vulnerable|dementia)\b/i, minUrgency: "P1" },
  { name: "self_harm_language", re: /\b(kill myself|end it all|suicid|self[- ]harm)\b/i, minUrgency: "P0" },
  { name: "no_heating_or_hot_water", re: /\b(no (heating|hot water)|boiler (is )?(broken|not working|dead))\b/i, minUrgency: "P1" },
  { name: "only_toilet", re: /\b(only|one) (toilet|bathroom|wc)\b/i, minUrgency: "P1" },
  { name: "legal_threat", re: /\b(solicitor|legal action|ombudsman|tribunal|sue|court|environmental health)\b/i },
  { name: "payment_details_change", re: /\b(bank details|account number|sort code|change (my|our|the) (bank|payment)|new bank)\b/i },
  { name: "notice_or_eviction", re: /\b(evict|section 21|section 8|serve notice|notice to quit|possession)\b/i },
  { name: "damp_or_mould", re: /\b(mould|mold|damp|condensation)\b/i },
  { name: "security", re: /\b(break[- ]in|burglar|lock (is )?broken|cannot lock|locked out|front door (won't|will not) (lock|close))\b/i, minUrgency: "P1" },
];

export function computeFlags(text: string): Flag[] {
  const out: Flag[] = [];
  for (const r of RULES) {
    const m = text.match(r.re);
    if (m) out.push({ name: r.name, evidence: m[0], minUrgency: r.minUrgency, forcedAction: r.forcedAction });
  }
  return out;
}
