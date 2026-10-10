import crypto from "node:crypto";

/**
 * Twilio messaging transport (WhatsApp sandbox or SMS). Demo path only: the judged run never loads this.
 * Env: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM (e.g. whatsapp:+14155238886), TWILIO_FROM_NUMBER for SMS.
 */
export async function sendMessage(channel: string, to: string, body: string): Promise<{ ok: boolean; sid?: string; error?: string }> {
  const sid = process.env.TWILIO_ACCOUNT_SID, token = process.env.TWILIO_AUTH_TOKEN;
  const whatsapp = channel === "whatsapp";
  const from = whatsapp ? process.env.TWILIO_WHATSAPP_FROM : process.env.TWILIO_FROM_NUMBER;
  if (!sid || !token || !from) return { ok: false, error: "messaging transport not configured" };
  try {
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: { Authorization: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64") },
      body: new URLSearchParams({ From: from, To: whatsapp ? `whatsapp:${to.replace(/^whatsapp:/, "")}` : to, Body: body.slice(0, 1500) }),
      signal: AbortSignal.timeout(10_000),
    });
    const j: any = await r.json().catch(() => ({}));
    return r.ok ? { ok: true, sid: j.sid } : { ok: false, error: `HTTP ${r.status}: ${j.message ?? ""}` };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/** X-Twilio-Signature: base64 HMAC-SHA1 of the full public URL followed by the sorted form params (key+value). */
export function validTwilioSignature(publicUrl: string, params: URLSearchParams, header: string | undefined): boolean {
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token || !header) return false;
  const data = publicUrl + [...params.keys()].sort().map((k) => k + (params.get(k) ?? "")).join("");
  const expected = crypto.createHmac("sha1", token).update(data).digest("base64");
  return expected.length === header.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(header));
}
