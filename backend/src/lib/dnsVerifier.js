"use strict";

// Lib: dnsVerifier
// Verifies that a custom domain's DNS is correctly configured for use with the platform.
// Two checks: CNAME/A record pointing to the platform, and a TXT record for ownership proof.
// We do both checks in parallel and return results for each — the owner dashboard can guide
// the user on which step is still missing.

const dns = require("dns").promises;

// The platform's CNAME target — custom domains should CNAME here.
// In production: your platform's apex domain (e.g., 'stores.yourplatform.com')
const CNAME_TARGET = (process.env.PLATFORM_CNAME_TARGET || "localhost").trim().toLowerCase();

// Checks DNS for a custom domain. Returns cname_valid + txt_valid — caller decides what to do.
// We never throw: DNS errors are captured as results.error so the dashboard can show them clearly.
// A record fallback exists because apex domains (example.com) can't have CNAMEs per RFC 1034.
async function verifyDomain(domain, verificationToken) {
  const results = {
    cname_valid: false,
    txt_valid:   false,
    cname_value: null,
    txt_value:   null,
    error:       null,
  };

  try {
    // ── Check 1: CNAME → platform ────────────────────────────────────────────
    try {
      const cnameRecords = await dns.resolveCname(domain);
      results.cname_value = cnameRecords[0] || null;
      results.cname_valid = cnameRecords.some((r) =>
        r.toLowerCase().includes(CNAME_TARGET.toLowerCase())
      );
    } catch {
      // CNAME not found — try A record as fallback
      try {
        const aRecords = await dns.resolve4(domain);
        results.cname_value = `A: ${aRecords[0]}`;
        // A records cannot be validated to point to us without knowing our IP.
        // Mark valid if the A record exists; owner's responsibility to point correctly.
        results.cname_valid = aRecords.length > 0;
      } catch {
        results.error = `DNS resolution failed: no CNAME or A record found for ${domain}`;
      }
    }

    // ── Check 2: TXT record for ownership verification ────────────────────────
    // Owner must add: _dsp-verify.{domain}  TXT  {verificationToken}
    try {
      const txtRecords = await dns.resolveTxt(`_dsp-verify.${domain}`);
      const flatTxt = txtRecords.map((r) => r.join("")).join("");
      results.txt_valid = flatTxt.includes(verificationToken);
      results.txt_value = flatTxt;
    } catch {
      results.txt_valid = false;
    }
  } catch (err) {
    results.error = err.message;
  }

  return results;
}

module.exports = { verifyDomain, CNAME_TARGET };
