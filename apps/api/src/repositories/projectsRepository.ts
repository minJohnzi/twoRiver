import type { Locale, ProjectTranslation, UpsertProjectInput } from "@tworiver/shared";
import type { BlogDatabase } from "../db/connection.js";
import { normalizeSlug } from "../services/slugService.js";

export interface ProjectRecord {
  id: number;
  slug: string;
  techStack: string[];
  coverUrl: string;
  githubUrl: string;
  demoUrl: string;
  sortOrder: number;
  isVisible: boolean;
  isFeatured: boolean;
  createdAt: string;
  updatedAt: string;
  translations: ProjectTranslation[];
}

export interface PublicProjectRecord extends ProjectRecord {
  requestedLocale: Locale;
  translation: ProjectTranslation;
}

interface ProjectRow {
  id: number;
  slug: string;
  tech_stack_json: string;
  cover_url: string;
  github_url: string;
  demo_url: string;
  sort_order: number;
  is_visible: number;
  is_featured: number;
  created_at: string;
  updated_at: string;
}

interface ProjectTranslationRow {
  project_id: number;
  locale: Locale;
  name: string;
  description: string;
  seo_title: string | null;
  seo_description: string | null;
}

export class ProjectSlugConflictError extends Error {
  constructor() {
    super("Project slug already exists");
    this.name = "ProjectSlugConflictError";
  }
}

export class InvalidProjectInputError extends Error {
  constructor() {
    super("Invalid project input");
    this.name = "InvalidProjectInputError";
  }
}

const PROJECT_COLUMNS = `
  id, slug, tech_stack_json, cover_url, github_url, demo_url,
  sort_order, is_visible, is_featured, created_at, updated_at
`;

function parseTechStack(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function mapTranslation(row: ProjectTranslationRow): ProjectTranslation {
  return {
    locale: row.locale,
    name: row.name,
    description: row.description,
    seoTitle: row.seo_title,
    seoDescription: row.seo_description
  };
}

function mapProject(row: ProjectRow, translations: ProjectTranslation[]): ProjectRecord {
  return {
    id: row.id,
    slug: row.slug,
    techStack: parseTechStack(row.tech_stack_json),
    coverUrl: row.cover_url,
    githubUrl: row.github_url,
    demoUrl: row.demo_url,
    sortOrder: row.sort_order,
    isVisible: row.is_visible === 1,
    isFeatured: row.is_featured === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    translations
  };
}

function hydrateProject(db: BlogDatabase, row: ProjectRow): ProjectRecord {
  const translationRows = db
    .prepare(
      `SELECT project_id, locale, name, description, seo_title, seo_description
       FROM project_translations
       WHERE project_id = ?
       ORDER BY locale ASC`
    )
    .all(row.id) as ProjectTranslationRow[];
  return mapProject(row, translationRows.map(mapTranslation));
}

function hydrateProjects(db: BlogDatabase, rows: ProjectRow[]): ProjectRecord[] {
  if (rows.length === 0) {
    return [];
  }

  const ids = rows.map((row) => row.id);
  const translationRows = db
    .prepare(
      `SELECT project_id, locale, name, description, seo_title, seo_description
       FROM project_translations
       WHERE project_id IN (${ids.map(() => "?").join(", ")})
       ORDER BY locale ASC`
    )
    .all(...ids) as ProjectTranslationRow[];
  const translationsByProject = new Map<number, ProjectTranslation[]>();
  for (const translation of translationRows) {
    const existing = translationsByProject.get(translation.project_id) ?? [];
    existing.push(mapTranslation(translation));
    translationsByProject.set(translation.project_id, existing);
  }

  return rows.map((row) => mapProject(row, translationsByProject.get(row.id) ?? []));
}

function normalizeProjectInput(input: UpsertProjectInput): UpsertProjectInput {
  const slug = normalizeSlug(input.slug);
  if (!slug) {
    throw new InvalidProjectInputError();
  }
  return { ...input, slug };
}

function projectSlugExists(db: BlogDatabase, slug: string, excludedProjectId?: number): boolean {
  const row =
    excludedProjectId === undefined
      ? (db.prepare("SELECT id FROM projects WHERE slug = ?").get(slug) as { id: number } | undefined)
      : (db
          .prepare("SELECT id FROM projects WHERE slug = ? AND id <> ?")
          .get(slug, excludedProjectId) as { id: number } | undefined);
  return row !== undefined;
}

function replaceTranslations(db: BlogDatabase, projectId: number, translations: ProjectTranslation[]): void {
  db.prepare("DELETE FROM project_translations WHERE project_id = ?").run(projectId);
  const insert = db.prepare(
    `INSERT INTO project_translations (project_id, locale, name, description, seo_title, seo_description)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  for (const translation of translations) {
    insert.run(
      projectId,
      translation.locale,
      translation.name,
      translation.description,
      translation.seoTitle,
      translation.seoDescription
    );
  }
}

function toPublicProject(project: ProjectRecord, requestedLocale: Locale): PublicProjectRecord | undefined {
  const translation =
    project.translations.find((candidate) => candidate.locale === requestedLocale) ??
    project.translations.find((candidate) => candidate.locale !== requestedLocale);
  return translation ? { ...project, requestedLocale, translation } : undefined;
}

export function listAdminProjects(db: BlogDatabase): ProjectRecord[] {
  const rows = db
    .prepare(
      `SELECT ${PROJECT_COLUMNS}
       FROM projects
       ORDER BY is_featured DESC, sort_order ASC, id DESC`
    )
    .all() as ProjectRow[];
  return hydrateProjects(db, rows);
}

export function getAdminProjectById(db: BlogDatabase, id: number): ProjectRecord | undefined {
  const row = db.prepare(`SELECT ${PROJECT_COLUMNS} FROM projects WHERE id = ?`).get(id) as ProjectRow | undefined;
  return row ? hydrateProject(db, row) : undefined;
}

export function createProject(db: BlogDatabase, input: UpsertProjectInput): ProjectRecord {
  const parsed = normalizeProjectInput(input);
  return db.transaction(() => {
    if (projectSlugExists(db, parsed.slug)) {
      throw new ProjectSlugConflictError();
    }

    const now = new Date().toISOString();
    const result = db
      .prepare(
        `INSERT INTO projects (
           slug, tech_stack_json, cover_url, github_url, demo_url,
           sort_order, is_visible, is_featured, created_at, updated_at
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        parsed.slug,
        JSON.stringify(parsed.techStack),
        parsed.coverUrl,
        parsed.githubUrl,
        parsed.demoUrl,
        parsed.sortOrder,
        parsed.isVisible ? 1 : 0,
        parsed.isFeatured ? 1 : 0,
        now,
        now
      );
    const projectId = Number(result.lastInsertRowid);
    replaceTranslations(db, projectId, parsed.translations);
    return getAdminProjectById(db, projectId) as ProjectRecord;
  })();
}

