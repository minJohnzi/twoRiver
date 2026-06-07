# Minimal Bilingual Tech Blog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deployable bilingual personal technical blog with a React/Vite frontend, Fastify API, SQLite storage, single-admin authentication, and Markdown editing with live preview.

**Architecture:** Use a single monorepo with `apps/web` for the public blog and admin UI, `apps/api` for Fastify and SQLite, and `packages/shared` for shared TypeScript schemas. The public site reads published posts through public API endpoints; the admin area authenticates with an HttpOnly session cookie and uses protected admin endpoints.

**Tech Stack:** pnpm workspaces, TypeScript, React, Vite, Fastify, better-sqlite3, @fastify/cookie, argon2, zod, Vitest, React Testing Library, Playwright-compatible browser verification, Nginx, systemd.

---

## File Structure

Create this structure:

```text
package.json
pnpm-workspace.yaml
tsconfig.base.json
.gitignore
.env.example
README.md
docs/deployment/ubuntu.md

packages/shared/
  package.json
  tsconfig.json
  src/index.ts
  src/schemas.ts

apps/api/
  package.json
  tsconfig.json
  vitest.config.ts
  src/main.ts
  src/app.ts
  src/config.ts
  src/db/connection.ts
  src/db/schema.sql
  src/db/migrate.ts
  src/db/seedAdmin.ts
  src/plugins/auth.ts
  src/repositories/postsRepository.ts
  src/repositories/tagsRepository.ts
  src/routes/authRoutes.ts
  src/routes/publicRoutes.ts
  src/routes/adminPostRoutes.ts
  src/routes/adminTagRoutes.ts
  src/services/passwordService.ts
  src/services/sessionService.ts
  src/services/slugService.ts
  src/services/ai/aiClient.ts
  src/services/ai/summaryService.ts
  tests/auth.test.ts
  tests/posts.test.ts

apps/web/
  package.json
  tsconfig.json
  vite.config.ts
  index.html
  src/main.tsx
  src/App.tsx
  src/api/client.ts
  src/api/posts.ts
  src/api/admin.ts
  src/components/Layout.tsx
  src/components/LanguageToggle.tsx
  src/components/MarkdownPreview.tsx
  src/components/TagFilter.tsx
  src/pages/HomePage.tsx
  src/pages/PostPage.tsx
  src/pages/AboutPage.tsx
  src/pages/LoginPage.tsx
  src/pages/AdminPostsPage.tsx
  src/pages/AdminEditorPage.tsx
  src/styles/global.css
  src/styles/markdown.css
  src/test/setup.ts
  src/pages/AdminEditorPage.test.tsx
```

## Task 1: Workspace Scaffold

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `README.md`

- [ ] **Step 1: Create root package metadata**

Create `package.json`:

```json
{
  "name": "tworiver-blog",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "pnpm --parallel --filter @tworiver/api --filter @tworiver/web dev",
    "build": "pnpm -r build",
    "typecheck": "pnpm -r typecheck",
    "test": "pnpm -r test",
    "lint": "pnpm -r lint",
    "api:migrate": "pnpm --filter @tworiver/api migrate",
    "api:seed-admin": "pnpm --filter @tworiver/api seed:admin"
  },
  "packageManager": "pnpm@9.15.4",
  "devDependencies": {
    "typescript": "^5.8.3"
  }
}
```

- [ ] **Step 2: Create workspace config**

Create `pnpm-workspace.yaml`:

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

- [ ] **Step 3: Create shared TypeScript base config**

Create `tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "skipLibCheck": true
  }
}
```

- [ ] **Step 4: Create ignore rules**

Create `.gitignore`:

```gitignore
node_modules/
dist/
coverage/
.env
.env.local
*.sqlite
*.sqlite-shm
*.sqlite-wal
apps/api/data/
```

- [ ] **Step 5: Create environment example**

Create `.env.example`:

```bash
NODE_ENV=development
PORT=4000
DATABASE_PATH=./apps/api/data/blog.sqlite
SESSION_SECRET=replace-with-at-least-32-random-characters
ADMIN_USERNAME=admin
ADMIN_PASSWORD=change-me-before-deploy
DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=https://api.deepseek.com
VITE_API_BASE_URL=http://localhost:4000
```

- [ ] **Step 6: Create README**

Create `README.md`:

```markdown
# TwoRiver Blog

A minimal bilingual technical blog with a React/Vite frontend, Fastify API, SQLite database, and single-admin publishing backend.

## Development

```bash
pnpm install
cp .env.example .env
pnpm api:migrate
pnpm api:seed-admin
pnpm dev
```

The frontend runs on Vite. The API runs on Fastify and reads configuration from environment variables.

## Build

```bash
pnpm build
pnpm typecheck
pnpm test
```
```

- [ ] **Step 7: Verify root scaffold**

Run:

```bash
pnpm --version
pnpm install
pnpm typecheck
```

Expected:

```text
No workspace packages fail type checking.
```

- [ ] **Step 8: Commit scaffold**

Run:

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json .gitignore .env.example README.md
git commit -m "chore: scaffold blog workspace"
```

## Task 2: Shared Types And Schemas

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/schemas.ts`
- Create: `packages/shared/src/index.ts`

- [ ] **Step 1: Create shared package**

Create `packages/shared/package.json`:

```json
{
  "name": "@tworiver/shared",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "echo \"shared package has no tests\"",
    "lint": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "zod": "^3.25.56"
  },
  "devDependencies": {
    "typescript": "^5.8.3"
  }
}
```

- [ ] **Step 2: Create shared tsconfig**

Create `packages/shared/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "declaration": true,
    "declarationMap": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create shared schemas**

Create `packages/shared/src/schemas.ts`:

```ts
import { z } from "zod";

export const LocaleSchema = z.enum(["zh", "en"]);
export type Locale = z.infer<typeof LocaleSchema>;

export const PostStatusSchema = z.enum(["draft", "published"]);
export type PostStatus = z.infer<typeof PostStatusSchema>;

