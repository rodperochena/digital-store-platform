-- Migration 016: Taxonomy reference tables (types, categories, tags) + product classification fields.
-- Taxonomy slugs are used as stable identifiers in the DB and API; labels are display-only.
-- The seed data covers the product types and categories shown in the product creator UI.
-- ON CONFLICT DO NOTHING makes this safe to re-run if seeds are ever re-applied.
-- product_tags uses a TEXT[] array column so we avoid a join table for what is
-- essentially a lightweight multi-select — querying is still fast with GIN indexes if needed.

BEGIN;

-- ── Part 1: Taxonomy reference tables ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS taxonomy_types (
  slug       TEXT PRIMARY KEY,
  label      TEXT NOT NULL,
  icon       TEXT,
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS taxonomy_categories (
  slug       TEXT NOT NULL,
  type_slug  TEXT NOT NULL REFERENCES taxonomy_types(slug),
  label      TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  PRIMARY KEY (type_slug, slug)
);

CREATE TABLE IF NOT EXISTS taxonomy_tags (
  slug       TEXT PRIMARY KEY,
  label      TEXT NOT NULL,
  group_name TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0
);

-- ── Part 2: Seed data ─────────────────────────────────────────────────────────

INSERT INTO taxonomy_types (slug, label, icon, sort_order) VALUES
  ('template',      'Template',        '📄', 1),
  ('ebook',         'Ebook / Guide',   '📚', 2),
  ('design-asset',  'Design Asset',    '🎨', 3),
  ('photo-video',   'Photo / Video',   '📸', 4),
  ('audio-music',   'Audio / Music',   '🎵', 5),
  ('preset-filter', 'Preset / Filter', '🎛️', 6),
  ('font',          'Font',            '🔤', 7),
  ('software-code', 'Software / Code', '💻', 8),
  ('ai-prompt',     'AI / Prompt',     '🤖', 9),
  ('printable',     'Printable',       '🖨️', 10),
  ('spreadsheet',   'Spreadsheet',     '📊', 11),
  ('other',         'Other',           '📦', 12)
ON CONFLICT DO NOTHING;

INSERT INTO taxonomy_categories (type_slug, slug, label, sort_order) VALUES
  ('template','productivity','Productivity',1),
  ('template','business','Business',2),
  ('template','marketing','Marketing',3),
  ('template','finance','Finance',4),
  ('template','academic','Academic',5),
  ('template','personal','Personal',6),
  ('ebook','nonfiction','Nonfiction',1),
  ('ebook','fiction','Fiction',2),
  ('ebook','technical','Technical',3),
  ('ebook','business','Business',4),
  ('ebook','self-help','Self-Help',5),
  ('ebook','education','Education',6),
  ('design-asset','branding','Branding',1),
  ('design-asset','social-media','Social Media',2),
  ('design-asset','ui-ux','UI / UX',3),
  ('design-asset','icons','Icons & Illustrations',4),
  ('design-asset','mockups','Mockups',5),
  ('design-asset','presentations','Presentations',6),
  ('photo-video','stock-photo','Stock Photography',1),
  ('photo-video','stock-video','Stock Video',2),
  ('photo-video','motion','Motion Graphics',3),
  ('photo-video','editing','Editing Assets',4),
  ('audio-music','music','Music & Beats',1),
  ('audio-music','sfx','Sound Effects',2),
  ('audio-music','production','Music Production',3),
  ('audio-music','podcast','Podcast Assets',4),
  ('preset-filter','lightroom','Lightroom Presets',1),
  ('preset-filter','luts','LUTs',2),
  ('preset-filter','photoshop','Photoshop Actions',3),
  ('preset-filter','video','Video Presets',4),
  ('font','sans-serif','Sans Serif',1),
  ('font','serif','Serif',2),
  ('font','script','Script',3),
  ('font','display','Display',4),
  ('font','handwritten','Handwritten',5),
  ('software-code','web-app','Web App',1),
  ('software-code','mobile-app','Mobile App',2),
  ('software-code','backend','Backend',3),
  ('software-code','no-code','No-Code',4),
  ('software-code','dev-tool','Developer Tool',5),
  ('software-code','plugin','Plugin / Extension',6),
  ('ai-prompt','writing','Writing',1),
  ('ai-prompt','marketing','Marketing',2),
  ('ai-prompt','design','Design',3),
  ('ai-prompt','coding','Coding',4),
  ('ai-prompt','productivity','Productivity',5),
  ('ai-prompt','automation','Automation',6),
  ('printable','art','Wall Art',1),
  ('printable','stationery','Stationery',2),
  ('printable','invitations','Invitations',3),
  ('printable','educational','Educational',4),
  ('spreadsheet','financial','Financial',1),
  ('spreadsheet','tracking','Tracking',2),
  ('spreadsheet','analytics','Analytics',3),
  ('spreadsheet','operations','Operations',4),
  ('other','general','General',1),
  ('other','bundle','Bundle',2),
  ('other','access','Access / Membership',3)
ON CONFLICT DO NOTHING;

INSERT INTO taxonomy_tags (slug, label, group_name, sort_order) VALUES
  ('notion','Notion','tool',1),
  ('google-sheets','Google Sheets','tool',2),
  ('excel','Excel','tool',3),
  ('canva','Canva','tool',4),
  ('figma','Figma','tool',5),
  ('photoshop','Photoshop','tool',6),
  ('illustrator','Illustrator','tool',7),
  ('after-effects','After Effects','tool',8),
  ('premiere','Premiere Pro','tool',9),
  ('lightroom','Lightroom','tool',10),
  ('procreate','Procreate','tool',11),
  ('react','React','tool',12),
  ('nextjs','Next.js','tool',13),
  ('nodejs','Node.js','tool',14),
  ('python','Python','tool',15),
  ('chatgpt','ChatGPT','tool',16),
  ('claude','Claude','tool',17),
  ('midjourney','Midjourney','tool',18),
  ('webflow','Webflow','tool',19),
  ('shopify','Shopify','tool',20),
  ('framer','Framer','tool',21),
  ('bubble','Bubble','tool',22),
  ('airtable','Airtable','tool',23),
  ('wordpress','WordPress','tool',24),
  ('pdf','PDF','format',1),
  ('zip','ZIP','format',2),
  ('docx','DOCX','format',3),
  ('epub','EPUB','format',4),
  ('mp3','MP3','format',5),
  ('wav','WAV','format',6),
  ('mp4','MP4','format',7),
  ('png','PNG','format',8),
  ('psd','PSD','format',9),
  ('ai-file','AI','format',10),
  ('svg','SVG','format',11),
  ('xlsx','XLSX','format',12),
  ('csv','CSV','format',13),
  ('json','JSON','format',14),
  ('code-repo','Code Repository','format',15),
  ('notion-link','Notion Link','format',16),
  ('canva-link','Canva Link','format',17),
  ('beginner','Beginner','audience',1),
  ('intermediate','Intermediate','audience',2),
  ('advanced','Advanced','audience',3),
  ('creator','Creator','audience',4),
  ('freelancer','Freelancer','audience',5),
  ('entrepreneur','Entrepreneur','audience',6),
  ('developer','Developer','audience',7),
  ('designer','Designer','audience',8),
  ('marketer','Marketer','audience',9),
  ('student','Student','audience',10),
  ('business-owner','Business Owner','audience',11)
ON CONFLICT DO NOTHING;

-- ── Part 3: New product columns ───────────────────────────────────────────────

ALTER TABLE products ADD COLUMN IF NOT EXISTS product_type     TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS product_category TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS product_tags     TEXT[] DEFAULT '{}';
ALTER TABLE products ADD COLUMN IF NOT EXISTS visibility       TEXT NOT NULL DEFAULT 'published'
  CHECK (visibility IN ('published', 'draft', 'unlisted'));
ALTER TABLE products ADD COLUMN IF NOT EXISTS video_url        TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS file_size_display TEXT;

-- Migrate existing inactive products to draft
UPDATE products SET visibility = 'draft' WHERE is_active = false AND visibility = 'published';

COMMIT;
