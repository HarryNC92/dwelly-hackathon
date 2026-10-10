# Landlord-agency contract inferences from the Property Management cases

This note is an inference from the public Dwelly Property Management practice cases. It is not an actual contract, legal advice, or evidence that these terms exist in a signed landlord-agency agreement. The dataset does not include landlord management agreements, terms of business, rent collection mandates, privacy notices, or contractor framework agreements.

For the operational rules that should be applied to new, unseen triage cases, see `generalised-triage-rules.md`. This file is the supporting interpretation; the generalised rule set is the agent policy.

What it does include is a repeated operating pattern. Across the cases, Northbridge Lettings behaves as a property management agent with limited delegated authority: it can triage, coordinate, communicate, chase, document and close maintenance requests, but landlord approval remains the key control point for dispatching contractors, approving quoted works, choosing who does the work, and deciding some cost/liability questions.

## High-level inferred relationship

Northbridge Lettings appears to act as the landlord's property management agent for maintenance administration. The landlord remains the principal decision-maker for material maintenance decisions unless a specific instruction or pre-authorisation has been given.

The agency can:

- receive and classify tenant maintenance requests;
- ask clarifying questions and request photos or access information;
- notify the landlord and ask for instructions;
- place the request on hold while waiting for landlord, tenant or provider responses;
- assign a contractor after landlord approval;
- share tenant contact details with the assigned contractor when needed for an authorised job;
- schedule visits, send reminders, chase providers and communicate appointment details;
- collect quotes, photos, completion reports and invoices;
- process close-out checks, including landlord confirmation, invoice/document upload and key return.

The agency generally cannot infer blanket authority to spend money, authorise quoted works, choose an alternative scope, or override the landlord's preferred route. Where the landlord wants to use their own contractor, do the work themselves, defer work, ask for another quote, or let the tenant fix it, the agency follows that path.

## Inferred terms

### 1. Landlord approval is required before contractor dispatch

The clearest inferred term is that the agency should not send a contractor until the landlord has approved provider selection or contractor attendance. The case histories repeatedly contain system states such as:

- "Please complete landlord approval step first"
- "Please approve selection of provider and category"
- "Waiting for landlord/tenant response before provider selection (3 days)."
- "Landlord approval confirmed. Proceed to provider selection."

The agency's outbound emails commonly ask the landlord whether they are happy for a contractor to attend or whether they want to use their own contractor. This implies that initial dispatch is not automatically within the agency's unilateral authority.

Examples:

- Case 011: the agency asks whether the landlord is happy for a dishwasher contractor to inspect, waits after no response, then only assigns Oakfield Homes after the landlord replies "Yes please go ahead" and the system records landlord approval.
- Case 016, 021, 030, 034, 036, 046, 050 and others follow the same pattern: landlord approval precedes provider selection.
- Case 043 is a red-flag counterexample: the request is put on hold waiting for the landlord, but a provider is assigned before the landlord's approval email appears.

### 2. Dispatch approval and works approval are different approvals

Approval to send a contractor is not the same as approval to carry out quoted works. The standard contractor template asks the provider to arrange a visit or provide a quote, and says that if a quote is required the provider should only proceed after receiving agency approval.

That strongly implies a two-stage authority model:

- landlord approves initial attendance, triage or quote;
- landlord separately approves quoted or non-trivial work before the contractor proceeds.

Examples:

- Case 011: landlord approves inspection first; later the provider quotes for a replacement dial and the case is held "waiting for authorisation".
- Case 033: landlord approval is recorded before provider assignment, and later "Quote was approved by landlord" appears before follow-on works.
- Case 046: the index records that the landlord approved a contractor visit and later approved a quoted hinge replacement.
- Case 048 is a red-flag counterexample: the provider reports the repair complete before the quote approval event, and the provider also refers to the wrong property address.

### 3. There is no visible standing spending limit

The dataset does not reveal a spend threshold under which the agency can freely approve work. Small amounts are still discussed with landlords in some cases, and large quotes are plainly sent for approval.

Observed quote or cost examples range from low amounts to major works, including roughly GBP 35, GBP 65, GBP 75, GBP 90, GBP 95, GBP 172.51, GBP 198.37, GBP 600, GBP 605 and GBP 1,370-1,700, often plus VAT. The important inference is not the exact amounts, but the pattern: quote approval depends on landlord instruction rather than a visible automatic authority limit.

The only softer exception is conditional pre-authorisation. A landlord can authorise an "easy and cheap" fix while requiring a quote if parts, complexity or higher cost appear. That should be treated as narrow authority, not blanket permission.

### 4. The landlord controls the route: agency contractor, landlord contractor, DIY, tenant action or no action

The landlord appears to retain choice over how the issue is handled. They may approve the agency's contractor, request another quote, use their own contractor, do the work themselves, allow the tenant to resolve it, or suggest a workaround.

Examples:

- Case 008: landlord asks for a second quote before deciding which contractor to use.
- Case 045: landlord arranges their own contractor; the agency waits, coordinates, and only passes tenant details after tenant authorisation.
- Case 001 and 030: landlord pays the contractor directly.
- Case 014 and 017: landlord suggests a workaround or self-handling route.
- Case 038 and 049: tenant action is approved instead of contractor works.

This implies the agency is not merely optimizing for fastest repair. It is implementing the landlord's instruction within the constraints of safety, tenancy responsibility and evidence.

