# TwoRiver Admin Feature Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Productize every approved admin capability from the reference template inside TwoRiver, wire it end to end to the public site, and ship it as one atomic replacement release.

**Architecture:** Keep the React/Vite, Fastify, shared Zod, SQLite, and uploads workspace. Add focused repositories, services, and route modules for content, site configuration, analytics, account/system operations, and backup restore; expose those through lazy-loaded admin/public React pages. All tasks may be developed incrementally, but production cutover happens only after the final migration, restore rehearsal, full test suite, and visual QA pass.

**Tech Stack:** React 19, React Router 7, Vite 6, Fastify 5, better-sqlite3, Zod 3, Argon2, TypeScript 5.8, Vitest, Testing Library, Playwright, `tar`.

---

## File Map

### Shared contracts

- Modify `packages/shared/src/schemas.ts`: retain compatibility re-exports.
- Create `packages/shared/src/schemas/common.ts`: locale, timestamps, pagination, localized-value helpers.
- Create `packages/shared/src/schemas/publishing.ts`: posts, taxonomy, recycle-bin contracts.
- Create `packages/shared/src/schemas/content.ts`: pages, projects, navigation, site configuration and resources.
- Create `packages/shared/src/schemas/analytics.ts`: page-view input and dashboard responses.
- Create `packages/shared/src/schemas/system.ts`: administrator profile, password, health, audit, backup and maintenance contracts.
- Modify `packages/shared/src/index.ts`: export all schema modules.

### API and persistence

- Modify `apps/api/src/db/schema.sql`, `apps/api/src/db/migrate.ts`, `apps/api/src/config.ts`, `apps/api/src/app.ts`.
- Modify `apps/api/src/repositories/postsRepository.ts`, `categoriesRepository.ts`, `tagsRepository.ts`.
- Create repositories: `pagesRepository.ts`, `projectsRepository.ts`, `navigationRepository.ts`, `siteSettingsRepository.ts`, `resourcesRepository.ts`, `analyticsRepository.ts`, `auditRepository.ts`, `systemRepository.ts`.
- Create services: `resourceReferenceService.ts`, `analyticsService.ts`, `backupService.ts`, `maintenanceService.ts`.
- Create routes: `adminPageRoutes.ts`, `adminProjectRoutes.ts`, `adminNavigationRoutes.ts`, `adminSiteSettingsRoutes.ts`, `analyticsRoutes.ts`, `adminAccountRoutes.ts`, `adminSystemRoutes.ts`, `publicContentRoutes.ts`.
- Modify existing post, taxonomy, resource, auth and public routes.

### Web application

- Keep `apps/web/src/api/admin.ts` as a compatibility barrel; split implementation into `apps/web/src/api/admin/*.ts`.
- Create `apps/web/src/api/site.ts`, `apps/web/src/contexts/SiteConfigContext.tsx`, `apps/web/src/hooks/usePageView.ts`, `apps/web/src/utils/seo.ts`.
- Create public pages: `CustomPagePage.tsx`, `ProjectsPage.tsx`, `ProjectPage.tsx`.
- Create admin pages: `AdminPagesPage.tsx`, `AdminProjectsPage.tsx`, `AdminNavigationPage.tsx`, `AdminSiteSettingsPage.tsx`, `AdminAnalyticsPage.tsx`, `AdminSystemSettingsPage.tsx`.
- Modify `App.tsx`, `Layout.tsx`, `AdminShell.tsx`, the existing admin publishing pages, public home/post/taxonomy pages, and `styles/global.scss`.

### Tests and release

- Add focused API tests under `apps/api/tests/` and web tests beside new pages/contexts.
- Add `tests/e2e/admin-parity.spec.ts` and extend `tests/e2e/global-setup.ts`.
- Remove `apps/web/src/admin-console/` only after all replacement routes are implemented.

---

### Task 1: Split and Extend Shared Contracts

