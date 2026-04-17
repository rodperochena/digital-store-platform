"use strict";

// Queries: email campaigns
// Campaign lifecycle management: draft → sending → sent/failed.
// campaign_recipients is populated by prepareCampaignRecipients (snapshot of active subscribers at send time).
// markRecipientOpened returns campaignId so the tracking route can update counters in one go.

const { pool } = require("../pool");
const crypto   = require("crypto");

function genTrackingToken() {
  return crypto.randomBytes(16).toString("hex");
}

function genUnsubToken() {
  return crypto.randomBytes(24).toString("hex");
}

// ── Create ─────────────────────────────────────────────────────────────────────

async function createCampaign(storeId, { subject, preview_text, body_html, body_text }) {
  const { rows } = await pool.query(
    `INSERT INTO email_campaigns (store_id, subject, preview_text, body_html, body_text)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [storeId, subject, preview_text || null, body_html, body_text || null]
  );
  return rows[0];
}

// ── Get by ID ─────────────────────────────────────────────────────────────────

async function getCampaignById(storeId, campaignId) {
  const { rows } = await pool.query(
    `SELECT * FROM email_campaigns WHERE id = $1 AND store_id = $2 LIMIT 1`,
    [campaignId, storeId]
  );
  return rows[0] ?? null;
}

// ── List ──────────────────────────────────────────────────────────────────────

async function listCampaigns(storeId, { limit = 50, offset = 0 } = {}) {
  const { rows } = await pool.query(
    `SELECT * FROM email_campaigns WHERE store_id = $1
     ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
    [storeId, limit, offset]
  );
  const { rows: countRows } = await pool.query(
    `SELECT COUNT(*) AS total FROM email_campaigns WHERE store_id = $1`,
    [storeId]
  );
  return { campaigns: rows, total: parseInt(countRows[0].total, 10) };
}

// ── Update (draft only) ───────────────────────────────────────────────────────

async function updateCampaign(storeId, campaignId, { subject, preview_text, body_html, body_text }) {
  const current = await getCampaignById(storeId, campaignId);
  if (!current) return null;
  if (current.status !== "draft") {
    const err = new Error("Only draft campaigns can be edited");
    err.statusCode = 409;
    throw err;
  }

  const allowed = { subject, preview_text, body_html, body_text };
  const sets = [];
  const vals = [];
  let i = 1;
  for (const [key, val] of Object.entries(allowed)) {
    if (val !== undefined) {
      sets.push(`${key} = $${i++}`);
      vals.push(val ?? null);
    }
  }
  if (sets.length === 0) return current;

  sets.push(`updated_at = NOW()`);
  vals.push(campaignId, storeId);

  const { rows } = await pool.query(
    `UPDATE email_campaigns SET ${sets.join(", ")} WHERE id = $${i} AND store_id = $${i + 1} RETURNING *`,
    vals
  );
  return rows[0] ?? null;
}

// ── Delete (draft or failed only) ─────────────────────────────────────────────

async function deleteCampaign(storeId, campaignId) {
  const current = await getCampaignById(storeId, campaignId);
  if (!current) return { deleted: false, reason: "NOT_FOUND" };
  if (!["draft", "failed"].includes(current.status)) {
    return { deleted: false, reason: "INVALID_STATUS" };
  }
  const { rowCount } = await pool.query(
    `DELETE FROM email_campaigns WHERE id = $1 AND store_id = $2`,
    [campaignId, storeId]
  );
  return { deleted: rowCount > 0, reason: null };
}

// ── Prepare recipients ────────────────────────────────────────────────────────

async function prepareCampaignRecipients(storeId, campaignId) {
  // Ensure unsubscribe tokens exist on all active subscribers (back-fill if missing)
  await pool.query(
    `UPDATE store_subscribers
     SET unsubscribe_token = encode(gen_random_bytes(24), 'hex')
     WHERE store_id = $1 AND is_active = true AND unsubscribe_token IS NULL`,
    [storeId]
  );

  // Get active subscribers
  const { rows: subs } = await pool.query(
    `SELECT id, email, unsubscribe_token FROM store_subscribers
     WHERE store_id = $1 AND is_active = true`,
    [storeId]
  );

  if (subs.length === 0) return 0;

  // Insert recipient rows (skip if already exist for idempotency)
  const insertValues = subs.map((sub) =>
    `('${campaignId}', '${sub.id}', '${sub.email.replace(/'/g, "''")}', '${genTrackingToken()}')`
  ).join(",\n");

  await pool.query(
    `INSERT INTO email_campaign_recipients (campaign_id, subscriber_id, email, tracking_token)
     VALUES ${insertValues}
     ON CONFLICT DO NOTHING`
  );

  // Update campaign status + recipient_count
  await pool.query(
    `UPDATE email_campaigns
     SET status = 'sending', recipient_count = $1, updated_at = NOW()
     WHERE id = $2`,
    [subs.length, campaignId]
  );

  return subs.length;
}

