/**
 * Deterministic extraction of a CaseState from a parsed case file. No model calls here: every field comes from the
 * organisers' system strings and templates, so the result is stable, explainable and cheap. Unknowns stay unknown.
 */
import type { HistoryEvent } from "../ingest/dwelly.js";
import { CaseStateSchema, type CaseState, type Party, type Stage } from "../schemas/casestate.js";
import { classifySystemEvent, deriveStage, type Classified } from "./stage.js";
import {
  addDays, bodyLines, companyNames, findAddresses, findAmounts, findEmails, findPhones, findWrittenDates, gist, greetingName, isAgency, isInbound,
  isOutbound, isPlausibleName, monthName, normAddress, normName, normPhone, parseWrittenDateTime, roleOf, signoffName, weekdayName, weekdayOf, type Role,
} from "./entities.js";

export type CaseHeader = { jobId?: string; propertyAddress?: string; sourceRole?: string; created?: string; title?: string };
type ConflictKind = "address" | "name" | "phone" | "date" | "amount" | "other";
export type Conflict = { kind: ConflictKind; text: string };
type ApprovalStatus = CaseState["landlordApproval"]["status"];
type Signal = { n: number; status: ApprovalStatus; text?: string; conditions?: string; ask?: boolean };

const DAY = 86_400_000;
const APPROVE_RE = /\b(?:go ?ahead|please proceed|yes please|yes,? (?:that'?s|that is|this is) fine|(?:that'?s|that is) fine|ok(?:ay)? to (?:proceed|go)|fine to send|happy (?:for|to)|approves?d?\b|agrees? to (?:proceed|have)|please (?:get|send|arrange|mend|instruct)|send someone|arrange an engineer|instruct(?:ed)?\b|pls go|yes go|yes,? please|proceed with)/i;
const DECLINE_RE = /\b(?:not? (?:happy|approved|authorised)|don'?t (?:proceed|go ahead|send)|do not proceed|hold (?:off|fire)|leave it for now|no thanks|declin|refus(?:e|ed) to pay)/i;
const OWN_CONTRACTOR_RE = /\b(?:(?:my|his|her|their|our|own) (?:own )?(?:contractor|plumber|electrician|handyman|builder|window (?:man|specialist|company|fitter)|guy|people)|arranged for (?:a|an|his|her|their) .{0,50}?(?:specialist|contractor|engineer|plumber)|asked him to proceed|had a quote and asked|(?:LL|landlord)'?s? (?:own )?(?:contractor|provider|contractors)|LL (?:is arranging|has org|has arranged)|landlord'?s? contractor|landlord contractor|contractor used by .{0,40} be contacted|will (?:get|send) (?:my|his|her|someone)|I will (?:arrange|sort|get someone))/i;
const TENANT_FIX_RE = /\b(?:tenant(?:s)? (?:to|can|may|could) fix|approves the tenant to fix|tenant(?:s)? (?:have|has) (?:completed|sorted|fixed|done)|sorted .{0,40}(?:himself|herself|themselves)|tenant(?:s)? will (?:replace|fix|sort)|tenant'?s? liability|tenats? have completed)/i;
const LL_SELF_FIX_RE = /\b(?:(?:LL|landlord) (?:completed|has dealt|has sorted|sorted|confirmed he has sorted|did it|fixed|dealt with) |LL completed by himself|landlord has dealt with|ll (?:rang and )?confirmed (?:this is all done|he has sorted)|knack of how to close|LL INFORMED US)/i;
const CONDITIONAL_RE = /(?:if (?:it'?s|it is|is|its) (?:something )?(?:easy|simple|cheap|low.?cost|minor|straightforward)[^.]*|only have budget[^.]*|if (?:it )?(?:turns out )?(?:needs?|requires?) (?:a )?parts?[^.]*quote[^.]*|(?:simple|low-cost) fix[^.]*)/i;
const APPROVAL_ASK_RE = /(?:happy for|are you happy|approve|go ahead|wish to proceed|how you wish to proceed|come to a decision|let me know if you wish|shall (?:we|I)|would you like (?:us|me) to|can (?:we|I) (?:send|arrange|instruct|proceed)|do you want (?:us|me) to|please advise if you are|please let me know if they can)/i;
// Informal assent after an approval request ("Yes that sounds like it needs sorting fairly soon", "ok", "sounds good") and
// instructions on how to proceed ("contact the contractor Keystone Works used last year", "use X") both count as approval.
const ASSENT_RE = /^(?:yes|yep|yeah|yup|ok|okay|sure|fine|agreed|absolutely|of course|great|perfect|please do|go ahead|go for it)\b|\b(?:sounds (?:good|fine|great|right|sensible|like it needs)|needs? (?:sorting|doing|fixing|looking at|to be (?:sorted|fixed|done))|get (?:it|that|this|someone|somebody|a contractor|an engineer|him|her|them) (?:out|sorted|done|fixed|round|to (?:look|attend))|please (?:sort|fix|arrange|organise|organize|book|send|instruct)|happy (?:for|to|with)|carry on|crack on|that(?:'s| is| would be) (?:fine|great|ok|okay|good)|no problem|by all means|fairly soon|as soon as)\b/i;
const INSTRUCT_RE = /\b(?:requests?|asks?|would like|wants?|instructs?|suggests?|advises?) (?:that |us to |you to |the agency to )?(?:the |a |an )?(?:contractor|engineer|plumber|electrician|company|handyman|supplier|manufacturer|[A-Z][a-z]+(?: [A-Z][a-z]+)?)\b[^.]{0,90}?\b(?:be contacted|be used|be instructed|be asked|be called|attend|contacted|instructed|look at|to (?:attend|quote|look|come))|\b(?:use|contact|call|try|ring|book|get) (?:the )?(?:same )?(?:contractor|company|engineer|plumber|electrician|[A-Z][a-z]+(?: [A-Z][a-z]+)?) (?:who|that|used|from|we used|you used|again|out)|\bunder (?:the )?(?:warranty|guarantee)\b[^.]{0,60}\b(?:contact|call|repair|service)/i;
const QUESTION_RE = /\b(?:inquir|asks? (?:about|if|whether|for an update)|is seeking|requests? (?:an )?update|any update|wondering|has (?:it|this) been|was (?:it|this) (?:resolved|fixed|done))\b|\?\s*$/i;
const AGENCY_APPROVED_NOTE_RE = /\b(?:estimate approved|landlord has approved|LANDLORD HAS APPROVED|landlord .{0,30}?(?:approved|agreed)|LL (?:already )?(?:agreed|approved|has approved)|spoke to landlord who approved|landlord had a quote and agreed|quote .{0,40} landlord has approved)/i;
const DONE_RE = /\b(?:(?:is|are|been|now|all) (?:now )?(?:completed?|done|fixed|repaired|replaced|installed|sorted|finished|resolved)|completed the (?:repair|work|job)|job (?:is )?(?:done|complete)|works? (?:are|is) (?:now )?complete|has been (?:completed|repaired|replaced|re-?fitted|fixed)|repair .{0,30}(?:completed|carried out)|all done|its now clear|it'?s now clear|now working|repaired under warranty|resolved|managed to (?:fix|sort|clear|repair)|fixed it (?:himself|herself|themselves|myself|ourselves)?)\b/i;
const NOT_DONE_RE = /\b(?:not (?:yet )?(?:completed?|done|fixed)|when (?:completed|done)|will be (?:completed|done|finished)|once (?:completed|done)|still not|hasn'?t been|has not been|until (?:it is|its) (?:completed|done))\b/i;
const DISPUTE_RE = /\b(?:disput|disagree|not (?:happy|acceptable)|unacceptable|complain|refus|unfair|not (?:my|our) responsib|won'?t (?:be )?pay|not paying|solicitor|ombudsman|disappoint|frustrat|chasing payment|still (?:not|hasn'?t|no)|yet again|again\b.{0,20}(?:broken|not working|same)|appalling|ridiculous|unprofessional|escalat|compensat|withhold)/i;
const SAFETY: Array<[string, RegExp, RegExp?]> = [
  ["glass may shatter or broken glass", /shatter|broken glass|glass (?:is |has )?(?:cracked|broken|smashed)|cracked (?:glass|pane|window)/i],
  ["water near electrics or a smoke detector", /water[^.]{0,60}(?:electric|socket|light fitting|smoke (?:detector|alarm)|wiring)|(?:electric|socket|light fitting|smoke (?:detector|alarm))[^.]{0,60}(?:water|leak|wet|dripping)/i],
  ["scalding or dangerously hot water", /scald|boiling hot|dangerously hot|too hot to/i],
  ["property cannot be secured (door or lock)", /(?:won'?t|will not|cannot|can'?t|does ?n[o']t|not able to|unable to) (?:lock|secure)|lock (?:is |has )?(?:broken|not working|faulty|jammed|engaged prematurely)|locking mechanism[^.]{0,40}(?:broken|fault|not|stuck|jam)|door (?:won'?t|will not|does ?n[o']t|can'?t) (?:close|shut|lock)|insecure|front door[^.]{0,40}(?:broken|not (?:closing|locking))/i],
  ["rotting or failing door or window frame", /rott(?:en|ing)|\b(?:to|starting to|started to) rot\b|frame[^.]{0,30}wobbl|wobbl[^.]{0,30}(?:door|frame)/i],
  ["window will not open (escape route)", /window[^.]{0,60}(?:won'?t|will not|cannot|can'?t|cant|does ?n[o']t) (?:be )?open|stuck (?:shut|closed)|fire (?:escape|exit)/i],
  ["appliance fitted without isolation valves", /isolation valve|no isolat/i],
  ["water leak known for an extended period", /leak/i, /(?:\d+|two|three|several|few) weeks|fortnight|1[0-9] days|2[0-9] days|over a month|for (?:a|one) month/i],
  ["gas or carbon monoxide", /gas (?:smell|leak|escape)|smell(?:ing)? (?:of )?gas|carbon monoxide|\bCO\b (?:alarm|detector)/i],
  ["no heating or hot water", /no (?:heating|hot water)|boiler (?:is )?(?:not working|broken|down|leaking)|heating (?:is )?not working|without (?:heating|hot water)/i],
  ["only toilet at the property affected", /only toilet at the property\?\s*Yes|only (?:one )?toilet\b(?![^.]*\?)/i],
  ["flooding or ceiling damage", /flood|ceiling (?:is )?(?:bulging|coming down|collapsed|leaking)|water (?:pouring|coming through)/i],
  ["damp or mould", /\bmould|\bmold\b|\bdamp\b/i],
  ["vulnerable occupant", /\bdisab|elderly|wheelchair|newborn|pregnan|vulnerable|young child/i],
  ["security: keys lost or break-in", /break.?in|burglar|lost (?:the |my |our )?keys?|intruder|forced entry/i],
  ["electrical fault", /sparking|exposed wir|burning smell|electric shock|keeps tripping|fuse (?:box|board)/i],
  ["sewage or overflow", /sewage|overflowing|raw waste/i],
];

function partyOf(map: Map<Role, Party>, role: Role): Party {
  let p = map.get(role);
  if (!p) { p = { role, names: [], emails: [], phones: [], notes: [] }; map.set(role, p); }
  return p;
}
function addName(p: Party, name: string | undefined, seen: Map<Role, Map<string, number[]>>, n: number) {
  if (!name || !isPlausibleName(name)) return;
  const clean = name.replace(/\s+/g, " ").trim();
  if (!p.names.some((x) => normName(x) === normName(clean))) p.names.push(clean);
  const m = seen.get(p.role) ?? new Map(); seen.set(p.role, m);
  m.set(normName(clean), [...(m.get(normName(clean)) ?? []), n]);
}
function addPhone(p: Party, phone: string) { const k = normPhone(phone); if (!p.phones.some((x) => normPhone(x) === k)) p.phones.push(phone); }
function tokens(n: string): Set<string> { return new Set(normName(n).split(/[\s&]+/).filter((t) => t.length > 1)); }
function related(a: string, b: string): boolean { const ta = tokens(a), tb = tokens(b); for (const t of ta) if (tb.has(t)) return true; return false; }
/** Cluster aliases by shared tokens; canonical = longest name in the cluster. Returns clusters as name lists. */
function clusterNames(names: string[]): string[][] {
  const clusters: string[][] = [];
  for (const n of names) {
    const hit = clusters.find((c) => c.some((x) => related(x, n)));
    if (hit) hit.push(n); else clusters.push([n]);
  }
  return clusters.map((c) => [...c].sort((a, b) => b.length - a.length));
}
const toRole = (e: HistoryEvent): Role => roleOf(e.to);
const fromRole = (e: HistoryEvent): Role => roleOf(e.from);
const SUMMARY_RE = /^(?:The customer,? )?([A-Z][a-z]+(?: [A-Z][a-z]+)?),? (?:informs|confirms|approves|agrees|requests|inquires|is inquiring|is seeking|expressed|addresses|mentions|acknowledges|discusses|has arranged|arranged|advises|explains|states|asks|reports|called)/;

export function extractCaseStateSync(events: HistoryEvent[], header: CaseHeader = {}, attachmentsText = ""): CaseState {
  const ev = [...events].sort((a, b) => a.n - b.n);
  const conflicts: Conflict[] = [];
  const notes: string[] = [];
  const parties = new Map<Role, Party>();
  const namesSeen = new Map<Role, Map<string, number[]>>();
  const classified = new Map<number, Classified | undefined>(ev.map((e) => [e.n, classifySystemEvent(e)]));
  const lastTs = [...ev].reverse().find((e) => e.ts)?.ts;
  const nowMs = lastTs ? new Date(lastTs).getTime() : Date.now();
  const jobId = header.jobId ?? ev.map((e) => e.body.match(/Job Id:\s*([A-Z0-9-]+)/)?.[1]).find(Boolean);
  const requestText = ev.find((e) => /^Request description:/i.test(e.body))?.body.replace(/^Request description:\s*/i, "") ?? "";

  // ---- stage from system strings
  const derived = deriveStage(ev);
  let stage: Stage = derived.stage; let stageEvidenceEventN = derived.evidenceEventN;
  for (const u of derived.unknownStrings) notes.push(`unrecognised system string at ${u}`);

  // ---- parties, addresses, phones, emails
  const addrMap = new Map<string, { address: string; eventNs: number[] }>();
  const headerAddr = header.propertyAddress ? normAddress(header.propertyAddress) : undefined;
  const tenantPhones = new Map<string, { phone: string; relay: boolean; eventNs: number[] }>();
  const staffNames = new Set<string>();
  const smsSigners = new Map<string, number[]>();
  for (const e of ev) {
    const body = e.body;
    for (const a of findAddresses(body)) { const k = normAddress(a); const cur = addrMap.get(k) ?? { address: a, eventNs: [] }; cur.eventNs.push(e.n); addrMap.set(k, cur); }
    const hold = body.match(/^Put on hold by ([A-Z][a-z]+(?: [A-Z][a-z]+)?)\./m);
    if (hold) { staffNames.add(hold[1]); addName(partyOf(parties, "agency"), hold[1], namesSeen, e.n); }
    if (["Email", "SMS", "Call", "Note"].includes(e.channel)) {
      const fr = fromRole(e), to = toRole(e);
      // Templates addressed to the contractor carry the tenant's details.
      for (const m of body.matchAll(/^\**Tenant(?: [Nn]ames?)?:?\**:?\s*([A-Z][^\n]{2,60})$/gm)) addName(partyOf(parties, "tenant"), m[1].trim().replace(/[.,]+$/, ""), namesSeen, e.n);
      const mp = body.match(/^Our maintenance provider ([A-Z][^\n]+?) will be attending/m) ?? body.match(/^\**Maintenance Provider Name:?\**:?\s*([A-Z][^\n]+)$/m);
      if (mp) addName(partyOf(parties, "contractor"), mp[1].trim(), namesSeen, e.n);
      if (fr !== "agency" && fr !== "other") {
        const s = signoffName(body); if (s && !staffNames.has(s)) addName(partyOf(parties, fr), s, namesSeen, e.n);
        const sm = bodyLines(body)[0]?.match(SUMMARY_RE); if (sm && isPlausibleName(sm[1])) addName(partyOf(parties, fr), sm[1], namesSeen, e.n);
        const g = greetingName(body); if (g && to === "agency") { staffNames.add(g); addName(partyOf(parties, "agency"), g, namesSeen, e.n); }
        for (const em of findEmails(body)) { const p = partyOf(parties, fr); if (!p.emails.includes(em)) p.emails.push(em); }
        for (const ph of findPhones(body)) if (!ph.relay) addPhone(partyOf(parties, fr), ph.phone);
      } else if (fr === "agency" && to !== "agency" && to !== "other") {
        const g = greetingName(body); if (g) addName(partyOf(parties, to), g, namesSeen, e.n);
        const s = signoffName(body); if (s) { staffNames.add(s); addName(partyOf(parties, "agency"), s, namesSeen, e.n); }
        if (to === "contractor") {
          for (const m of body.matchAll(/^\**(?:Contact [Dd]etails|Phone|Tel|Mobile|Contact):?\**:?\s*((?:\+44|0)[\d ]{9,13})/gm)) {
            const relay = /enter (?:this|the) code when calling/i.test(body.slice(m.index!, m.index! + m[0].length + 45));
            const k = normPhone(m[1]); const cur = tenantPhones.get(k) ?? { phone: m[1].trim(), relay, eventNs: [] }; cur.eventNs.push(e.n); cur.relay = cur.relay && relay; tenantPhones.set(k, cur);
            addPhone(partyOf(parties, "tenant"), m[1].trim());
          }
        }
        if (e.channel === "SMS") { const sig = body.match(/this is ((?!Northbridge Lettings)[A-Z][a-z]+ [A-Z][a-z]+)!/); if (sig) { const cur = smsSigners.get(sig[1]) ?? []; cur.push(e.n); smsSigners.set(sig[1], cur); } }
      }
      if (to === "contractor" || fr === "contractor") for (const c of companyNames(body)) if (!/^Lantern Maintenance$/.test(c)) addName(partyOf(parties, "contractor"), c, namesSeen, e.n);
    }
  }
  for (const [who, ns] of smsSigners) conflicts.push({ kind: "other", text: `agency SMS signed as "${who}", not Northbridge Lettings (event${ns.length > 1 ? "s" : ""} ${ns.slice(0, 6).join(", ")})` });
  // Address conflicts: anything that is not the header address.
  const addressesMentioned = [...addrMap.values()];
  const reference = headerAddr ?? (addressesMentioned.length ? normAddress([...addressesMentioned].sort((a, b) => b.eventNs.length - a.eventNs.length)[0].address) : undefined);
  for (const [k, v] of addrMap) if (reference && k !== reference) conflicts.push({ kind: "address", text: `address "${v.address}" in event${v.eventNs.length > 1 ? "s" : ""} ${v.eventNs.slice(0, 6).join(", ")} differs from the case property "${header.propertyAddress ?? addrMap.get(reference)?.address}"` });
  // Name conflicts: unrelated full names for the same party.
  for (const role of ["tenant", "landlord"] as Role[]) {
    const p = parties.get(role); if (!p) continue;
    const clusters = clusterNames(p.names);
    p.names = clusters.flat();
    if (clusters.length > 1) {
      const full = clusters.filter((c) => c[0].includes(" "));
      if (full.length > 1) conflicts.push({ kind: "name", text: `${role} appears under unrelated names: ${full.map((c) => `"${c[0]}" (event${(namesSeen.get(role)?.get(normName(c[0])) ?? []).length > 1 ? "s" : ""} ${(namesSeen.get(role)?.get(normName(c[0])) ?? []).slice(0, 4).join(", ")})`).join(" vs ")}` });
      else notes.push(`${role} is referred to by several names: ${p.names.join(", ")}`);
    }
  }
  const contractor = parties.get("contractor");
  if (contractor) contractor.names = clusterNames(contractor.names).flat();
  // Phone conflicts: tenant numbers given to the contractor that differ and are not relay codes.
  const realTenantPhones = [...tenantPhones.values()].filter((p) => !p.relay);
  if (realTenantPhones.length > 1) conflicts.push({ kind: "phone", text: `tenant phone differs between messages: ${realTenantPhones.map((p) => `${p.phone} (event ${p.eventNs[0]})`).join(", ")}` });

  // ---- holds
  const holds: CaseState["holds"] = [];
  const waitingFrom = (s: string): CaseState["holds"][number]["waitingFor"] => {
    const t = s.toLowerCase();
    if (/landlord|\bll\b|\blls\b/.test(t)) return "landlord";
    if (/provider|contractor|plumber|electrician|engineer|cleaner|window (?:man|company)|quote|invoice|works?\b|attend|visit|completion/.test(t)) return "provider";
    if (/tenant|\btt\b|\bt\b to|\bt reply|\bts\b/.test(t)) return "tenant";
    if (/other/.test(t)) return "other";
    return "unknown";
  };
  for (const e of ev) {
    if (e.channel !== "Hold") continue;
    const m = e.body.match(/^Put on hold(?: by ([A-Z][a-z]+(?: [A-Z][a-z]+)?))?\. Reason: ([^.\n]+)\.?(?:\s*Comment:\s*([\s\S]*))?$/m);
    const reason = m ? m[2].trim() : gist(e.body, 120);
    const comment = m?.[3]?.trim();
    let waitingFor = waitingFrom(reason);
    if (waitingFor === "other" || waitingFor === "unknown") { const w = waitingFrom(comment ?? reason); if (w !== "unknown") waitingFor = waitingFor === "other" && w === "other" ? "other" : w; }
    if (m && comment && /Waiting for (Landlord|Provider|Tenant)/i.test(reason)) { const w = waitingFrom(comment); if (w !== "unknown" && w !== "other" && w !== waitingFrom(reason)) notes.push(`event ${e.n}: hold reason "${reason}" but the comment is about the ${w}`); }
    holds.push({ eventN: e.n, by: m?.[1], reason, waitingFor, comment: comment ? comment.replace(/\s+/g, " ").slice(0, 200) : undefined, released: false });
  }
  for (const h of holds) {
    const later = ev.filter((e) => e.n > h.eventN);
    h.released = later.some((e) => e.channel === "Hold" || classified.get(e.n)?.stage !== undefined || (h.waitingFor !== "other" && h.waitingFor !== "unknown" && roleOf(e.from) === (h.waitingFor === "provider" ? "contractor" : h.waitingFor) && e.channel !== "Update"));
  }

  // ---- interrupts
  let openInterrupt: string | undefined;
  for (const e of ev) {
    const c = classified.get(e.n);
    if (c && ["interrupt_response", "ll_no_response_3d", "ll_message_received", "provider_email_unparseable", "reminders_3plus", "post_closure_message", "not_tenanted", "paused_deadline", "no_results", "results_present"].includes(c.kind)) openInterrupt = `event ${e.n}: ${e.body.split("\n")[0].trim().slice(0, 160)}`;
    else if (openInterrupt && (e.channel === "Hold" || isOutbound(e) || (c?.stage && !["interrupt_response"].includes(c.kind)) || (e.channel === "Note" && isAgency(e.from)))) openInterrupt = undefined;
  }

  // ---- provider assignment, reminders
  let providerAssigned: CaseState["providerAssigned"];
  const assignments: { n: number; name: string }[] = [];
  for (const e of ev) {
    const c = classified.get(e.n);
    if (c?.kind !== "provider_assigned" && c?.kind !== "provider_reassigned") continue;
    const window = ev.filter((x) => x.n > e.n && x.n <= e.n + 8);
    let name: string | undefined;
    for (const x of window) {
      name = x.body.match(/^Our maintenance provider ([A-Z][^\n]+?) will be attending/m)?.[1] ?? x.body.match(/^\**Maintenance Provider Name:?\**:?\s*([A-Z][^\n]+)$/m)?.[1]
        ?? (toRole(x) === "contractor" ? x.body.match(/^Dear ([A-Z][^,\n]+),/m)?.[1] : undefined) ?? (toRole(x) === "contractor" ? companyNames(x.body)[0] : undefined);
      if (name) break;
    }
    if (!name) {
      const later = ev.filter((x) => x.n > e.n && x.channel !== "SMS");
      const isSigner = (c: string) => smsSigners.has(c);
      name = later.flatMap((x) => (toRole(x) === "contractor" || fromRole(x) === "contractor" ? companyNames(x.body) : [])).find((c) => !isSigner(c))
        ?? later.flatMap((x) => companyNames(x.body)).find((c) => !isSigner(c))
        ?? later.filter((x) => fromRole(x) === "contractor").map((x) => signoffName(x.body)).find((s) => s && !staffNames.has(s));
    }
    assignments.push({ n: e.n, name: (name ?? "unnamed provider").trim() });
  }
  if (assignments.length) {
    const last = assignments[assignments.length - 1];
    providerAssigned = { name: last.name, eventN: last.n };
    if (assignments.length > 1) notes.push(`provider (re)assigned ${assignments.length} times: ${assignments.map((a) => `${a.name} at event ${a.n}`).join("; ")}`);
    const cp = partyOf(parties, "contractor"); addName(cp, last.name, namesSeen, last.n); cp.isAssignedProvider = true;
  }
  const lastAssignN = assignments.length ? assignments[assignments.length - 1].n : 0;
  let remindersSent = ev.filter((e) => e.n > lastAssignN && isOutbound(e) && toRole(e) === "contractor" && /friendly reminder/i.test(e.body)).length;
  if (ev.some((e) => classified.get(e.n)?.kind === "reminders_3plus")) remindersSent = Math.max(remindersSent, 3);

  // ---- visit
  const visit: CaseState["visit"] = {};
  const visitRecords: { n: number; iso: string }[] = [];
  for (const e of ev) {
    const c = classified.get(e.n);
    if (c?.date && /^visit_/.test(c.kind)) { const iso = parseWrittenDateTime(c.date); if (iso) visitRecords.push({ n: e.n, iso }); }
    const slot = e.body.match(/Confirmed Time Slot:\s*([^\n]+)/i); if (slot && isOutbound(e)) { const iso = parseWrittenDateTime(slot[1]); if (iso) visitRecords.push({ n: e.n, iso }); }
  }
  if (visitRecords.length) {
    const last = visitRecords[visitRecords.length - 1];
    visit.date = last.iso; visit.eventN = last.n;
    const confirmedTo = new Set(ev.filter((e) => isOutbound(e) && /Confirmed Time Slot|confirmed appointment details/i.test(e.body)).map(toRole));
    visit.confirmedBothSides = confirmedTo.has("tenant") && confirmedTo.has("contractor");
    const after = ev.filter((e) => e.n >= last.n);
    if (after.some((e) => /missed (?:the )?(?:confirmed )?(?:date|appointment|visit)|no.?show|did ?n[o']t (?:turn up|show|attend)|failed to attend|nobody (?:came|turned up|attended)/i.test(e.body))) visit.missed = true;
    // Visit date recorded after the visit itself (the system was updated retrospectively).
    const recordedAt = ev.find((e) => e.n === last.n)?.ts;
    if (recordedAt && new Date(recordedAt).getTime() - new Date(last.iso + "Z").getTime() > DAY) conflicts.push({ kind: "date", text: `visit date ${last.iso.replace("T", " ").slice(0, 16)} was recorded at event ${last.n} on ${recordedAt.slice(0, 10)}, after the visit` });
    const distinct = [...new Set(visitRecords.map((v) => v.iso.slice(0, 10)))];
    const steps = visitRecords.filter((v, i) => i === 0 || v.iso.slice(0, 10) !== visitRecords[i - 1].iso.slice(0, 10));
    if (distinct.length > 1) notes.push(`visit date changed: ${steps.map((v) => `${v.iso.replace("T", " ").slice(0, 16)} (event ${v.n})`).join(" → ")}`);
  }

  // ---- work results, invoice, keys
  const workResults: CaseState["workResults"] = { present: false };
  for (const e of ev) {
    const c = classified.get(e.n);
    const fr = fromRole(e);
    const text = gist(e.body, 400);
    const sentences = text.split(/(?<=[.!])\s+|\n/).filter((s) => !/\?/.test(s));
    const doneSentence = sentences.some((s) => DONE_RE.test(s) && !NOT_DONE_RE.test(s) && !/quote|estimate|invoice/i.test(s));
    const says = (c?.kind === "results_present") || ((fr === "contractor" || fr === "tenant" || (fr === "landlord" && /done|complete|sorted|fixed/i.test(text)) || (isAgency(e.from) && ["Note", "Email"].includes(e.channel))) && doneSentence && e.n > Math.max(lastAssignN, 1));
    if (says && e.n > Math.max(lastAssignN, 1)) { workResults.present = true; workResults.eventN = e.n; workResults.summary = gist(e.body, 200); }
  }
  const invoice: CaseState["invoice"] = { present: false };
  for (const e of ev) {
    if (!/invoice/i.test(e.body) || /invoice sections not in use/i.test(e.body)) continue;
    if (isOutbound(e) && toRole(e) === "contractor" && !/invoice (?:received|attached|sent)/i.test(e.body) && !/attachments\/.*invoice/i.test(e.body)) continue; // the agency asking about invoices
    invoice.present = true; invoice.eventN = e.n;
    const amt = findAmounts(e.body).find((a) => /invoice|total|amount|due/i.test(a.context)) ?? findAmounts(e.body)[0];
    if (amt) invoice.amountGbp = amt.amountGbp;
    if (isOutbound(e) && toRole(e) === "landlord") invoice.sentToLandlord = true;
    if (/attachments\/[^)]*invoice/i.test(e.body) && isOutbound(e) && toRole(e) === "landlord") invoice.sentToLandlord = true;
  }
  for (const e of ev) if (fromRole(e) === "landlord" && /\bpaid\b/i.test(e.body) && !/(?:not|hasn'?t|has that|been|was it|unpaid|wasn'?t)\s*(?:been\s*)?paid|paid\?/i.test(e.body)) invoice.paid = true;
  for (const e of ev) if (fromRole(e) === "landlord" && /\bok(?:ay)? to pay|pass(?:ed)? (?:this |it )?for payment|approved? for payment|please pay/i.test(e.body)) notes.push(`landlord authorised payment at event ${e.n}`);
  if (!invoice.amountGbp && invoice.present && attachmentsText) { const a = findAmounts(attachmentsText).filter((x) => /total|amount due|balance/i.test(x.context)); if (a.length) invoice.amountGbp = a[a.length - 1].amountGbp; }
  const keys: CaseState["keys"] = {};
  for (const e of ev) {
    if (/collect(?:ed)? (?:the )?keys?|keys? (?:from|at) (?:our|the) office|with our key|key (?:collection|to be collected)|pick up (?:the )?keys?|keys? (?:were|was|have been) (?:issued|given|handed)|key return|added to keys/i.test(e.body)) keys.issued = true;
    if (classified.get(e.n)?.kind === "keys_confirmed" || /keys? (?:have been |were |has been )?returned|returned the keys?|brought (?:the )?(?:new )?key in|dropped (?:the )?keys? (?:off|back)/i.test(e.body)) keys.returned = true;
  }

  // ---- quotes
  const quotes: CaseState["quotes"] = [];
  const contractorCanon = () => parties.get("contractor")?.names[0] ?? providerAssigned?.name ?? "provider";
  for (const e of ev) {
    if (e.channel === "Update") continue;
    const amounts = findAmounts(e.body);
    if (!amounts.length) continue;
    const fr = fromRole(e), to = toRole(e);
    for (const a of amounts) {
      const ctx = a.context;
      if (!/quot|estimat|cost|price|charge|\+\s*VAT|VAT|would be|fee|call.?out/i.test(ctx) || (/invoice/i.test(ctx) && !/quot|estimat/i.test(ctx))) continue;
      const quotedBy = [...a.before.matchAll(/([A-Z][a-z]+(?: [A-Z][a-z]+)?) (?:has |have )?quoted/g)].pop()?.[1];
      const who = quotedBy ?? ctx.match(/quote from ([A-Z][a-z]+(?: [A-Z][a-z]+)?)/)?.[1];
      const provider = who && isPlausibleName(who) && !/landlord|tenant/i.test(who) ? who : fr === "contractor" ? (signoffName(e.body) ?? contractorCanon()) : contractorCanon();
      const existing = quotes.find((q) => q.amountGbp === a.amountGbp && (normName(q.provider) === normName(provider) || /provider/.test(q.provider)));
      if (existing) {
        if (isOutbound(e) && to === "landlord" && !existing.sentToLandlordEventN) existing.sentToLandlordEventN = e.n;
        if (existing.vat === "unknown" && a.vat !== "unknown") existing.vat = a.vat;
        else if (existing.vat !== "unknown" && a.vat !== "unknown" && existing.vat !== a.vat) conflicts.push({ kind: "amount", text: `£${a.amountGbp} from ${existing.provider} described as VAT ${existing.vat} (event ${existing.eventN}) and VAT ${a.vat} (event ${e.n})` });
        continue;
      }
      quotes.push({ provider, amountGbp: a.amountGbp, vat: a.vat, eventN: e.n, sentToLandlordEventN: isOutbound(e) && to === "landlord" ? e.n : undefined, approvedEventN: undefined, superseded: false });
    }
  }
  for (let i = 0; i < quotes.length; i++) for (let j = i + 1; j < quotes.length; j++) {
    if (normName(quotes[i].provider) === normName(quotes[j].provider) && quotes[i].amountGbp !== quotes[j].amountGbp && quotes[i].eventN !== quotes[j].eventN && !/^provider$/.test(quotes[i].provider)) {
      quotes[i].superseded = true;
      conflicts.push({ kind: "amount", text: `quote from ${quotes[i].provider} changed from £${quotes[i].amountGbp} (event ${quotes[i].eventN}) to £${quotes[j].amountGbp} (event ${quotes[j].eventN})` });
    }
  }

  // ---- landlord approval
  const signals: Signal[] = [];
  let conditions: string | undefined;
  for (const e of ev) {
    const c = classified.get(e.n);
    const text = gist(e.body, 300);
    if (c?.kind === "ll_gate_start" || c?.kind === "ll_wait_3d") signals.push({ n: e.n, status: "pending", text: e.body.split("\n")[0] });
    else if (c?.kind === "ll_no_response_3d") signals.push({ n: e.n, status: "pending", text: e.body.split("\n")[0] });
    else if (c?.kind === "ll_message_received") signals.push({ n: e.n, status: "pending", text: e.body.split("\n")[0] });
    else if (c?.kind === "ll_approved_confirmed") signals.push({ n: e.n, status: "approved", text: e.body.split("\n")[0] });
    else if (c?.kind === "quote_approved") signals.push({ n: e.n, status: "approved", text: e.body.split("\n")[0] });
    const fr = fromRole(e), to = toRole(e);
    if (e.channel === "Hold" || (e.channel === "Note" && isAgency(e.from)) || (isOutbound(e) && to === "contractor")) {
      const cm = text.match(CONDITIONAL_RE); if (cm && /landlord|\bLL\b/i.test(text)) conditions = cm[0].trim();
      if (OWN_CONTRACTOR_RE.test(text) && /\bLL\b|landlord/i.test(text)) signals.push({ n: e.n, status: "own_contractor", text });
      else if (LL_SELF_FIX_RE.test(text)) signals.push({ n: e.n, status: "landlord_self_fix", text });
      else if (TENANT_FIX_RE.test(text)) signals.push({ n: e.n, status: "tenant_to_fix", text });
      else if (AGENCY_APPROVED_NOTE_RE.test(text)) signals.push({ n: e.n, status: "approved", text });
      continue;
    }
    if (fr === "landlord" && ["Email", "SMS", "Call"].includes(e.channel)) {
      const cm = text.match(CONDITIONAL_RE); if (cm) conditions = cm[0].trim();
      // The reply proper: greeting line, sign-off and signature removed, so "Hi Oliver\n\nYes that sounds..." starts at "Yes".
      const reply = bodyLines(e.body).filter((l) => !/^(?:hi|hello|hey|dear|hiya|morning|good (?:morning|afternoon|evening))\b[^\n]{0,40}$/i.test(l) && !/^(?:thanks|thank you|many thanks|regards|kind regards|best|cheers|sent from)\b/i.test(l) && !/^[A-Z][a-z]+(?: [A-Z][a-z]+)?$/.test(l)).join(" ").replace(/\s+/g, " ").trim();
      const asked = signals.some((s) => s.status === "pending" && s.n < e.n);
      const im = !QUESTION_RE.test(reply) ? reply.match(INSTRUCT_RE) : null;
      if (OWN_CONTRACTOR_RE.test(text)) signals.push({ n: e.n, status: "own_contractor", text });
      else if (TENANT_FIX_RE.test(text)) signals.push({ n: e.n, status: "tenant_to_fix", text });
      else if (DECLINE_RE.test(text)) signals.push({ n: e.n, status: "declined", text });
      else if (cm) signals.push({ n: e.n, status: "conditional", text, conditions: cm[0].trim() });
      else if (im) { const sentence = reply.split(/(?<=[.!])\s+/).find((s) => INSTRUCT_RE.test(s)) ?? im[0]; signals.push({ n: e.n, status: "conditional", text, conditions: `landlord's route: ${sentence.trim().slice(0, 160)}` }); }
      else if (APPROVE_RE.test(text) || /👍/.test(e.body) && e.body.trim().length < 60 || /^(?:ok|okay|yes|fine|agreed|sure)[.!]?$/i.test(e.body.trim()) || (asked && ASSENT_RE.test(reply) && !QUESTION_RE.test(reply))) signals.push({ n: e.n, status: "approved", text });
    } else if (isOutbound(e) && to === "landlord" && APPROVAL_ASK_RE.test(text) && (/\?/.test(text) || /let me know/i.test(text))) {
      signals.push({ n: e.n, status: "pending", text, ask: true });
    }
  }
  const sticky = new Set<ApprovalStatus>(["own_contractor", "landlord_self_fix", "tenant_to_fix"]);
  let approval: CaseState["landlordApproval"] = { status: "none" };
  for (const s of signals) {
    if (sticky.has(approval.status) && s.ask) continue; // chasing progress with the LL's own contractor is not a new approval question
    approval = { status: s.status, eventN: s.n, text: s.text?.slice(0, 160), conditions: s.conditions ?? conditions };
  }
  if (conditions && !approval.conditions) approval.conditions = conditions;
  if (approval.status === "approved") {
    const candidates = [...quotes].reverse().filter((q) => q.sentToLandlordEventN !== undefined && q.sentToLandlordEventN <= (approval.eventN ?? 0) && !q.superseded);
    const approvedQuote = candidates.find((q) => approval.text && related(q.provider, approval.text.replace(/[^A-Za-z &'-]/g, " "))) ?? candidates[0];
    if (approvedQuote) { approvedQuote.approvedEventN = approval.eventN; approval.amountGbp = approvedQuote.amountGbp; }
  }
  // Dispatch before approval (the red flag in 043 and 048).
  const firstApproved = signals.find((s) => s.status === "approved" || s.status === "conditional")?.n;
  const firstAssign = assignments[0]?.n;
  if (firstAssign && (firstApproved === undefined || firstApproved > firstAssign) && ev.some((e) => classified.get(e.n)?.kind === "ll_gate_start")) notes.push(`provider assigned at event ${firstAssign} ${firstApproved ? `before the landlord's approval at event ${firstApproved}` : "with no landlord approval recorded"}`);
  if (approval.status === "own_contractor") { const cp = partyOf(parties, "contractor"); cp.isLandlordsOwnContractor = true; if (!providerAssigned) providerAssigned = { name: cp.names[0] ?? "landlord's own contractor", eventN: approval.eventN ?? 0 }; }

  // ---- quote loop and approval-driven stage adjustments
  const lastQuoteToLL = [...quotes].filter((q) => q.sentToLandlordEventN !== undefined).sort((a, b) => b.sentToLandlordEventN! - a.sentToLandlordEventN!)[0];
  const terminal = new Set<Stage>(["completed", "completed_without_payment", "close_out", "paused_not_tenanted"]);
  const closed = new Set<Stage>(["completed", "completed_without_payment", "close_out"]);
  // The latest time any known quote amount went to the landlord (first send or a chase that repeats the figures).
  const quoteAmounts = new Set(quotes.map((q) => q.amountGbp));
  const lastQuoteSentN = Math.max(0, ...ev.filter((e) => isOutbound(e) && toRole(e) === "landlord" && findAmounts(e.body).some((a) => quoteAmounts.has(a.amountGbp))).map((e) => e.n));
  const decidedAfterQuote = (approval.eventN ?? 0) > lastQuoteSentN && !["pending", "none"].includes(approval.status);
  if (lastQuoteToLL && !closed.has(stage) && (stageEvidenceEventN ?? 0) < lastQuoteSentN && !decidedAfterQuote) { stage = "quote_loop"; stageEvidenceEventN = lastQuoteSentN; }
  else if (lastQuoteToLL && !closed.has(stage) && decidedAfterQuote && approval.status === "approved" && (stageEvidenceEventN ?? 0) < lastQuoteSentN) { stage = providerAssigned ? "awaiting_visit_date" : "dispatch"; stageEvidenceEventN = approval.eventN; }
  if (stage === "landlord_gate" && (approval.status === "approved" || approval.status === "conditional") && (approval.eventN ?? 0) > (stageEvidenceEventN ?? 0)) { stage = "dispatch"; stageEvidenceEventN = approval.eventN; }
  if (stage === "landlord_gate" && (approval.status === "own_contractor" || approval.status === "tenant_to_fix" || approval.status === "landlord_self_fix") && (approval.eventN ?? 0) > (stageEvidenceEventN ?? 0)) { stage = "awaiting_results"; stageEvidenceEventN = approval.eventN; }
  if (["intake", "landlord_gate", "dispatch", "awaiting_visit_date", "visit_scheduled", "awaiting_results", "quote_loop"].includes(stage) && workResults.present && (workResults.eventN ?? 0) > (stageEvidenceEventN ?? 0)) { stage = "close_out"; stageEvidenceEventN = workResults.eventN; }
  if (stage === "visit_scheduled" && visit.date && new Date(visit.date + "Z").getTime() + DAY < nowMs && !workResults.present) { stage = "awaiting_results"; }

  // ---- occupancy
  let occupancy: CaseState["occupancy"] = "unknown";
  const vacatedWording = /vacat|check.?out|checkout|\bempty\b|\bvoid\b|move.?in|end of tenancy|moved out|outgoing tenant/i.test(requestText + " " + (header.title ?? ""));
  const agencyRaised = /agency|manager|staff/i.test(header.sourceRole ?? "") || (!header.sourceRole && !ev.some((e) => roleOf(e.from) === "tenant" && e.n <= 3));
  if (ev.some((e) => classified.get(e.n)?.kind === "not_tenanted")) occupancy = "not_tenanted";
  else if (agencyRaised && vacatedWording) occupancy = "not_tenanted"; // an agency-raised job about a vacated flat stays not tenanted even if someone emailed the old tenant (006)
  else if (/tenant/i.test(header.sourceRole ?? "") || ev.some((e) => roleOf(e.to) === "tenant" || roleOf(e.from) === "tenant")) occupancy = "tenanted";
  else if (vacatedWording) occupancy = "not_tenanted";

  // ---- who pays
  let whoPays: CaseState["whoPays"] = "unknown";
  const all = ev.map((e) => e.body).join("\n");
  if (/tenant'?s? (?:responsibility|liability|cost|expense)|billed to you|at your own cost|charged to the tenant|tenant (?:will|to) pay|deducted from (?:the )?deposit|tenant pays/i.test(all)) whoPays = "tenant";
  if (/split|50\/50|half each|share the cost/i.test(all)) whoPays = "split";
  if (whoPays === "unknown" && (/LL pays|landlord pays|deduct(?:ed)? from (?:the )?rent|pass this for payment|landlord (?:to|will) pay|invoice .{0,40}landlord|landlord .{0,40}invoice/i.test(all) || approval.status === "approved" || invoice.sentToLandlord)) whoPays = "landlord";

  // ---- last inbound, post-closure, off-topic
  const inbound = ev.filter((e) => isInbound(e) && e.channel !== "Note");
  const lastIn = inbound[inbound.length - 1];
  const lastInbound = lastIn ? { from: lastIn.from, eventN: lastIn.n, channel: lastIn.channel, gist: gist(lastIn.body) } : undefined;
  const closedAtN = derived.closedAtN;
  const postClosure = closedAtN ? inbound.filter((e) => e.n > closedAtN) : [];
  const offTopic: string[] = postClosure.map((e) => `event ${e.n} (${e.from}, after closure at event ${closedAtN}): ${gist(e.body, 120)}`);
  for (const e of inbound) {
    if (postClosure.includes(e)) continue;
    if (/parking|garage|roof|another (?:job|property|flat)|other (?:flat|property)|different (?:issue|problem|property)/i.test(e.body) && !/parking|garage|roof/i.test(requestText)) offTopic.push(`event ${e.n} (${e.from}) raises an unrelated matter: ${gist(e.body, 120)}`);
    else { const other = findAddresses(e.body).map(normAddress).filter((a) => reference && a !== reference); if (other.length) offTopic.push(`event ${e.n} (${e.from}) refers to another property: ${other[0]}`); }
  }

  // ---- date conflicts
  if (header.created && ev[0]?.ts) {
    const c = new Date(header.created.replace(" ", "T").replace(/ UTC$/, "") + "Z").getTime();
    if (!Number.isNaN(c) && Math.abs(c - new Date(ev[0].ts).getTime()) > DAY) conflicts.push({ kind: "date", text: `case header says created ${header.created} but the first event is ${ev[0].ts}` });
  }
  const dateIssues = new Map<string, number[]>();
  const issue = (k: string, n: number) => { const l = dateIssues.get(k) ?? []; l.push(n); dateIssues.set(k, l); };
  for (const e of ev) {
    if (!e.ts || e.channel === "Update") continue;
    const et = new Date(e.ts); const ey = et.getUTCFullYear(), em = et.getUTCMonth() + 1;
    for (const d of findWrittenDates(e.body)) {
      if (d.month && d.day) {
        const diff = Math.min(Math.abs(d.month - em), 12 - Math.abs(d.month - em));
        if (diff > 2) { issue(`"${d.text}" written in a ${monthName(em)} ${ey} event`, e.n); continue; }
        if (d.weekday !== undefined) { const y = d.month < em - 6 ? ey + 1 : ey; const wd = weekdayOf(y, d.month, d.day); if (wd !== d.weekday) issue(`"${d.text}": ${d.day} ${monthName(d.month)} ${y} is a ${weekdayName(wd)}`, e.n); }
      } else if (d.day && d.weekday !== undefined) {
        let y = ey, m = em; if (d.day < et.getUTCDate() - 7) { m = em === 12 ? 1 : em + 1; if (m === 1) y++; }
        const wd = weekdayOf(y, m, d.day); if (wd !== d.weekday) issue(`"${d.text}": ${d.day} ${monthName(m)} ${y} is a ${weekdayName(wd)}`, e.n);
      }
    }
  }
  for (const [k, ns] of dateIssues) conflicts.push({ kind: "date", text: `${k} (event${ns.length > 1 ? "s" : ""} ${[...new Set(ns)].slice(0, 6).join(", ")})` });
  if (invoice.eventN && visit.date) { const invTs = ev.find((e) => e.n === invoice.eventN)?.ts; if (invTs && new Date(invTs).getTime() < new Date(visit.date + "Z").getTime()) conflicts.push({ kind: "date", text: `invoice at event ${invoice.eventN} (${invTs.slice(0, 10)}) predates the visit on ${visit.date.slice(0, 10)}` }); }

  // ---- safety signals
  const safetySignals: string[] = [];
  const safetyHits = new Map<string, number[]>();
  const scan = (text: string, n: number | undefined) => { for (const [label, re, also] of SAFETY) if (re.test(text) && (!also || also.test(text))) { const l = safetyHits.get(label) ?? []; if (n !== undefined) l.push(n); safetyHits.set(label, l); } };
  // Intake Q&A puts question and answer on one line ("- Is this the only toilet? Yes"): keep only the answer part of such lines.
  const noQuestions = (t: string) => t.split("\n").map((l) => (/\?/.test(l) && !/only toilet at the property\?\s*Yes/i.test(l) ? l.slice(l.lastIndexOf("?") + 1) : l)).join("\n");
  for (const e of ev) if (e.channel !== "Update" && e.channel !== "Hold") scan(noQuestions(e.body), e.n);
  if (attachmentsText) scan(attachmentsText, undefined);
  for (const [label, ns] of safetyHits) safetySignals.push(`${label}${ns.length ? ` (event${ns.length > 1 ? "s" : ""} ${[...new Set(ns)].slice(0, 4).join(", ")})` : " (attachment)"}`);

  // ---- timers (ISO, from event timestamps)
  const timers: CaseState["timers"] = {};
  const lastOutToLL = [...ev].reverse().find((e) => isOutbound(e) && toRole(e) === "landlord");
  const lastInFromLL = [...ev].reverse().find((e) => fromRole(e) === "landlord" && e.channel !== "Update");
  const waitingOnLL = approval.status === "pending" || holds.some((h) => !h.released && h.waitingFor === "landlord") || (lastOutToLL && (!lastInFromLL || lastInFromLL.n < lastOutToLL.n) && /\?/.test(lastOutToLL.body));
  if (waitingOnLL && lastOutToLL?.ts && !terminal.has(stage)) timers.landlordReplyDue = addDays(lastOutToLL.ts, 3);
  const waitStart = [...ev].reverse().find((e) => ["provider_assigned", "provider_reassigned", "resumed_wait_visit", "back_to_start", "quote_approved"].includes(classified.get(e.n)?.kind ?? ""));
  if (stage === "awaiting_visit_date" && waitStart?.ts) timers.providerVisitDateDue = addDays(waitStart.ts, 5);
  if ((stage === "visit_scheduled" || stage === "awaiting_results") && visit.date && !workResults.present) timers.resultsCheckDue = addDays(visit.date + "Z", 3);
  const closeWarn = [...ev].reverse().find((e) => isOutbound(e) && toRole(e) === "tenant" && /within (?:the next )?24 ?h(?:ou)?rs?[^.]{0,80}closed|will be closed/i.test(e.body));
  if (closeWarn?.ts && !terminal.has(stage)) timers.closeWarningDue = addDays(closeWarn.ts, 1);

  // ---- notes
  const changeModes = ev.filter((e) => classified.get(e.n)?.kind === "change_mode").length;
  if (changeModes) notes.push(`${changeModes} "Manually updated via Change Mode" event${changeModes > 1 ? "s" : ""}`);
  for (const e of ev) if (classified.get(e.n)?.kind === "description_changed") notes.push(`request description changed at event ${e.n}`);
  const intake = ev.find((e) => classified.get(e.n)?.kind === "intake_classification");
  if (intake) { const issue = intake.body.match(/Issue:\**\s*\n?\s*\**([^\n*]+)/)?.[1]?.trim(); const sev = intake.body.match(/Severity:\s*([A-Z]+)/)?.[1]; if (issue) notes.push(`AI intake classification: ${issue}${sev ? `, severity ${sev}` : ""} (event ${intake.n})`); }
  for (const e of ev) if (/(?:authorisation|permission|consent) to (?:pass|share)|happy for (?:you|us) to (?:share|pass) (?:my|her|his|their|the) (?:details|number)|gave (?:consent|permission|authorisation)|tenant(?:s)? (?:consented|agreed to share)/i.test(e.body)) { notes.push(`tenant consent to share contact details recorded at event ${e.n}`); break; }
  if (postClosure.length) notes.push(`${postClosure.length} message${postClosure.length > 1 ? "s" : ""} received after closure (event ${closedAtN})`);
  const unavailable = ev.filter((e) => /unavailable|could not be extracted|\[(?:No )?[Tt]ext\/transcription|contents not provided|transcription (?:unavailable|absent|missing)/i.test(e.body)).map((e) => e.n);
  if (unavailable.length) notes.push(`${unavailable.length} event${unavailable.length > 1 ? "s" : ""} with unavailable attachments or transcripts (events ${unavailable.slice(0, 8).join(", ")}${unavailable.length > 8 ? "…" : ""})`);

  // ---- triage-rule state fields (docs/triage-rules.md): payment route, tenant liability, work status, documents
  let paymentRoute: CaseState["paymentRoute"] = "unknown";
  if (/deduct(?:ed|ing)? (?:it |this |the cost )?from (?:the )?rent|rent deduction|take (?:it )?(?:out of|from) (?:the )?rent/i.test(all)) paymentRoute = "landlord_rent_deduction";
  else if (/warranty|no charge|free of charge|at no cost|redone free|no cost to/i.test(all) && !/out of warranty|warranty (?:has )?expired/i.test(all)) paymentRoute = "warranty_or_free";
  else if (whoPays === "tenant") paymentRoute = "tenant_chargeable";
  else if (/pays? (?:the )?contractor directly|LL pays|landlord pays|paid directly|pay (?:the )?(?:invoice|contractor) directly|pass this for payment|please pay/i.test(all) || invoice.sentToLandlord) paymentRoute = "landlord_direct";
  let tenantLiability: CaseState["tenantLiability"] = "unknown";
  if (whoPays === "tenant" || /tenant'?s? (?:responsibility|liability)|chargeable to (?:the )?tenant|billed to you|at your own cost|tenant(?:'s)? (?:own )?(?:appliance|alteration)|unnecessary call.?out/i.test(all)) tenantLiability = "yes";
  else if (/not (?:the )?tenant'?s? (?:fault|responsibility)|landlord'?s? responsibility|wear and tear|no charge to (?:the )?tenant|pre-?existing/i.test(all)) tenantLiability = "no";
  let workStatus: CaseState["workStatus"] = "unknown";
  const visitMs = visit.date ? new Date(visit.date + "Z").getTime() : undefined;
  if (workResults.present) {
    workStatus = "work_completed";
    const afterDone = inbound.filter((e) => e.n > (workResults.eventN ?? 0));
    if (afterDone.some((e) => /not (?:been )?(?:fixed|working|resolved|done)|still (?:not|broken|leaking|the same)|same (?:issue|problem|fault)|happened again|broken again|not happy|disappoint|complain|unacceptable/i.test(e.body))) workStatus = "disputed";
  } else if (visitMs !== undefined && visitMs < nowMs) workStatus = "visit_completed";
  else if (visitMs !== undefined) workStatus = "visit_scheduled";
  else if (providerAssigned || ["intake", "landlord_gate", "dispatch", "awaiting_visit_date", "quote_loop", "paused_not_tenanted"].includes(stage)) workStatus = "not_started";
  const documents: CaseState["documents"] = [];
  const docKind = (s: string): CaseState["documents"][number]["kind"] => /quote|estimate/i.test(s) ? "quote" : /invoice/i.test(s) ? "invoice" : /inspection|check.?out|report/i.test(s) ? "inspection_report" : /photo|image|\.(?:jpe?g|png|webp|gif)$/i.test(s) ? "photo" : /complet/i.test(s) ? "completion_evidence" : "other";
  const seenDocs = new Set<string>();
  for (const e of ev) {
    for (const a of e.attachments) { const name = a.replace(/^attachments\//, ""); if (seenDocs.has(name)) continue; seenDocs.add(name); documents.push({ kind: docKind(name), name, eventN: e.n, available: true }); }
    for (const m of e.body.matchAll(/attachment-\d+-document\s*\((?:unavailable|contents not provided)[^)]*\)/gi)) { const key = `${e.n}:${m[0]}`; if (seenDocs.has(key)) continue; seenDocs.add(key); documents.push({ kind: docKind(e.body.slice(Math.max(0, m.index! - 120), m.index!)), name: m[0].split(/\s/)[0], eventN: e.n, available: false }); }
    const added = e.body.match(/^Added document\(s\):\s*([^\n]+)/im);
    if (added) documents.push({ kind: docKind(added[1]), name: added[1].slice(0, 80), eventN: e.n, available: !/unavailable|not provided|contents/i.test(added[1]) && e.attachments.length > 0 });
    if (/referenced .{0,30}(?:photo|image).{0,30}unavailable|\[Three referenced|photos? (?:attachment )?unavailable/i.test(e.body)) documents.push({ kind: "photo", eventN: e.n, available: false });
    if (/^Inspection document uploaded/im.test(e.body)) documents.push({ kind: "inspection_report", name: "inspection document (portal)", eventN: e.n, available: e.attachments.length > 0 });
  }

  // ---- difficulty (deterministic, per handout A)
  const reasons: string[] = []; let score = 0;
  if (safetySignals.length) { score += 3; reasons.push(`+3 safety signal: ${safetySignals[0].replace(/ \(.*$/, "")}`); }
  const partyConflicts = conflicts.filter((c) => ["address", "name", "phone"].includes(c.kind));
  const pc = Math.min(4, partyConflicts.length * 2); if (pc) { score += pc; reasons.push(`+${pc} for ${partyConflicts.length} data conflict${partyConflicts.length > 1 ? "s" : ""} touching a party or the address`); }
  const silence: string[] = [];
  if (timers.landlordReplyDue && new Date(timers.landlordReplyDue).getTime() < nowMs) silence.push("landlord silent for over 3 days");
  if (remindersSent >= 3 && !visit.date && !workResults.present) silence.push(`${remindersSent} reminders to the provider with no visit date`);
  if (visit.missed) silence.push("provider missed the visit");
  if (silence.length) { score += 2; reasons.push(`+2 silence timer expired: ${silence.join("; ")}`); }
  if (lastIn && DISPUTE_RE.test(lastIn.body)) { score += 2; reasons.push(`+2 dispute or disagreement in the last inbound (event ${lastIn.n})`); }
  const needsApproval = new Set<Stage>(["dispatch", "awaiting_visit_date", "visit_scheduled", "awaiting_results"]);
  if (needsApproval.has(stage) && ["none", "pending", "declined"].includes(approval.status)) { score += 1; reasons.push(`+1 no landlord approval recorded at stage ${stage}`); }
  if (ev.length > 35) { score += 1; reasons.push(`+1 long history (${ev.length} events)`); }
  const lastThree = ev.slice(-3);
  if (lastThree.some((e) => /unavailable|could not be extracted|\[(?:No )?[Tt]ext\/transcription|contents not provided|transcription (?:unavailable|absent|missing)/i.test(e.body))) { score += 1; reasons.push("+1 unavailable attachment or transcript in the last three events"); }
  score = Math.min(10, score);
  const tier = score <= 2 ? "routine" : score <= 5 ? "standard" : "hard";

  const state: CaseState = CaseStateSchema.parse({
    jobId, propertyAddress: header.propertyAddress || undefined, addressesMentioned,
    parties: [...parties.values()].filter((p) => p.names.length || p.emails.length || p.phones.length),
    stage, stageEvidenceEventN, occupancy, landlordApproval: approval, quotes, providerAssigned, remindersSent, visit, workResults, invoice, keys, holds,
    openInterrupt, timers, lastEventTs: lastTs, lastInbound, whoPays, paymentRoute, tenantLiability, workStatus, documents, safetySignals, dataConflicts: conflicts.map((c) => c.text), offTopic,
    postClosureMessages: postClosure.length > 0, notes, difficulty: { score, reasons, tier },
  });
  return state;
}
