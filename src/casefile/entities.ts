/**
 * Deterministic entity extraction from case-file text: names, aliases, emails, phones, addresses, amounts, dates.
 * Everything here is regex over the organisers' templates. An optional bounded model pass (aliases and amounts only)
 * lives in `enrichWithModel`; it is off unless the caller passes a model.
 */
import type { HistoryEvent } from "../ingest/dwelly.js";

export type Role = "tenant" | "landlord" | "contractor" | "agency" | "other";

export const AGENCY_NAMES = /northbridge lettings|agency \/ system|agency|system|management|internal|staff|not specified|unspecified/i;
const COMPANY_SUFFIX = "(?:Services|Works|Solutions|Utilities|Homes|Surveying|Compliance|Maintenance|Plumbing|Electrical|Heating|Cleaning|Property|Lettings|Group|Ltd|Limited|Contractors|Roofing|Glazing|Windows|Repairs)";
export const COMPANY_RE = new RegExp(`\\b([A-Z][a-z]+(?: [A-Z][a-z]+)? ${COMPANY_SUFFIX})\\b`, "g");
const PERSON = "[A-Z][a-z]+(?:[-' ][A-Z][a-z]+)?";
const GREETING_RE = new RegExp(`^(?:Hi|Hello|Hey|Dear|HI|Morning|Good (?:morning|afternoon|evening)|Hi there)[,!]?\\s+(?:there\\s+)?(${PERSON}(?: & ${PERSON})?)\\s*[,!.:\\-]?\\s*$`, "m");
const SIGNOFF_LEAD = /^(?:thanks|thankyou|thank you|many thanks|thanks again|kind regards|kindest regards|regards|best|best regards|best wishes|cheers|warm regards|all the best|thanks very much|thank you so much)[,.!]?\s*$/i;
const INLINE_SIGNOFF = new RegExp(`(?:kind regards|regards|thanks|cheers|best)[,.]?\\s+(${PERSON})\\s*$`, "im");
const NAME_ONLY = new RegExp(`^(${PERSON})\\s*x?$`);
const STOP_NAMES = new Set(["Job Id", "Address", "Please", "Hello", "Hi", "Dear", "Thanks", "Regards", "Kind", "Best", "Many", "Sent", "From", "Subject", "To", "Cc", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December", "Flat", "Attachment", "Attachments", "Request", "Contact", "Tenant", "Landlord", "Provider", "Maintenance", "Northbridge", "Lettings", "The", "This", "Our", "We", "You", "Your", "Good", "Ok", "Okay", "Yes", "No", "Paid", "Pls", "Brill", "Fab", "Great", "Lovely", "Received", "Visit", "Confirmed", "Pets", "Access", "Additional", "List", "If", "In", "Can", "Could", "Just", "Due", "Oh", "Sorry", "Property", "Validation", "Priority", "Reason", "Comment", "Waiting", "Other", "Put", "Hold", "Task", "Keys", "Need", "All", "Work", "Email", "Message", "Manually", "Change", "Mode", "Resumed", "Quote", "Estimate", "Invoice", "Skipped", "Added", "Mrs", "Mr", "Ms", "Phone", "Sincerely", "Thankyou", "Thank", "Afternoon", "Morning", "Evening", "Director", "Customer", "Agent", "Caller", "Internal", "Team", "Hiya", "Ta", "Sent", "Attachment", "Maintenance", "Provider", "Lettings", "Compliance", "Surveying", "Unspecified", "Not", "Specified"]);

export const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
export const PHONE_RE = /\b(?:\+44\s?7\d{3}|\(?0\d{4}\)?)\s?\d{3}\s?\d{3}\b|\b0\d{3}\s?\d{3}\s?\d{4}\b/g;
export const RELAY_CODE_RE = /enter (?:this|the) code when calling/i;
export const ADDRESS_RE = /(?:Flat\s+\d+[A-Za-z]?,\s*)?\d+[A-Za-z]?\s+[A-Z][A-Za-z']+(?:\s+[A-Z][A-Za-z']+){0,3},\s*[A-Z][A-Za-z']+,\s*[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/g;
export const AMOUNT_RE = /£\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?(?!\d)/g;

export function normAddress(a: string): string { return a.toLowerCase().replace(/\s+/g, " ").replace(/[.;:]+$/, "").trim(); }
export function normName(n: string): string { return n.toLowerCase().replace(/\s+/g, " ").trim(); }
export function normPhone(p: string): string { return p.replace(/\D/g, "").replace(/^44/, "0"); }

export function isPlausibleName(n: string): boolean {
  const parts = n.split(/\s+/);
  if (parts.some((p) => STOP_NAMES.has(p))) return false;
  if (AGENCY_NAMES.test(n)) return false;
  return parts.length >= 1 && parts.length <= 3;
}

/** Strip the templated header lines ("Job Id:", "Address:", "**Address:**") so greetings and sign-offs can be found. */
export function bodyLines(body: string): string[] {
  return body.split("\n").map((l) => l.trim()).filter((l) => l && !/^\**(Job Id|Address)\**:/i.test(l) && !/^Attachments?(\(s\))?:/i.test(l) && !/^Validation:/i.test(l));
}

/** Who the message greets ("Hi Langley," → Langley). Only the first few lines are considered. */
export function greetingName(body: string): string | undefined {
  const head = bodyLines(body).slice(0, 3).join("\n");
  const m = head.match(GREETING_RE);
  const n = m?.[1]?.trim();
  return n && isPlausibleName(n) ? n : undefined;
}

/** Who signed the message: a bare name after a sign-off lead, or "Kind regards Maya Harper" inline. */
export function signoffName(body: string): string | undefined {
  const lines = bodyLines(body).filter((l) => !/^(From|Sent|To|Cc|Subject):/i.test(l) && !/^Sent from my/i.test(l) && !/^\[.*\]$/.test(l));
  const tail = lines.slice(-4);
  for (let i = tail.length - 1; i >= 0; i--) {
    const m = tail[i].match(NAME_ONLY);
    if (m && isPlausibleName(m[1]) && (i === 0 || SIGNOFF_LEAD.test(tail[i - 1]) || tail.length === 1)) return m[1];
    if (m && isPlausibleName(m[1]) && i === tail.length - 1 && tail.length > 1) return m[1];
  }
  const inline = lines.slice(-2).join(" ").match(INLINE_SIGNOFF);
  if (inline && isPlausibleName(inline[1])) return inline[1];
  return undefined;
}

export function companyNames(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(COMPANY_RE)) if (!/northbridge lettings/i.test(m[1])) out.add(m[1]);
  return [...out];
}

export function findAddresses(text: string): string[] { return [...text.matchAll(ADDRESS_RE)].map((m) => m[0].replace(/\s+/g, " ").trim()); }
export function findEmails(text: string): string[] { return [...new Set([...text.matchAll(EMAIL_RE)].map((m) => m[0].toLowerCase()))]; }
export function findPhones(text: string): { phone: string; relay: boolean }[] {
  const out: { phone: string; relay: boolean }[] = [];
  for (const m of text.matchAll(PHONE_RE)) {
    const after = text.slice(m.index! + m[0].length, m.index! + m[0].length + 40);
    out.push({ phone: m[0].replace(/\s+/g, " ").trim(), relay: RELAY_CODE_RE.test(after) });
  }
  return out;
}

export type Amount = { amountGbp: number; vat: "inc" | "plus" | "unknown"; context: string; before: string; index: number };
export function findAmounts(text: string): Amount[] {
  const out: Amount[] = [];
  for (const m of text.matchAll(AMOUNT_RE)) {
    const whole = Number(m[1].replace(/,/g, "")); const pence = m[2] ? Number(m[2].padEnd(2, "0")) / 100 : 0;
    const after = text.slice(m.index! + m[0].length, m.index! + m[0].length + 45);
    const before = text.slice(Math.max(0, m.index! - 70), m.index!);
    let vat: Amount["vat"] = "unknown";
    if (/^\s*(?:\+|plus|\+\s*20%|excl?(?:uding)?\.?|ex)\s*VAT|^\s*-?\s*doesn'?t include VAT|not includ(?:e|ing) VAT/i.test(after)) vat = "plus";
    else if (/^\s*(?:inc(?:l)?(?:uding|usive)?\.?|including|with)\s*(?:of\s*)?VAT|VAT inc/i.test(after)) vat = "inc";
    out.push({ amountGbp: whole + pence, vat, context: (before + m[0] + after).replace(/\s+/g, " ").trim(), before: before.replace(/\s+/g, " "), index: m.index! });
  }
  return out;
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/** "DD/MM/YYYY hh:mm am", "DD/MM/YYYY HH:mm", "YYYY-MM-DD HH:mm(:ss)". Returns a local-naive ISO string (no zone), as written. */
export function parseWrittenDateTime(s: string): string | undefined {
  let m = s.match(/(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})\s*(am|pm)?)?/i);
  if (m) {
    let h = m[4] ? Number(m[4]) : 0; const min = m[5] ? Number(m[5]) : 0; const ap = m[6]?.toLowerCase();
    if (ap === "pm" && h < 12) h += 12; if (ap === "am" && h === 12) h = 0;
    return `${m[3]}-${m[2]}-${m[1]}T${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}:00`;
  }
  m = s.match(/(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::\d{2})?)?/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}T${m[4] ?? "00"}:${m[5] ?? "00"}:00`;
  return undefined;
}

export type WrittenDate = { text: string; day?: number; month?: number; weekday?: number };
/** Dates written in prose: "Monday 20th October", "Tuesday 6th June", "November 4th", "Friday 5/9". */
export function findWrittenDates(text: string): WrittenDate[] {
  const out: WrittenDate[] = [];
  const re = new RegExp(`\\b(?:(${WEEKDAYS.join("|")})\\s+)?(?:(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTHS.join("|")})|(${MONTHS.join("|")})\\s+(\\d{1,2})(?:st|nd|rd|th)?)\\b`, "gi");
  for (const m of text.matchAll(re)) {
    const weekday = m[1] ? WEEKDAYS.indexOf(m[1].toLowerCase()) : undefined;
    const day = Number(m[2] ?? m[5]); const month = MONTHS.indexOf((m[3] ?? m[4]).toLowerCase()) + 1;
    if ((m[3] ?? m[4]) === "may") continue; // the verb, not the month
    if (day >= 1 && day <= 31) out.push({ text: m[0], day, month, weekday });
  }
  const re2 = new RegExp(`\\b(${WEEKDAYS.join("|")})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?!\\s*(?:of\\s+)?(?:${MONTHS.join("|")}))`, "gi");
  for (const m of text.matchAll(re2)) out.push({ text: m[0], day: Number(m[2]), weekday: WEEKDAYS.indexOf(m[1].toLowerCase()) });
  return out;
}

export function weekdayOf(y: number, m: number, d: number): number { return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); }
export const weekdayName = (i: number) => WEEKDAYS[i][0].toUpperCase() + WEEKDAYS[i].slice(1);
export const monthName = (i: number) => MONTHS[i - 1][0].toUpperCase() + MONTHS[i - 1].slice(1);

export function roleOf(s: string): Role {
  const t = s.toLowerCase();
  if (/tenant/.test(t)) return "tenant";
  if (/landlord/.test(t)) return "landlord";
  if (/contractor|provider|surveying|services|works|solutions|utilities|homes|compliance/.test(t)) return "contractor";
  if (/northbridge|agency|system|staff|internal|management/.test(t)) return "agency";
  return "other";
}

export function isAgency(s: string): boolean { return roleOf(s) === "agency"; }
export function isInbound(e: HistoryEvent): boolean { return ["Email", "SMS", "Call", "Note"].includes(e.channel) && !isAgency(e.from) && roleOf(e.from) !== "other"; }
export function isOutbound(e: HistoryEvent): boolean { return ["Email", "SMS", "Call"].includes(e.channel) && isAgency(e.from); }

export function addDays(iso: string, days: number): string | undefined {
  const t = new Date(iso); if (Number.isNaN(t.getTime())) return undefined;
  return new Date(t.getTime() + days * 86_400_000).toISOString();
}
export function gist(body: string, n = 160): string {
  const lines = bodyLines(body).filter((l) => !/^(From|Sent|To|Cc|Subject):/i.test(l));
  const s = lines.join(" ").replace(/\s+/g, " ").trim();
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

// ---- optional bounded model pass: aliases and amounts only -------------------------------------------------------
import { generateText, type LanguageModel } from "ai";
import type { CaseState } from "../schemas/casestate.js";

/**
 * One bounded call that may only ADD party aliases and quote amounts the regexes missed. It never changes stage, approval,
 * conflicts or anything else. Fails silent: any error or malformed output leaves the state untouched.
 */
export async function enrichWithModel(state: CaseState, events: HistoryEvent[], model: LanguageModel, timeoutMs = 20_000): Promise<{ added: string[] }> {
  const added: string[] = [];
  const compact = events.filter((e) => ["Email", "SMS", "Call", "Note"].includes(e.channel)).map((e) => `#${e.n} ${e.channel} ${e.from} → ${e.to}: ${gist(e.body, 320)}`).join("\n").slice(0, 24_000);
  const prompt = `Below is a UK lettings maintenance case history. Return ONLY JSON of the form {"parties":[{"role":"tenant|landlord|contractor","names":["..."]}],"quotes":[{"provider":"...","amountGbp":123.45,"vat":"inc|plus|unknown","eventN":12}]}.
Rules: list every name or alias each party is referred to by (people and companies); list every quoted price for works (not invoices, not rent) with the event number where it appears. Do not infer anything not written. Known so far: ${JSON.stringify({ parties: state.parties.map((p) => ({ role: p.role, names: p.names })), quotes: state.quotes.map((q) => ({ provider: q.provider, amountGbp: q.amountGbp, eventN: q.eventN })) })}

${compact}`;
  try {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const r = await generateText({ model, prompt, maxOutputTokens: 1500, abortSignal: ctrl.signal });
    clearTimeout(t);
    const json = r.text.match(/\{[\s\S]*\}/)?.[0]; if (!json) return { added };
    const out = JSON.parse(json) as { parties?: { role: string; names: string[] }[]; quotes?: { provider: string; amountGbp: number; vat?: string; eventN: number }[] };
    for (const p of out.parties ?? []) {
      const role = roleOf(p.role); if (role === "agency" || role === "other") continue;
      let party = state.parties.find((x) => x.role === role);
      if (!party) { party = { role, names: [], emails: [], phones: [], notes: [] }; state.parties.push(party); }
      for (const n of p.names ?? []) if (typeof n === "string" && isPlausibleName(n) && !party.names.some((x) => normName(x) === normName(n))) { party.names.push(n); added.push(`${role} alias ${n}`); }
    }
    for (const q of out.quotes ?? []) {
      if (typeof q.amountGbp !== "number" || !Number.isFinite(q.amountGbp) || !events.some((e) => e.n === q.eventN)) continue;
      if (state.quotes.some((x) => x.amountGbp === q.amountGbp)) continue;
      state.quotes.push({ provider: String(q.provider ?? "provider"), amountGbp: q.amountGbp, vat: q.vat === "inc" || q.vat === "plus" ? q.vat : "unknown", eventN: q.eventN, superseded: false });
      added.push(`quote £${q.amountGbp} at event ${q.eventN}`);
    }
    if (added.length) state.notes.push(`model pass added: ${added.join(", ")}`);
  } catch { /* leave the deterministic state untouched */ }
  return { added };
}
