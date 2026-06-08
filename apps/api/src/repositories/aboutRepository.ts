import { UpsertAboutProfileInputSchema, type AboutProfile, type UpsertAboutProfileInput } from "@tworiver/shared";
import type { BlogDatabase } from "../db/connection.js";

interface AboutProfileRow {
  display_name: string;
  headline: string;
  bio: string;
  avatar_url: string;
  github_url: string;
  email: string;
  social_links_json: string;
  updated_at: string;
}

function parseSocialLinks(value: string): AboutProfile["socialLinks"] {
  try {
    const parsed = JSON.parse(value) as unknown;
    const result = UpsertAboutProfileInputSchema.shape.socialLinks.safeParse(parsed);
    return result.success ? result.data : [];
  } catch {
    return [];
  }
}

function mapRow(row: AboutProfileRow | undefined): AboutProfile {
  if (!row) {
    return {
      displayName: "",
      headline: "",
      bio: "",
      avatarUrl: "",
      githubUrl: "",
      email: "",
      socialLinks: [],
      updatedAt: null
    };
  }

  return {
    displayName: row.display_name,
    headline: row.headline,
    bio: row.bio,
    avatarUrl: row.avatar_url,
    githubUrl: row.github_url,
    email: row.email,
    socialLinks: parseSocialLinks(row.social_links_json),
    updatedAt: row.updated_at
  };
}

export function getAboutProfile(db: BlogDatabase): AboutProfile {
  const row = db
    .prepare(
      `SELECT display_name, headline, bio, avatar_url, github_url, email, social_links_json, updated_at
       FROM about_profile
       WHERE id = 1`
    )
    .get() as AboutProfileRow | undefined;

  return mapRow(row);
}

export function updateAboutProfile(db: BlogDatabase, input: UpsertAboutProfileInput): AboutProfile {
  const parsed = UpsertAboutProfileInputSchema.parse(input);
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO about_profile (
      id,
      display_name,
      headline,
      bio,
      avatar_url,
      github_url,
      email,
      social_links_json,
      created_at,
      updated_at
    )
    VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      display_name = excluded.display_name,
      headline = excluded.headline,
      bio = excluded.bio,
      avatar_url = excluded.avatar_url,
      github_url = excluded.github_url,
      email = excluded.email,
      social_links_json = excluded.social_links_json,
      updated_at = excluded.updated_at`
  ).run(
    parsed.displayName.trim(),
    parsed.headline.trim(),
    parsed.bio.trim(),
    parsed.avatarUrl.trim(),
    parsed.githubUrl.trim(),
    parsed.email.trim(),
    JSON.stringify(parsed.socialLinks.map((link) => ({ label: link.label.trim(), url: link.url.trim() }))),
    now,
    now
  );

  return getAboutProfile(db);
}
