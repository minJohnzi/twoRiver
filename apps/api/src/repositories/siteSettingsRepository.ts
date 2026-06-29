import type {
  Locale,
  SiteSettingsTranslation,
  SiteSocialLink,
  SiteTheme,
  UpsertSiteSettingsInput
} from "@tworiver/shared";
import type { BlogDatabase } from "../db/connection.js";

export interface SiteSettingsRecord {
  logoUrl: string;
  faviconUrl: string;
  robotsText: string;
  theme: SiteTheme;
  translations: SiteSettingsTranslation[];
  socialLinks: SiteSocialLink[];
  updatedAt: string;
}

export interface PublicSiteSettingsRecord extends SiteSettingsRecord {
  requestedLocale: Locale;
  siteName: string;
  subtitle: string;
  seoTitle: string;
  seoDescription: string;
  seoKeywords: string[];
  translation: SiteSettingsTranslation;
}

interface SiteSettingsRow {
  logo_url: string;
  favicon_url: string;
  robots_text: string;
  primary_color: string;
  home_layout: SiteTheme["homeLayout"];
  code_theme: SiteTheme["codeTheme"];
  font_size: SiteTheme["fontSize"];
  allow_reader_dark_mode: number;
  updated_at: string;
}

interface SiteSettingsTranslationRow {
  locale: Locale;
  site_name: string;
  subtitle: string;
  seo_title: string;
  seo_description: string;
  seo_keywords_json: string;
}

interface SiteSocialLinkRow {
  label: string;
  url: string;
  sort_order: number;
}

const DEFAULT_TRANSLATION: SiteSettingsTranslation = {
  locale: "zh",
  siteName: "TwoRiver",
  subtitle: "",
  seoTitle: "TwoRiver",
  seoDescription: "",
  seoKeywords: []
};

function parseKeywords(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function mapTranslation(row: SiteSettingsTranslationRow): SiteSettingsTranslation {
  return {
    locale: row.locale,
    siteName: row.site_name,
    subtitle: row.subtitle,
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
    seoKeywords: parseKeywords(row.seo_keywords_json)
  };
}

function mapSocialLink(row: SiteSocialLinkRow): SiteSocialLink {
  return {
    label: row.label,
    url: row.url,
    sortOrder: row.sort_order
  };
}

function hydrateSiteSettings(
  row: SiteSettingsRow,
  translations: SiteSettingsTranslation[],
  socialLinks: SiteSocialLink[]
): SiteSettingsRecord {
  return {
    logoUrl: row.logo_url,
    faviconUrl: row.favicon_url,
    robotsText: row.robots_text,
    theme: {
      primaryColor: row.primary_color,
      homeLayout: row.home_layout,
      codeTheme: row.code_theme,
      fontSize: row.font_size,
      allowReaderDarkMode: row.allow_reader_dark_mode === 1
    },
    translations: translations.length > 0 ? translations : [DEFAULT_TRANSLATION],
    socialLinks,
    updatedAt: row.updated_at
  };
}

function replaceTranslations(db: BlogDatabase, translations: SiteSettingsTranslation[]): void {
  db.prepare("DELETE FROM site_setting_translations WHERE site_settings_id = 1").run();
  const insert = db.prepare(
    `INSERT INTO site_setting_translations (
       site_settings_id, locale, site_name, subtitle, seo_title, seo_description, seo_keywords_json
     )
     VALUES (1, ?, ?, ?, ?, ?, ?)`
  );
  for (const translation of translations) {
    insert.run(
      translation.locale,
      translation.siteName,
      translation.subtitle,
      translation.seoTitle,
      translation.seoDescription,
      JSON.stringify(translation.seoKeywords)
    );
  }
}

function replaceSocialLinks(db: BlogDatabase, socialLinks: SiteSocialLink[]): void {
  db.prepare("DELETE FROM site_social_links").run();
  const insert = db.prepare("INSERT INTO site_social_links (label, url, sort_order) VALUES (?, ?, ?)");
  for (const link of socialLinks) {
    insert.run(link.label, link.url, link.sortOrder);
  }
}

export function getSiteSettings(db: BlogDatabase): SiteSettingsRecord {
  db.prepare("INSERT OR IGNORE INTO site_settings (id) VALUES (1)").run();
  const row = db.prepare("SELECT * FROM site_settings WHERE id = 1").get() as SiteSettingsRow;
  const translations = (
    db
      .prepare(
        `SELECT locale, site_name, subtitle, seo_title, seo_description, seo_keywords_json
         FROM site_setting_translations
         WHERE site_settings_id = 1
         ORDER BY locale ASC`
      )
      .all() as SiteSettingsTranslationRow[]
  ).map(mapTranslation);
  const socialLinks = (
    db.prepare("SELECT label, url, sort_order FROM site_social_links ORDER BY sort_order ASC, id ASC").all() as SiteSocialLinkRow[]
  ).map(mapSocialLink);
  return hydrateSiteSettings(row, translations, socialLinks);
}

export function updateSiteSettings(db: BlogDatabase, input: UpsertSiteSettingsInput): SiteSettingsRecord {
  return db.transaction(() => {
    db.prepare(
      `UPDATE site_settings
       SET logo_url = ?, favicon_url = ?, robots_text = ?, primary_color = ?, home_layout = ?,
           code_theme = ?, font_size = ?, allow_reader_dark_mode = ?, updated_at = ?
       WHERE id = 1`
    ).run(
      input.logoUrl,
      input.faviconUrl,
      input.robotsText,
      input.theme.primaryColor,
      input.theme.homeLayout,
      input.theme.codeTheme,
      input.theme.fontSize,
      input.theme.allowReaderDarkMode ? 1 : 0,
      new Date().toISOString()
    );
    replaceTranslations(db, input.translations);
    replaceSocialLinks(db, input.socialLinks);
    return getSiteSettings(db);
  })();
}

export function getPublicSiteSettings(db: BlogDatabase, requestedLocale: Locale): PublicSiteSettingsRecord {
  const settings = getSiteSettings(db);
  const translation =
    settings.translations.find((candidate) => candidate.locale === requestedLocale) ??
    settings.translations.find((candidate) => candidate.locale !== requestedLocale) ??
    DEFAULT_TRANSLATION;
  return {
    ...settings,
    requestedLocale,
    siteName: translation.siteName,
    subtitle: translation.subtitle,
    seoTitle: translation.seoTitle,
    seoDescription: translation.seoDescription,
    seoKeywords: translation.seoKeywords,
    translation
  };
}
