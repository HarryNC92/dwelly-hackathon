# Northbridge Lettings operating conventions (mined from the 50 public cases)

Corpus: 40 tenant repairs, 9 agency-manager jobs (mostly checkout works on empty flats), 1 automated inspection. Quotes are verbatim house wording; bracketed numbers are case ids.

## 1. Workflow

**Tenant repair**
1. Intake Note "Request description: …", often with an "[AI Intake Classification]" Note whose category can be wrong (014, 042, 049); trust the tenant's words.
2. Gate: "Please complete landlord approval step first" (25 cases) or "Please approve selection of provider and category" (15). Under both, staff normally ask the landlord.
3. Within 2 days: landlord email, tenant holding email, hold "Reason: Waiting for Landlord. Comment: Held awaiting response from landlord." (025, 028). The system may instead run "Waiting for landlord/tenant response before provider selection (3 days)."
4. Yes → "Landlord approval confirmed. Proceed to provider selection." → "Maintenance provider assigned" → platform emails tenant and contractor → hold "Reason: Waiting for Provider. Comment: waiting for appointment to be booked" (011).
5. Contractor phones tenant → "Visit date selected - dd/mm/yyyy hh:mm" → platform confirmations and tenant SMS.
6. Visit produces a quote → to landlord, hold "Held awaiting response from the landlord regarding quote." → "Quote was approved by landlord" → contractor instructed (002, 033). Attend-and-fix jobs skip this.
7. Completion and invoice → landlord email → "Task has been moved to Result" → "Request marked as completed, lets do the final checks" → "Skipped uploading one or more documents. Reason provided: …" → "Need confirmation from landlord" → (if keys issued) "Keys return confirmed" → "All checks have been completed; the request is now closed".

**Agency-initiated (checkout works, 003–008):** "Following the tenant vacating please provide an estimate to; …" → provider assigned immediately → "Property is **NOT TENANTED** — moved to Paused" (resolve manually) → contractor emailed with the checkout report, hold "Hold for quote" → itemised quote to landlord ("Please let me know if he may proceed.", 007), hold "Waiting for Landlord" → contractor told "Your quote for this job has been approved.", sequenced after other checkout works (004), keys via caretaker or office (007) → invoice to landlord → final checks with key return.
Inspection follow-ups and periodic readings: ask the tenant for photos, chase weekly, close on receipt (009, 010). Inspections are system-scheduled, then "Please add results of inspection" and a report to the landlord (020).

## 2. Decision rules

**Self-fix first.** Blocked drains are the tenant's; the landlord is not contacted (027): "As per the terms of your tenancy, maintenance of internal drains—including clearing blockages caused by everyday use such as hair or soap build-up is the tenant’s responsibility." A contractor they request is chargeable "if the blockage is found to be due to tenant-related causes such as hair, foreign objects, or general shower usage". For possible user error, send checks first "to rule out any obstruction and avoid the risk of being liable for an unnecessary call-out" (012; also 024, 039; landlord tips 017, 041). Unclear cause: ask ("Can you please advise how the hand basin became cracked?", 029). Tenant offers to fix or replace: landlord OK, then let them (038, 049).

**Landlord approval.** Ask before instructing, offering their own contractor: "Please advise if you would like us to send one of our contractors to attend to this issue and resolve where possible (or quote if significant), or if you would prefer to deal with it yourself." (016, 032). Instructing on notice only ("I have raised a job for Riverside Works to sort.", 030) or with nothing logged (013, 022, 029, 031, 034) happened only on simple attend-and-fix jobs; do it only with recorded standing authority.

**Quotes and cost.** Every quote for further work went to the landlord, however small: £35/£90 + VAT (050), £95 inc VAT (011), £172.51 + VAT (032), £1,370 vs £1,700 + VAT (008). No self-approval threshold appears; the one agency-approved estimate was a checkout clean (003). The first call-out runs under the initial yes ("a minimum of £65.00 + VAT", 041). Give contractors conditional authority: "if is something easy and cheap to fix, but if turns out needs part or is more complex, please quote it and we will chase her approval" (043).

**Second quote** only when the landlord asks ("Can try one other subcontractor to quote for comparison?", 008); present both with VAT status: "I assume you wish to proceed with the cheaper option?"

**Invoices.** Request PDF (046, 050). Name the payment route in the completion email: landlord pays ("Please pass this for payment.", 008), paid from rent ("deduct it off the rental amount", 019; 013, 018), or contractor bills the landlord direct ("LL pays contractor directly", 030; 001, 006). The landlord confirms payment, usually after closure ("Paid", 003; "Ok to pay", 008).