**Files:**
- Create: `packages/shared/src/schemas/common.ts`
- Create: `packages/shared/src/schemas/publishing.ts`
- Create: `packages/shared/src/schemas/content.ts`
- Create: `packages/shared/src/schemas/analytics.ts`
- Create: `packages/shared/src/schemas/system.ts`
- Modify: `packages/shared/src/schemas.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `apps/api/tests/sharedSchemas.test.ts`

- [ ] **Step 1: Write failing schema tests**

Cover `archived` status, localized translations with one or two locales, reserved page slugs, safe navigation URLs, site theme enums, page-view input, password confirmation, maintenance actions, and backup manifest versions.

```ts
expect(PostStatusSchema.parse("archived")).toBe("archived");
expect(() => UpsertPageInputSchema.parse({ slug: "admin", status: "published", translations: validTranslations })).toThrow();
expect(UpsertNavigationItemInputSchema.parse({ url: "https://example.com", openInNewWindow: true, translations: validLabels })).toBeTruthy();
expect(PageViewInputSchema.parse({ path: "/posts/example", contentType: "post", contentId: 1, locale: "zh" })).toBeTruthy();
```

- [ ] **Step 2: Run the shared test and verify RED**

Run: `pnpm --filter @tworiver/api test -- sharedSchemas.test.ts`

Expected: FAIL because the new schema modules and exports do not exist.

- [ ] **Step 3: Implement the contracts**

Define canonical domain names once and reuse them across API and web:

```ts
export const PostStatusSchema = z.enum(["draft", "published", "archived"]);
export const ContentStatusSchema = z.enum(["draft", "published"]);
export const SiteLayoutSchema = z.enum(["list", "grid", "bento"]);
export const CodeThemeSchema = z.enum(["dracula", "monokai", "github-light", "one-dark"]);
export const FontSizeSchema = z.enum(["small", "medium", "large"]);
export const LocalizedTextSchema = z.object({ locale: LocaleSchema, title: z.string().min(1) });
export const RESERVED_CONTENT_SLUGS = ["admin", "about", "posts", "pages", "projects", "categories", "tags"] as const;
```

Keep `schemas.ts` as a re-export layer so current imports remain valid.

Lock these names for every later task: `PostLifecycleInputSchema`, `BulkPostActionInputSchema`, `UpsertPageInputSchema`, `UpsertProjectInputSchema`, `UpsertNavigationItemInputSchema`, `UpsertSiteSettingsInputSchema`, `PageViewInputSchema`, `UpdateAdminProfileInputSchema`, `ChangePasswordInputSchema`, `MaintenanceActionInputSchema`, and `BackupManifestSchema`. Export the matching inferred TypeScript types without the `Schema` suffix.

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm --filter @tworiver/api test -- sharedSchemas.test.ts && pnpm --filter @tworiver/shared build`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src apps/api/tests/sharedSchemas.test.ts
git commit -m "feat(shared): define admin parity contracts"
```

### Task 2: Add Versioned Schema and Safe Legacy Migration

**Files:**
- Modify: `apps/api/src/db/schema.sql`
- Modify: `apps/api/src/db/migrate.ts`
- Create: `apps/api/tests/migrations.admin-parity.test.ts`

- [ ] **Step 1: Write migration tests**

Create legacy databases containing published, draft, and hidden posts plus uploads. Assert migration preserves IDs/translations, maps `hidden` to `archived`, adds new defaults, creates every new table/index, and is idempotent.

```ts
migrate(databasePath);
migrate(databasePath);
const row = db.prepare("SELECT status, is_pinned, is_featured, deleted_at FROM posts WHERE id = 3").get();
expect(row).toEqual({ status: "archived", is_pinned: 0, is_featured: 0, deleted_at: null });
expect(tableNames(db)).toContain("site_settings");
expect(tableNames(db)).toContain("analytics_daily");
```

- [ ] **Step 2: Run the migration test and verify RED**

Run: `pnpm --filter @tworiver/api test -- migrations.admin-parity.test.ts`

Expected: FAIL because the v2 schema is absent.

- [ ] **Step 3: Implement migration v2**

Add `schema_migrations`, rebuild `posts` with `draft/published/archived`, and add tables for page/project translations, navigation translations, site settings/translations/social links, registered resources, analytics events/daily aggregates/visitors/content/referrers/devices, audit events, and backup records. Wrap each migration in a transaction and insert its version only after success.

- [ ] **Step 4: Run migration and existing API tests**

Run: `pnpm --filter @tworiver/api test -- migrations.admin-parity.test.ts posts.test.ts categories.test.ts`

Expected: PASS with no legacy regression.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/db apps/api/tests/migrations.admin-parity.test.ts
git commit -m "feat(api): add admin parity database migration"
```

### Task 3: Implement Article Lifecycle, Bulk Actions, and Recycle Bin

