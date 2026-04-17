import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useOwner } from "../../context/OwnerContext";
import {
  getCampaign, createCampaign, updateCampaign, sendCampaign, previewCampaign,
} from "../../api/owner";
import styles from "./EmailComposer.module.css";

// ── Toolbar action helpers ────────────────────────────────────────────────────

function wrapSelection(ta, open, close, defaultText = "") {
  const start = ta.selectionStart;
  const end   = ta.selectionEnd;
  const sel   = ta.value.slice(start, end) || defaultText;
  const before = ta.value.slice(0, start);
  const after  = ta.value.slice(end);
  const newVal = `${before}${open}${sel}${close}${after}`;
  const cursor = start + open.length + sel.length + close.length;
  return { value: newVal, cursor };
}

function insertAtCursor(ta, text) {
  const start = ta.selectionStart;
  const before = ta.value.slice(0, start);
  const after  = ta.value.slice(ta.selectionEnd);
  const newVal = `${before}${text}${after}`;
  const cursor = start + text.length;
  return { value: newVal, cursor };
}

// ── Simple Markdown → HTML renderer ──────────────────────────────────────────

function renderMarkdown(md) {
  if (!md) return "";
  let html = md;
  // Headings
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm,  "<h2>$1</h2>");
  html = html.replace(/^# (.+)$/gm,   "<h1>$1</h1>");
  // Bold + italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g,    "<em>$1</em>");
  // Inline code
  html = html.replace(/`(.+?)`/g, "<code>$1</code>");
  // Links
  html = html.replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>');
  // Unordered lists
  html = html.replace(/(^- .+$\n?)+/gm, (block) => {
    const items = block.trim().split("\n").map((l) => `<li>${l.slice(2)}</li>`).join("");
    return `<ul>${items}</ul>`;
  });
  // Ordered lists
  html = html.replace(/(^\d+\. .+$\n?)+/gm, (block) => {
    const items = block.trim().split("\n").map((l) => `<li>${l.replace(/^\d+\. /, "")}</li>`).join("");
    return `<ol>${items}</ol>`;
  });
  // Paragraphs
  html = html.replace(/\n\n+/g, "</p><p>");
  html = `<p>${html}</p>`;
  return html;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function EmailComposer() {
  const { ownerCtx } = useOwner();
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = Boolean(id);

  const [loading, setLoading]   = useState(isEdit);
  const [saving, setSaving]     = useState(false);
  const [sending, setSending]   = useState(false);
  const [error, setError]       = useState(null);
  const [showPreviewPane, setShowPreviewPane] = useState(false);
  const [previewEmail, setPreviewEmail] = useState("");
  const [previewSending, setPreviewSending] = useState(false);
  const [previewMsg, setPreviewMsg] = useState(null);

  const [form, setForm] = useState({
    subject:      "",
    preview_text: "",
    body_html:    "",
  });

  const taRef = useRef(null);

  // Load existing campaign on edit
  useEffect(() => {
    if (!isEdit) return;
    getCampaign(ownerCtx, id)
      .then((c) => {
        setForm({
          subject:      c.subject      ?? "",
          preview_text: c.preview_text ?? "",
          body_html:    c.body_html    ?? "",
        });
      })
      .catch(() => setError("Failed to load campaign."))
      .finally(() => setLoading(false));
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  function set(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  // ── Toolbar ────────────────────────────────────────────────────────────────

  function applyToolbar(type) {
    const ta = taRef.current;
    if (!ta) return;
    let result;
    if (type === "bold")   result = wrapSelection(ta, "**", "**", "bold text");
    if (type === "italic") result = wrapSelection(ta, "*", "*",   "italic text");
    if (type === "h2")     result = insertAtCursor(ta, "\n## Heading\n");
    if (type === "h3")     result = insertAtCursor(ta, "\n### Heading\n");
    if (type === "ul")     result = insertAtCursor(ta, "\n- Item 1\n- Item 2\n- Item 3\n");
    if (type === "ol")     result = insertAtCursor(ta, "\n1. First item\n2. Second item\n3. Third item\n");
    if (type === "link")   result = wrapSelection(ta, "[", "](https://)", "link text");
    if (type === "button") result = insertAtCursor(ta,
      '\n<table cellpadding="0" cellspacing="0" style="margin:16px 0"><tr><td style="border-radius:6px;background:#0d6efd"><a href="https://" style="display:inline-block;padding:10px 24px;color:#fff;text-decoration:none;font-size:14px;font-weight:600;border-radius:6px">Button Text</a></td></tr></table>\n'
    );
    if (!result) return;
    setForm((f) => ({ ...f, body_html: result.value }));
    // Restore cursor after state update
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(result.cursor, result.cursor);
    }, 0);
  }

  // ── Save ───────────────────────────────────────────────────────────────────

  async function handleSave(e) {
    e.preventDefault();
    if (!form.subject.trim()) { setError("Subject is required."); return; }
    if (!form.body_html.trim()) { setError("Body is required."); return; }
    setError(null);
    setSaving(true);
    try {
      if (isEdit) {
        await updateCampaign(ownerCtx, id, form);
      } else {
        const created = await createCampaign(ownerCtx, form);
        navigate(`/owner/email-updates/${created.id}/edit`, { replace: true });
        return;
      }
    } catch (err) {
      setError(err.message || "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  // ── Send ───────────────────────────────────────────────────────────────────

  async function handleSend() {
    if (!form.subject.trim() || !form.body_html.trim()) {
      setError("Save the campaign first.");
      return;
    }
    if (!confirm(`Send "${form.subject}" to all active subscribers? This cannot be undone.`)) return;
    setSending(true);
    try {
      if (isEdit) {
        // Save latest edits first
        await updateCampaign(ownerCtx, id, form);
        await sendCampaign(ownerCtx, id);
      } else {
        const created = await createCampaign(ownerCtx, form);
        await sendCampaign(ownerCtx, created.id);
      }
      navigate("/owner/email-updates");
    } catch (err) {
      setError(err.message || "Failed to send.");
    } finally {
      setSending(false);
    }
  }

  // ── Preview send ──────────────────────────────────────────────────────────

  async function handlePreviewSend() {
    if (!previewEmail.trim()) return;
    if (!isEdit) { setPreviewMsg("Save the campaign first."); return; }
    setPreviewSending(true);
    setPreviewMsg(null);
    try {
      await previewCampaign(ownerCtx, id, previewEmail.trim());
      setPreviewMsg(`Preview sent to ${previewEmail.trim()}`);
    } catch (err) {
      setPreviewMsg(err.message || "Failed to send preview.");
    } finally {
      setPreviewSending(false);
    }
  }

  if (loading) return <p className={styles.loading}>Loading…</p>;

  const previewHtml = renderMarkdown(form.body_html);

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.heading}>{isEdit ? "Edit Campaign" : "New Campaign"}</h1>
        </div>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.btnOutline}
            onClick={() => navigate("/owner/email-updates")}
          >
            Cancel
          </button>
          <button
            type="button"
            className={styles.btnOutline}
            onClick={() => setShowPreviewPane((p) => !p)}
          >
            {showPreviewPane ? "Hide Preview" : "Preview"}
          </button>
          <button
            type="button"
            className={styles.btnPrimary}
            disabled={saving}
            onClick={handleSave}
          >
            {saving ? "Saving…" : "Save Draft"}
          </button>
          <button
            type="button"
            className={styles.btnSend}
            disabled={sending || saving}
            onClick={handleSend}
          >
            {sending ? "Sending…" : "Send Now"}
          </button>
        </div>
      </div>

      {error && <p className={styles.errorMsg}>{error}</p>}

      <div className={`${styles.layout} ${showPreviewPane ? styles.splitLayout : ""}`}>
        {/* ── Editor column ── */}
        <div className={styles.editorCol}>
          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="subject">Subject line</label>
            <input
              id="subject"
              type="text"
              className={styles.input}
              value={form.subject}
              onChange={set("subject")}
              placeholder="Your email subject"
            />
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="preview_text">
              Preview text
              <span className={styles.labelHint}> — shows in inbox before opening</span>
            </label>
            <input
              id="preview_text"
              type="text"
              className={styles.input}
              value={form.preview_text}
              onChange={set("preview_text")}
              placeholder="Short summary that appears in inbox…"
            />
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.label}>Email body</label>
            <div className={styles.toolbar}>
              <button type="button" className={styles.toolBtn} onClick={() => applyToolbar("bold")} title="Bold"><strong>B</strong></button>
              <button type="button" className={styles.toolBtn} onClick={() => applyToolbar("italic")} title="Italic"><em>I</em></button>
              <span className={styles.toolSep} />
              <button type="button" className={styles.toolBtn} onClick={() => applyToolbar("h2")} title="Heading 2">H2</button>
              <button type="button" className={styles.toolBtn} onClick={() => applyToolbar("h3")} title="Heading 3">H3</button>
              <span className={styles.toolSep} />
              <button type="button" className={styles.toolBtn} onClick={() => applyToolbar("ul")} title="Bullet list">• List</button>
              <button type="button" className={styles.toolBtn} onClick={() => applyToolbar("ol")} title="Numbered list">1. List</button>
              <span className={styles.toolSep} />
              <button type="button" className={styles.toolBtn} onClick={() => applyToolbar("link")} title="Link">Link</button>
              <button type="button" className={styles.toolBtn} onClick={() => applyToolbar("button")} title="Button">Button</button>
            </div>
            <textarea
              ref={taRef}
              className={styles.bodyTextarea}
              value={form.body_html}
              onChange={set("body_html")}
              placeholder="Write your email content here. Supports Markdown and HTML."
              rows={20}
            />
            <p className={styles.hint}>Supports Markdown (bold, italic, headings, lists, links) and raw HTML.</p>
          </div>

          {/* Send preview */}
          <div className={styles.previewSendBox}>
            <p className={styles.previewSendLabel}>Send a test email</p>
            <div className={styles.previewSendRow}>
              <input
                type="email"
                className={styles.input}
                value={previewEmail}
                onChange={(e) => setPreviewEmail(e.target.value)}
                placeholder="your@email.com"
              />
              <button
                type="button"
                className={styles.btnOutline}
                disabled={previewSending || !previewEmail.trim()}
                onClick={handlePreviewSend}
              >
                {previewSending ? "Sending…" : "Send test"}
              </button>
            </div>
            {previewMsg && <p className={styles.previewMsg}>{previewMsg}</p>}
          </div>
        </div>

        {/* ── Preview column ── */}
        {showPreviewPane && (
          <div className={styles.previewCol}>
            <p className={styles.previewTitle}>Preview</p>
            <div className={styles.previewCard}>
              <div className={styles.previewSubject}>{form.subject || <em>No subject</em>}</div>
              {form.preview_text && (
                <div className={styles.previewText}>{form.preview_text}</div>
              )}
              <div
                className={styles.previewBody}
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
