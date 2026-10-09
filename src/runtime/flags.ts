import type { Flag } from "../schemas/case.js";

/** Deterministic labels. Hints to the router, the agent and the checks. Only gas/CO forces an action. */
const RULES: { name: string; re: RegExp; minUrgency?: Flag["minUrgency"]; forcedAction?: string }[] = [
  { name: "gas_or_co", re: /\b(smell(s|ing|ed|t)? (of )?gas|gas (leak|escape|smell)|(carbon monoxide|\bCO\b) (alarm|detector)[^.]{0,30}(going off|sounding|beeping|went off|activated)|feel(ing)? (dizzy|sick|faint)[^.]{0,40}(boiler|gas|heater))\b/i, minUrgency: "P0", forcedAction: "Tell the reporter to call the National Gas Emergency line 0800 111 999 immediately and ventilate; do not operate switches. Then proceed." },
  { name: "fire", re: /\b(on fire|there(\'s| is) a fire|house fire|flat fire|flames|smoke (coming|filling|pouring)|burning smell|smell(s|ing)? (of )?burning|smoke alarm[^.]{0,30}(going off|sounding|won\'t stop))\b/i, minUrgency: "P0" },
  { name: "water_near_electrics", re: /\b(water|leak|leaking|dripping|flood(ing)?)\b[^.]{0,80}\b(light fitting|ceiling light|light switch|socket|plug|fuse box|consumer unit|electrics|wiring|electrical)\b/i, minUrgency: "P0" },
  { name: "structural", re: /\b(ceiling (is )?(collapsing|collapsed|coming down|falling down|sagging|bulging)|wall (is )?(bulging|leaning|collapsing)|large crack|subsidence|floor (is )?(giving way|collapsing))\b/i, minUrgency: "P0" },
  { name: "person_at_risk", re: /\b(disabled|wheelchair|elderly|newborn|baby|pregnant|oxygen|dialysis|vulnerable|dementia)\b/i, minUrgency: "P1" },
  { name: "self_harm_language", re: /\b(kill myself|end it all|suicid|self[- ]harm)\b/i, minUrgency: "P0" },
  { name: "no_heating_or_hot_water", re: /\b(no (heating|hot water)|boiler (is )?(broken|not working|dead))\b/i, minUrgency: "P1" },
  { name: "only_toilet", re: /\b(only|one) (toilet|bathroom|wc)\b/i, minUrgency: "P1" },
  { name: "legal_threat", re: /\b(solicitor|legal action|ombudsman|tribunal|environmental health|take (you|legal) (to court|action)|court (action|proceedings|claim)|formal complaint|small claims)\b/i },
  { name: "payment_details_change", re: /\b(bank details|account number|sort code|change (my|our|the) (bank|payment)|new bank)\b/i },
  { name: "notice_or_eviction", re: /\b(evict|section 21|section 8|serve notice|notice to quit|possession)\b/i },
  { name: "damp_or_mould", re: /\b(mould|mold|damp|condensation)\b/i },
  { name: "possible_injection", re: /\b(ignore (all |any )?(previous|prior|above) instructions|you are (now|an?) (ai|assistant|system)|system prompt|as the (ai|agent|system),? (mark|set|close|approve)|disregard (the|your) (policy|rules))\b/i },
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