export const TagSchema = z.object({
  id: z.number().int().positive(),
  slug: z.string().min(1),
  name: z.string().min(1)
});
export type Tag = z.infer<typeof TagSchema>;

export const PostTranslationSchema = z.object({
  locale: LocaleSchema,
  title: z.string().min(1),
  summary: z.string().default(""),
  contentMarkdown: z.string().default(""),
  seoTitle: z.string().nullable().default(null),
  seoDescription: z.string().nullable().default(null)
});
export type PostTranslation = z.infer<typeof PostTranslationSchema>;

export const PublicPostListItemSchema = z.object({
  id: z.number().int().positive(),
  slug: z.string().min(1),
  status: PostStatusSchema,
  publishedAt: z.string().nullable(),
  tags: z.array(TagSchema),
  translations: z.array(PostTranslationSchema)
});
export type PublicPostListItem = z.infer<typeof PublicPostListItemSchema>;

export const PublicPostSchema = PublicPostListItemSchema.extend({
  createdAt: z.string(),
  updatedAt: z.string()
});
export type PublicPost = z.infer<typeof PublicPostSchema>;

export const UpsertPostInputSchema = z.object({
  slug: z.string().min(1).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  status: PostStatusSchema,
  publishedAt: z.string().nullable(),
  tagSlugs: z.array(z.string().min(1)).default([]),
  translations: z.array(PostTranslationSchema).min(1)
});
export type UpsertPostInput = z.infer<typeof UpsertPostInputSchema>;

export const LoginInputSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1)
});
export type LoginInput = z.infer<typeof LoginInputSchema>;
```

- [ ] **Step 4: Export shared package API**

Create `packages/shared/src/index.ts`:

```ts
export * from "./schemas";
```

- [ ] **Step 5: Verify shared package**

Run:

```bash
pnpm --filter @tworiver/shared typecheck
```

Expected:

```text
No TypeScript errors.
```

- [ ] **Step 6: Commit shared types**

Run:

```bash
git add packages/shared
git commit -m "feat: add shared blog schemas"
```

## Task 3: Fastify API Foundation And Database

**Files:**
- Create: `apps/api/package.json`
- Create: `apps/api/tsconfig.json`
- Create: `apps/api/vitest.config.ts`
- Create: `apps/api/src/config.ts`
- Create: `apps/api/src/db/schema.sql`
- Create: `apps/api/src/db/connection.ts`
- Create: `apps/api/src/db/migrate.ts`
- Create: `apps/api/src/main.ts`
- Create: `apps/api/src/app.ts`

- [ ] **Step 1: Create API package**

Create `apps/api/package.json`:

```json
{
  "name": "@tworiver/api",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/main.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/main.js",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
    "lint": "tsc -p tsconfig.json --noEmit",
    "migrate": "tsx src/db/migrate.ts",
    "seed:admin": "tsx src/db/seedAdmin.ts"
  },
  "dependencies": {
    "@fastify/cookie": "^11.0.2",
    "@tworiver/shared": "workspace:*",
    "argon2": "^0.41.1",
    "better-sqlite3": "^11.10.0",
    "fastify": "^5.3.3",
    "zod": "^3.25.56"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.13",
    "@types/node": "^22.15.29",
    "tsx": "^4.19.4",
    "typescript": "^5.8.3",
    "vitest": "^3.2.1"
  }
}
```

- [ ] **Step 2: Create API tsconfig**

Create `apps/api/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "types": ["node"]
  },
  "include": ["src", "tests"]
}
```

- [ ] **Step 3: Create Vitest config**

Create `apps/api/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"]
  }
});
```

- [ ] **Step 4: Create config reader**

Create `apps/api/src/config.ts`:

```ts
import { z } from "zod";

const ConfigSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_PATH: z.string().default("./apps/api/data/blog.sqlite"),
  SESSION_SECRET: z.string().min(32).default("development-session-secret-change-me"),
  ADMIN_USERNAME: z.string().default("admin"),
  ADMIN_PASSWORD: z.string().default("change-me-before-deploy"),
  DEEPSEEK_API_KEY: z.string().optional(),
  DEEPSEEK_BASE_URL: z.string().url().default("https://api.deepseek.com")
});

export type AppConfig = z.infer<typeof ConfigSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return ConfigSchema.parse(env);
}
```

- [ ] **Step 5: Create SQLite schema**

Create `apps/api/src/db/schema.sql`:

```sql
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('draft', 'published')),
  published_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
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
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (post_id, locale),
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS post_tags (
  post_id INTEGER NOT NULL,
  tag_id INTEGER NOT NULL,
  PRIMARY KEY (post_id, tag_id),
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_posts_status_published_at ON posts(status, published_at);
CREATE INDEX IF NOT EXISTS idx_post_translations_locale ON post_translations(locale);
CREATE INDEX IF NOT EXISTS idx_tags_slug ON tags(slug);
```

- [ ] **Step 6: Create DB connection**

Create `apps/api/src/db/connection.ts`:

```ts
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

export type BlogDatabase = Database.Database;

export function openDatabase(databasePath: string): BlogDatabase {
  const directory = path.dirname(databasePath);
  fs.mkdirSync(directory, { recursive: true });
  const db = new Database(databasePath);
  db.pragma("foreign_keys = ON");
  db.pragma("journal_mode = WAL");
  return db;
}
```

- [ ] **Step 7: Create migration script**

Create `apps/api/src/db/migrate.ts`:

```ts
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../config.js";
import { openDatabase } from "./connection.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function migrate(databasePath = loadConfig().DATABASE_PATH): void {
  const schemaPath = path.join(__dirname, "schema.sql");
  const schema = fs.readFileSync(schemaPath, "utf8");
  const db = openDatabase(databasePath);
  db.exec(schema);
  db.close();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  migrate();
}
```

- [ ] **Step 8: Create Fastify app**

Create `apps/api/src/app.ts`:

```ts
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import type { BlogDatabase } from "./db/connection.js";
import type { AppConfig } from "./config.js";

