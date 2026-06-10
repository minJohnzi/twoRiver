# Image Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add admin-only image uploads for post Markdown, stored on local disk under stable post UID folders and inserted through button, drag-and-drop, and paste interactions.

**Architecture:** Add stable post UIDs to shared/API post records, derive an uploads root from the database directory, expose a protected multipart image-upload route, serve `/uploads/*` statically in development, and wire the editor to upload images into the current saved post. Article deletion performs best-effort cleanup of that post UID image directory.

**Tech Stack:** TypeScript, Fastify, SQLite, Zod, React, Vite, Vitest, Testing Library, `@fastify/multipart`, `@fastify/static`, Node `crypto`/`fs`.

---

## File Map

- Modify `packages/shared/src/schemas.ts`: add `uid` to public post schemas and add upload response schema/types.
- Modify `apps/api/package.json` and `pnpm-lock.yaml`: add `@fastify/multipart` and `@fastify/static`.
- Modify `apps/api/src/config.ts`: derive upload behavior from `DATABASE_PATH`; no first-release `UPLOADS_DIR`.
- Modify `apps/api/src/db/schema.sql`: add `posts.uid`.
- Modify `apps/api/src/db/migrate.ts`: migrate existing databases by adding/backfilling `posts.uid`.
- Modify `apps/api/src/repositories/postsRepository.ts`: read/create/return `uid`; expose lookup by UID; cleanup images on delete.
- Create `apps/api/src/services/uploads/uploadPaths.ts`: resolve upload root, post image directories, public URLs, and safe path joins.
- Create `apps/api/src/services/uploads/imageUploadService.ts`: validate and store uploaded images.
- Create `apps/api/src/routes/adminUploadRoutes.ts`: protected multipart upload endpoint.
- Modify `apps/api/src/app.ts`: register multipart/static plugins and admin upload route.
- Create `apps/api/tests/uploads.test.ts`: API upload tests.
- Modify existing API test `makeConfig` helpers only if the `AppConfig` type changes.
- Modify `apps/web/src/api/admin.ts`: add `uploadAdminPostImage`.
- Modify `apps/web/src/pages/AdminEditorPage.tsx`: preserve post UID, add button/drop/paste upload and Markdown insertion.
- Modify `apps/web/src/styles/global.css`: focused upload affordance styles.
- Modify `apps/web/src/pages/AdminEditorPage.test.tsx`: editor image-upload interaction tests.
- Modify `README.md` and `docs/deployment/ubuntu.md`: uploads storage and Nginx notes.

## Task 1: Post UID Contract and Migration

**Files:**
- Modify: `packages/shared/src/schemas.ts`
- Modify: `apps/api/src/db/schema.sql`
- Modify: `apps/api/src/db/migrate.ts`
- Modify: `apps/api/src/repositories/postsRepository.ts`
- Modify: API tests with manual `PublicPost` or `AppConfig` fixtures if typecheck requires it

- [ ] **Step 1: Write failing repository/API expectations**

Add or extend API tests in `apps/api/tests/posts.test.ts`:

```ts
expect(createResponse.json().post.uid).toMatch(/^p_[0-9a-f-]{36}$/);
expect(detailResponse.json().post.uid).toBe(createResponse.json().post.uid);
```

Also add an update assertion that changing slug preserves `uid`:

```ts
const originalUid = createResponse.json().post.uid;
const updateResponse = await app.inject({
  method: "PUT",
  url: `/api/admin/posts/${createResponse.json().post.id}`,
  headers: { cookie, "x-csrf-token": csrfToken },
  payload: {
    slug: "renamed-post",
    status: "draft",
    publishedAt: null,
    tagSlugs: [],
    translations: [{ locale: "en", title: "Renamed", summary: "", contentMarkdown: "" }]
  }
});
expect(updateResponse.json().post.uid).toBe(originalUid);
```

- [ ] **Step 2: Add shared post UID type**

In `packages/shared/src/schemas.ts`, add `uid` to `PublicPostListItemSchema`:

```ts
uid: z.string().regex(/^p_[0-9a-f-]{36}$/),
```

Because `PublicPostSchema` extends `PublicPostListItemSchema`, it inherits `uid`.

