# Voice escalation: brief for Vedaant

What you are building tonight: when our case engine decides a case is a P0 emergency, it places an outbound phone call to the on-call property manager (Jeremy's mobile for the demo). An ElevenLabs agent reads a short summary, asks for one decision, and the decision comes back to our backend. That is the whole feature. One rule from the review: during the Reality Test the engine fires the call and moves on. It never waits for an answer and never changes a case based on the call. The decision flowing back into the case is a demo path we show on training cases, so the webhook matters for the video, not for the scored run.

## The contract with the backend

Our app (Next.js API routes, deployed on Vercel or local with a Cloudflare tunnel, URL to follow) exposes:

- `GET /api/cases/{case_id}` returns the handover pack as JSON: `summary`, `property`, `tenant_name`, `options` (list of allowed decisions), `deadline`.
- `POST /api/escalations` with `{case_id, to_number}` is what the engine's escalate tool calls. It is our side, you do not need it, but it is what will trigger your agent.
- `POST /api/webhooks/elevenlabs` receives the post-call webhook. We parse `analysis.data_collection_results.decision.value` and `conversation_initiation_client_data.dynamic_variables.case_id` and write them into the case.

Until the app is up, the backend side is just a curl or a short script that calls the outbound-call endpoint with hardcoded dynamic variables. Any language, it is one HTTP POST. Build against that first.

## Build steps

1. Phone number. Import a Twilio number into ElevenLabs via the dashboard Phone Numbers tab (label, number, Twilio SID, auth token or API key). A Twilio trial account only calls verified numbers, plays a trial message first and is restricted to the sign-up country, so upgrade the Twilio account tonight and enable the UK under Voice Geo Permissions. A UK local number needs an address bundle that may take days, so use whatever number is fastest to provision and dial out to a UK mobile. Verified caller IDs can also be imported for outbound-only use. Docs: https://elevenlabs.io/docs/eleven-agents/phone-numbers/twilio-integration/native-integration and https://www.twilio.com/docs/usage/trials

2. Agent. Create it in the dashboard. LLM: `claude-haiku-4-5` (low latency, it is a scripted call). Prompt uses dynamic variables with `{{double_braces}}`:

   First message: "Hi, this is the Dwelly operations assistant calling about an urgent case at {{property}}. Do you have thirty seconds?"

   System prompt, in short: you are calling the on-call manager about case {{case_id}}. Summary: {{summary}}. Ask them to choose one of: {{options}}. Confirm the choice back in one sentence. Do not negotiate, do not give legal or financial advice, do not promise anything to tenants. If they cannot decide, say you will mark it undecided and a colleague will follow up. Then end the call.

   Make sure `end_call` is enabled as a system tool (dashboard agents get it by default). Docs: https://elevenlabs.io/docs/eleven-agents/customization/personalization/dynamic-variables

3. Decision capture without a mid-call tool. In the agent's analysis settings add a data collection field:
   `decision` (string): "One of: approve_contractor, attend_self, call_tenant, undecided. Return undecided if no clear choice was made."
   Optionally `spend_limit` (number): "Any spend limit the manager stated, in GBP, else null."
   Docs: https://elevenlabs.io/docs/eleven-agents/customization/agent-analysis/data-collection

4. Post-call webhook. Settings, Webhooks, add a `post_call_transcription` webhook pointing at our app URL `/api/webhooks/elevenlabs`. Keep the signing secret, we verify the `ElevenLabs-Signature` header (HMAC over the raw body; the official SDK has a helper). Receiver must return 2xx quickly; a 4xx stops retries. Also register `call_initiation_failure` so an unanswered call is recorded as "no answer" and the case stays escalated. Docs: https://elevenlabs.io/docs/eleven-agents/workflows/post-call-webhooks

5. Trigger the call. Raw HTTP is enough (the `elevenlabs` npm or pip package also works):

```
POST https://api.elevenlabs.io/v1/convai/twilio/outbound-call
xi-api-key: <key>

{
  "agent_id": "agent_xxx",
  "agent_phone_number_id": "phnum_xxx",
  "to_number": "+447700900123",
  "conversation_initiation_client_data": {
    "dynamic_variables": {
      "case_id": "C-1042",
      "property": "Flat 3, 12 Rose Street",
      "summary": "Tenant reports water coming through the kitchen ceiling, active leak, electrics nearby. Landlord authority is £250, emergency plumber quote is £400.",
      "options": "approve the emergency plumber up to £400, attend yourself, or ask us to call the tenant back"
    }
  }
}
```

   Response contains `conversation_id` and `callSid`. Docs: https://elevenlabs.io/docs/api-reference/twilio/outbound-call

## Test plan

Call Jeremy's phone with the hardcoded payload, answer "approve the plumber", confirm the webhook arrives with `decision = approve_contractor`. Then call and say nothing useful, confirm `undecided`. Then do not answer, confirm the failure webhook. That is done.

## What to tell Jeremy when finished

Agent id, phone number id, the webhook secret (put it in the shared env file, never in the repo), and the three test results.

## Secrets

ElevenLabs key, Twilio credentials and the webhook secret go in `.env` which is gitignored. The repo is public under Apache 2.0.