**Closing.** Close when the work is confirmed done (contractor, landlord or tenant) and any invoice is in hand; until then hold "Comment: Hold for invoice" (008, 031, 042). Final checks: upload or skip documents with a reason, "Need confirmation from landlord" (a checklist step; closure doesn't wait for a reply, 003, 034), key return where keys were issued. No-invoice outcomes close "Task has been completed without payment" (014, 016, 025, 028, 049); supervisors sometimes close "Task has been completed by supervisor" (015, 018, 037).

**Humans and escalation.** The platform asks for review with "Please review manually", "Please check what’s happening" or "Email received from provider, but expected data could not be extracted. Please review manually." (016, 031, 046). Platform faults go to the Slack "PM questions channel" with "Reason: Other. Comment: Held due to system issues." (002). A landlord's delay complaint produced only a colleague's hold telling the PM to chase (036).

**Auto mode.** The platform sends notices, reminders, confirmations and SMS, and runs timed waits. An inbound message pauses it: "Please check if we need to provide a response to provider. If not, please return this request to auto mode." (37 cases; landlord and tenant variants). Returning to auto means no reply is needed; otherwise reply and set a hold. "Manually updated via Change Mode" marks manual changes; "Resumed auto waiting for provider visit date (5 days)" follows a manual chase (030). "Validation: (Priority cannot be decreased to 5. Current priority is 6.)" is harmless.

## 3. Message templates

Manual emails open "Address: <property address>", sometimes under "Job Id: NBL-027-8010" (003, 007, 027, 039, 050), then "Hi <first name>," or "Good morning,", often "I hope you are well.", a short body, and "Kind regards" or "Many thanks" plus the PM's first name.
- Tenant holding (028, 033): "Thank you for your repair request, we have sent the information to your landlord asking permission on how to proceed. We will be in further contact as soon as possible."
- Landlord quote (002, 033): "Please find attached a quote for this property. Can you please advise if you approve for me to raise an order for these works."
- Contractor go-ahead (011): "We have just heard from the landlord and we have the go ahead so please can you arrange for the work to be completed."
- Landlord completion (050): "Just to make you aware that the window repair is now complete. Please see attached invoice for your record. I will process on my side as normal."
- Tenant closure warning (027): "Should we not hear back from you within the next 24hrs, this maintenance request will be closed down."

Never hand-write platform templates ("Our maintenance provider <X> will be attending your property…", "This is a friendly reminder that we are awaiting the confirmation…", "We are providing the confirmed appointment details…").

SMS only points to email or confirms a slot: "Hello, this is Northbridge Lettings! Please check your email regarding the property at <address>." (with each contractor email); "Hello, this is Northbridge Lettings! Your <type> appointment is scheduled for <slot>. To reschedule call <number>"; chase: "…REMINDER to please check your email regarding a <issue> at <address>. Your prompt response will greatly be appreciated. Kindest regards." (023, 027).

## 4. Roles and channels

- "Agency / system" is the platform plus staff acting in it, "Northbridge Lettings" is staff, and "Northbridge Lettings system" is automated sends; all three write notes, holds and emails. "Contractor", "Maintenance provider" and named firms are one role. To "Not specified", "Internal" or "staff" means an internal record.
- Email: external messages; inbound mail is often stored as a third-person summary ("The customer confirms…").
- Update: workflow and automation events.
- Hold: "Put on hold by <name>. Reason: <Waiting for Provider | Waiting for Landlord | Waiting for Tenant | Other>. Comment: <next check>", or free text phrased as the next check ("Has Sawyer confirmed a start and completion date? If not, chase.", 006). Expired holds are re-set; overruns trigger "Paused automatically: exceeded visit/move-out/hold deadline by 2 days" (002).
- Note: intake, pasted off-platform emails, call outcomes, skip reasons.
- Call: a one-line summary, not a transcript ("The agent informs the caller that the call may be recorded for training and monitoring purposes."), often IVR noise; only 038 has speaker lines. Staff log the outcome in a Note (009, 014).
- SMS: outbound only.
- Synthetic noise: SMS brand names, in-body addresses and some dates are inconsistent; use the case's address and "Northbridge Lettings".

## 5. Exception patterns

- **Provider silent:** reminders, then "3+ reminders have been sent to provider. Please check what’s happening." (006, 018, 030), then a manual email ("Can you make contact with the tenants please and get this job booked in.", 030) or call (025). No report after a visit: "No work results; we need to check what is happening", answered with "Please could you update me on this job and if it is completed please send me your invoice." (036). Provider on leave: hold until return (029, 036). No slow contractor was replaced.
- **Landlord silent:** after "No landlord/tenant response after 3 days. Please review manually.", resend (016), SMS (023, 043) or phone (019, 041), and tell the tenant you are chasing (019). Quoted work never proceeded unapproved.
- **Tenant silent:** weekly chase (009); 24-hour closure warning plus SMS (027); "Please can you confirm if you have fixed this issue yourself so that I can close the job off the system." (049); SMS asking the tenant to ring the contractor back (023).
- **Quote vs invoice:** explain lower invoices ("the tap didn't need replacing", 008); re-approve higher revised quotes ("I know this is a large quote so please let me know your thoughts.", 019); clarify VAT (008).
- **Partial works:** landlords approve part (019, 045) or are offered a smaller scope (005).
- **Chargeable visits and responsibility:** warn before sending anyone (012, 027); see §2.
- **Duplicates:** link to the landlord's existing job ("Bit of a duplicate here…", 001); edit the description for add-ons (034); drop self-fixed items and rename (047).
- **Landlord's contractor or warranty:** hold "Waiting for Landlord", chase the landlord rather than the contractor, get tenant consent before sharing contact details (045), close without payment on confirmation (025, 028, 041, 047).
- **Recovery:** misdirected email resent to the right party (005); "Sorry, please see attached" (046); "apologies - if Keystone Compliance have confirmed a date with you - please take that as the date" (026); "Provider missed the confirmed date so now going tomorrow." (030); contractor without portal access noted and stages back-filled (019); faulty earlier repair redone free with an apology (036).

## 6. Timing norms

- First action within 2 days (outliers 012, 044); landlords usually reply within hours.
- The system flags landlord or tenant silence at 3 days; staff chase at 3–7 days.
- Contractor reminders begin 1–3 days after assignment; "3+ reminders" fires around day 3–9; "No work results" 2–3 days after the visit; tenant SMS on the visit day or the day before.
- Holds are re-set every 2–7 days, weekly on long waits (045, 047).
- Durations: attend-and-fix 2–14 days, quoted work 2–4 weeks, landlord-contractor jobs up to 3.5 months.
- Timestamps are UTC and synthetic; no working-hours rule is evidenced.

## 7. Ten "if X then Y" rules

1. New tenant repair, no recorded approval → ask landlord (our contractor or theirs?), tenant holding email, hold "Waiting for Landlord" (016, 028, 046).
2. Drain blockage or likely user error → self-help email; engineer only if it still fails (012, 024, 027).
3. Landlord says go ahead → approval confirmed, assign provider, hold "Waiting for Provider" (026, 042, 048).
4. Landlord uses own contractor → hold "Waiting for Landlord", chase landlord every 1–2 weeks, close without payment when confirmed (028, 045).
5. Contractor quotes extra work → figure to landlord, wait; a 👍 reply counts as yes (011, 032, 046).
6. Quote approved → thank landlord, tell contractor to go ahead, hold "Waiting for Provider" (011, 046, 050).
7. No landlord reply in 3 days → resend, SMS or phone; update tenant (016, 019, 043).
8. "3+ reminders" or visit passed without report → chase contractor for a date, or an update plus invoice (030, 036).
9. Work done → with invoice: landlord email, final checks, close same day (007, 042, 050); without: "Hold for invoice" (008, 031).
10. Thanks or acknowledgement needing no answer → return to auto mode, send nothing (017, 030, 042).

## 8. What a naive agent gets wrong

1. Approving small quotes itself; even £35–£95 went to the landlord (011, 046, 050).
2. Closing at the wrong time: never before completion and invoice (008, 031); keep landlord-contractor jobs open "until its finished" (045); but don't wait for payment confirmation, which arrives after closure (003, 008, 034).
3. Hand-writing platform messages or replying to every inbound message.
4. Sending contractors to tenant-responsibility issues, or lecturing tenants about landlord repairs; ask the cause when unclear (012, 027, 029).
5. Wrong channel or party: content in SMS, chasing the landlord's contractor, sharing tenant numbers without consent (045), escalating routine delay. The PM chases; Slack is for system faults (002).