### 5. Payment authority is variable and must be explicit

The cases show multiple payment paths:

- landlord pays by deduction from rent;
- landlord pays the contractor directly;
- tenant pays or may be billed where the issue is tenant responsibility;
- no payment is due for warranty work, self-fix, landlord contractor or tenant fix.

The agency sometimes tells the landlord that an invoice will be deducted from rent or processed through the rental amount, but that should not be treated as blanket authority. Deducting from rent is a sensitive financial act and should be tied to explicit landlord approval or a clear existing route in the case.

Examples:

- Case 013: agency says the dishwasher repair invoice will come from rent.
- Case 018 and 019: agency says garden maintenance will be invoiced or deducted from rent.
- Case 001 and 030: landlord pays the contractor directly.
- Case 027: internal drain blockage is framed as tenant responsibility; a contractor visit could be billed to the tenant if the cause is tenant-related.

### 6. Tenant responsibility can change the decision path

The agency sometimes determines that an issue sits with the tenant, or at least warns the tenant that cost may fall to them.

Examples:

- Case 027: internal drains and everyday-use blockages are described as tenant responsibility under the tenancy terms; tenant is advised to try drain cleaner/plunger before a chargeable contractor visit.
- Case 038: tenant-supplied replacement washing machine remains the tenant's property and liability, with landlord approval for the arrangement and possible removal cost.
- Checkout cleaning, end-of-tenancy damage, garden upkeep and unnecessary call-outs can shift cost away from the landlord depending on the facts.

For an agent, this means "tenant reported it" does not automatically mean "landlord pays"; liability needs to be reasoned from the issue type, tenancy context and landlord/tenant responses.

### 7. Tenant contact details are controlled information

Tenant contact details are shared with contractors only in the context of an authorised job. Where the landlord's own contractor is involved, the agency seeks tenant authorisation before passing details on.

Example:

- Case 045: the landlord's contractor asks for contact details, and the agency records that it called the tenants to get authorisation before sharing those details.

This implies a privacy/data-sharing term: contact information should be disclosed only when necessary for the maintenance purpose and only to the authorised contractor or with tenant consent where the contractor is outside the normal agency assignment flow.

### 8. The agency has some access and key-management authority, but close-out requires checks

The agency can coordinate access and sometimes use a management key, at least for inspections. It also has duties around key return when contractors have keys.

Examples:

- Case 020: the inspection notice says the agency will access using the management key if the tenant is not present.
- Multiple close-out flows include "We need to check the key return before completing the request" followed by "Keys return confirmed."

This suggests the agency has operational custody/access powers, but those powers come with audit obligations.

### 9. Documentation is part of the agency's duty

The agency is expected to preserve or upload relevant documents: quotes, photos, invoices, inspection reports and completion evidence. Closing a case often requires either the documents or a reason for skipping them.

Repeated close-out strings include:

- "Request marked as completed, lets do the final checks"
- "Need confirmation from landlord"
- "Skipped uploading one or more documents. Reason provided: ..."
- "We need to check the key return before completing the request"
- "All checks have been completed; the request is now closed"

This implies the agency's contractual role is not only to arrange work, but to maintain an auditable record for the landlord.

### 10. Safety does not create clear spend authority in the public data

Some cases involve possible safety or habitability issues: water near electrics, security, scalding, broken glass, non-locking doors, windows near stairs. The dataset supports urgent escalation, but it does not show a clear contractual emergency spending authority or emergency threshold.

For our purposes, urgent safety issues should override routine workflow timing, but the safe inference is "escalate to human/on-call manager/landlord urgently" rather than "the agent may approve spend unilaterally."

## Practical contract model for the agent

The agent should behave as if the implied contract says:

1. Northbridge Lettings is authorised to administer maintenance requests on the landlord's behalf.
2. The agency may communicate with tenants, landlords and contractors to gather information and coordinate approved work.
3. The agency must obtain landlord approval before contractor dispatch unless the current case contains explicit pre-authorisation or a documented exceptional process.
4. The agency must obtain a second approval for quoted works, scope changes, parts, higher-than-expected costs or liability disputes.
5. The agency must respect the landlord's right to choose their own contractor, request more quotes, defer work or approve tenant/self-fix routes.
6. The agency may share tenant contact details only with the authorised contractor for the maintenance purpose, or with tenant consent for landlord-selected contractors.
7. The agency should not deduct costs from rent, bill a tenant, or tell a contractor to proceed unless the payment route and approving party are clear.
8. The agency must preserve documents, invoices, quote evidence, completion evidence and key-return confirmation before closing.
9. Conflicting addresses, names, dates, amounts or scope should pause the workflow and trigger manual review before any outbound message.
10. Safety issues require urgent escalation, but the dataset does not prove unilateral emergency spending authority.

## Unknowns

The dataset does not tell us:

- whether Northbridge Lettings has a written emergency repair authority;
- whether any landlord gave a standing spending limit outside these logs;
- whether rent deduction is generally pre-authorised by the management agreement;
- whether all properties are fully managed or some are let-only with ad hoc maintenance support;
- whether the contractor template is a contractual term or just an operational instruction;
- what GDPR/data-processing terms govern tenant contact sharing;
- whether the agency can bind the landlord to contractor terms.

Because those facts are absent, the agent should default to conservative authority checks and explicit approvals.