export interface BuildAppOptions {
  config: AppConfig;
  db: BlogDatabase;
}

export function buildApp({ config }: BuildAppOptions) {
  const app = Fastify({ logger: config.NODE_ENV !== "test" });

  app.register(cookie, {
    secret: config.SESSION_SECRET
  });

  app.get("/api/health", async () => ({
    ok: true,
    service: "tworiver-blog-api"
  }));

  return app;
}
```

- [ ] **Step 9: Create API entrypoint**

Create `apps/api/src/main.ts`:

```ts
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { openDatabase } from "./db/connection.js";

const config = loadConfig();
const db = openDatabase(config.DATABASE_PATH);
const app = buildApp({ config, db });

await app.listen({ port: config.PORT, host: "0.0.0.0" });
```

- [ ] **Step 10: Verify API foundation**

Run:

```bash
pnpm --filter @tworiver/api typecheck
pnpm --filter @tworiver/api migrate
pnpm --filter @tworiver/api test
```

Expected:

```text
No TypeScript errors.
Migration exits successfully.
Vitest exits successfully.
```

- [ ] **Step 11: Commit API foundation**

Run:

```bash
git add apps/api
git commit -m "feat: add Fastify API foundation"
```

## Task 4: Authentication And Admin Seeding

**Files:**
- Create: `apps/api/src/services/passwordService.ts`
- Create: `apps/api/src/services/sessionService.ts`
- Create: `apps/api/src/plugins/auth.ts`
- Create: `apps/api/src/db/seedAdmin.ts`
- Create: `apps/api/src/routes/authRoutes.ts`
- Create: `apps/api/tests/auth.test.ts`
- Modify: `apps/api/src/app.ts`

- [ ] **Step 1: Write auth tests**

Create `apps/api/tests/auth.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { buildApp } from "../src/app.js";
import { openDatabase, type BlogDatabase } from "../src/db/connection.js";
import { migrate } from "../src/db/migrate.js";
import { seedAdmin } from "../src/db/seedAdmin.js";
import type { AppConfig } from "../src/config.js";

describe("auth routes", () => {
  let db: BlogDatabase;
  let databasePath: string;
  let config: AppConfig;

  beforeEach(async () => {
    databasePath = path.join(os.tmpdir(), `tworiver-auth-${randomUUID()}.sqlite`);
    config = {
      NODE_ENV: "test",
      PORT: 0,
      DATABASE_PATH: databasePath,
      SESSION_SECRET: "test-session-secret-with-more-than-32-chars",
      ADMIN_USERNAME: "admin",
      ADMIN_PASSWORD: "secret123",
      DEEPSEEK_BASE_URL: "https://api.deepseek.com"
    };
    migrate(databasePath);
    db = openDatabase(databasePath);
    await seedAdmin(db, config.ADMIN_USERNAME, config.ADMIN_PASSWORD);
  });

  afterEach(() => {
    db.close();
  });

  it("rejects invalid credentials", async () => {
    const app = buildApp({ config, db });
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "admin", password: "wrong" }
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ message: "Invalid username or password" });
  });

  it("logs in and returns current user", async () => {
    const app = buildApp({ config, db });
    const login = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "admin", password: "secret123" }
    });

    expect(login.statusCode).toBe(200);
    const cookie = login.cookies[0];
    expect(cookie.name).toBe("tworiver_session");
    expect(cookie.httpOnly).toBe(true);

    const me = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      cookies: { tworiver_session: cookie.value }
    });

    expect(me.statusCode).toBe(200);
    expect(me.json()).toEqual({ user: { id: 1, username: "admin" } });
  });
});
```

- [ ] **Step 2: Run auth tests to verify failure**

Run:

```bash
pnpm --filter @tworiver/api test -- auth.test.ts
```

Expected:

```text
FAIL because seedAdmin and auth routes do not exist yet.
```

- [ ] **Step 3: Implement password service**

Create `apps/api/src/services/passwordService.ts`:

```ts
import argon2 from "argon2";

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password);
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  return argon2.verify(hash, password);
}
```

- [ ] **Step 4: Implement session service**

Create `apps/api/src/services/sessionService.ts`:

```ts
import { randomBytes } from "node:crypto";
import type { BlogDatabase } from "../db/connection.js";

export interface SessionUser {
  id: number;
  username: string;
}

export function createSession(db: BlogDatabase, userId: number): string {
  const sessionId = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString();
  db.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)").run(sessionId, userId, expiresAt);
  return sessionId;
}

export function getSessionUser(db: BlogDatabase, sessionId: string): SessionUser | null {
  const row = db
    .prepare(
      `SELECT users.id, users.username
       FROM sessions
       JOIN users ON users.id = sessions.user_id
       WHERE sessions.id = ? AND sessions.expires_at > datetime('now')`
    )
    .get(sessionId) as SessionUser | undefined;

  return row ?? null;
}

export function deleteSession(db: BlogDatabase, sessionId: string): void {
  db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
}
```

- [ ] **Step 5: Implement admin seed**

Create `apps/api/src/db/seedAdmin.ts`:

```ts
import { loadConfig } from "../config.js";
import { openDatabase, type BlogDatabase } from "./connection.js";
import { hashPassword } from "../services/passwordService.js";

export async function seedAdmin(db: BlogDatabase, username: string, password: string): Promise<void> {
  const passwordHash = await hashPassword(password);
  db.prepare(
    `INSERT INTO users (username, password_hash)
     VALUES (?, ?)
     ON CONFLICT(username) DO UPDATE SET password_hash = excluded.password_hash, updated_at = datetime('now')`
  ).run(username, passwordHash);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const config = loadConfig();
  const db = openDatabase(config.DATABASE_PATH);
  await seedAdmin(db, config.ADMIN_USERNAME, config.ADMIN_PASSWORD);
  db.close();
}
```

- [ ] **Step 6: Implement auth plugin**

Create `apps/api/src/plugins/auth.ts`:

```ts
import fp from "fastify-plugin";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { BlogDatabase } from "../db/connection.js";
import { getSessionUser, type SessionUser } from "../services/sessionService.js";