export function updateProject(db: BlogDatabase, id: number, input: UpsertProjectInput): ProjectRecord | undefined {
  const parsed = normalizeProjectInput(input);
  return db.transaction(() => {
    if (!getAdminProjectById(db, id)) {
      return undefined;
    }
    if (projectSlugExists(db, parsed.slug, id)) {
      throw new ProjectSlugConflictError();
    }

    db.prepare(
      `UPDATE projects
       SET slug = ?, tech_stack_json = ?, cover_url = ?, github_url = ?, demo_url = ?,
           sort_order = ?, is_visible = ?, is_featured = ?, updated_at = ?
       WHERE id = ?`
    ).run(
      parsed.slug,
      JSON.stringify(parsed.techStack),
      parsed.coverUrl,
      parsed.githubUrl,
      parsed.demoUrl,
      parsed.sortOrder,
      parsed.isVisible ? 1 : 0,
      parsed.isFeatured ? 1 : 0,
      new Date().toISOString(),
      id
    );
    replaceTranslations(db, id, parsed.translations);
    return getAdminProjectById(db, id);
  })();
}

export function deleteProject(db: BlogDatabase, id: number): boolean {
  return db.prepare("DELETE FROM projects WHERE id = ?").run(id).changes > 0;
}

export function listPublicProjects(db: BlogDatabase, requestedLocale: Locale): PublicProjectRecord[] {
  const rows = db
    .prepare(
      `SELECT ${PROJECT_COLUMNS}
       FROM projects
       WHERE is_visible = 1
       ORDER BY is_featured DESC, sort_order ASC, id DESC`
    )
    .all() as ProjectRow[];
  return hydrateProjects(db, rows)
    .map((project) => toPublicProject(project, requestedLocale))
    .filter((project): project is PublicProjectRecord => project !== undefined);
}

export function getPublicProjectBySlug(
  db: BlogDatabase,
  slugInput: string,
  requestedLocale: Locale
): PublicProjectRecord | undefined {
  const slug = normalizeSlug(slugInput);
  if (!slug) {
    return undefined;
  }

  const row = db
    .prepare(`SELECT ${PROJECT_COLUMNS} FROM projects WHERE slug = ? AND is_visible = 1`)
    .get(slug) as ProjectRow | undefined;
  if (!row) {
    return undefined;
  }

  return toPublicProject(hydrateProject(db, row), requestedLocale);
}