**Files:**
- Modify: `apps/api/src/repositories/postsRepository.ts`
- Modify: `apps/api/src/routes/adminPostRoutes.ts`
- Modify: `apps/api/src/routes/publicRoutes.ts`
- Modify: `apps/api/tests/posts.test.ts`

- [ ] **Step 1: Add failing lifecycle tests**

Assert pin/feature/cover persistence, pinned-first public sorting, archived exclusion, soft delete, restore, 30-day permanent-delete guard, and transactional bulk archive/trash.

- [ ] **Step 2: Run targeted tests and verify RED**

Run: `pnpm --filter @tworiver/api test -- posts.test.ts`

- [ ] **Step 3: Implement repository operations**

Expose explicit functions rather than route-local SQL:

```ts
export function updatePostLifecycle(db: BlogDatabase, id: number, patch: PostLifecycleInput): PostRecord | undefined;
export function bulkUpdatePosts(db: BlogDatabase, input: BulkPostActionInput): number;
export function trashPost(db: BlogDatabase, id: number, now = new Date()): boolean;
export function restorePost(db: BlogDatabase, id: number): boolean;
export function permanentlyDeletePost(db: BlogDatabase, id: number, now = new Date()): { deleted: boolean; uid?: string };
export function listTrashedPosts(db: BlogDatabase): PostRecord[];
```

Add admin routes for bulk actions and recycle-bin operations. Public queries require `status = 'published' AND deleted_at IS NULL` and order by `is_pinned DESC, published_at DESC, id DESC`.

- [ ] **Step 4: Run post and integration tests**

Run: `pnpm --filter @tworiver/api test -- posts.test.ts integration.test.ts`

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/repositories/postsRepository.ts apps/api/src/routes/adminPostRoutes.ts apps/api/src/routes/publicRoutes.ts apps/api/tests/posts.test.ts
git commit -m "feat(api): add article lifecycle and recycle bin"
```

### Task 4: Productize Taxonomy Metadata and Delete Safety

**Files:**
- Modify: `apps/api/src/repositories/categoriesRepository.ts`
- Modify: `apps/api/src/repositories/tagsRepository.ts`
- Modify: `apps/api/src/routes/adminCategoryRoutes.ts`
- Modify: `apps/api/src/routes/adminTagRoutes.ts`
- Modify: `apps/api/tests/categories.test.ts`
- Modify: `apps/api/tests/posts.test.ts`

- [ ] **Step 1: Add failing taxonomy tests**

Verify category order and localized descriptions, real post counts, tag usage counts, duplicate rejection, and 409 responses when deleting referenced taxonomy.

- [ ] **Step 2: Run taxonomy tests and verify RED**

Run: `pnpm --filter @tworiver/api test -- categories.test.ts posts.test.ts`

- [ ] **Step 3: Move mutation SQL into repositories and implement metadata**

Return enriched contracts from list/get methods and use `COUNT(DISTINCT posts.id)` with `deleted_at IS NULL`. Route handlers parse shared input schemas and map reference conflicts to 409.

- [ ] **Step 4: Run taxonomy tests**

Run: `pnpm --filter @tworiver/api test -- categories.test.ts posts.test.ts`

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/repositories/categoriesRepository.ts apps/api/src/repositories/tagsRepository.ts apps/api/src/routes/adminCategoryRoutes.ts apps/api/src/routes/adminTagRoutes.ts apps/api/tests
git commit -m "feat(api): enrich taxonomy management"
```

### Task 5: Register Resources and Enforce Reference Safety

**Files:**
- Create: `apps/api/src/repositories/resourcesRepository.ts`
- Create: `apps/api/src/services/resourceReferenceService.ts`
- Modify: `apps/api/src/services/uploads/resourceLibraryService.ts`
- Modify: `apps/api/src/routes/adminResourceRoutes.ts`
- Modify: `apps/api/src/routes/adminUploadRoutes.ts`
- Modify: `apps/api/tests/uploads.test.ts`
- Modify: `apps/api/tests/uploadCleanup.test.ts`

- [ ] **Step 1: Add failing resource registry tests**

Test upload registration, legacy reconciliation, folder moves, reference counts from Markdown/settings/projects/pages, 409 deletion for referenced files, and compensation when filesystem operations fail.

- [ ] **Step 2: Run upload tests and verify RED**