- [ ] **Step 3: Add UID to fresh schema**

In `apps/api/src/db/schema.sql`, add `uid` to `posts`:

```sql
uid TEXT NOT NULL UNIQUE,
```

Place it after `id`.

- [ ] **Step 4: Update migrations for existing DBs**

In `apps/api/src/db/migrate.ts`, after applying the base schema, add a migration helper that:

```ts
const columns = db.prepare("PRAGMA table_info(posts)").all() as Array<{ name: string }>;
const hasUid = columns.some((column) => column.name === "uid");
if (!hasUid) {
  db.prepare("ALTER TABLE posts ADD COLUMN uid TEXT").run();
}
const rows = db.prepare("SELECT id, uid FROM posts WHERE uid IS NULL OR uid = ''").all() as Array<{ id: number }>;
const update = db.prepare("UPDATE posts SET uid = ? WHERE id = ?");
for (const row of rows) {
  update.run(`p_${crypto.randomUUID()}`, row.id);
}
db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_posts_uid ON posts(uid)").run();
```

Import `crypto` from `node:crypto`. SQLite cannot add a non-null unique column with generated values in one statement, so enforce future writes in application code and uniqueness through the index.

- [ ] **Step 5: Generate UIDs on create and return them**

In `apps/api/src/repositories/postsRepository.ts`:

Add `uid` to `PostRecord` and `PostRow`.

Update all post SELECT lists to include `uid`.

In `createPost`, generate:

```ts
const uid = `p_${crypto.randomUUID()}`;
```

and insert:

```sql
INSERT INTO posts (uid, slug, status, category_id, published_at, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?)
```

Return `uid` from `hydratePost`.

- [ ] **Step 6: Run UID verification**

Run:

```powershell
C:\nvm4w\nodejs\pnpm.cmd --filter @tworiver/api test -- posts.test.ts
C:\nvm4w\nodejs\pnpm.cmd --filter @tworiver/api typecheck
```

Expected: post tests and API typecheck pass.

- [ ] **Step 7: Commit**

```powershell
git add packages/shared/src/schemas.ts apps/api/src/db/schema.sql apps/api/src/db/migrate.ts apps/api/src/repositories/postsRepository.ts apps/api/tests/posts.test.ts apps/api/tests
git commit -m "feat: add stable post uids"
```

## Task 2: Upload Storage Service and Static Serving

**Files:**
- Modify: `apps/api/package.json`
- Modify: `pnpm-lock.yaml`
- Create: `apps/api/src/services/uploads/uploadPaths.ts`
- Create: `apps/api/src/services/uploads/imageUploadService.ts`
- Modify: `apps/api/src/repositories/postsRepository.ts`
- Modify: `apps/api/src/app.ts`

- [ ] **Step 1: Add dependencies**

Run:

```powershell
C:\nvm4w\nodejs\pnpm.cmd add --filter @tworiver/api @fastify/multipart @fastify/static
```

Expected: `apps/api/package.json` and `pnpm-lock.yaml` update.

- [ ] **Step 2: Create upload path helpers**

Create `apps/api/src/services/uploads/uploadPaths.ts`:

```ts
import path from "node:path";
import type { AppConfig } from "../../config.js";

const PUBLIC_UPLOAD_PREFIX = "/uploads";

export function getUploadsRoot(config: AppConfig): string {
  return path.resolve(path.dirname(config.DATABASE_PATH), "uploads");
}

export function getPostImageDirectory(config: AppConfig, postUid: string): string {
  return path.join(getUploadsRoot(config), "images", "posts", postUid);
}

export function getPostImagePublicUrl(postUid: string, filename: string): string {
  return `${PUBLIC_UPLOAD_PREFIX}/images/posts/${postUid}/${filename}`;
}

export function isValidPostUid(value: string): boolean {
  return /^p_[0-9a-f-]{36}$/.test(value);
}
```

- [ ] **Step 3: Add post UID lookup**

In `apps/api/src/repositories/postsRepository.ts`, add:

```ts
export function getPostIdByUid(db: BlogDatabase, uid: string): number | undefined {
  const row = db.prepare("SELECT id FROM posts WHERE uid = ?").get(uid) as { id: number } | undefined;
  return row?.id;
}
```

