"use strict";

// Lib: campaignSender
// Sends a marketing email campaign to all active store subscribers in small batches.
// Designed to be resumable: recipients are marked sent/failed individually in the DB, so
// if the process crashes mid-send, re-calling sendCampaign will pick up from where it left off.
// Batch size (10) and delay (200ms) exist to be polite to the email provider's rate limits.

const { sendEmail } = require("./mailer");
const { getStoreSettings } = require("../db/queries/stores.queries");
const { getCampaignById, prepareCampaignRecipients, getUnsentRecipients,
        markRecipientSent, markRecipientFailed, updateCampaignCounters,
        markCampaignSent, markCampaignFailed } = require("../db/queries/campaigns.queries");
const { createNotification } = require("../db/queries/notifications.queries");

const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 200;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildFrontendBase() {
  return (process.env.APP_BASE_URL || "http://localhost:5173").replace(/\/$/, "");
}

function buildBackendBase() {
  return (process.env.BACKEND_URL || "http://localhost:5051").replace(/\/$/, "");
}

function buildTrackingPixelUrl(trackingToken) {
  return `${buildBackendBase()}/api/track/open/${trackingToken}`;
}

function buildUnsubscribeUrl(unsubToken) {
  return `${buildFrontendBase()}/unsubscribe/${unsubToken}`;
}

/**
 * Builds the HTML email body for a campaign.
 */
function buildCampaignEmailHtml({ campaign, store, recipient }) {
  const accent    = store.primary_color || "#0d6efd";
  const storeName = store.name || "Your Store";
  const logoUrl   = store.logo_url || null;
  const trackingUrl = buildTrackingPixelUrl(recipient.tracking_token);
  const unsubUrl    = buildUnsubscribeUrl(recipient.unsubscribe_token);

  const logoHtml = logoUrl
    ? `<img src="${logoUrl}" alt="${storeName}" style="height:36px;object-fit:contain;display:block;margin-bottom:12px" />`
    : "";

  const previewHidden = campaign.preview_text
    ? `<span style="display:none;max-height:0;overflow:hidden;mso-hide:all">${campaign.preview_text}</span>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${campaign.subject}</title></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
${previewHidden}
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:32px 16px">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08)">
        <!-- Accent bar -->
        <tr><td style="background:${accent};height:4px"></td></tr>
        <!-- Header -->
        <tr><td style="padding:28px 32px 16px">
          ${logoHtml}
          <span style="font-size:18px;font-weight:700;color:#111827">${storeName}</span>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:0 32px 28px;font-size:15px;color:#374151;line-height:1.7">
          ${campaign.body_html}
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:16px 32px;border-top:1px solid #f3f4f6;background:#fafafa">
          <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.6">
            Sent by ${storeName} ·
            <a href="${unsubUrl}" style="color:#9ca3af;text-decoration:underline">Unsubscribe</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
  <!-- Tracking pixel -->
  <img src="${trackingUrl}" width="1" height="1" alt="" style="display:none" />
</body>
</html>`;
}

function buildCampaignEmailText({ campaign, store, recipient }) {
  const storeName = store.name || "Your Store";
  const unsubUrl  = buildUnsubscribeUrl(recipient.unsubscribe_token);
  const body      = campaign.body_text || campaign.body_html.replace(/<[^>]+>/g, "");

  return [
    `From: ${storeName}`,
    `Subject: ${campaign.subject}`,
    "",
    body,
    "",
    "---",
    `To unsubscribe: ${unsubUrl}`,
  ].join("\n");
}

/**
 * Send a campaign. Resumes from remaining pending recipients if called again after partial failure.
 */
async function sendCampaign(storeId, campaignId) {
  const campaign = await getCampaignById(storeId, campaignId);
  if (!campaign) {
    console.warn("sendCampaign: campaign not found", { storeId, campaignId });
    return;
  }

  // If still draft, prepare recipients first (sets status → 'sending')
  if (campaign.status === "draft") {
    const count = await prepareCampaignRecipients(storeId, campaignId);
    if (count === 0) {
      console.log("sendCampaign: no active subscribers, marking failed", { campaignId });
      await markCampaignFailed(campaignId);
      return;
    }
  } else if (campaign.status !== "sending") {
    console.warn("sendCampaign: campaign not in sendable state", { campaignId, status: campaign.status });
    return;
  }

  const store = await getStoreSettings(storeId);
  let totalSent = 0;
  let totalFailed = 0;

  while (true) {
    const recipients = await getUnsentRecipients(campaignId, BATCH_SIZE);
    if (recipients.length === 0) break;

    for (const recipient of recipients) {
      try {
        const html = buildCampaignEmailHtml({ campaign, store, recipient });
        const text = buildCampaignEmailText({ campaign, store, recipient });

        await sendEmail({
          to:      recipient.email,
          subject: campaign.subject,
          text,
          html,
        });

        await markRecipientSent(recipient.id);
        totalSent++;
      } catch (err) {
        await markRecipientFailed(recipient.id, err.message).catch(() => {});
        totalFailed++;
        console.warn("sendCampaign: failed to send to recipient", {
          campaignId,
          email: recipient.email,
          err: err.message,
        });
      }
    }

    await updateCampaignCounters(campaignId).catch(() => {});

    if (recipients.length === BATCH_SIZE) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  // Final counter update + mark campaign status
  await updateCampaignCounters(campaignId).catch(() => {});

  if (totalSent > 0) {
    await markCampaignSent(campaignId);
    createNotification(storeId, {
      type:     "system",
      title:    "Campaign sent",
      body:     `"${campaign.subject}" delivered to ${totalSent} subscriber${totalSent !== 1 ? "s" : ""}${totalFailed > 0 ? ` (${totalFailed} failed)` : ""}`,
      metadata: { campaign_id: campaignId, sent: totalSent, failed: totalFailed },
    }).catch(() => {});
  } else {
    await markCampaignFailed(campaignId);
    createNotification(storeId, {
      type:     "system",
      title:    "Campaign failed",
      body:     `"${campaign.subject}" could not be delivered to any subscribers`,
      metadata: { campaign_id: campaignId, failed: totalFailed },
    }).catch(() => {});
  }

  console.log("sendCampaign: complete", { campaignId, totalSent, totalFailed });
}

module.exports = { sendCampaign };
