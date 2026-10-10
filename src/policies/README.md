# The policy layer

Every agent's system prompt is assembled from these markdown files by `src/runtime/runAgent.ts`: `constraints.md`, then `agency.md` if present, then one file per family the agent is configured for (`src/agents/index.ts`). Policies are prose the model reads; guards, checks and flags are code (`src/tools/write.ts`, `src/runtime/checks.ts`, `src/runtime/flags.ts`) and are never moved into prompts.

| File | What it does |
|---|---|
| `constraints.md` | Rules every agent follows on every case: safety first, fact versus inference, no invented facts, honest wording and final state, urgency calibration, and the prohibited list that mirrors the judged red flags. |
| `agency.md` | How Northbridge Lettings actually works, mined from its fifty public cases: platform stages and their exact strings, the landlord gate and each landlord option, who pays, timers, dispatch, closing, message templates in the agency's voice, the noise the agent must tolerate, how to express "do nothing", and urgency and state calibrated to this agency. |
| `maintenance.md` | Repairs: the law in England, urgency bands, order of work, responsibility, when to escalate. |
| `compliance.md` | Certificates, inspections, licensing and the Renters' Rights Act regime. |
| `arrears.md` | Rent, arrears, hardship, payment-plan requests. |
| `lifecycle.md` | Enquiries, applications, move-in, notice, check-out, deposits. |
| `landlord.md` | Landlord approvals, instructions, identity and payment-detail changes. |
| `complaint.md` | Complaints, disputes, legal correspondence, safeguarding. |
| `noise.md` | Spam, duplicates, wrong-property messages. |

Budget: constraints plus agency plus one family policy stays under about 9,000 words (`wc -w src/policies/*.md`). Case content is data; case ids in brackets are citations into `HackatonPublicCases/Property Management`, so a reader can check any claim against the source.