This lets upload validation confirm that `postUid` belongs to an existing post.

- [ ] **Step 4: Create image upload service**

Create `apps/api/src/services/uploads/imageUploadService.ts`:

```ts
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { MultipartFile } from "@fastify/multipart";
import type { AppConfig } from "../../config.js";
import { getPostImageDirectory, getPostImagePublicUrl, isValidPostUid } from "./uploadPaths.js";

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const ALLOWED_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/gif", "gif"]
]);

export class ImageUploadValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageUploadValidationError";
  }
}

export interface StoredImage {
  url: string;
  markdown: string;
}

export async function storePostImage(config: AppConfig, postUid: string, file: MultipartFile): Promise<StoredImage> {
  if (!isValidPostUid(postUid)) {
    throw new ImageUploadValidationError("Invalid post UID");
  }

  const extension = ALLOWED_TYPES.get(file.mimetype);
  if (!extension) {
    throw new ImageUploadValidationError("Unsupported image type");
  }

  const originalExtension = path.extname(file.filename).slice(1).toLowerCase();
  const normalizedOriginal = originalExtension === "jpeg" ? "jpg" : originalExtension;
  if (normalizedOriginal !== extension && !(extension === "jpg" && originalExtension === "jpeg")) {
    throw new ImageUploadValidationError("Image extension does not match MIME type");
  }

  const buffer = await file.toBuffer();
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new ImageUploadValidationError("Image is too large");
  }

  const directory = getPostImageDirectory(config, postUid);
  await fs.mkdir(directory, { recursive: true });
  const filename = `${crypto.randomUUID()}.${extension}`;
  await fs.writeFile(path.join(directory, filename), buffer, { flag: "wx" });

  const url = getPostImagePublicUrl(postUid, filename);
  return {
    url,
    markdown: `![图片](${url})`
  };
}
```

- [ ] **Step 5: Register static serving**

In `apps/api/src/app.ts`:

Import:

```ts
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import { getUploadsRoot } from "./services/uploads/uploadPaths.js";
```

Register before routes:

```ts
app.register(multipart, {
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 1
  }
});

app.register(fastifyStatic, {
  root: getUploadsRoot(config),
  prefix: "/uploads/",
  decorateReply: false
});
```

- [ ] **Step 6: Run API typecheck**

```powershell
C:\nvm4w\nodejs\pnpm.cmd --filter @tworiver/api typecheck
```

Expected: passes.

- [ ] **Step 7: Commit**

```powershell
git add apps/api/package.json pnpm-lock.yaml apps/api/src/services/uploads apps/api/src/repositories/postsRepository.ts apps/api/src/app.ts
git commit -m "feat: add image upload storage service"
```

## Task 3: Admin Upload API and Delete Cleanup

**Files:**
- Create: `apps/api/src/routes/adminUploadRoutes.ts`
- Modify: `apps/api/src/routes/adminPostRoutes.ts`
- Modify: `apps/api/src/repositories/postsRepository.ts`
- Modify: `apps/api/src/app.ts`
- Create: `apps/api/tests/uploads.test.ts`

- [ ] **Step 1: Write API upload tests**

Create `apps/api/tests/uploads.test.ts` using the existing temp DB/loginWithCsrf pattern.

Test cases:

```ts
test("uploads a supported image for an existing post uid", async () => {
  // create post, read post.uid
  // POST multipart to /api/admin/uploads/images
  // expect 201/200, url starts /uploads/images/posts/<uid>/, markdown contains url
  // GET returned url and expect image bytes/content-type
});

test("rejects uploads for unknown post uid", async () => {
  // postUid p_00000000-0000-0000-0000-000000000000
  // expect 404
});

test("rejects unsupported svg uploads", async () => {
  // filename icon.svg, mimetype image/svg+xml
  // expect 400
});

test("rejects oversized images", async () => {
  // buffer Buffer.alloc(10 * 1024 * 1024 + 1)
  // expect 400
});

test("deleting a post removes its image directory best effort", async () => {
  // upload image, verify file exists under uploads root, delete post, verify post uid directory no longer exists
});
```

