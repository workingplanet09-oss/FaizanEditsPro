import { env } from "../env";
import { AppError } from "../errors";

export interface OutgoingEmail {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface SendResult {
  provider: string;
  id?: string;
}

/** Provider abstraction — swap Resend / Postmark / SendGrid with EMAIL_PROVIDER. `console` logs to the DB outbox only (demo mode). */
export async function sendViaProvider(m: OutgoingEmail): Promise<SendResult> {
  const { provider, apiKey } = env.email;
  if (provider === "console") return { provider: "console" };
  if (!apiKey) throw new AppError("NOT_CONFIGURED", `EMAIL_PROVIDER=${provider} requires EMAIL_API_KEY`);

  if (provider === "resend") {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ from: m.from, to: [m.to], subject: m.subject, html: m.html, text: m.text }),
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Resend error ${res.status}: ${json?.message ?? "unknown"}`);
    return { provider, id: json.id };
  }
  if (provider === "postmark") {
    const res = await fetch("https://api.postmarkapp.com/email", {
      method: "POST",
      headers: { "X-Postmark-Server-Token": apiKey, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ From: m.from, To: m.to, Subject: m.subject, HtmlBody: m.html, TextBody: m.text, MessageStream: "outbound" }),
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Postmark error ${res.status}: ${json?.Message ?? "unknown"}`);
    return { provider, id: json.MessageID };
  }
  if (provider === "sendgrid") {
    const fromMatch = m.from.match(/^(.*)<(.+)>$/);
    const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: m.to }] }],
        from: fromMatch ? { name: fromMatch[1].trim(), email: fromMatch[2].trim() } : { email: m.from },
        subject: m.subject,
        content: [
          { type: "text/plain", value: m.text },
          { type: "text/html", value: m.html },
        ],
      }),
    });
    if (!res.ok) throw new Error(`SendGrid error ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return { provider, id: res.headers.get("x-message-id") ?? undefined };
  }
  throw new AppError("NOT_CONFIGURED", `Unknown EMAIL_PROVIDER ${provider}`);
}