declare module "fastify" {
  interface FastifyInstance {
    db: BlogDatabase;
    requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void>;
  }

  interface FastifyRequest {
    user: SessionUser | null;
  }
}

export const authPlugin = fp<{ db: BlogDatabase }>(async (app, { db }) => {
  app.decorate("db", db);
  app.decorateRequest("user", null);

  app.decorate("requireAuth", async (request, reply) => {
    const sessionId = request.cookies.tworiver_session;
    if (!sessionId) {
      reply.code(401).send({ message: "Authentication required" });
      return;
    }

    const user = getSessionUser(db, sessionId);
    if (!user) {
      reply.code(401).send({ message: "Authentication required" });
      return;
    }

    request.user = user;
  });
});
```

- [ ] **Step 7: Implement auth routes**

Create `apps/api/src/routes/authRoutes.ts`:

```ts
import type { FastifyInstance } from "fastify";
import { LoginInputSchema } from "@tworiver/shared";
import { createSession, deleteSession, getSessionUser } from "../services/sessionService.js";
import { verifyPassword } from "../services/passwordService.js";

export async function authRoutes(app: FastifyInstance) {
  app.post("/api/auth/login", async (request, reply) => {
    const input = LoginInputSchema.parse(request.body);
    const user = app.db
      .prepare("SELECT id, username, password_hash AS passwordHash FROM users WHERE username = ?")
      .get(input.username) as { id: number; username: string; passwordHash: string } | undefined;

    if (!user || !(await verifyPassword(user.passwordHash, input.password))) {
      reply.code(401).send({ message: "Invalid username or password" });
      return;
    }

    const sessionId = createSession(app.db, user.id);
    reply.setCookie("tworiver_session", sessionId, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production"
    });
    return { user: { id: user.id, username: user.username } };
  });

  app.post("/api/auth/logout", async (request, reply) => {
    const sessionId = request.cookies.tworiver_session;
    if (sessionId) {
      deleteSession(app.db, sessionId);
    }
    reply.clearCookie("tworiver_session", { path: "/" });
    return { ok: true };
  });

  app.get("/api/auth/me", async (request, reply) => {
    const sessionId = request.cookies.tworiver_session;
    if (!sessionId) {
      reply.code(401).send({ message: "Authentication required" });
      return;
    }
    const user = getSessionUser(app.db, sessionId);
    if (!user) {
      reply.code(401).send({ message: "Authentication required" });
      return;
    }
    return { user };
  });
}
```

- [ ] **Step 8: Register auth plugin and routes**

Modify `apps/api/src/app.ts`:

```ts
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import type { BlogDatabase } from "./db/connection.js";
import type { AppConfig } from "./config.js";
import { authPlugin } from "./plugins/auth.js";
import { authRoutes } from "./routes/authRoutes.js";

export interface BuildAppOptions {
  config: AppConfig;
  db: BlogDatabase;
}

export function buildApp({ config, db }: BuildAppOptions) {
  const app = Fastify({ logger: config.NODE_ENV !== "test" });

  app.register(cookie, {
    secret: config.SESSION_SECRET
  });
  app.register(authPlugin, { db });
  app.register(authRoutes);

  app.get("/api/health", async () => ({
    ok: true,
    service: "tworiver-blog-api"
  }));

  return app;
}
```

- [ ] **Step 9: Verify auth**

Run:

```bash
pnpm --filter @tworiver/api test -- auth.test.ts
pnpm --filter @tworiver/api typecheck
```

Expected:

```text
auth.test.ts passes.
No TypeScript errors.
```

- [ ] **Step 10: Commit auth**

Run:

```bash
git add apps/api/src apps/api/tests/auth.test.ts
git commit -m "feat: add single admin authentication"
```

## Task 5: Post And Tag API

**Files:**
- Create: `apps/api/src/services/slugService.ts`
- Create: `apps/api/src/repositories/tagsRepository.ts`
- Create: `apps/api/src/repositories/postsRepository.ts`
- Create: `apps/api/src/routes/publicRoutes.ts`
- Create: `apps/api/src/routes/adminPostRoutes.ts`
- Create: `apps/api/src/routes/adminTagRoutes.ts`
- Create: `apps/api/tests/posts.test.ts`
- Modify: `apps/api/src/app.ts`

- [ ] **Step 1: Write post API tests**

Create `apps/api/tests/posts.test.ts` with tests that cover:

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { buildApp } from "../src/app.js";
import { migrate } from "../src/db/migrate.js";
import { seedAdmin } from "../src/db/seedAdmin.js";
import { openDatabase, type BlogDatabase } from "../src/db/connection.js";
import type { AppConfig } from "../src/config.js";

describe("post routes", () => {
  let db: BlogDatabase;
  let config: AppConfig;

  beforeEach(async () => {
    const databasePath = path.join(os.tmpdir(), `tworiver-posts-${randomUUID()}.sqlite`);
    config = {
      NODE_ENV: "test",
      PORT: 0,
      DATABASE_PATH: databasePath,
      SESSION_SECRET: "test-session-secret-with-more-than-32-chars",
      ADMIN_USERNAME: "admin",
      ADMIN_PASSWORD: "secret123",
      DEEPSEEK_BASE_URL: "https://api.deepseek.com"
    };
    migrate(databasePath);
    db = openDatabase(databasePath);
    await seedAdmin(db, "admin", "secret123");
  });

  afterEach(() => {
    db.close();
  });

  async function login(app: ReturnType<typeof buildApp>) {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "admin", password: "secret123" }
    });
    return response.cookies[0].value;
  }

  it("hides drafts from public list", async () => {
    const app = buildApp({ config, db });
    const session = await login(app);
    await app.inject({
      method: "POST",
      url: "/api/admin/posts",
      cookies: { tworiver_session: session },
      payload: {
        slug: "draft-post",
        status: "draft",
        publishedAt: null,
        tagSlugs: ["typescript"],
        translations: [{ locale: "zh", title: "草稿", summary: "摘要", contentMarkdown: "# 草稿" }]
      }
    });

    const publicList = await app.inject({ method: "GET", url: "/api/posts" });
    expect(publicList.statusCode).toBe(200);
    expect(publicList.json()).toEqual({ posts: [] });
  });

  it("creates and reads a published bilingual post", async () => {
    const app = buildApp({ config, db });
    const session = await login(app);
    const create = await app.inject({
      method: "POST",
      url: "/api/admin/posts",
      cookies: { tworiver_session: session },
      payload: {
        slug: "hello-react",
        status: "published",
        publishedAt: "2026-06-07T00:00:00.000Z",
        tagSlugs: ["react", "sqlite"],
        translations: [
          { locale: "zh", title: "你好 React", summary: "中文摘要", contentMarkdown: "# 你好" },
          { locale: "en", title: "Hello React", summary: "English summary", contentMarkdown: "# Hello" }
        ]
      }
    });

    expect(create.statusCode).toBe(201);

    const detail = await app.inject({ method: "GET", url: "/api/posts/hello-react" });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().post.slug).toBe("hello-react");
    expect(detail.json().post.translations).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
pnpm --filter @tworiver/api test -- posts.test.ts
```