Run: `pnpm --filter @tworiver/api test -- uploads.test.ts uploadCleanup.test.ts`

- [ ] **Step 3: Implement registry and reference scanning**

Use a single `ResourceRecord` source of truth. Upload writes a temporary file, atomically renames it, then commits the record; failures remove the temporary file. Moving and deleting perform the inverse compensation.

- [ ] **Step 4: Run upload suites**

Run: `pnpm --filter @tworiver/api test -- uploads.test.ts uploadStorage.test.ts uploadCleanup.test.ts`

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/repositories/resourcesRepository.ts apps/api/src/services apps/api/src/routes/adminResourceRoutes.ts apps/api/src/routes/adminUploadRoutes.ts apps/api/tests
git commit -m "feat(api): add registered resource library"
```

### Task 6: Add Bilingual Page Management and Public Routes

**Files:**
- Create: `apps/api/src/repositories/pagesRepository.ts`
- Create: `apps/api/src/routes/adminPageRoutes.ts`
- Create: `apps/api/src/routes/publicContentRoutes.ts`
- Create: `apps/api/tests/pages.test.ts`
- Modify: `apps/api/src/app.ts`

- [ ] **Step 1: Write failing page CRUD tests**

Cover bilingual create/update, reserved slug rejection, draft invisibility, translation fallback, 404 behavior, publish/unpublish, and safe delete.

- [ ] **Step 2: Run and verify RED**

Run: `pnpm --filter @tworiver/api test -- pages.test.ts`

- [ ] **Step 3: Implement repository and routes**

Provide `/api/admin/pages`, `/api/admin/pages/:id`, `/api/pages/:slug`; use shared schemas and one transaction for page plus translations.

- [ ] **Step 4: Run page tests**

Run: `pnpm --filter @tworiver/api test -- pages.test.ts`

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/repositories/pagesRepository.ts apps/api/src/routes apps/api/src/app.ts apps/api/tests/pages.test.ts
git commit -m "feat(api): add bilingual custom pages"
```

### Task 7: Add Project Showcase Management and Public Routes

**Files:**
- Create: `apps/api/src/repositories/projectsRepository.ts`
- Create: `apps/api/src/routes/adminProjectRoutes.ts`
- Modify: `apps/api/src/routes/publicContentRoutes.ts`
- Create: `apps/api/tests/projects.test.ts`
- Modify: `apps/api/src/app.ts`

- [ ] **Step 1: Write failing project tests**

Test localized CRUD, safe URLs, visibility, featured ordering, cover resource references, public list/detail and fallback.

- [ ] **Step 2: Run and verify RED**

Run: `pnpm --filter @tworiver/api test -- projects.test.ts`

- [ ] **Step 3: Implement project repository and routes**

Use transactionally replaced translations and deterministic order `is_featured DESC, sort_order ASC, id DESC`.

- [ ] **Step 4: Run project tests**

Run: `pnpm --filter @tworiver/api test -- projects.test.ts`

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/repositories/projectsRepository.ts apps/api/src/routes apps/api/src/app.ts apps/api/tests/projects.test.ts
git commit -m "feat(api): add project showcase management"
```

### Task 8: Add Navigation, Site Settings, SEO, and Robots

**Files:**
- Create: `apps/api/src/repositories/navigationRepository.ts`
- Create: `apps/api/src/repositories/siteSettingsRepository.ts`
- Create: `apps/api/src/routes/adminNavigationRoutes.ts`
- Create: `apps/api/src/routes/adminSiteSettingsRoutes.ts`
- Modify: `apps/api/src/routes/publicContentRoutes.ts`
- Create: `apps/api/tests/siteSettings.test.ts`
- Modify: `apps/api/src/app.ts`

- [ ] **Step 1: Write failing site configuration tests**

Test safe internal/external URLs, reorder transactions, translation fallback, singleton settings, social ordering, theme enums, and dynamic `/robots.txt` output.

- [ ] **Step 2: Run and verify RED**

Run: `pnpm --filter @tworiver/api test -- siteSettings.test.ts`

- [ ] **Step 3: Implement configuration routes**

Expose `/api/site`, admin navigation/settings CRUD, and `/robots.txt`. Keep About as the only author-profile source.

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @tworiver/api test -- siteSettings.test.ts about.test.ts`

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/repositories/navigationRepository.ts apps/api/src/repositories/siteSettingsRepository.ts apps/api/src/routes apps/api/src/app.ts apps/api/tests/siteSettings.test.ts
git commit -m "feat(api): add dynamic site configuration"
```

### Task 9: Add Privacy-Preserving First-Party Analytics

**Files:**
- Modify: `apps/api/src/config.ts`
- Create: `apps/api/src/repositories/analyticsRepository.ts`
- Create: `apps/api/src/services/analyticsService.ts`
- Create: `apps/api/src/routes/analyticsRoutes.ts`
- Create: `apps/api/tests/analytics.test.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `.env.example`