Use Fastify inject multipart payload support. If direct multipart construction is cumbersome, use `form-data` or `undici` only if already available; otherwise build the multipart body manually with boundary bytes.

- [ ] **Step 2: Add upload route**

Create `apps/api/src/routes/adminUploadRoutes.ts`:

```ts
import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config.js";
import { getPostIdByUid } from "../repositories/postsRepository.js";
import { ImageUploadValidationError, storePostImage } from "../services/uploads/imageUploadService.js";

interface AdminUploadRouteOptions {
  config: AppConfig;
}

export async function adminUploadRoutes(app: FastifyInstance, { config }: AdminUploadRouteOptions) {
  app.addHook("preHandler", app.requireAuth);
  app.addHook("preHandler", app.requireCsrf);

  app.post("/api/admin/uploads/images", async (request, reply) => {
    const parts = request.parts();
    let postUid = "";
    let imageFile: Awaited<ReturnType<typeof request.file>> | undefined;

    for await (const part of parts) {
      if (part.type === "field" && part.fieldname === "postUid") {
        postUid = String(part.value ?? "");
      }
      if (part.type === "file" && part.fieldname === "file") {
        imageFile = part;
      }
    }

    if (!postUid || !imageFile) {
      reply.code(400).send({ message: "Missing image upload input" });
      return;
    }

    if (!getPostIdByUid(app.db, postUid)) {
      reply.code(404).send({ message: "Post not found" });
      return;
    }

    try {
      const image = await storePostImage(config, postUid, imageFile);
      reply.code(201);
      return image;
    } catch (error) {
      if (error instanceof ImageUploadValidationError) {
        reply.code(400).send({ message: error.message });
        return;
      }
      throw error;
    }
  });
}
```

Adjust the exact multipart file type if TypeScript needs a named type from `@fastify/multipart`.

- [ ] **Step 3: Register upload route**

In `apps/api/src/app.ts`:

```ts
import { adminUploadRoutes } from "./routes/adminUploadRoutes.js";
```

Register:

```ts
app.register(adminUploadRoutes, { config });
```

- [ ] **Step 4: Cleanup post images on delete**

In `postsRepository`, change deletion to return deleted post UID:

```ts
export function deletePost(db: BlogDatabase, id: number): { deleted: boolean; uid?: string } {
  const row = getPostRowById(db, id);
  if (!row) return { deleted: false };
  const result = db.prepare("DELETE FROM posts WHERE id = ?").run(id);
  return { deleted: result.changes > 0, uid: row.uid };
}
```

In `adminPostRoutes`, after successful delete:

```ts
const result = deletePost(app.db, id);
if (!result.deleted) { ... }
if (result.uid) {
  try {
    await removePostImageDirectory(config, result.uid);
  } catch (error) {
    request.log.error({ error, postUid: result.uid }, "Failed to clean post image uploads");
  }
}
```

Add a helper in upload paths/service:

```ts
export async function removePostImageDirectory(config: AppConfig, postUid: string): Promise<void> {
  await fs.rm(getPostImageDirectory(config, postUid), { recursive: true, force: true });
}
```

`adminPostRoutes` will need route options `{ config }`, and `app.ts` should register `adminPostRoutes` with `{ config }`.

- [ ] **Step 5: Run API tests**

```powershell
C:\nvm4w\nodejs\pnpm.cmd --filter @tworiver/api test -- uploads.test.ts
C:\nvm4w\nodejs\pnpm.cmd --filter @tworiver/api test
C:\nvm4w\nodejs\pnpm.cmd --filter @tworiver/api typecheck
```

Expected: all pass.

- [ ] **Step 6: Commit**

```powershell
git add apps/api/src/routes/adminUploadRoutes.ts apps/api/src/routes/adminPostRoutes.ts apps/api/src/repositories/postsRepository.ts apps/api/src/app.ts apps/api/src/services/uploads apps/api/tests/uploads.test.ts apps/api/tests
git commit -m "feat: add admin image upload API"
```

## Task 4: Editor Upload Interactions

**Files:**
- Modify: `apps/web/src/api/admin.ts`
- Modify: `apps/web/src/pages/AdminEditorPage.tsx`
- Modify: `apps/web/src/styles/global.css`
- Modify: `apps/web/src/pages/AdminEditorPage.test.tsx`

