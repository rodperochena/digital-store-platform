"use strict";

// Routes: tracking
// Email open tracking pixel — GET /api/track/open/:token
// Returns a 1×1 transparent GIF immediately, then asynchronously marks the campaign recipient as opened.
// Never fails the response: any DB error is silently swallowed.

const express = require("express");
const { markRecipientOpened, updateCampaignCounters } = require("../db/queries/campaigns.queries");

const router = express.Router();

// 1×1 transparent GIF
const PIXEL_BUF = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64"
);

// GET /api/track/open/:token — Public
// Email open tracking pixel. Returns 1×1 GIF and asynchronously records the open event.
router.get("/track/open/:token", async (req, res) => {
  const { token } = req.params;

  // Fire-and-forget — never fail the pixel response
  markRecipientOpened(token)
    .then((campaignId) => {
      if (campaignId) updateCampaignCounters(campaignId).catch(() => {});
    })
    .catch(() => {});

  res.setHeader("Content-Type", "image/gif");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  return res.send(PIXEL_BUF);
});

module.exports = { trackingRouter: router };