- [ ] **Step 1: Write failing config and analytics tests**

Assert production requires `ANALYTICS_HASH_SECRET`, raw IP is absent from tables, UTC-day HMACs rotate, minute duplicates collapse, bots/admin routes are excluded, aggregates and CSV are correct, and event failure is non-fatal to public reads.

- [ ] **Step 2: Run and verify RED**

Run: `pnpm --filter @tworiver/api test -- config.test.ts analytics.test.ts`

- [ ] **Step 3: Implement analytics ingestion and queries**

```ts
const dailyKey = createHmac("sha256", config.ANALYTICS_HASH_SECRET).update(utcDate).digest();
const visitorHash = createHmac("sha256", dailyKey).update(`${request.ip}\n${userAgent}`).digest("hex");
```

Expose public `POST /api/analytics/page-view` and admin summary/detail/CSV endpoints. Upsert long-lived daily aggregates while retaining event and daily-visitor rows for 90 days.

- [ ] **Step 4: Run analytics tests**

Run: `pnpm --filter @tworiver/api test -- config.test.ts analytics.test.ts`

- [ ] **Step 5: Commit**

```bash
git add .env.example apps/api/src/config.ts apps/api/src/repositories/analyticsRepository.ts apps/api/src/services/analyticsService.ts apps/api/src/routes/analyticsRoutes.ts apps/api/src/app.ts apps/api/tests
git commit -m "feat(api): add privacy-first analytics"
```

### Task 10: Add Administrator Profile, Password Rotation, and Audit Events

**Files:**
- Create: `apps/api/src/repositories/auditRepository.ts`
- Create: `apps/api/src/repositories/systemRepository.ts`
- Create: `apps/api/src/routes/adminAccountRoutes.ts`
- Modify: `apps/api/src/routes/authRoutes.ts`
- Modify: `apps/api/src/services/sessionService.ts`
- Modify: `apps/api/src/plugins/auth.ts`
- Create: `apps/api/tests/account.test.ts`

- [ ] **Step 1: Write failing account tests**

Test profile updates, duplicate/invalid username, old-password verification, Argon2 replacement, revocation of all other sessions, current session survival, and redacted audit rows.

- [ ] **Step 2: Run and verify RED**

Run: `pnpm --filter @tworiver/api test -- auth.test.ts account.test.ts`

- [ ] **Step 3: Implement account routes and audit helpers**

Add `deleteOtherSessions(db, userId, currentSessionId)` and return the enriched user shape from login/me. Never write password material or session IDs to audit metadata.

- [ ] **Step 4: Run authentication tests**

