/**
 * Spoken options per safety flag (names from src/runtime/flags.ts). Used to brief the on-call call when the
 * pipeline's escalation does not carry its own options. Options are phrased to be read aloud.
 */
export type Play = { why_urgent: string; risk_if_delayed: string; options: string; recommended_option: string; recommendation_reason: string };

const PLAYS: Record<string, Play> = {
  gas_or_co: {
    why_urgent: "The tenant reports a gas smell or a carbon monoxide alarm, with people in the property.",
    risk_if_delayed: "Risk of explosion, fire or carbon monoxide poisoning.",
    options: "Option 1: we confirm the tenant has called the National Gas Emergency line on 0800 111 999, has ventilated and is not using switches, and we book a Gas Safe engineer today. Option 2: you attend yourself once the gas emergency service has made it safe. Option 3: we phone the tenant back right now to check everyone is out and safe, then report back to you.",
    recommended_option: "Option 1",
    recommendation_reason: "the gas emergency service must make it safe first, and a Gas Safe engineer is needed for the repair",
  },
  fire: {
    why_urgent: "The report mentions fire or smoke at the property.",
    risk_if_delayed: "Risk to life and serious damage to the building.",
    options: "Option 1: we confirm the tenant has called 999 and is out, and we arrange an emergency make-safe visit today. Option 2: you attend yourself. Option 3: we phone the tenant back right now to check they are safe.",
    recommended_option: "Option 1",
    recommendation_reason: "emergency services come first and the property must be made safe today",
  },
  water_near_electrics: {
    why_urgent: "Water is reported near electrics.",
    risk_if_delayed: "Risk of electric shock or fire.",
    options: "Option 1: we send an emergency electrician and plumber today, and ask the tenant to switch off at the consumer unit if it is safe to reach. Option 2: you attend yourself today. Option 3: we phone the tenant back now with isolation advice and book contractors for the morning.",
    recommended_option: "Option 1",
    recommendation_reason: "water and electrics together is a shock and fire risk that should be made safe today",
  },
  structural: {
    why_urgent: "The report describes possible structural damage, such as a ceiling or wall coming down.",
    risk_if_delayed: "Risk of collapse and injury.",
    options: "Option 1: we send an emergency builder today to make safe and assess. Option 2: you attend yourself today. Option 3: we phone the tenant to keep everyone out of the affected room until someone attends.",
    recommended_option: "Option 1",
    recommendation_reason: "a collapse risk needs a professional on site today",
  },
  security: {
    why_urgent: "The property cannot be secured, for example a door or lock that does not work.",
    risk_if_delayed: "The property and tenant are exposed overnight.",
    options: "Option 1: we send an emergency locksmith today. Option 2: you attend yourself to secure it. Option 3: we phone the tenant to agree interim measures and book a locksmith for the morning.",
    recommended_option: "Option 1",
    recommendation_reason: "it secures the property before tonight",
  },
  glass_may_shatter: {
    why_urgent: "Glass is reported as at risk of shattering.",
    risk_if_delayed: "Risk of injury from broken glass.",
    options: "Option 1: we send an emergency glazier today to make it safe. Option 2: your own contractor attends within 24 hours. Option 3: we apply temporary safety film or boarding today and book the full repair later.",
    recommended_option: "Option 1",
    recommendation_reason: "it removes the injury risk today",
  },
  scalding: {
    why_urgent: "Water is reported as dangerously hot.",
    risk_if_delayed: "Risk of scalding injury.",
    options: "Option 1: we send a plumber within 24 hours and tell the tenant not to use that outlet. Option 2: you attend yourself. Option 3: we phone the tenant now with interim advice and book a plumber.",
    recommended_option: "Option 1",
    recommendation_reason: "it removes the burn risk quickly",
  },
  escape_route: {
    why_urgent: "A window or door on an escape route cannot be opened.",
    risk_if_delayed: "The tenant may not be able to get out in a fire.",
    options: "Option 1: we send a contractor today to restore the escape route. Option 2: you attend yourself. Option 3: we phone the tenant to confirm another exit is available and book a contractor for tomorrow.",
    recommended_option: "Option 1",
    recommendation_reason: "escape routes must work at all times",
  },
  person_at_risk: {
    why_urgent: "Someone at the property may be vulnerable or at risk.",
    risk_if_delayed: "Harm to a vulnerable person.",
    options: "Option 1: you or a colleague phone the tenant now to check on them. Option 2: we request a welfare check from the relevant service. Option 3: we arrange an urgent visit today.",
    recommended_option: "Option 1",
    recommendation_reason: "a person needs to speak to them first",
  },
  self_harm_language: {
    why_urgent: "The message contains language suggesting the person may be at risk of harming themselves.",
    risk_if_delayed: "Risk to the person's life.",
    options: "Option 1: you phone the tenant now and, if they are in danger, call 999. Option 2: we contact emergency services for a welfare check now. Option 3: a trained colleague calls them within the hour.",
    recommended_option: "Option 1",
    recommendation_reason: "this needs a human to speak to them immediately",
  },
};

const DEFAULT: Play = {
  why_urgent: "Our system has classed this as an urgent safety case.",
  risk_if_delayed: "The risk to the occupants continues until someone acts.",
  options: "Option 1: we send an emergency contractor today. Option 2: you attend yourself today. Option 3: we phone the tenant back first and update you.",
  recommended_option: "Option 1",
  recommendation_reason: "it gets someone qualified on site soonest",
};

/** The highest-priority known flag wins (order of PLAYS). */
export function playFor(flags: string[]): Play & { flag?: string } {
  const flag = Object.keys(PLAYS).find((f) => flags.includes(f));
  return flag ? { ...PLAYS[flag], flag } : DEFAULT;
}
