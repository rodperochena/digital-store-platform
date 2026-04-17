"use strict";

// Lib: mailer
// Thin email abstraction with two providers: "log" (default, dev/test) and "resend" (production).
// "log" provider never fails, which is exactly what we want in test — no mocked transport needed.
// Resend was chosen because it works with native fetch (Node 18+) and doesn't require an SMTP server.
// To add a new provider (SendGrid, Postmark, etc.), add a branch here — nothing else needs to change.

// Sends a single email. provider is read at call time so env changes mid-process take effect.
// @param {{ to: string, subject: string, text: string, html?: string }} opts
async function sendEmail({ to, subject, text, html }) {
  const provider = (process.env.MAILER_PROVIDER || "log").toLowerCase().trim();

  if (provider === "resend") {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error("RESEND_API_KEY is not set");

    const from = (process.env.MAILER_FROM || "noreply@example.com").trim();

    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ from, to, subject, text, html }),
    });

    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      throw new Error(`Resend API error ${resp.status}: ${body}`);
    }
    return;
  }

  // Default: log
  console.log(
    `[mailer:log] to=${to} subject="${subject}"\n${text}`
  );
}

module.exports = { sendEmail };