Run: `pnpm --filter @tworiver/api test -- auth.test.ts account.test.ts`

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/repositories apps/api/src/routes apps/api/src/services/sessionService.ts apps/api/src/plugins/auth.ts apps/api/tests
git commit -m "feat(api): add administrator account settings"
```

### Task 11: Add Backup, Restore, Health, and Maintenance

**Files:**
- Modify: `apps/api/package.json`
- Modify: `pnpm-lock.yaml`
- Create: `apps/api/src/services/backupService.ts`
- Create: `apps/api/src/services/maintenanceService.ts`
- Create: `apps/api/src/routes/adminSystemRoutes.ts`
- Create: `apps/api/tests/backupRestore.test.ts`
- Create: `apps/api/tests/systemMaintenance.test.ts`
- Modify: `apps/api/src/app.ts`

- [ ] **Step 1: Add `tar` dependency**

Run: `pnpm --filter @tworiver/api add tar`

- [ ] **Step 2: Write failing backup/restore tests**

Test manifest checksums, SQLite plus uploads contents, wrong-password rejection, corrupt archive rejection, automatic pre-restore snapshot, 503 maintenance mode, successful database replacement, failure rollback, health fields, and scoped cleanup counts.

- [ ] **Step 3: Run and verify RED**

Run: `pnpm --filter @tworiver/api test -- backupRestore.test.ts systemMaintenance.test.ts`

- [ ] **Step 4: Implement coordinated backup and restore**

Use `db.backup()` for consistent snapshots, `.tar.gz` archives with a versioned manifest, extraction to a temporary directory, checksum validation, a maintenance gate in Fastify, and atomic database/uploads replacement. Change `app.onClose` and timers to use `app.db` so a restored database can replace the live connection safely.

- [ ] **Step 5: Implement health and maintenance actions**

Expose database/upload/migration/backup/recycle/analytics state and only these actions: expired sessions, orphan uploads, analytics detail older than 90 days, trash older than 30 days.

- [ ] **Step 6: Run system tests**

Run: `pnpm --filter @tworiver/api test -- backupRestore.test.ts systemMaintenance.test.ts uploads.test.ts auth.test.ts`

- [ ] **Step 7: Commit**

```bash
git add apps/api/package.json pnpm-lock.yaml apps/api/src/services apps/api/src/routes/adminSystemRoutes.ts apps/api/src/app.ts apps/api/tests
git commit -m "feat(api): add backup restore and maintenance"
```

### Task 12: Split Web API Clients and Add Site Configuration Context

**Files:**
- Create: `apps/web/src/api/admin/posts.ts`
- Create: `apps/web/src/api/admin/content.ts`
- Create: `apps/web/src/api/admin/site.ts`
- Create: `apps/web/src/api/admin/analytics.ts`
- Create: `apps/web/src/api/admin/system.ts`
- Modify: `apps/web/src/api/admin.ts`
- Create: `apps/web/src/api/site.ts`
- Create: `apps/web/src/contexts/SiteConfigContext.tsx`
- Create: `apps/web/src/contexts/SiteConfigContext.test.tsx`

- [ ] **Step 1: Write failing client/context tests**

Verify endpoint/method/body mappings, request cancellation, default config fallback, localization fallback, and no duplicate site-config fetch across route changes.

- [ ] **Step 2: Run and verify RED**

Run: `pnpm --filter @tworiver/web test -- SiteConfigContext.test.tsx admin.test.ts`

- [ ] **Step 3: Implement focused clients and provider**

Keep `admin.ts` re-exporting all current and new symbols. Provider fetches `/api/site` once, exposes resolved locale text and theme tokens, and retains a safe static default on non-auth configuration errors.

- [ ] **Step 4: Run web tests**

Run: `pnpm --filter @tworiver/web test -- SiteConfigContext.test.tsx admin.test.ts`

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/api apps/web/src/contexts
git commit -m "feat(web): add site and admin API modules"
```

### Task 13: Wire Dynamic Public Navigation, Theme, SEO, Pages, Projects, and Analytics

**Files:**
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/components/Layout.tsx`
- Modify: `apps/web/src/pages/HomePage.tsx`
- Create: `apps/web/src/pages/CustomPagePage.tsx`
- Create: `apps/web/src/pages/ProjectsPage.tsx`
- Create: `apps/web/src/pages/ProjectPage.tsx`
- Create: `apps/web/src/hooks/usePageView.ts`
- Create: `apps/web/src/utils/seo.ts`
- Modify: `apps/web/src/styles/global.scss`
- Test: `apps/web/src/App.test.tsx`

- [ ] **Step 1: Add failing public experience tests**

Test dynamic bilingual navigation, page/project routes, translation fallback, safe external links, list/grid/Bento classes, font/code/accent tokens, reader dark-mode permission, localized document metadata, and one page-view per route.

- [ ] **Step 2: Run and verify RED**

Run: `pnpm --filter @tworiver/web test -- App.test.tsx`

- [ ] **Step 3: Implement public routing and configuration application**

Add lazy routes `/pages/:slug`, `/projects`, `/projects/:slug`; wrap the public layout with `SiteConfigProvider`; apply theme values through stable `data-*` attributes and CSS variables; use `usePageView` after meaningful content renders.

- [ ] **Step 4: Run public tests**

Run: `pnpm --filter @tworiver/web test -- App.test.tsx AboutPage.test.tsx`

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/App.tsx apps/web/src/components/Layout.tsx apps/web/src/pages apps/web/src/hooks apps/web/src/utils/seo.ts apps/web/src/styles/global.scss
git commit -m "feat(web): connect site configuration to public pages"
```

