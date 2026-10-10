# Triage rules for new maintenance cases (Harry, derived from the public cases)

Operational policy for triage and next-action selection on unseen cases. Evidence: the public Dwelly Property Management cases. Companion notes: `landlord-agency-contract-inferences.md` (to be added by Harry).

## Goal
Given a maintenance case so far, choose one safe next action: send a message; request approval; assign or chase a provider; hold and wait; escalate to a human or on-call manager; close if close-out requirements are complete; do nothing yet because the correct timer has not expired. The answer should include the action, recipient, message or instruction where relevant, and the reasons and evidence used.

## Required state extraction
Minimum state fields: property_address; occupancy_status (tenanted, not tenanted, unknown); reported_issue; safety_risk (none, possible, urgent, unknown); tenant_liability_possible (yes, no, unknown); landlord_dispatch_approval (approved, denied, pending, conditional, unknown); provider_assignment (none, assigned, landlord_own_provider, tenant_own_provider, unknown); quote_status (none, requested, received, sent_to_landlord, approved, rejected, second_quote_requested, unknown); work_status (not_started, visit_scheduled, visit_completed, work_completed, disputed, unknown); payment_route (landlord_rent_deduction, landlord_direct, tenant_chargeable, warranty_or_free, unknown); data_conflicts (address, name, phone, date, amount, scope or attachment conflicts); current_hold_reason (landlord, tenant, provider, other, none); timers (pending landlord/tenant/provider deadlines, reminder count, visit date, close warning); documents (quotes, invoices, photos, inspection reports, completion evidence, missing or unavailable); keys_or_access (keys issued, key return needed, access confirmed, access unknown). Unknown stays unknown; never filled from later outcomes or assumptions.

## Rule precedence
1 Safety, security and habitability. 2 Data conflicts and privacy. 3 Occupancy and access. 4 Landlord authority and approval gates. 5 Tenant liability and payment route. 6 Workflow stage and timers. 7 Close-out requirements. A higher rule blocks lower automation; on conflict choose the safer action: hold, escalate, or ask for explicit approval.

## Core rules
- PM-GEN-001 Use only the case so far. Later outcomes are for evaluation only.
- PM-GEN-002 Output one primary next action. Valid types: message_landlord, message_tenant, message_provider, request_clarification, assign_provider, request_landlord_approval, request_quote, hold_waiting_for_landlord, hold_waiting_for_tenant, hold_waiting_for_provider, escalate_human_review, escalate_safety, close_without_payment, close_after_final_checks, no_action_timer_not_expired.
- PM-SAFE-001 Safety overrides routine workflow: immediate safety, security, water damage, electrical risk, scalding, broken glass, non-locking external doors, dangerous stairs or window conditions, unsafe appliance installation, active leak or worsening structural risk. Default: escalate_safety, preserving landlord approval requirements where possible, never quietly waiting out routine timers.
- PM-SAFE-002 Do not close with unresolved safety risk. Default: escalate_human_review. Closing needs a clear completion report, the issue resolved, documents or a reason, key and access checks complete.
- PM-DATA-001 Property identity conflicts block outbound messages (contractor completion email for another address; landlord email about another property; reminder with unrelated addresses; quote or invoice address mismatch). Default: escalate_human_review.
- PM-DATA-002 Actor identity conflicts (names, phones) block sharing contact details, confirming appointments or approving works until the recipient is identified. Default: escalate_human_review or request_clarification.
- PM-DATA-003 Date and amount conflicts (impossible dates, inconsistent visit dates, invoice before visit, unclear VAT, changed quote amounts) block automatic approval, closure or payment. Default: escalate_human_review.
- PM-PRIV-001 Tenant contact details go to the assigned contractor on an authorised job; a landlord-selected contractor needs tenant consent unless the case already shows it. Default: message_tenant for permission, or escalate_human_review if urgent.
- PM-OCC-001 Not tenanted: no tenant appointment emails or access requests; use an agency access path. Default: escalate_human_review or hold_waiting_for_landlord.
- PM-AUTH-001 Landlord approval before provider dispatch, unless conditional pre-authorisation applies or a safety escalation is triggered. Approval may be a landlord message or the system state "Landlord approval confirmed. Proceed to provider selection." Default: request_landlord_approval or hold_waiting_for_landlord.
- PM-AUTH-002 Quote approval before quoted works; attendance for triage is not approval for the works. Quote received and unapproved: message_landlord with the details. Provider reports work done before approval: escalate_human_review.
- PM-AUTH-003 Conditional approval is narrow (simple, cheap, same visit, no parts). Parts, higher cost, changed scope or uncertain diagnosis need a quote or fresh approval. Default: message_landlord or request_quote.
- PM-AUTH-004 Respect the landlord's route: own contractor, second quote, defer, inspect personally, tenant or self-fix. Hold or coordinate that route; do not assign an agency provider, unless safety requires escalation.
- PM-LIAB-001 Likely tenant responsibility (internal drain blockage from normal use; checkout cleaning or damage; garden upkeep per tenancy; unnecessary call-out after declined troubleshooting; tenant-supplied appliance or alteration): warn or ask before arranging a chargeable contractor. Default: message_tenant explaining the possible charge, or escalate_human_review for disputed liability.
- PM-LIAB-002 Payment route explicit before financial action: no rent deduction, tenant billing, "invoice us" to a provider, or close-as-paid without a clear route. Default: escalate_human_review or message_landlord.
- PM-WORKFLOW-001 Waiting can be correct: timer not expired means no_action_timer_not_expired (approval requested within the wait period; provider under the reminder threshold; tenant within a 24-hour close warning).
- PM-WORKFLOW-002 Expired landlord or tenant timer is not approval. Default: escalate_human_review or a reminder message.
- PM-WORKFLOW-003 Provider silence after repeated reminders: escalate or review, not unlimited reminders.
- PM-WORKFLOW-004 Missed visits: never mark complete; chase the provider, update the tenant, escalate if repeated.
- PM-DOC-001 Completion requires evidence (completion report, invoice, photos, inspection report, landlord or tenant confirmation as appropriate). Default: message the party whose confirmation is missing, or escalate.
- PM-DOC-002 Missing documents need a recorded reason before close-out.
- PM-KEY-001 Key return confirmed before closing where keys were issued.
- PM-CLOSE-001 Close only when resolution is evidenced, payment route clear or none needed, landlord confirmation complete where required, documents uploaded or reason recorded, keys returned where relevant, and no safety risk, data conflict, liability dispute or open quote remains.

## Decision algorithm
Extract state; list safety risks; list data conflicts; check occupancy and access; determine the authority gate (before dispatch approval; after approval before visit; after visit before quote approval; after quote approval before completion; after completion before close-out); determine liability and payment route; check timers; check close-out requirements; select the highest-priority blocking rule; produce one next action and concise reasoning.

## Answer format for triage
ACTION, RECIPIENT (landlord, tenant, provider, human, none), MESSAGE_OR_INSTRUCTION, REASONING (current stage; blocking rule ids; evidence; unknowns or conflicts), CONFIDENCE (high, medium, low).

## Safe defaults when ambiguous
No dispatch without landlord approval; no approval of quoted works without the landlord; no tenant contact details to unauthorised recipients; no messages with conflicting property details; no closing safety cases without strong evidence; no payment authority inferred from silence; escalate when the next action could create spend, privacy, safety or tenancy liability.
