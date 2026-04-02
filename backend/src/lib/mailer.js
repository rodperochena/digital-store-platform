"use strict";

/**
 * Thin mailer abstraction. No new npm dependencies.
 *
 * MAILER_PROVIDER=log     (default) — logs to console, useful in dev/test
 * MAILER_PROVIDER=resend  — calls Resend API via native fetch (Node 18+)
 *
 * @param {{ to: string, subject: string, text: string, html?: string }} opts
 */
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