### Task 14: Complete Admin Navigation and Routes

**Files:**
- Modify: `apps/web/src/components/AdminShell.tsx`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/App.test.tsx`

- [ ] **Step 1: Add failing route/menu coverage**

Assert the full approved menu and nested article entries, auth protection for every route, route preloading, active state, mobile close behavior, and absence of theme-showcase links.

- [ ] **Step 2: Run and verify RED**

Run: `pnpm --filter @tworiver/web test -- App.test.tsx`

- [ ] **Step 3: Add lazy admin routes**

Add `/admin/pages`, `/admin/projects`, `/admin/navigation`, `/admin/site-settings`, `/admin/analytics`, `/admin/system`, and article draft/trash filters. Extend icons and localized page titles without introducing another shell.

- [ ] **Step 4: Run route tests**

Run: `pnpm --filter @tworiver/web test -- App.test.tsx`

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/App.tsx apps/web/src/components/AdminShell.tsx apps/web/src/App.test.tsx
git commit -m "feat(web): complete admin console navigation"
```

### Task 15: Upgrade Admin Publishing, Taxonomy, Dashboard, and Resources

**Files:**
- Modify: `apps/web/src/pages/AdminDashboardPage.tsx`
- Modify: `apps/web/src/pages/AdminPostsPage.tsx`
- Modify: `apps/web/src/pages/AdminEditorPage.tsx`
- Modify: `apps/web/src/pages/AdminTaxonomyPage.tsx`
- Modify: `apps/web/src/pages/AdminResourcesPage.tsx`
- Modify/create tests beside each page
- Modify: `apps/web/src/styles/global.scss`

- [ ] **Step 1: Add failing interaction tests**

Cover dashboard real metrics, status/category/tag search, pagination, bulk archive/trash, recycle restore/permanent delete, pin/feature/cover editing, category metadata, tag counts/cloud, resource search/folder/reference guard, preserved input on errors, and loading-disabled controls.

- [ ] **Step 2: Run and verify RED**

Run: `pnpm --filter @tworiver/web test -- AdminEditorPage.test.tsx AdminPostsPage.test.tsx AdminResourcesPage.test.tsx AdminTaxonomyPage.test.tsx AdminDashboardPage.test.tsx`

- [ ] **Step 3: Implement the approved publishing workflows**

Reuse existing editor subcomponents and API error patterns. Split helper components only when a touched page would otherwise exceed its current responsibility; do not duplicate Markdown rendering or upload logic.

- [ ] **Step 4: Run publishing tests**

Run: `pnpm --filter @tworiver/web test -- AdminEditorPage.test.tsx AdminPostsPage.test.tsx AdminResourcesPage.test.tsx AdminTaxonomyPage.test.tsx AdminDashboardPage.test.tsx`

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages apps/web/src/styles/global.scss
git commit -m "feat(web): productize publishing administration"
```

### Task 16: Build Admin Pages, Projects, Navigation, and Site Settings

**Files:**
- Create: `apps/web/src/pages/AdminPagesPage.tsx`
- Create: `apps/web/src/pages/AdminProjectsPage.tsx`
- Create: `apps/web/src/pages/AdminNavigationPage.tsx`
- Create: `apps/web/src/pages/AdminSiteSettingsPage.tsx`
- Create tests beside each page
- Modify: `apps/web/src/styles/global.scss`

- [ ] **Step 1: Write failing CRUD and preview tests**

Cover bilingual editing, slug validation, status, project cover/links/tech stack/featured/visibility, navigation ordering/safe links, site tabs, social ordering, theme preview, robots rules, and unsaved-error preservation.

- [ ] **Step 2: Run and verify RED**

Run: `pnpm --filter @tworiver/web test -- AdminPagesPage.test.tsx AdminProjectsPage.test.tsx AdminNavigationPage.test.tsx AdminSiteSettingsPage.test.tsx`

- [ ] **Step 3: Implement focused admin pages**

Use the current admin board, side-panel, table, form and modal visual language. Every saved setting must read back from the API and update preview state from the returned canonical record.

- [ ] **Step 4: Run page tests**

Run: `pnpm --filter @tworiver/web test -- AdminPagesPage.test.tsx AdminProjectsPage.test.tsx AdminNavigationPage.test.tsx AdminSiteSettingsPage.test.tsx`

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/AdminPagesPage* apps/web/src/pages/AdminProjectsPage* apps/web/src/pages/AdminNavigationPage* apps/web/src/pages/AdminSiteSettingsPage* apps/web/src/styles/global.scss
git commit -m "feat(web): add site content administration"
```