- [ ] **Step 1: Add frontend upload client**

In `apps/web/src/api/admin.ts`, add:

```ts
export interface UploadedImage {
  url: string;
  markdown: string;
}

export function uploadAdminPostImage(input: { postUid: string; file: File }) {
  const body = new FormData();
  body.set("postUid", input.postUid);
  body.set("file", input.file);
  return apiRequest<UploadedImage>("/api/admin/uploads/images", {
    method: "POST",
    body
  });
}
```

Update `apiRequest` in `apps/web/src/api/client.ts` if needed so it does not set `Content-Type: application/json` for `FormData` bodies:

```ts
if (init.body !== undefined && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
  headers.set("Content-Type", "application/json");
}
```

- [ ] **Step 2: Preserve post UID in editor**

Add `uid` state to `AdminEditorPage`:

```ts
const [postUid, setPostUid] = useState<string | null>(null);
```

When loading/saving/creating a post, set `postUid` from returned `post.uid`.

New unsaved post starts with `null`.

- [ ] **Step 3: Add Markdown insertion helper**

In `AdminEditorPage`, keep a `textarea` ref:

```ts
const markdownTextareaRef = useRef<HTMLTextAreaElement | null>(null);
```

Create:

```ts
function insertMarkdownAtSelection(markdown: string) {
  const textarea = markdownTextareaRef.current;
  const current = translations[activeLocale].contentMarkdown;
  if (!textarea) {
    updateTranslation("contentMarkdown", `${current}${current ? "\n\n" : ""}${markdown}`);
    return;
  }
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const nextValue = `${current.slice(0, start)}${markdown}${current.slice(end)}`;
  updateTranslation("contentMarkdown", nextValue);
  requestAnimationFrame(() => {
    textarea.focus();
    const cursor = start + markdown.length;
    textarea.setSelectionRange(cursor, cursor);
  });
}
```

Before uploading, derive alt text from current selection:

```ts
const selected = current.slice(start, end).trim();
const alt = selected || "图片";
const markdown = result.markdown.replace("![图片]", `![${alt.replace(/[\\]\\n\\r]/g, " ")}]`);
```

- [ ] **Step 4: Add upload handler**

Create:

```ts
async function uploadImageFile(file: File) {
  if (!postUid) {
    setError(locale === "zh" ? "请先保存草稿再上传图片。" : "Save the draft before uploading images.");
    return;
  }
  if (!file.type.startsWith("image/") || file.type === "image/svg+xml") {
    setError(locale === "zh" ? "仅支持 jpg、png、webp、gif 图片。" : "Only jpg, png, webp, and gif images are supported.");
    return;
  }
  setIsUploadingImage(true);
  setError(null);
  try {
    const result = await uploadAdminPostImage({ postUid, file });
    insertMarkdownAtSelection(withSelectedAltText(result.markdown));
  } catch (caught) {
    setError(caught instanceof Error ? caught.message : "Failed to upload image");
  } finally {
    setIsUploadingImage(false);
  }
}
```

Add state:

```ts
const [isUploadingImage, setIsUploadingImage] = useState(false);
```

- [ ] **Step 5: Add button, drag, and paste UI**

Add a hidden file input and upload button near the Markdown body label:

```tsx
<input
  ref={fileInputRef}
  type="file"
  accept="image/jpeg,image/png,image/webp,image/gif"
  hidden
  onChange={(event) => {
    const file = event.target.files?.[0];
    if (file) void uploadImageFile(file);
    event.currentTarget.value = "";
  }}
/>
<button type="button" className="secondary-button" disabled={isUploadingImage} onClick={() => fileInputRef.current?.click()}>
  {isUploadingImage ? "Uploading..." : "Upload image"}
</button>
```

On the Markdown textarea:

```tsx
onDragOver={(event) => {
  if (Array.from(event.dataTransfer.items).some((item) => item.kind === "file")) {
    event.preventDefault();
  }
}}
onDrop={(event) => {
  const file = Array.from(event.dataTransfer.files).find((item) => item.type.startsWith("image/"));
  if (file) {
    event.preventDefault();
    void uploadImageFile(file);
  }
}}
onPaste={(event) => {
  const file = Array.from(event.clipboardData.files).find((item) => item.type.startsWith("image/"));
  if (file) {
    event.preventDefault();
    void uploadImageFile(file);
  }
}}
```

- [ ] **Step 6: Add frontend tests**

In `apps/web/src/pages/AdminEditorPage.test.tsx`, add tests:

```ts
it("blocks image upload until the post has been saved", ...)
it("uploads from the button and inserts markdown at the cursor", ...)
it("uses selected text as image alt text", ...)
it("uploads dropped images", ...)
it("uploads pasted images", ...)
it("leaves markdown unchanged on upload failure", ...)
```

Mock `uploadAdminPostImage`.

- [ ] **Step 7: Run web verification**

```powershell
C:\nvm4w\nodejs\pnpm.cmd --filter @tworiver/web test -- AdminEditorPage.test.tsx
C:\nvm4w\nodejs\pnpm.cmd --filter @tworiver/web test
C:\nvm4w\nodejs\pnpm.cmd --filter @tworiver/web typecheck
```

Expected: all pass.

- [ ] **Step 8: Commit**

```powershell
git add apps/web/src/api/admin.ts apps/web/src/api/client.ts apps/web/src/pages/AdminEditorPage.tsx apps/web/src/styles/global.css apps/web/src/pages/AdminEditorPage.test.tsx
git commit -m "feat: add editor image upload interactions"
```

## Task 5: Documentation and Final Verification

**Files:**
- Modify: `README.md`
- Modify: `docs/deployment/ubuntu.md`
- Modify: `.env.example` only if a documented value changes

- [ ] **Step 1: Update README**

Add a short note under features:

```md
- Admin image uploads for post Markdown, stored under the database data directory
```

Add a persistence note:

```md
Uploaded images are stored under `<database-dir>/uploads/`. Back up both the SQLite database and the `uploads/` directory.
```

- [ ] **Step 2: Update Ubuntu deployment docs**

In `docs/deployment/ubuntu.md`, add Nginx config:

```nginx
location /uploads/ {
    alias /var/lib/tworiver-blog/uploads/;
    try_files $uri =404;
}
```

Add backup note:

```text
/var/lib/tworiver-blog/blog.sqlite
/var/lib/tworiver-blog/uploads/
```

- [ ] **Step 3: Run full verification**

```powershell
C:\nvm4w\nodejs\pnpm.cmd --filter @tworiver/api test
C:\nvm4w\nodejs\pnpm.cmd --filter @tworiver/web test
C:\nvm4w\nodejs\pnpm.cmd --filter @tworiver/api typecheck
C:\nvm4w\nodejs\pnpm.cmd --filter @tworiver/web typecheck
C:\nvm4w\nodejs\pnpm.cmd --filter @tworiver/api build
C:\nvm4w\nodejs\pnpm.cmd --filter @tworiver/web build
```

Expected: all pass.

- [ ] **Step 4: Browser smoke check**

Start dev servers:

```powershell
C:\nvm4w\nodejs\pnpm.cmd dev
```

Manual/browser checks:

- New post shows upload disabled/error until saved.
- Saved draft can upload image by button.
- Drag image into editor inserts Markdown.
- Paste image into editor inserts Markdown.
- Preview renders uploaded image.
- Delete post removes the post UID uploads directory.

- [ ] **Step 5: Commit docs/final fixes**

```powershell
git add README.md docs/deployment/ubuntu.md .env.example
git commit -m "docs: document image upload storage"
```

## Self-Review Notes

- Spec coverage: image-only scope, 10 MB limit, local storage, post UID folders, button/drop/paste entry points, unsaved-post guard, static serving, delete cleanup, security limits, and deployment notes are each covered.
- Scope control: no compression, media library, image delete UI, object storage, automatic draft creation, or generic attachments are included.
- Type consistency: `uid` is added to shared public post shapes and API post records; upload API returns `url` and `markdown`.
- Risk callout: SQLite migration for `uid` needs careful implementation because existing DBs cannot add a generated non-null unique column in one step.