Expected:

```text
FAIL because post routes and repositories do not exist yet.
```

- [ ] **Step 3: Implement slug service**

Create `apps/api/src/services/slugService.ts`:

```ts
export function normalizeSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
```

- [ ] **Step 4: Implement tag repository**

Create `apps/api/src/repositories/tagsRepository.ts`:

```ts
import type { BlogDatabase } from "../db/connection.js";
import { normalizeSlug } from "../services/slugService.js";

export interface TagRow {
  id: number;
  slug: string;
  name: string;
}

export function listTags(db: BlogDatabase): TagRow[] {
  return db.prepare("SELECT id, slug, name FROM tags ORDER BY name ASC").all() as TagRow[];
}

export function ensureTags(db: BlogDatabase, tagSlugs: string[]): TagRow[] {
  return tagSlugs.map((rawSlug) => {
    const slug = normalizeSlug(rawSlug);
    const name = rawSlug.trim();
    db.prepare(
      `INSERT INTO tags (slug, name)
       VALUES (?, ?)
       ON CONFLICT(slug) DO UPDATE SET name = excluded.name, updated_at = datetime('now')`
    ).run(slug, name);
    return db.prepare("SELECT id, slug, name FROM tags WHERE slug = ?").get(slug) as TagRow;
  });
}
```

- [ ] **Step 5: Implement post repository**

Create `apps/api/src/repositories/postsRepository.ts` with `createPost`, `updatePost`, `listPublicPosts`, `getPublicPostBySlug`, `listAdminPosts`, and `getAdminPostById`. Use `UpsertPostInputSchema` before writing data. The implementation must:

```text
Insert or update posts inside a transaction.
Replace post translations for the post.
Replace post tag links for the post.
Only return published posts from public methods.
Map snake_case database fields to camelCase API fields.
```

Use this mapping shape:

```ts
export interface PostRecord {
  id: number;
  slug: string;
  status: "draft" | "published";
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  tags: Array<{ id: number; slug: string; name: string }>;
  translations: Array<{
    locale: "zh" | "en";
    title: string;
    summary: string;
    contentMarkdown: string;
    seoTitle: string | null;
    seoDescription: string | null;
  }>;
}
```

- [ ] **Step 6: Implement public routes**

Create `apps/api/src/routes/publicRoutes.ts`:

```ts
import type { FastifyInstance } from "fastify";
import { getPublicPostBySlug, listPublicPosts } from "../repositories/postsRepository.js";
import { listTags } from "../repositories/tagsRepository.js";

export async function publicRoutes(app: FastifyInstance) {
  app.get("/api/posts", async () => ({ posts: listPublicPosts(app.db) }));

  app.get<{ Params: { slug: string } }>("/api/posts/:slug", async (request, reply) => {
    const post = getPublicPostBySlug(app.db, request.params.slug);
    if (!post) {
      reply.code(404).send({ message: "Post not found" });
      return;
    }
    return { post };
  });

  app.get("/api/tags", async () => ({ tags: listTags(app.db) }));
}
```

- [ ] **Step 7: Implement admin post routes**

Create `apps/api/src/routes/adminPostRoutes.ts` with protected CRUD routes:

```ts
import type { FastifyInstance } from "fastify";
import { UpsertPostInputSchema } from "@tworiver/shared";
import {
  createPost,
  deletePost,
  getAdminPostById,
  listAdminPosts,
  updatePost
} from "../repositories/postsRepository.js";

export async function adminPostRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.requireAuth);

  app.get("/api/admin/posts", async () => ({ posts: listAdminPosts(app.db) }));

  app.post("/api/admin/posts", async (request, reply) => {
    const input = UpsertPostInputSchema.parse(request.body);
    const post = createPost(app.db, input);
    reply.code(201);
    return { post };
  });

  app.get<{ Params: { id: string } }>("/api/admin/posts/:id", async (request, reply) => {
    const post = getAdminPostById(app.db, Number(request.params.id));
    if (!post) {
      reply.code(404).send({ message: "Post not found" });
      return;
    }
    return { post };
  });

  app.put<{ Params: { id: string } }>("/api/admin/posts/:id", async (request, reply) => {
    const input = UpsertPostInputSchema.parse(request.body);
    const post = updatePost(app.db, Number(request.params.id), input);
    if (!post) {
      reply.code(404).send({ message: "Post not found" });
      return;
    }
    return { post };
  });

  app.delete<{ Params: { id: string } }>("/api/admin/posts/:id", async (request) => {
    deletePost(app.db, Number(request.params.id));
    return { ok: true };
  });
}
```