### Task 17: Build Admin Analytics and System Operations

**Files:**
- Create: `apps/web/src/pages/AdminAnalyticsPage.tsx`
- Create: `apps/web/src/pages/AdminSystemSettingsPage.tsx`
- Create tests beside each page
- Modify: `apps/web/src/pages/LoginPage.tsx`
- Modify: `apps/web/src/styles/global.scss`

- [ ] **Step 1: Write failing analytics/system tests**

Test 7/30/90 period changes, real chart/table data, CSV download, profile update, old/new password form, session message, health cards, audit log, backup download, restore validation/progress, password confirmation, and scoped maintenance confirmation.

- [ ] **Step 2: Run and verify RED**

Run: `pnpm --filter @tworiver/web test -- AdminAnalyticsPage.test.tsx AdminSystemSettingsPage.test.tsx`

- [ ] **Step 3: Implement analytics and system pages**

Use accessible SVG charts with fixed dimensions, ordinary buttons for downloads, file input for restore, and explicit progress/error states. Do not display fake logs, CDN controls, telemetry, factory reset, or a fake forgot-password action.

- [ ] **Step 4: Run page tests**

Run: `pnpm --filter @tworiver/web test -- AdminAnalyticsPage.test.tsx AdminSystemSettingsPage.test.tsx`

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/AdminAnalyticsPage* apps/web/src/pages/AdminSystemSettingsPage* apps/web/src/pages/LoginPage.tsx apps/web/src/styles/global.scss
git commit -m "feat(web): add analytics and system operations"
```

### Task 18: Remove Template Copy and Run Atomic Release Verification

**Files:**
- Delete: `apps/web/src/admin-console/`
- Modify: `apps/web/tsconfig.json`
- Modify: `tests/e2e/global-setup.ts`
- Create: `tests/e2e/admin-parity.spec.ts`
- Modify: `README.md`
- Modify: `docs/operations.md`
- Modify: `.env.example`

- [ ] **Step 1: Add complete E2E coverage**

Exercise login; bilingual post draft/publish/archive/trash/restore; upload; taxonomy; page/project publish; navigation and theme propagation; analytics ingestion; password change; backup download; destructive restore rehearsal against test data; logout and route protection on desktop and mobile projects.

- [ ] **Step 2: Remove the inert template source and exclusion**

Delete `apps/web/src/admin-console/` and remove `src/admin-console` from `apps/web/tsconfig.json`. Verify no imports, mockData, theme showcase, simulated API, CDN or telemetry text remain:

Run: `rg -n "admin-console|mockData|ThemeShowcase|CDN|telemetry|模拟" apps packages tests`

Expected: no production matches; test descriptions may only mention prohibited behavior.

- [ ] **Step 3: Rehearse migration and backup restore**

Copy the current configured SQLite database and uploads into a temporary rehearsal directory, run migration twice, start the API against the copy, create a full backup, mutate data, restore, and compare manifest checksums plus representative rows/files.

- [ ] **Step 4: Run the full verification gate**

Run:

```bash
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```

Expected: all commands exit 0. Also verify `GET /api/health`, `/`, `/projects`, a published `/pages/:slug`, and `/admin` return the expected status/content.

- [ ] **Step 5: Perform visual QA**

Capture desktop and Pixel 5 screenshots for every admin menu plus public list/grid/Bento layouts. Check overflow, overlap, blank states, error overlays, console errors, form text fit, chart dimensions and modal focus behavior.

- [ ] **Step 6: Update operations documentation**

Document `ANALYTICS_HASH_SECRET`, migration prerequisites, one-release backup, restore maintenance behavior, analytics retention, recycle retention and rollback commands.

- [ ] **Step 7: Commit the release integration**

```bash
git add apps/web/tsconfig.json tests/e2e README.md docs/operations.md .env.example
git add -u apps/web/src/admin-console
git commit -m "feat: complete TwoRiver admin parity replacement"
```

---

## Final Release Rule

Development commits remain internal. Do not deploy or declare the replacement complete until Task 18 passes in full. A screen backed by mock data, a disabled placeholder control, or a setting that does not affect the public site fails the completion definition.
