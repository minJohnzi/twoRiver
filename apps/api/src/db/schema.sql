PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  avatar_url TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  csrf_token TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS category_translations (
  category_id INTEGER NOT NULL,
  locale TEXT NOT NULL CHECK (locale IN ('zh', 'en')),
  name TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (category_id, locale),
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('draft', 'published', 'archived')),
  category_id INTEGER,
  published_at TEXT,
  is_pinned INTEGER NOT NULL DEFAULT 0 CHECK (is_pinned IN (0, 1)),
  is_featured INTEGER NOT NULL DEFAULT 0 CHECK (is_featured IN (0, 1)),
  cover_url TEXT NOT NULL DEFAULT '',
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS post_translations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,
  locale TEXT NOT NULL CHECK (locale IN ('zh', 'en')),
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  content_markdown TEXT NOT NULL DEFAULT '',
  seo_title TEXT,
  seo_description TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (post_id, locale),
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS tag_translations (
  tag_id INTEGER NOT NULL,
  locale TEXT NOT NULL CHECK (locale IN ('zh', 'en')),
  name TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (tag_id, locale),
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS post_tags (
  post_id INTEGER NOT NULL,
  tag_id INTEGER NOT NULL,
  PRIMARY KEY (post_id, tag_id),
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS about_profile (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  display_name TEXT NOT NULL DEFAULT '',
  headline TEXT NOT NULL DEFAULT '',
  bio TEXT NOT NULL DEFAULT '',
  avatar_url TEXT NOT NULL DEFAULT '',
  github_url TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  social_links_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

INSERT OR IGNORE INTO about_profile (id) VALUES (1);

CREATE TABLE IF NOT EXISTS pages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('draft', 'published')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS page_translations (
  page_id INTEGER NOT NULL,
  locale TEXT NOT NULL CHECK (locale IN ('zh', 'en')),
  title TEXT NOT NULL,
  content_markdown TEXT NOT NULL DEFAULT '',
  seo_title TEXT,
  seo_description TEXT,
  PRIMARY KEY (page_id, locale),
  FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  tech_stack_json TEXT NOT NULL DEFAULT '[]',
  cover_url TEXT NOT NULL DEFAULT '',
  github_url TEXT NOT NULL DEFAULT '',
  demo_url TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_visible INTEGER NOT NULL DEFAULT 1 CHECK (is_visible IN (0, 1)),
  is_featured INTEGER NOT NULL DEFAULT 0 CHECK (is_featured IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS project_translations (
  project_id INTEGER NOT NULL,
  locale TEXT NOT NULL CHECK (locale IN ('zh', 'en')),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  seo_title TEXT,
  seo_description TEXT,
  PRIMARY KEY (project_id, locale),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS navigation_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  open_in_new_window INTEGER NOT NULL DEFAULT 0 CHECK (open_in_new_window IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS navigation_translations (
  navigation_id INTEGER NOT NULL,
  locale TEXT NOT NULL CHECK (locale IN ('zh', 'en')),
  label TEXT NOT NULL,
  PRIMARY KEY (navigation_id, locale),
  FOREIGN KEY (navigation_id) REFERENCES navigation_items(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS site_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  logo_url TEXT NOT NULL DEFAULT '',
  favicon_url TEXT NOT NULL DEFAULT '',
  robots_text TEXT NOT NULL DEFAULT 'User-agent: *\nAllow: /',
  primary_color TEXT NOT NULL DEFAULT '#111111',
  home_layout TEXT NOT NULL DEFAULT 'list' CHECK (home_layout IN ('list', 'grid', 'bento')),
  code_theme TEXT NOT NULL DEFAULT 'one-dark' CHECK (code_theme IN ('dracula', 'monokai', 'github-light', 'one-dark')),
  font_size TEXT NOT NULL DEFAULT 'medium' CHECK (font_size IN ('small', 'medium', 'large')),
  allow_reader_dark_mode INTEGER NOT NULL DEFAULT 1 CHECK (allow_reader_dark_mode IN (0, 1)),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

INSERT OR IGNORE INTO site_settings (id) VALUES (1);

CREATE TABLE IF NOT EXISTS site_setting_translations (
  site_settings_id INTEGER NOT NULL DEFAULT 1 CHECK (site_settings_id = 1),
  locale TEXT NOT NULL CHECK (locale IN ('zh', 'en')),
  site_name TEXT NOT NULL,
  subtitle TEXT NOT NULL DEFAULT '',
  seo_title TEXT NOT NULL DEFAULT '',
  seo_description TEXT NOT NULL DEFAULT '',
  seo_keywords_json TEXT NOT NULL DEFAULT '[]',
  PRIMARY KEY (site_settings_id, locale),
  FOREIGN KEY (site_settings_id) REFERENCES site_settings(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS site_social_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL,
  url TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS resources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT NOT NULL UNIQUE,
  storage_path TEXT NOT NULL UNIQUE,
  original_filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
  kind TEXT NOT NULL CHECK (kind IN ('post-image', 'about-image', 'asset')),
  folder TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'upload',
  checksum_sha256 TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS analytics_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_date TEXT NOT NULL,
  minute_bucket TEXT NOT NULL,
  visitor_hash TEXT NOT NULL,
  path TEXT NOT NULL,
  content_type TEXT NOT NULL,
  content_id INTEGER,
  locale TEXT NOT NULL CHECK (locale IN ('zh', 'en')),
  referrer_domain TEXT NOT NULL DEFAULT '',
  device_type TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (minute_bucket, visitor_hash, path)
);

CREATE TABLE IF NOT EXISTS analytics_daily (
  event_date TEXT PRIMARY KEY,
  page_views INTEGER NOT NULL DEFAULT 0,
  unique_visitors INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS analytics_daily_visitors (
  event_date TEXT NOT NULL,
  visitor_hash TEXT NOT NULL,
  PRIMARY KEY (event_date, visitor_hash)
);

CREATE TABLE IF NOT EXISTS analytics_content_daily (
  event_date TEXT NOT NULL,
  content_type TEXT NOT NULL,
  content_id INTEGER,
  path TEXT NOT NULL,
  locale TEXT NOT NULL,
  page_views INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (event_date, content_type, path, locale)
);

CREATE TABLE IF NOT EXISTS analytics_referrer_daily (
  event_date TEXT NOT NULL,
  referrer_domain TEXT NOT NULL,
  page_views INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (event_date, referrer_domain)
);

CREATE TABLE IF NOT EXISTS analytics_device_daily (
  event_date TEXT NOT NULL,
  device_type TEXT NOT NULL,
  page_views INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (event_date, device_type)
);

CREATE TABLE IF NOT EXISTS audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL DEFAULT '',
  target_id TEXT NOT NULL DEFAULT '',
  outcome TEXT NOT NULL CHECK (outcome IN ('success', 'failure')),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS backup_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK (kind IN ('download', 'pre-restore', 'restore')),
  filename TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('started', 'completed', 'failed')),
  size_bytes INTEGER NOT NULL DEFAULT 0,
  checksum_sha256 TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_posts_status_published_at ON posts(status, published_at);
CREATE INDEX IF NOT EXISTS idx_posts_category_status ON posts(category_id, status);
CREATE INDEX IF NOT EXISTS idx_posts_deleted_at ON posts(deleted_at);
CREATE INDEX IF NOT EXISTS idx_post_translations_locale ON post_translations(locale);
CREATE INDEX IF NOT EXISTS idx_tags_slug ON tags(slug);
CREATE INDEX IF NOT EXISTS idx_categories_slug ON categories(slug);
CREATE INDEX IF NOT EXISTS idx_pages_status_sort ON pages(status, sort_order);
CREATE INDEX IF NOT EXISTS idx_projects_visible_sort ON projects(is_visible, is_featured, sort_order);
CREATE INDEX IF NOT EXISTS idx_navigation_sort ON navigation_items(enabled, sort_order);
CREATE INDEX IF NOT EXISTS idx_resources_kind_folder ON resources(kind, folder);
CREATE INDEX IF NOT EXISTS idx_analytics_events_date ON analytics_events(event_date);
CREATE INDEX IF NOT EXISTS idx_audit_events_created_at ON audit_events(created_at);