- [ ] **Step 8: Implement admin tag routes**

Create `apps/api/src/routes/adminTagRoutes.ts` with authenticated list/create/update/delete tag endpoints. Reuse `listTags` and normalize tag slugs with `normalizeSlug`.

- [ ] **Step 9: Register post and tag routes**

Modify `apps/api/src/app.ts` to register:

```ts
import { publicRoutes } from "./routes/publicRoutes.js";
import { adminPostRoutes } from "./routes/adminPostRoutes.js";
import { adminTagRoutes } from "./routes/adminTagRoutes.js";

app.register(publicRoutes);
app.register(adminPostRoutes);
app.register(adminTagRoutes);
```

- [ ] **Step 10: Verify post API**

Run:

```bash
pnpm --filter @tworiver/api test -- posts.test.ts
pnpm --filter @tworiver/api typecheck
```

Expected:

```text
posts.test.ts passes.
No TypeScript errors.
```

- [ ] **Step 11: Commit post API**

Run:

```bash
git add apps/api/src apps/api/tests/posts.test.ts
git commit -m "feat: add post and tag APIs"
```

## Task 6: React/Vite Frontend Foundation

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/vite.config.ts`
- Create: `apps/web/index.html`
- Create: `apps/web/src/main.tsx`
- Create: `apps/web/src/App.tsx`
- Create: `apps/web/src/api/client.ts`
- Create: `apps/web/src/api/posts.ts`
- Create: `apps/web/src/components/Layout.tsx`
- Create: `apps/web/src/components/LanguageToggle.tsx`
- Create: `apps/web/src/components/TagFilter.tsx`
- Create: `apps/web/src/pages/HomePage.tsx`
- Create: `apps/web/src/pages/PostPage.tsx`
- Create: `apps/web/src/pages/AboutPage.tsx`
- Create: `apps/web/src/styles/global.css`
- Create: `apps/web/src/styles/markdown.css`

- [ ] **Step 1: Create web package**

Create `apps/web/package.json`:

```json
{
  "name": "@tworiver/web",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite --host 0.0.0.0",
    "build": "tsc -p tsconfig.json && vite build",
    "preview": "vite preview --host 0.0.0.0",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
    "lint": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@tworiver/shared": "workspace:*",
    "@vitejs/plugin-react": "^4.5.1",
    "highlight.js": "^11.11.1",
    "marked": "^15.0.12",
    "react": "^19.1.0",
    "react-dom": "^19.1.0",
    "react-router-dom": "^7.6.2"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.3.0",
    "@types/react": "^19.1.6",
    "@types/react-dom": "^19.1.5",
    "jsdom": "^26.1.0",
    "typescript": "^5.8.3",
    "vite": "^6.3.5",
    "vitest": "^3.2.1"
  }
}
```

- [ ] **Step 2: Create web tsconfig and Vite config**

Create `apps/web/tsconfig.json` and `apps/web/vite.config.ts` with React plugin, `jsdom` test environment, and proxy `/api` to `http://localhost:4000` during development.

- [ ] **Step 3: Implement API client**

Create `apps/web/src/api/client.ts`:

```ts
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {})
    }
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(error.message ?? response.statusText);
  }

  return response.json() as Promise<T>;
}
```

- [ ] **Step 4: Implement public API wrapper**

Create `apps/web/src/api/posts.ts`:

```ts
import type { PublicPost, PublicPostListItem, Tag } from "@tworiver/shared";
import { apiRequest } from "./client";

export function fetchPosts() {
  return apiRequest<{ posts: PublicPostListItem[] }>("/api/posts");
}

export function fetchPost(slug: string) {
  return apiRequest<{ post: PublicPost }>(`/api/posts/${slug}`);
}

export function fetchTags() {
  return apiRequest<{ tags: Tag[] }>("/api/tags");
}
```

- [ ] **Step 5: Implement layout and public pages**

Create layout and pages with these behaviors:

```text
Layout: header with TwoRiver, Blog, About, Admin, language toggle.
HomePage: fetch posts and tags, filter posts by selected tag, display localized title and summary.
PostPage: fetch by slug, render localized Markdown with fallback to available translation.
AboutPage: static bilingual personal intro using neutral first-release copy: Chinese text says this is a personal technical blog focused on software engineering notes, and English text says the same in concise English.
```

The public design must be minimal and content-focused. Use a max-width reading column, readable line height, subdued borders, and no card-heavy marketing layout.

- [ ] **Step 6: Implement global styles**

Create `apps/web/src/styles/global.css` and `apps/web/src/styles/markdown.css` with:

```text
System font stack.
White or near-white page background.
Readable text color.
Small header.
Max-width content container.
Responsive article list.
Code block styling using highlight.js classes.
Mobile-safe spacing.
```

- [ ] **Step 7: Verify public frontend build**

Run:

```bash
pnpm --filter @tworiver/web typecheck
pnpm --filter @tworiver/web build
```

Expected:

```text
No TypeScript errors.
Vite production build succeeds.
```

- [ ] **Step 8: Commit frontend foundation**

Run:

```bash
git add apps/web
git commit -m "feat: add public React blog frontend"
```

## Task 7: Admin UI And Markdown Preview

**Files:**
- Create: `apps/web/src/api/admin.ts`
- Create: `apps/web/src/components/MarkdownPreview.tsx`
- Create: `apps/web/src/pages/LoginPage.tsx`
- Create: `apps/web/src/pages/AdminPostsPage.tsx`
- Create: `apps/web/src/pages/AdminEditorPage.tsx`
- Create: `apps/web/src/test/setup.ts`
- Create: `apps/web/src/pages/AdminEditorPage.test.tsx`
- Modify: `apps/web/src/App.tsx`

- [ ] **Step 1: Create admin editor test**

Create `apps/web/src/pages/AdminEditorPage.test.tsx`:

```tsx
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import userEvent from "@testing-library/user-event";
import { MarkdownPreview } from "../components/MarkdownPreview";

describe("MarkdownPreview", () => {
  it("renders headings and code blocks", async () => {
    render(<MarkdownPreview markdown={"# Title\n\n```ts\nconst value = 1;\n```"} />);

    expect(screen.getByRole("heading", { name: "Title" })).toBeInTheDocument();
    expect(screen.getByText("const value = 1;")).toBeInTheDocument();
  });
});

describe("admin editor behavior", () => {
  it("allows typing markdown source text", async () => {
    render(<textarea aria-label="Markdown body" defaultValue="" />);
    await userEvent.type(screen.getByLabelText("Markdown body"), "# Draft");
    expect(screen.getByLabelText("Markdown body")).toHaveValue("# Draft");
  });
});
```

- [ ] **Step 2: Run editor test to verify failure**

Run:

```bash
pnpm --filter @tworiver/web test -- AdminEditorPage.test.tsx
```

Expected:

```text
FAIL because MarkdownPreview does not exist yet.
```

- [ ] **Step 3: Implement MarkdownPreview**

Create `apps/web/src/components/MarkdownPreview.tsx`:

```tsx
import { marked } from "marked";
import hljs from "highlight.js";
import { useMemo } from "react";
import "highlight.js/styles/github.css";

marked.setOptions({
  highlight(code, language) {
    if (language && hljs.getLanguage(language)) {
      return hljs.highlight(code, { language }).value;
    }
    return hljs.highlightAuto(code).value;
  }
});

interface MarkdownPreviewProps {
  markdown: string;
}

export function MarkdownPreview({ markdown }: MarkdownPreviewProps) {
  const html = useMemo(() => marked.parse(markdown || ""), [markdown]);
  return <article className="markdown-body" dangerouslySetInnerHTML={{ __html: html }} />;
}
```

- [ ] **Step 4: Implement admin API wrapper**

Create `apps/web/src/api/admin.ts` with functions:

```ts
import type { PublicPost, UpsertPostInput } from "@tworiver/shared";
import { apiRequest } from "./client";

export function login(username: string, password: string) {
  return apiRequest<{ user: { id: number; username: string } }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password })
  });
}

export function logout() {
  return apiRequest<{ ok: true }>("/api/auth/logout", { method: "POST" });
}

export function fetchCurrentUser() {
  return apiRequest<{ user: { id: number; username: string } }>("/api/auth/me");
}

export function fetchAdminPosts() {
  return apiRequest<{ posts: PublicPost[] }>("/api/admin/posts");
}

export function fetchAdminPost(id: number) {
  return apiRequest<{ post: PublicPost }>(`/api/admin/posts/${id}`);
}

export function createAdminPost(input: UpsertPostInput) {
  return apiRequest<{ post: PublicPost }>("/api/admin/posts", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function updateAdminPost(id: number, input: UpsertPostInput) {
  return apiRequest<{ post: PublicPost }>(`/api/admin/posts/${id}`, {
    method: "PUT",
    body: JSON.stringify(input)
  });
}
```

- [ ] **Step 5: Implement login page**

Create `apps/web/src/pages/LoginPage.tsx` with username/password fields, submit handling through `login`, error display, and redirect to `/admin/posts` after successful login.

- [ ] **Step 6: Implement admin posts page**

Create `apps/web/src/pages/AdminPostsPage.tsx` with:

```text
Fetch protected admin posts.
Show status, slug, zh/en completeness, tags, updated time.
Link to new article editor.
Link to existing article editor.
```

- [ ] **Step 7: Implement admin editor**

Create `apps/web/src/pages/AdminEditorPage.tsx` with:

```text
Slug input.
Status selector.
Tag comma-separated input.
Language tabs for zh and en.
Title input for active language.
Summary textarea for active language.
Markdown textarea for active language.
Live MarkdownPreview pane.
Save draft button.
Publish button.
```

On save, construct `UpsertPostInput` with both translations that have title or body content.

- [ ] **Step 8: Wire routes**

Modify `apps/web/src/App.tsx` to include routes:

```text
/ -> HomePage
/posts/:slug -> PostPage
/about -> AboutPage
/admin/login -> LoginPage
/admin/posts -> AdminPostsPage
/admin/posts/new -> AdminEditorPage
/admin/posts/:id -> AdminEditorPage
```

- [ ] **Step 9: Verify admin UI**

Run:

```bash
pnpm --filter @tworiver/web test -- AdminEditorPage.test.tsx
pnpm --filter @tworiver/web typecheck
pnpm --filter @tworiver/web build
```

Expected:

```text
MarkdownPreview tests pass.
No TypeScript errors.
Vite build succeeds.
```

- [ ] **Step 10: Commit admin UI**

Run:

```bash
git add apps/web/src
git commit -m "feat: add admin publishing UI"
```

## Task 8: AI Extension Stubs

**Files:**
- Create: `apps/api/src/services/ai/aiClient.ts`
- Create: `apps/api/src/services/ai/summaryService.ts`
- Create: `apps/api/src/services/ai/tagSuggestionService.ts`
- Create: `apps/api/src/services/ai/translationDraftService.ts`

- [ ] **Step 1: Create AI client boundary**

Create `apps/api/src/services/ai/aiClient.ts`:

```ts
export interface AiClientConfig {
  apiKey?: string;
  baseUrl: string;
}

export interface AiMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export class AiClientNotConfiguredError extends Error {
  constructor() {
    super("AI client is not configured");
  }
}

export async function completeWithAi(config: AiClientConfig, messages: AiMessage[]): Promise<string> {
  if (!config.apiKey) {
    throw new AiClientNotConfiguredError();
  }

  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages,
      temperature: 0.3
    })
  });

  if (!response.ok) {
    throw new Error(`AI request failed with status ${response.status}`);
  }

  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content ?? "";
}
```

- [ ] **Step 2: Create summary service**

Create `apps/api/src/services/ai/summaryService.ts`:

