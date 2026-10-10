# Northbridge Lettings operating conventions (mined from the 50 public cases)

Corpus: 40 tenant repairs, 9 agency-manager jobs (mostly checkout works), 1 automated inspection. Quotes are verbatim; bracketed numbers are case ids.

## 1. Workflow

**Tenant repair**
1. Intake: "Request description: …", sometimes with an "[AI Intake Classification]" whose category can be wrong (014, 042, 049).
2. Gate: "Please complete landlord approval step first" (25 cases) or "Please approve selection of provider and category" (15); under both, staff usually ask the landlord.
3. Within 2 days: landlord email, usually a tenant holding email, then hold "Reason: Waiting for Landlord. Comment: Held awaiting response from landlord." (025, 028).
4. Yes → "Landlord approval confirmed. Proceed to provider selection." → "Maintenance provider assigned" (platform emails both) → hold "Reason: Waiting for Provider. Comment: waiting for appointment to be booked" (011).
5. Contractor phones tenant → "Visit date selected - <dd/mm/yyyy hh:mm>" → platform confirmations and tenant SMS.
6. Quote from the visit → landlord approval → "Quote was approved by landlord" → contractor instructed (002, 033).
7. Done → invoice email to landlord → "Task has been moved to Result" → "Request marked as completed, lets do the final checks" → "Skipped uploading one or more documents. Reason provided: …" → "Need confirmation from landlord" → (keys issued) "Keys return confirmed" → "All checks have been completed; the request is now closed".

**Agency-initiated (checkout works, 003–008):** "Following the tenant vacating please provide an estimate to; …" → provider assigned at once → "Property is **NOT TENANTED** — moved to Paused" (resolve manually) → checkout report to contractor, hold "Hold for quote" → itemised quote to landlord, hold "Waiting for Landlord" → "Your quote for this job has been approved." → invoice to landlord → final checks.

## 2. Decision rules

**Self-fix first.** Blocked internal drains are the tenant's, with no landlord contact (027): "As per the terms of your tenancy, maintenance of internal drains—including clearing blockages caused by everyday use such as hair or soap build-up is the tenant’s responsibility." A contractor they request is billed to them "if the blockage is found to be due to tenant-related causes". For likely user error, send checks first "to rule out any obstruction and avoid the risk of being liable for an unnecessary call-out" (012; 024, 039). Unclear cause: ask ("Can you please advise how the hand basin became cracked?", 029). Tenant-offered fixes need the landlord's OK (038, 049).

**Landlord approval.** Ask first, offering their own contractor: "Please advise if you would like us to send one of our contractors to attend to this issue and resolve where possible (or quote if significant), or if you would prefer to deal with it yourself." (016, 032). Instructing without asking (013, 022, 030, 034) happened only on simple attend-and-fix jobs; require recorded standing authority.

**Quotes.** Every quote for further work went to the landlord, however small (011, 032, 046). No self-approval threshold appears; the only agency-approved estimate was a checkout clean (003). The first call-out runs under the initial yes ("a minimum of £65.00 + VAT", 041), with contractors told to fix "if is something easy and cheap to fix" and otherwise quote (043). Second quotes only at the landlord's request: "I assume you wish to proceed with the cheaper option?" (008).

**Invoices.** The completion email says who pays: the landlord ("Please pass this for payment.", 008) or the rent ("deduct it off the rental amount", 019). If the landlord pays the contractor direct, note it ("LL pays contractor directly", 030). Landlords confirm payment after closure ("Paid", 003; "Ok to pay", 008).

**Closing.** Close when the work is confirmed done (contractor, landlord or tenant) and any invoice is in hand; meanwhile hold "Comment: Hold for invoice" (008, 031, 042). Final checks: upload documents or give a skip reason, "Need confirmation from landlord" (a checklist step, not a wait: 003, 034), key return if keys were issued. No invoice: "Task has been completed without payment" (014, 016, 028).

**Humans.** Prompts ending "Please review manually" (016, 046) or "Please check what’s happening" (006, 030) need a person. Platform faults go to the Slack "PM questions channel"; a supervisor then closes ("Task has been completed by supervisor", 002).

**Auto mode.** The platform sends routine messages and runs timed waits. Any inbound message pauses it: "Please check if we need to provide a response to provider. If not, please return this request to auto mode." (also landlord and tenant variants). Return to auto means no reply is needed; otherwise reply and set a hold. "Validation: (Priority cannot be decreased…)" lines are harmless.

## 3. Message templates

Manual emails start "Address: <property address>" (sometimes under "Job Id: NBL-027-8010": 003, 027, 050), then "Hi <first name>," or "Good morning,", a short body, "Kind regards" and the PM's first name.
- Tenant holding (028, 033): "Thank you for your repair request, we have sent the information to your landlord asking permission on how to proceed. We will be in further contact as soon as possible."
- Landlord quote (002, 033): "Please find attached a quote for this property. Can you please advise if you approve for me to raise an order for these works."
- Contractor go-ahead (011): "We have just heard from the landlord and we have the go ahead so please can you arrange for the work to be completed."
- Landlord completion (050): "Just to make you aware that the window repair is now complete. Please see attached invoice for your record. I will process on my side as normal."

