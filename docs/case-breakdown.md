# Dwelly public cases: breakdown (Property Management focus)

(Prepared by Vedaant's agent from the public cases. Source of truth for workflow strings, business rules, noise and red flags.)

Source: https://github.com/DwellyOrg/HackatonPublicCases (cloned to `./HackatonPublicCases`).
Practice data only. Do not submit answers for it. The Reality Test cases arrive at 16:30 in `HackatonChallendges/`.

## 1. Repo shape

- There are 200 synthetic cases, 50 per track: Banking, Delivery, Insurance and Property Management (PM).
- Each case is in `<Track>/NNN/` and has `index.md` (case details, initial request, overview and outcome), `history.md` (numbered, timestamped events), `attachments/` (optional).
- Case numbers repeat across tracks, so a case is identified by track + number.
- The suggested way to evaluate: cut the history at a decision point, hide later events and the outcome, ask the system for its next step, then compare with what happened. The recorded outcome is one acceptable answer, not the only one.
- The other three tracks have a "Next action at escalation" section. Each case is one narrow authorised step. Delivery says outright: "facts learned later must not be used as if already known".
- PM has no such framing. It contains full, raw maintenance logs exported from a real system, so we have to pick the decision points ourselves.

## 2. Property Management at a glance

- All 50 are maintenance requests at one agency, Northbridge Lettings (UK, GBP), and all are marked Completed.
- Who raised them: 001–010 agency manager (checkout cleaning, end-of-tenancy and empty-property works, garden, solar meter reading); 011–050 tenant-reported repairs (dishwasher, doors and locks and keys, oven, drains and plumbing, shower, washing machine, windows, shed, garden).
- Size: 13–64 events per case (typically 25–40), about 545 KB in total.
- Channels: Email (506), Update (443, system state messages), Hold (236), Note (192), Call (74, summarised transcripts), SMS (54).
- Parties: Agency/system, Tenant, Landlord (LL), Contractor/provider.
- Attachments: only 7 PM cases have real files, all PDFs: checkout and inspection reports, quotes, invoices and one meter photo (003, 004, 005, 007, 008, 010, 020). Everywhere else the attachment is referenced but marked "unavailable".

## 3. Workflow (exact system strings)

```
1  Intake          "Request description: …"  (+ optional "[AI Intake Classification]" Issue/Severity/Confidence/Q&A)
2  LL gate         "Please complete landlord approval step first" | "Please approve selection of provider and category"
                   "Waiting for landlord/tenant response before provider selection (3 days)."
                   → "No landlord/tenant response after 3 days. Please review manually."
                   → "Message received from landlord/tenant. Please review and proceed manually."
                   → "Landlord approval confirmed. Proceed to provider selection."
3  Occupancy       "Property is **NOT TENANTED** — moved to Paused"
4  Dispatch        "Maintenance provider assigned" → templated tenant + contractor emails, SMS
                   reminders "This is a friendly reminder…" → "3+ reminders have been sent to provider. Please check what's happening."
                   "Resumed auto waiting for provider visit date (5 days)"
5  Visit           "Visit date selected - DD/MM/YYYY hh:mm" → confirmations both sides + SMS day before
6  Results         "No work results; we need to check what is happening" (~3 days after visit)
                   "Work results isset, please select next stage"
                   "Email received from provider, but expected data could not be extracted. Please review manually."
7  Quote loop      quote → LL; "Quote was approved by landlord"; "The request was updated to the start stage to arrange a visit."
8  Close-out       "Task has been moved to Result" → "Request marked as completed, lets do the final checks"
                   "Skipped uploading one or more documents. Reason provided: …" ; "Need confirmation from landlord"
                   "We need to check the key return before completing the request" → "Keys return confirmed"
                   "All checks have been completed; the request is now closed"
9  Alt endings     "Task has been completed without payment" (LL/tenant self-fixed) | "Task has been completed by supervisor"
   Interrupts      "Please check if we need to provide a response to {landlord|tenant|provider}. If not, please return this request to auto mode."
                   "Put on hold by X. Reason: Waiting for Landlord|Provider|Tenant|Other. Comment: …"
                   "Manually updated via Change Mode" ; "Paused automatically: exceeded … deadline by N days"
```

Hold reasons: Waiting for Provider 70, Waiting for Landlord 49, Other 22, Waiting for Tenant 8.

## 4. Business rules we can infer

- Landlord approval comes before dispatch. A quote needs a second approval. The contractor template says "only proceed after receiving our approval". Dispatching before approval is a red flag (043, 048 did it).
- No explicit £ authority limit appears anywhere. Every quote went to the LL: £35 / £65 / £75 / £90 / £95 / £172.51 / £198.37 / £600 / £605 / £1,370–£1,700, mostly +VAT. The LL may give conditional pre-authorisation: "easy and cheap" fixes OK, a quote needed if parts are required (043).
- The landlord's options: approve; ask for a second quote (008); use their own contractor (001, 015, 028, 041, 045, 047); do it themselves or suggest a workaround (014, 017, 035); let the tenant fix it (038, 049).
- Who pays: the LL by default, deducted from rent (013, 018, 019) or paid directly to the contractor (030, 034). The tenant pays for checkout cleaning and damage (004, 006, 008), internal drain blockages and unnecessary call-outs (012, 027). Garden upkeep is the tenant's job (009). Pre-existing damage gets checked (029). Warranty work is redone free (025, 036). An appliance the tenant supplies becomes the tenant's liability (038).
- Timers: 3 days for an LL or tenant reply; contractor reminders every 1–3 days, flagged after 3; "No work results" about 3 days after the visit; 5-day wait for the provider to give a visit date; SMS the day before the visit; 24h close warning to the tenant (027).
- Closing a case requires: LL confirmation; key return (where keys were issued); documents uploaded, or a reason given for skipping; an invoice in PDF form.
- Tenant contact details go only to the assigned contractor. The LL's own contractor gets them only with the tenant's consent (045).
- Priority is numeric and can't be lowered, which produces the "Validation: Priority cannot be decreased…" noise. Intake severity is always ROUTINE.

## 5. Noise the agent must tolerate (deliberate)

- Names: one tenant, LL or contractor can appear under several names (001, 002, 025, 026, 032, 043, 050). Provider brands change within a case, and SMS can be signed by another agency name.
- Addresses and phone numbers: messages can quote the wrong property address: 005, 006, 008, 009, 015, 022, 028, 032, 033, 034, 037, 038, 045 (about 6 addresses), 048. Phone numbers can differ between messages (002, 012, 037, 039, 048).
- Dates: impossible or contradictory dates: invoice before visit (050), "November 4th" in April (043), weekday doesn't match the date (039), index date doesn't match the history (020, 031). Visit entered or approval logged after the work was done (019, 048).
- Content: missing attachments and notes saying "[Text/transcription unavailable]"; call "transcripts" that are only IVR prompts; emails are often LLM summaries, sometimes wrong (009); emoji-only approvals (032 👍, 046).
- Duplicates and stray messages: duplicate emails and status lines; off-topic issues mixed into a thread (024, 041); messages arriving after the case is closed (003, 008, 027, 039, 045).
- System problems: intake misclassification: a door filed as a fridge (014), a washing machine asked about as a boiler (042); hold reasons that contradict their comments; a typo that reverses the meaning (016: "invoice was needed" should say not); a closed case reappearing because of a bug (002).

## 6. Judgement calls: escalate, and red flags

Should escalate to a human or the landlord:
- Safety: door glass may shatter (014); water damage near a smoke detector (035); scalding shower (034); door that won't lock (023); rotting door (015); window by the stairs that won't open (044); tenant fitted a washer with no isolation valves (040); water leak known for over 2 weeks (031).
- Cost and disputes: quote increases partway through the job (019); choosing between quotes, VAT confusion, LL owes the contractor money (008); warranty dispute (025); LL complaint plus a repeat failure (036); unapproved alteration, i.e. a dog flap (020); deciding tenant liability (027, 029).
- Silence: no LL reply after 3 days (019, 011, 016); 3+ reminders to the contractor (018, 030, 047, where it sat about 3 months); missed visit (030).
- Data conflicts: wrong address or name before sending anything; unparseable provider email; vague scope (045).

Red flags / prohibited:
- dispatching or authorising work before LL approval (043, 048)
- telling the LL "no issues" when the report shows a defect (020)
- claiming work is done without evidence (018, 024)
- deducting from rent without explicit approval (013)
- emailing a tenant who has moved out; check occupancy first (006)
- sending two contractors for the same job (047)
- sharing tenant contact details without consent
- sending a message that quotes the wrong property
- closing a case while a safety issue is still open

## 7. Implications for our build

1. The Reality Test is probably "here is a case so far, what next?" The engine needs to: parse the events; work out the current stage from the system strings above; check against the rules in section 4; choose one next action, a hold or an escalation; write ANSWER.md and REASONING.md.
2. Make data conflicts an explicit step. Check names, addresses, dates and amounts against the case header before any outbound message. A conflict means hold or escalate, never send.
3. Safety triage overrides the ROUTINE label. P0 cases (leaks near electrics, security, scalding, broken glass) trigger the voice call to the on-call manager, which is fire-and-forget during the Reality Test.
4. "Doing nothing" is a valid output. Examples: waiting out the 3-day timer, or waiting for the LL's own contractor.
5. Build an eval harness from these 50 cases. Truncate each case at its decision points and score our next action against what happened, together with the red-flag list above.
