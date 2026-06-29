import type { Locale, NavigationTranslation, UpsertNavigationItemInput } from "@tworiver/shared";
import type { BlogDatabase } from "../db/connection.js";

export interface NavigationItemRecord {
  id: number;
  url: string;
  sortOrder: number;
  enabled: boolean;
  openInNewWindow: boolean;
  createdAt: string;
  updatedAt: string;
  translations: NavigationTranslation[];
}

export interface PublicNavigationItemRecord extends NavigationItemRecord {
  requestedLocale: Locale;
  label: string;
  translation: NavigationTranslation;
}

interface NavigationRow {
  id: number;
  url: string;
  sort_order: number;
  enabled: number;
  open_in_new_window: number;
  created_at: string;
  updated_at: string;
}

interface NavigationTranslationRow {
  navigation_id: number;
  locale: Locale;
  label: string;
}

const NAVIGATION_COLUMNS = "id, url, sort_order, enabled, open_in_new_window, created_at, updated_at";

function mapTranslation(row: NavigationTranslationRow): NavigationTranslation {
  return {
    locale: row.locale,
    label: row.label
  };
}

function mapNavigation(row: NavigationRow, translations: NavigationTranslation[]): NavigationItemRecord {
  return {
    id: row.id,
    url: row.url,
    sortOrder: row.sort_order,
    enabled: row.enabled === 1,
    openInNewWindow: row.open_in_new_window === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    translations
  };
}

function hydrateNavigationItems(db: BlogDatabase, rows: NavigationRow[]): NavigationItemRecord[] {
  if (rows.length === 0) {
    return [];
  }

  const ids = rows.map((row) => row.id);
  const translations = db
    .prepare(
      `SELECT navigation_id, locale, label
       FROM navigation_translations
       WHERE navigation_id IN (${ids.map(() => "?").join(", ")})
       ORDER BY locale ASC`
    )
    .all(...ids) as NavigationTranslationRow[];
  const translationsByItem = new Map<number, NavigationTranslation[]>();
  for (const translation of translations) {
    const existing = translationsByItem.get(translation.navigation_id) ?? [];
    existing.push(mapTranslation(translation));
    translationsByItem.set(translation.navigation_id, existing);
  }

  return rows.map((row) => mapNavigation(row, translationsByItem.get(row.id) ?? []));
}

function hydrateNavigationItem(db: BlogDatabase, row: NavigationRow): NavigationItemRecord {
  return hydrateNavigationItems(db, [row])[0] as NavigationItemRecord;
}

function replaceTranslations(db: BlogDatabase, navigationId: number, translations: NavigationTranslation[]): void {
  db.prepare("DELETE FROM navigation_translations WHERE navigation_id = ?").run(navigationId);
  const insert = db.prepare("INSERT INTO navigation_translations (navigation_id, locale, label) VALUES (?, ?, ?)");
  for (const translation of translations) {
    insert.run(navigationId, translation.locale, translation.label);
  }
}

function toPublicNavigationItem(
  item: NavigationItemRecord,
  requestedLocale: Locale
): PublicNavigationItemRecord | undefined {
  const translation =
    item.translations.find((candidate) => candidate.locale === requestedLocale) ??
    item.translations.find((candidate) => candidate.locale !== requestedLocale);
  return translation ? { ...item, requestedLocale, label: translation.label, translation } : undefined;
}

export function listAdminNavigationItems(db: BlogDatabase): NavigationItemRecord[] {
  const rows = db
    .prepare(`SELECT ${NAVIGATION_COLUMNS} FROM navigation_items ORDER BY sort_order ASC, id ASC`)
    .all() as NavigationRow[];
  return hydrateNavigationItems(db, rows);
}

export function listPublicNavigationItems(db: BlogDatabase, requestedLocale: Locale): PublicNavigationItemRecord[] {
  const rows = db
    .prepare(`SELECT ${NAVIGATION_COLUMNS} FROM navigation_items WHERE enabled = 1 ORDER BY sort_order ASC, id ASC`)
    .all() as NavigationRow[];
  return hydrateNavigationItems(db, rows)
    .map((item) => toPublicNavigationItem(item, requestedLocale))
    .filter((item): item is PublicNavigationItemRecord => item !== undefined);
}

export function getNavigationItemById(db: BlogDatabase, id: number): NavigationItemRecord | undefined {
  const row = db
    .prepare(`SELECT ${NAVIGATION_COLUMNS} FROM navigation_items WHERE id = ?`)
    .get(id) as NavigationRow | undefined;
  return row ? hydrateNavigationItem(db, row) : undefined;
}

export function createNavigationItem(db: BlogDatabase, input: UpsertNavigationItemInput): NavigationItemRecord {
  return db.transaction(() => {
    const now = new Date().toISOString();
    const result = db
      .prepare(
        `INSERT INTO navigation_items (url, sort_order, enabled, open_in_new_window, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(input.url, input.sortOrder, input.enabled ? 1 : 0, input.openInNewWindow ? 1 : 0, now, now);
    const navigationId = Number(result.lastInsertRowid);
    replaceTranslations(db, navigationId, input.translations);
    return getNavigationItemById(db, navigationId) as NavigationItemRecord;
  })();
}

export function updateNavigationItem(
  db: BlogDatabase,
  id: number,
  input: UpsertNavigationItemInput
): NavigationItemRecord | undefined {
  return db.transaction(() => {
    if (!getNavigationItemById(db, id)) {
      return undefined;
    }

    db.prepare(
      `UPDATE navigation_items
       SET url = ?, sort_order = ?, enabled = ?, open_in_new_window = ?, updated_at = ?
       WHERE id = ?`
    ).run(input.url, input.sortOrder, input.enabled ? 1 : 0, input.openInNewWindow ? 1 : 0, new Date().toISOString(), id);
    replaceTranslations(db, id, input.translations);
    return getNavigationItemById(db, id);
  })();
}

export function deleteNavigationItem(db: BlogDatabase, id: number): boolean {
  return db.prepare("DELETE FROM navigation_items WHERE id = ?").run(id).changes > 0;
}

export function reorderNavigationItems(db: BlogDatabase, ids: number[]): NavigationItemRecord[] {
  return db.transaction(() => {
    const uniqueIds = Array.from(new Set(ids));
    if (uniqueIds.length !== ids.length || uniqueIds.length === 0) {
      throw new Error("Invalid navigation order");
    }
    const placeholders = uniqueIds.map(() => "?").join(", ");
    const found = db
      .prepare(`SELECT COUNT(*) AS count FROM navigation_items WHERE id IN (${placeholders})`)
      .get(...uniqueIds) as { count: number };
    if (found.count !== uniqueIds.length) {
      throw new Error("Invalid navigation order");
    }

    const update = db.prepare("UPDATE navigation_items SET sort_order = ?, updated_at = ? WHERE id = ?");
    const now = new Date().toISOString();
    uniqueIds.forEach((id, index) => update.run(index + 1, now, id));
    return listAdminNavigationItems(db);
  })();
}