SMS only points to email or confirms a slot: "Hello, this is Northbridge Lettings! Please check your email regarding the property at <address>." and "Hello, this is Northbridge Lettings! Your <type> appointment is scheduled for <slot>. To reschedule call <number>". Chases say "REMINDER to please check your email…" (023, 027).

## 4. Roles and channels

- From "Agency / system", "Northbridge Lettings" and "Northbridge Lettings system" all mean the agency (staff or automation); "Contractor", "Maintenance provider" and named firms are one role; To "Not specified", "Internal" or "staff" is internal.
- Email is external; inbound mail is often a third-person summary ("The customer confirms…"). Update is a workflow or automation event. Note is internal (intake, pasted emails, call outcomes, skip reasons). SMS is outbound only.
- Hold: "Put on hold by <name>. Reason: <Waiting for Provider | Waiting for Landlord | Waiting for Tenant | Other>. Comment: <next check>", or free text phrased as the next check ("Has Sawyer confirmed a start and completion date? If not, chase.", 006).
- Call: a one-line summary, not a transcript ("The agent informs the caller that the call may be recorded…"), only 038 has speaker lines. Outcomes go in a following Note (009, 014).
- Ignore conflicting SMS brand names, in-body addresses and dates (synthetic noise).

## 5. Exception patterns

- **Provider silent:** "3+ reminders have been sent to provider. Please check what’s happening." (006, 018, 030) → manual email or call (025, 030). After "No work results; we need to check what is happening": "Please could you update me on this job and if it is completed please send me your invoice." (036). No slow contractor was replaced.
- **Landlord silent:** after "No landlord/tenant response after 3 days. Please review manually." resend (016), SMS (023, 043) or phone (019, 041), and tell the tenant (019).
- **Tenant silent:** weekly chases (009), ask whether they fixed it so the job can close (049), SMS asking them to ring the contractor (023).
- **Quote vs invoice:** explain a lower invoice (008, 050); re-approve a higher revised quote ("I know this is a large quote so please let me know your thoughts.", 019).
- **Partial works:** the landlord approves part (019, 045) or is offered less (005).
- **Responsibility and chargeable visits:** ask the cause (029); warn of charges before sending anyone (012, 027).
- **Duplicates:** link to the existing job ("Bit of a duplicate here…", 001), append add-ons to the description (034), drop self-fixed items (047).
- **Landlord's contractor or warranty:** hold "Waiting for Landlord", chase the landlord, get tenant consent before sharing their details (045), close without payment on confirmation (025, 028, 041).
- **Recovery:** resend a misdirected email or missing attachment (005, 046), apologise for a wrong date (026), rebook a missed visit (030).

## 6. Timing norms

- First action within 2 days (outliers 012, 044); landlords usually reply within hours.
- Silence is flagged at 3 days; staff chase at 3–7 days; holds are re-set every 2–7 days.
- Contractor reminders start 1–3 days after assignment; "3+ reminders" fires around day 3–9; "No work results" 2–3 days after the visit; tenant SMS on the visit day or the day before.
- Tenant deadline: "Should we not hear back from you within the next 24hrs, this maintenance request will be closed down." (027).
- Attend-and-fix 2–14 days; quoted work 2–4 weeks; landlord-contractor jobs up to 3.5 months.
- Timestamps are UTC and synthetic; no working-hours rule is evidenced.

## 7. Ten "if X then Y" rules

1. New repair, no recorded approval → ask landlord, tenant holding email, hold "Waiting for Landlord" (016, 028).
2. Drain or likely user error → self-help email; engineer only if still failing (012, 024, 027).
3. Landlord yes → approval confirmed, assign provider, hold "Waiting for Provider" (026, 048).
4. Landlord's own contractor → hold "Waiting for Landlord", chase every 1–2 weeks, close without payment (028, 045).
5. Contractor quotes extra → figure to landlord and wait; a thumbs-up emoji counts as yes (011, 032).
6. Quote approved → thank landlord, instruct contractor, hold "Waiting for Provider" (046, 050).
7. Landlord silent 3 days → resend, SMS or phone; update tenant (016, 019).
8. "3+ reminders" or visit unreported → chase contractor (date, or update and invoice) (030, 036).
9. Done with invoice → landlord email, final checks, close within hours (007, 042, 050); no invoice yet → "Hold for invoice" (008, 031).
10. Thanks or acknowledgement → return to auto mode, send nothing (017, 030, 042).

## 8. What a naive agent gets wrong

1. Approving small quotes; even £35–£95 went to the landlord (011, 046, 050).
2. Closing at the wrong time: before completion and invoice (008, 031) or while a landlord's contractor works (045), or holding open for payment confirmation (003, 034).
3. Hand-writing platform messages or answering every inbound message (017, 030).
4. Sending contractors to tenant-responsibility faults, or lecturing tenants on landlord repairs; ask the cause when unclear (012, 027, 029).
5. Wrong channel or party: content in SMS, chasing the landlord's contractor, sharing tenant numbers without consent (045), escalating routine delay; Slack is for system faults (002).