```ts
import { completeWithAi, type AiClientConfig } from "./aiClient.js";

export async function generateSummary(config: AiClientConfig, markdown: string, locale: "zh" | "en"): Promise<string> {
  const language = locale === "zh" ? "Chinese" : "English";
  return completeWithAi(config, [
    { role: "system", content: `Write concise ${language} summaries for technical blog posts.` },
    { role: "user", content: markdown }
  ]);
}
```

- [ ] **Step 3: Create tag and translation services**

Create tag suggestion and translation draft service files with the same `completeWithAi` boundary. Do not register HTTP routes in the first release; keep these services ready for later protected admin endpoints.

- [ ] **Step 4: Verify AI stubs**

Run:

```bash
pnpm --filter @tworiver/api typecheck
```

Expected:

```text
No TypeScript errors.
```

- [ ] **Step 5: Commit AI boundary**

Run:

```bash
git add apps/api/src/services/ai
git commit -m "feat: add AI service extension boundary"
```

## Task 9: Deployment Documentation

**Files:**
- Create: `docs/deployment/ubuntu.md`
- Modify: `README.md`

- [ ] **Step 1: Create Ubuntu deployment guide**

Create `docs/deployment/ubuntu.md` with:

```markdown
# Ubuntu Deployment

## Build

```bash
pnpm install --frozen-lockfile
pnpm build
```

## Server directories

```bash
sudo mkdir -p /var/www/tworiver-blog
sudo mkdir -p /var/lib/tworiver-blog
sudo mkdir -p /opt/tworiver-blog
```

## Environment

Create `/etc/tworiver-blog.env`:

```bash
NODE_ENV=production
PORT=4000
DATABASE_PATH=/var/lib/tworiver-blog/blog.sqlite
SESSION_SECRET=replace-with-a-long-random-secret
ADMIN_USERNAME=admin
ADMIN_PASSWORD=replace-before-running-seed
DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=https://api.deepseek.com
```

## Database

```bash
cd /opt/tworiver-blog
pnpm --filter @tworiver/api migrate
pnpm --filter @tworiver/api seed:admin
```

## systemd

Create `/etc/systemd/system/tworiver-blog-api.service`:

```ini
[Unit]
Description=TwoRiver Blog API
After=network.target

[Service]
WorkingDirectory=/opt/tworiver-blog
EnvironmentFile=/etc/tworiver-blog.env
ExecStart=/usr/bin/node apps/api/dist/main.js
Restart=always
RestartSec=5
User=www-data
Group=www-data

[Install]
WantedBy=multi-user.target
```

Enable it:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now tworiver-blog-api
sudo systemctl status tworiver-blog-api
```

## Nginx

Create `/etc/nginx/sites-available/tworiver-blog`:

```nginx
server {
    listen 80;
    server_name example.com;

    root /var/www/tworiver-blog;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:4000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Enable it:

```bash
sudo ln -s /etc/nginx/sites-available/tworiver-blog /etc/nginx/sites-enabled/tworiver-blog
sudo nginx -t
sudo systemctl reload nginx
```
```

- [ ] **Step 2: Link deployment guide from README**

Modify `README.md` to add:

```markdown
## Deployment

See [docs/deployment/ubuntu.md](docs/deployment/ubuntu.md).
```

- [ ] **Step 3: Commit deployment docs**

Run:

```bash
git add README.md docs/deployment/ubuntu.md
git commit -m "docs: add Ubuntu deployment guide"
```

## Task 10: End-To-End Verification

**Files:**
- Modify only files needed to fix verification failures.

- [ ] **Step 1: Run full checks**

Run:

```bash
pnpm typecheck
pnpm test
pnpm build
```

Expected:

```text
All workspace packages pass type checking.
All tests pass.
API and web production builds succeed.
```

- [ ] **Step 2: Start local services**

Run in one terminal:

```bash
pnpm --filter @tworiver/api migrate
pnpm --filter @tworiver/api seed:admin
pnpm --filter @tworiver/api dev
```

Run in another terminal:

```bash
pnpm --filter @tworiver/web dev
```

Expected:

```text
API listens on port 4000.
Vite prints a local frontend URL.
```

- [ ] **Step 3: Browser verify core flow**

Use the Browser plugin or in-app browser to verify:

```text
Open public home page.
Open admin login.
Log in with seeded admin credentials.
Create a draft post with zh and en Markdown.
Confirm draft is absent from public home.
Publish the post.
Confirm public home shows it.
Open the article detail page.
Switch between zh and en.
Check desktop and mobile widths.
```

- [ ] **Step 4: Fix verification failures**

For each failure, make the smallest scoped code change, then rerun the relevant check:

```bash
pnpm typecheck
pnpm test
pnpm build
```

- [ ] **Step 5: Final commit**

Run:

```bash
git status --short
git add .
git commit -m "chore: verify bilingual blog release"
```

## Self-Review

Spec coverage:

- Monorepo scaffold: Task 1.
- Shared frontend/backend types: Task 2.
- Fastify API and SQLite schema: Task 3.
- Username/password admin authentication with HttpOnly cookie: Task 4.
- Public posts, admin CRUD, tags, drafts hidden from public readers: Task 5.
- React public blog pages and bilingual reading: Task 6.
- Admin Markdown editor with live preview: Task 7.
- DeepSeek-ready AI service boundary: Task 8.
- Ubuntu deployment with Nginx, systemd, SQLite: Task 9.
- Build, tests, and browser verification: Task 10.

Placeholder scan:

- The plan intentionally excludes first-release AI HTTP routes because the approved spec lists AI implementation as out of scope. AI service boundaries are concrete and type-checkable.
- The remaining implementation tasks list exact files, expected behavior, commands, and verification gates.

Type consistency:

- Shared API uses `PublicPost`, `PublicPostListItem`, `Tag`, and `UpsertPostInput`.
- Locale values are consistently `zh` and `en`.
- Status values are consistently `draft` and `published`.
- Markdown field is consistently exposed as `contentMarkdown` and stored as `content_markdown`.