// ── Get next unsent batch ─────────────────────────────────────────────────────

async function getUnsentRecipients(campaignId, batchSize = 10) {
  const { rows } = await pool.query(
    `SELECT ecr.id, ecr.email, ecr.tracking_token,
            ss.unsubscribe_token
     FROM   email_campaign_recipients ecr
     JOIN   store_subscribers ss ON ss.id = ecr.subscriber_id
     WHERE  ecr.campaign_id = $1 AND ecr.status = 'pending'
     LIMIT  $2`,
    [campaignId, batchSize]
  );
  return rows;
}

// ── Mark recipient sent / failed ──────────────────────────────────────────────

async function markRecipientSent(recipientId) {
  await pool.query(
    `UPDATE email_campaign_recipients
     SET status = 'sent', sent_at = NOW()
     WHERE id = $1`,
    [recipientId]
  );
}

async function markRecipientFailed(recipientId, error) {
  await pool.query(
    `UPDATE email_campaign_recipients
     SET status = 'failed', error = $1
     WHERE id = $2`,
    [error ? String(error).slice(0, 500) : null, recipientId]
  );
}

// ── Open tracking ─────────────────────────────────────────────────────────────

async function markRecipientOpened(trackingToken) {
  const { rows } = await pool.query(
    `UPDATE email_campaign_recipients
     SET opened_at = NOW()
     WHERE tracking_token = $1 AND opened_at IS NULL
     RETURNING campaign_id`,
    [trackingToken]
  );
  return rows[0]?.campaign_id ?? null;
}

// ── Update campaign counters ──────────────────────────────────────────────────

async function updateCampaignCounters(campaignId) {
  await pool.query(
    `UPDATE email_campaigns SET
       sent_count   = (SELECT COUNT(*) FROM email_campaign_recipients WHERE campaign_id = $1 AND status = 'sent'),
       failed_count = (SELECT COUNT(*) FROM email_campaign_recipients WHERE campaign_id = $1 AND status = 'failed'),
       open_count   = (SELECT COUNT(*) FROM email_campaign_recipients WHERE campaign_id = $1 AND opened_at IS NOT NULL),
       updated_at   = NOW()
     WHERE id = $1`,
    [campaignId]
  );
}

// ── Mark campaign completed / failed ─────────────────────────────────────────

async function markCampaignSent(campaignId) {
  await pool.query(
    `UPDATE email_campaigns SET status = 'sent', sent_at = NOW(), updated_at = NOW()
     WHERE id = $1`,
    [campaignId]
  );
}

async function markCampaignFailed(campaignId) {
  await pool.query(
    `UPDATE email_campaigns SET status = 'failed', updated_at = NOW()
     WHERE id = $1`,
    [campaignId]
  );
}

// ── Stats ─────────────────────────────────────────────────────────────────────

async function getCampaignStats(storeId, campaignId) {
  const { rows } = await pool.query(
    `SELECT id, subject, status, recipient_count, sent_count, open_count,
            click_count, failed_count, sent_at, created_at
     FROM   email_campaigns
     WHERE  id = $1 AND store_id = $2 LIMIT 1`,
    [campaignId, storeId]
  );
  if (!rows[0]) return null;

  const c = rows[0];
  const openRate = c.sent_count > 0
    ? Math.round((c.open_count / c.sent_count) * 1000) / 10
    : 0;

  const { rows: recipients } = await pool.query(
    `SELECT email, status, opened_at, sent_at, error
     FROM   email_campaign_recipients
     WHERE  campaign_id = $1
     ORDER  BY created_at ASC`,
    [campaignId]
  );

  return { ...c, open_rate: openRate, recipients };
}

// ── Duplicate ─────────────────────────────────────────────────────────────────

async function duplicateCampaign(storeId, campaignId) {
  const original = await getCampaignById(storeId, campaignId);
  if (!original) return null;

  const { rows } = await pool.query(
    `INSERT INTO email_campaigns (store_id, subject, preview_text, body_html, body_text)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      storeId,
      `Copy of ${original.subject}`,
      original.preview_text,
      original.body_html,
      original.body_text,
    ]
  );
  return rows[0];
}

module.exports = {
  createCampaign,
  getCampaignById,
  listCampaigns,
  updateCampaign,
  deleteCampaign,
  prepareCampaignRecipients,
  getUnsentRecipients,
  markRecipientSent,
  markRecipientFailed,
  markRecipientOpened,
  updateCampaignCounters,
  markCampaignSent,
  markCampaignFailed,
  getCampaignStats,
  duplicateCampaign,
};
