# TwoRiver TipTap Article Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Replace the admin article body editor with a progressively rolled out TipTap 3 editor whose JSON is authoritative, while legacy Markdown articles, bilingual publishing, public rendering, resources, and AI translation remain safe and compatible.

**Architecture:** Add a framework-neutral workspace package that owns the versioned article document schema, transformations, Markdown compatibility, and safe HTML mapping. Extend post translations with an explicit content format and additive columns; the API normalizes both legacy Markdown and canonical TipTap requests before repositories persist them. The public renderer ships before TipTap publishing, and the admin editor is then enabled for opt-in drafts, explicit per-locale conversion, and finally default authoring.

**Tech Stack:** TypeScript 5.8, TipTap 3.27.1, ProseMirror, Zod 3, React 19, Vite 6, Fastify 5, better-sqlite3, marked 15, DOMPurify 3, highlight.js 11, Vitest 3, Testing Library, Playwright.

---

## Execution Preconditions

- Start execution only after the current codex/admin-feature-parity worktree is clean and its Web/API baseline is green.
- Use superpowers:using-git-worktrees before Task 1 and create an isolated codex/tiptap-article-editor branch.
- Do not deploy Tasks 1–11 individually to production. Task 12 is the first point where the deployed public application can safely display TipTap content.
- Keep VITE_TIPTAP_NEW_ARTICLE_ENABLED=false and TIPTAP_PUBLISH_ENABLED=false until the rollout task explicitly changes the environment.
- Every task follows RED → GREEN → focused verification → commit. Do not combine task commits.
- Use exact TipTap version 3.27.1 for every @tiptap package. Upgrade only in a separate dependency change after this plan is complete.

## File Map

### Workspace content engine

- Create packages/content-engine/package.json: package metadata, exports, scripts, exact TipTap dependencies.
- Create packages/content-engine/tsconfig.json: NodeNext build and declaration output.
- Create packages/content-engine/vitest.config.ts: Node test environment.
- Create packages/content-engine/src/index.ts: public server/editor exports.
- Create packages/content-engine/src/browser.ts: browser-safe renderer and types export without editor setup side effects.
- Create packages/content-engine/src/documentTypes.ts: schema version, JSON types, validation error types.
- Create packages/content-engine/src/documentLimits.ts: size, node count, nesting, URL limits.
- Create packages/content-engine/src/urlPolicy.ts: browser-safe link and image URL policy.
- Create packages/content-engine/src/articleExtensions.ts: one canonical TipTap extension list.
- Create packages/content-engine/src/validateDocument.ts: schema, attrs, URL, complexity validation.
- Create packages/content-engine/src/normalizeDocument.ts: heading ID completion and duplicate repair.
- Create packages/content-engine/src/extractText.ts: search and AI prose extraction.
- Create packages/content-engine/src/collectResourceReferences.ts: image URL collection.
- Create packages/content-engine/src/markdownProjection.ts: canonical JSON to deterministic Markdown.
- Create packages/content-engine/src/markdownImport.ts: conservative Markdown conversion preview.
- Create packages/content-engine/src/renderArticleHtml.ts: browser-safe JSON-to-HTML mapping.
- Create packages/content-engine/src/translationSegments.ts: topology-preserving translation segments.
- Create packages/content-engine/src/migrations/v1.ts: current-version migration entry.
- Create tests under packages/content-engine/tests/ plus Markdown fixtures.

### Shared contracts

- Modify packages/shared/package.json: depend on and build content-engine first.
- Modify packages/shared/src/schemas/publishing.ts: canonical ArticleContent union, legacy input normalization, expectedUpdatedAt.
- Modify packages/shared/src/index.ts and packages/shared/src/schemas.ts only if exports require adjustment.
- Modify apps/api/tests/sharedSchemas.test.ts.

### Database and API

- Modify apps/api/package.json: direct workspace dependency.
- Modify apps/api/src/db/schema.sql: additive post translation content columns and fresh-database constraints.
- Modify apps/api/src/db/migrate.ts: migration v5, backfill, triggers, idempotency.
- Modify apps/api/src/repositories/postsRepository.ts: hydration, per-locale UPSERT, optimistic update.
- Create apps/api/src/services/articleContentService.ts: server normalization and derived fields.
- Modify apps/api/src/services/resourceReferenceService.ts: format-aware post reference scan.
- Modify apps/api/src/services/ai/translationDraftService.ts: Markdown and TipTap translation paths.
- Modify apps/api/src/routes/adminPostRoutes.ts: canonical CRUD, conflict errors, conversion and restore routes.
- Modify apps/api/src/config.ts and .env.example: publish gate.
- Modify API tests: migrations.admin-parity.test.ts, sharedSchemas.test.ts, posts.test.ts, uploads.test.ts, uploadCleanup.test.ts.
- Create apps/api/tests/articleContentService.test.ts.

### Web editor and rendering

- Modify apps/web/package.json: @tworiver/content-engine, @tiptap/react, @tiptap/extension-file-handler.
- Create apps/web/src/editor/ArticleEditor.tsx and ArticleEditor.test.tsx.
- Create apps/web/src/editor/ArticleEditorToolbar.tsx and ArticleEditorToolbar.test.tsx.
- Create apps/web/src/editor/ArticleLinkPopover.tsx.
- Create apps/web/src/editor/ArticleTableControls.tsx.
- Create apps/web/src/editor/CodeBlockLanguageSelect.tsx.
- Create apps/web/src/editor/useArticleImageUpload.ts and test.
- Create apps/web/src/editor/useUnsavedArticleWarning.ts and test.
- Create apps/web/src/editor/ArticleFormatActions.tsx and test.
- Modify apps/web/src/api/admin.ts and admin.test.ts.
- Modify apps/web/src/pages/AdminEditorPage.tsx and AdminEditorPage.test.tsx.
- Create apps/web/src/utils/renderArticleDocument.ts and test.
- Modify apps/web/src/utils/renderMarkdownDocument.ts and test.
- Modify apps/web/src/components/MarkdownPreview.tsx and test.
- Modify apps/web/src/pages/PostPage.tsx and PostPage.test.tsx.
- Modify apps/web/src/styles/global.scss and markdown.scss.
- Modify apps/web/src/vite-env.d.ts if the project provides it; otherwise create apps/web/src/env.d.ts for typed feature flags.

### Browser and release verification

- Create tests/e2e/tiptap-editor.spec.ts.
- Modify tests/e2e/publishing.spec.ts only to keep its legacy Markdown regression explicit.
- Modify README.md and .env.example.
- Update docs/tiptap-document-engine.md only if implementation discovers a corrected long-term boundary; do not broaden this release.

---

### Task 1: Scaffold the Content Engine and Lock Dependency Versions

**Files:**
- Create: packages/content-engine/package.json
- Create: packages/content-engine/tsconfig.json
- Create: packages/content-engine/vitest.config.ts
- Create: packages/content-engine/src/index.ts
- Create: packages/content-engine/src/browser.ts
- Create: packages/content-engine/src/documentTypes.ts
- Create: packages/content-engine/tests/smoke.test.ts
- Modify: packages/shared/package.json
- Modify: apps/api/package.json
- Modify: apps/web/package.json
- Modify: pnpm-lock.yaml

- [ ] **Step 1: Write the failing workspace smoke test**

Create packages/content-engine/tests/smoke.test.ts:

~~~ts
import { describe, expect, test } from "vitest";
import { ARTICLE_DOCUMENT_SCHEMA_VERSION } from "../src/index.js";

describe("content engine package", () => {
  test("exports the current article document schema version", () => {
    expect(ARTICLE_DOCUMENT_SCHEMA_VERSION).toBe(1);
  });
});
~~~

- [ ] **Step 2: Run the package test and verify RED**

Run: pnpm --filter @tworiver/content-engine test

Expected: FAIL because the workspace package does not exist.

- [ ] **Step 3: Create the package and build configuration**

Use this package contract:

~~~json
{
  "name": "@tworiver/content-engine",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./browser": {
      "types": "./dist/browser.d.ts",
      "import": "./dist/browser.js"
    },
    "./schema": {
      "types": "./dist/documentTypes.d.ts",
      "import": "./dist/documentTypes.js"
    },
    "./editor": {
      "types": "./dist/articleExtensions.d.ts",
      "import": "./dist/articleExtensions.js"
    }
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
    "lint": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@tiptap/core": "3.27.1",
    "@tiptap/extension-code-block-lowlight": "3.27.1",
    "@tiptap/extension-image": "3.27.1",
    "@tiptap/extension-table": "3.27.1",
    "@tiptap/extension-unique-id": "3.27.1",
    "@tiptap/markdown": "3.27.1",
    "@tiptap/static-renderer": "3.27.1",
    "@tiptap/starter-kit": "3.27.1",
    "lowlight": "^3.3.0",
    "marked": "^15.0.12",
    "zod": "^3.25.56"
  },
  "devDependencies": {
    "typescript": "^5.8.3",
    "vitest": "^3.2.1"
  }
}
~~~

tsconfig.json extends ../../tsconfig.base.json, sets NodeNext module/moduleResolution, declaration=true, outDir=dist, rootDir=src, and includes src. vitest.config.ts uses the Node environment and includes tests/**/*.test.ts.

- [ ] **Step 4: Add the initial exports**

Create packages/content-engine/src/index.ts:

~~~ts
export { ARTICLE_DOCUMENT_SCHEMA_VERSION } from "./documentTypes.js";
~~~

Create packages/content-engine/src/documentTypes.ts:

~~~ts
export const ARTICLE_DOCUMENT_SCHEMA_VERSION = 1 as const;
~~~

Create packages/content-engine/src/browser.ts:

~~~ts
export { ARTICLE_DOCUMENT_SCHEMA_VERSION } from "./documentTypes.js";
~~~

browser.ts must always import browser-safe leaf modules directly. It must never re-export index.ts, articleExtensions.ts, or any editor/runtime module, even during scaffolding.

- [ ] **Step 5: Wire workspace dependencies and build order**

Add @tworiver/content-engine: workspace:* to shared, API, and Web dependencies. Change the shared build/typecheck/test prerequisite so a direct shared build first builds content-engine:

~~~json
{
  "scripts": {
    "build": "pnpm --filter @tworiver/content-engine build && tsc -p tsconfig.json",
    "typecheck": "pnpm --filter @tworiver/content-engine build && tsc -p tsconfig.json --noEmit",
    "test": "pnpm --filter @tworiver/content-engine test"
  }
}
~~~

Add @tiptap/react 3.27.1 and @tiptap/extension-file-handler 3.27.1 to apps/web/package.json. Run pnpm install so pnpm-lock.yaml records one TipTap version line.

- [ ] **Step 6: Verify GREEN and package build order**

Run:

~~~powershell
pnpm --filter @tworiver/content-engine test
pnpm --filter @tworiver/content-engine build
pnpm --filter @tworiver/shared build
pnpm --filter @tworiver/api typecheck
pnpm --filter @tworiver/web typecheck
~~~

Expected: all commands PASS; pnpm why @tiptap/core reports 3.27.1 only.

- [ ] **Step 7: Commit**

~~~powershell
git add packages/content-engine packages/shared/package.json apps/api/package.json apps/web/package.json pnpm-lock.yaml
git commit -m "build: add versioned article content engine"
~~~

### Task 2: Define the v1 TipTap Schema and Strict Validation

**Files:**
- Modify: packages/content-engine/src/documentTypes.ts
- Create: packages/content-engine/src/documentLimits.ts
- Create: packages/content-engine/src/urlPolicy.ts
- Create: packages/content-engine/src/articleExtensions.ts
- Create: packages/content-engine/src/validateDocument.ts
- Create: packages/content-engine/tests/documentSchema.test.ts
- Modify: packages/content-engine/src/index.ts
- Modify: packages/content-engine/src/browser.ts

- [ ] **Step 1: Write failing schema and security tests**

Create cases for a paragraph, all allowed nodes, unknown nodes, underline, unknown attrs, javascript links, data images, oversized URL, excess depth, and excess node count:

~~~ts
import { describe, expect, test } from "vitest";
import { validateArticleDocument } from "../src/index.js";

const paragraph = {
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "Hello" }] }]
};

test("accepts the minimal v1 document", () => {
  expect(validateArticleDocument(paragraph)).toEqual(paragraph);
});

test("rejects unknown nodes and persisted underline marks", () => {
  expect(() => validateArticleDocument({ type: "doc", content: [{ type: "callout" }] })).toThrow(/unknown-node/);
  expect(() =>
    validateArticleDocument({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "x", marks: [{ type: "underline" }] }] }]
    })
  ).toThrow(/unknown-mark/);
});

test("rejects unsafe URLs", () => {
  expect(() =>
    validateArticleDocument({
      type: "doc",
      content: [{
        type: "paragraph",
        content: [{ type: "text", text: "bad", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] }]
      }]
    })
  ).toThrow(/unsafe-link/);
});
~~~

- [ ] **Step 2: Run the schema test and verify RED**

Run: pnpm --filter @tworiver/content-engine test -- documentSchema.test.ts

Expected: FAIL because validateArticleDocument and the document types do not exist.

- [ ] **Step 3: Define document types and limits**

Use a deliberately narrow persisted JSON model:

~~~ts
export interface ArticleMark {
  type: "bold" | "italic" | "strike" | "code" | "link";
  attrs?: Record<string, unknown>;
}

export interface ArticleNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: ArticleNode[];
  marks?: ArticleMark[];
  text?: string;
}

export interface ArticleDocument extends ArticleNode {
  type: "doc";
  content: ArticleNode[];
}

export const ARTICLE_DOCUMENT_SCHEMA_VERSION = 1 as const;
export const MAX_ARTICLE_JSON_BYTES = 1024 * 1024;
export const MAX_ARTICLE_NODES = 20_000;
export const MAX_ARTICLE_DEPTH = 50;
export const MAX_ARTICLE_URL_LENGTH = 2_048;
~~~

Keep ARTICLE_DOCUMENT_SCHEMA_VERSION in documentTypes.ts, then re-export it from index.ts and directly from browser.ts. Define a recursive strict ArticleDocumentSchema in documentTypes.ts for shared API shape checking. It allows generic string node names so the shared contract can parse JSON, while validateArticleDocument performs the v1 whitelist and ProseMirror checks. Define ArticleDocumentValidationError with code and path fields so API errors can expose safe diagnostics without body content. Add a schema test proving browser.ts can be imported without loading articleExtensions or lowlight.

- [ ] **Step 4: Define the canonical extension list**

Create articleExtensions.ts with:

~~~ts
import { common, createLowlight } from "lowlight";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { TableKit } from "@tiptap/extension-table";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { UniqueID } from "@tiptap/extension-unique-id";

const lowlight = createLowlight(common);

export const articleExtensions = [
  StarterKit.configure({
    underline: false,
    codeBlock: false,
    heading: { levels: [1, 2, 3, 4, 5, 6] },
    link: {
      openOnClick: false,
      autolink: true,
      protocols: ["http", "https", "mailto"]
    }
  }),
  CodeBlockLowlight.configure({ lowlight }),
  Image.configure({ allowBase64: false, inline: false }),
  TableKit.configure({ table: { resizable: false } }),
  UniqueID.configure({
    types: ["heading"],
    generateID: () => "h_" + globalThis.crypto.randomUUID()
  })
];
~~~

- [ ] **Step 5: Implement strict validation**

validateArticleDocument must:

1. Reject non-object/non-doc roots.
2. Count UTF-8 JSON bytes, nodes, and depth.
3. Check node/mark names against constants.
4. Check attrs by node/mark, rejecting extra keys.
5. Validate heading level 1–6 and non-empty optional ID.
6. Validate code language as null or a conservative token.
7. Validate links and images with URL helper functions.
8. Build a ProseMirror schema with getSchema(articleExtensions), call nodeFromJSON, and call check().
9. Return a structured clone typed as ArticleDocument.

Place the browser-safe URL predicates in urlPolicy.ts:

~~~ts
export function isAllowedLink(value: string): boolean {
  if (value.startsWith("/") || value.startsWith("#")) return true;
  const url = new URL(value);
  return ["http:", "https:", "mailto:"].includes(url.protocol);
}

export function isAllowedImage(value: string): boolean {
  if (value.startsWith("/uploads/")) return true;
  return new URL(value).protocol === "https:";
}
~~~

Catch URL construction errors and return false. Never accept data:, file:, blob:, or javascript:.

- [ ] **Step 6: Run tests and typecheck**

Run:

~~~powershell
pnpm --filter @tworiver/content-engine test -- documentSchema.test.ts
pnpm --filter @tworiver/content-engine typecheck
~~~

Expected: PASS.

- [ ] **Step 7: Commit**

~~~powershell
git add packages/content-engine/src packages/content-engine/tests/documentSchema.test.ts
git commit -m "feat(content): define article document schema"
~~~

### Task 3: Normalize IDs, Extract Text, and Collect Resources

**Files:**
- Create: packages/content-engine/src/normalizeDocument.ts
- Create: packages/content-engine/src/extractText.ts
- Create: packages/content-engine/src/collectResourceReferences.ts
- Create: packages/content-engine/src/migrations/v1.ts
- Create: packages/content-engine/tests/documentTransforms.test.ts
- Modify: packages/content-engine/src/index.ts
- Modify: packages/content-engine/src/browser.ts

- [ ] **Step 1: Write failing transform tests**

~~~ts
test("adds stable unique IDs only to headings", () => {
  const normalized = normalizeArticleDocument({
    type: "doc",
    content: [
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Intro" }] },
      { type: "paragraph", content: [{ type: "text", text: "Body" }] }
    ]
  });
  expect(normalized.content[0]?.attrs?.id).toMatch(/^h_/);
  expect(normalized.content[1]?.attrs?.id).toBeUndefined();
});

test("preserves the first heading ID and repairs duplicates", () => {
  const normalized = normalizeArticleDocument(duplicateHeadingIds);
  expect(normalized.content.map((node) => node.attrs?.id)).toEqual(["intro", expect.stringMatching(/^h_/)]);
});

test("extracts search text and prose text with different code behavior", () => {
  expect(extractArticleText(documentWithCode)).toContain("const answer = 42");
  expect(extractArticleProse(documentWithCode)).not.toContain("const answer = 42");
});

test("collects unique image references", () => {
  expect(collectArticleResourceReferences(documentWithDuplicateImage)).toEqual(["/uploads/a.png"]);
});
~~~

- [ ] **Step 2: Run transform tests and verify RED**

Run: pnpm --filter @tworiver/content-engine test -- documentTransforms.test.ts

Expected: FAIL with missing exports.

- [ ] **Step 3: Implement normalization without mutating the caller**

Deep-clone the validated document, walk it depth-first, keep a Set of heading IDs, and assign h_UUID to missing/duplicate IDs. Preserve valid unique IDs. Return validateArticleDocument(normalized).

Expose:

~~~ts
export function normalizeArticleDocument(input: unknown): ArticleDocument;
export function migrateArticleDocument(schemaVersion: number, input: unknown): ArticleDocument;
~~~

For version 1, migrateArticleDocument validates and normalizes. Reject version numbers below 1 or above ARTICLE_DOCUMENT_SCHEMA_VERSION with unsupported-schema-version.

- [ ] **Step 4: Implement search and prose extraction**

Walk visible nodes in document order. Search text includes headings, paragraphs, lists, quotes, table cells, image alt, and code block text. Prose excludes codeBlock. Join block boundaries with newlines, collapse three or more newlines to two, and trim.

~~~ts
export function extractArticleText(doc: ArticleDocument): string {
  return extract(doc, { includeCode: true });
}

export function extractArticleProse(doc: ArticleDocument): string {
  return extract(doc, { includeCode: false });
}
~~~

- [ ] **Step 5: Implement resource collection**

Return sorted unique normalized image src values:

~~~ts
export function collectArticleResourceReferences(doc: ArticleDocument): string[] {
  const urls = new Set<string>();
  walkArticleDocument(doc, (node) => {
    if (node.type === "image" && typeof node.attrs?.src === "string") {
      urls.add(node.attrs.src);
    }
  });
  return [...urls].sort();
}
~~~

- [ ] **Step 6: Run tests**

Run:

~~~powershell
pnpm --filter @tworiver/content-engine test -- documentTransforms.test.ts
pnpm --filter @tworiver/content-engine test
~~~

Expected: PASS.

- [ ] **Step 7: Commit**

~~~powershell
git add packages/content-engine/src packages/content-engine/tests/documentTransforms.test.ts
git commit -m "feat(content): normalize and derive article content"
~~~

### Task 4: Add Deterministic Markdown Projection and Conservative Import

**Files:**
- Create: packages/content-engine/src/markdownProjection.ts
- Create: packages/content-engine/src/markdownImport.ts
- Create: packages/content-engine/tests/markdownConversion.test.ts
- Create: packages/content-engine/tests/fixtures/basic.md
- Create: packages/content-engine/tests/fixtures/unsupported-html.md
- Create: packages/content-engine/tests/fixtures/unsupported-task-list.md
- Modify: packages/content-engine/src/index.ts

- [ ] **Step 1: Write failing projection and preview tests**

~~~ts
test("projects supported JSON to deterministic GFM", () => {
  const first = projectArticleToMarkdown(fullSupportedDocument);
  const second = projectArticleToMarkdown(fullSupportedDocument);
  expect(second).toBe(first);
  expect(first).toContain("## Heading");
  expect(first).toMatch(/\x60{3}ts/);
  expect(first).toContain("| Name | Value |");
  expect(first).toContain("![Diagram](/uploads/diagram.png)");
});

test("previews supported Markdown without writing state", () => {
  const result = previewMarkdownConversion("# Intro\\n\\nHello **world**.");
  expect(result.canConvert).toBe(true);
  expect(result.blockers).toEqual([]);
  expect(result.document.type).toBe("doc");
  expect(result.document.content[0]?.attrs?.id).toBe("intro");
  expect(result.projectedMarkdown).toContain("# Intro");
});

test("preserves the current public heading slug rules during conversion", () => {
  const result = previewMarkdownConversion("## 中文标题\\n\\n## 中文标题");
  expect(result.document?.content.map((node) => node.attrs?.id)).toEqual([
    "中文标题",
    "中文标题-2"
  ]);
});

test.each([
  ["raw-html", "<section>unsafe</section>"],
  ["task-list", "- [x] shipped"]
])("blocks %s in v1", (code, markdown) => {
  const result = previewMarkdownConversion(markdown);
  expect(result.canConvert).toBe(false);
  expect(result.blockers).toEqual(expect.arrayContaining([expect.objectContaining({ code })]));
});
~~~

- [ ] **Step 2: Run conversion tests and verify RED**

Run: pnpm --filter @tworiver/content-engine test -- markdownConversion.test.ts

Expected: FAIL with missing projection/import exports.

- [ ] **Step 3: Implement deterministic projection**

Use renderToMarkdown from @tiptap/static-renderer/pm/markdown with articleExtensions and normalized JSON. Normalize line endings to LF, remove trailing spaces, and end non-empty output with one newline.

~~~ts
export function projectArticleToMarkdown(input: unknown): string {
  const document = normalizeArticleDocument(input);
  const markdown = renderToMarkdown({
    extensions: articleExtensions,
    content: document
  });
  return normalizeProjectedMarkdown(markdown);
}
~~~

Throw ArticleDocumentValidationError with markdown-projection-failed when the renderer cannot represent an allowed v1 node.

- [ ] **Step 4: Implement conservative Markdown preview**

Register articleExtensions with MarkdownManager configured for GFM. Before parsing, detect:

- HTML tags outside fenced code;
- task-list syntax;
- iframe/script/style;
- data images;
- malformed table constructs that fail projection.

Return:

~~~ts
export interface MarkdownConversionPreview {
  canConvert: boolean;
  document: ArticleDocument | null;
  projectedMarkdown: string | null;
  blockers: Array<{ code: string; line: number; message: string }>;
  warnings: Array<{ code: string; line: number; message: string }>;
}
~~~

For a non-blocked document, parse, assign missing heading IDs with the current Unicode NFKC public slug/deduplication rule, normalize, validate, project, and compare a normalized semantic token stream from source and projection. Return warnings for external HTTPS images, normalized whitespace, and non-blocking semantic differences. A blocker always leaves document and projectedMarkdown null.

- [ ] **Step 5: Add a legacy Markdown text extractor**

Export extractMarkdownText and extractMarkdownProse for migration/service use. Tokenize with marked, preserve code only in extractMarkdownText, remove HTML, and return normalized plain text.

- [ ] **Step 6: Run tests**

Run:

~~~powershell
pnpm --filter @tworiver/content-engine test -- markdownConversion.test.ts
pnpm --filter @tworiver/content-engine build
~~~

Expected: PASS.

- [ ] **Step 7: Commit**

~~~powershell
git add packages/content-engine
git commit -m "feat(content): add markdown compatibility pipeline"
~~~

### Task 5: Add Canonical and Legacy-Compatible Shared Contracts

**Files:**
- Modify: packages/shared/src/schemas/publishing.ts
- Modify: apps/api/tests/sharedSchemas.test.ts

- [ ] **Step 1: Write failing schema tests**

~~~ts
const tiptapContent = {
  format: "tiptap",
  schemaVersion: 1,
  doc: { type: "doc", content: [{ type: "paragraph" }] }
};

test("normalizes legacy Markdown post input", () => {
  const parsed = UpsertPostInputSchema.parse(legacyPostPayload);
  expect(parsed.translations[0]?.content).toEqual({
    format: "markdown",
    markdown: "Legacy body"
  });
});

test("accepts canonical TipTap input and rejects dual sources", () => {
  expect(UpsertPostInputSchema.parse(canonicalTiptapPayload).translations[0]?.content).toEqual(tiptapContent);
  expect(() =>
    UpsertPostInputSchema.parse({
      ...canonicalTiptapPayload,
      translations: [{
        ...canonicalTiptapPayload.translations[0],
        contentMarkdown: "ambiguous"
      }]
    })
  ).toThrow();
});

test("accepts optimistic concurrency on updates", () => {
  expect(UpsertPostInputSchema.parse({
    ...legacyPostPayload,
    expectedUpdatedAt: "2026-06-30T00:00:00.000Z"
  }).expectedUpdatedAt).toBe("2026-06-30T00:00:00.000Z");
});
~~~

- [ ] **Step 2: Run schema tests and verify RED**

Run: pnpm --filter @tworiver/api test -- sharedSchemas.test.ts

Expected: FAIL because ArticleContentSchema and canonical inputs are absent.

- [ ] **Step 3: Define the canonical content union**

~~~ts
export const MarkdownArticleContentSchema = z.object({
  format: z.literal("markdown"),
  markdown: z.string()
});

export const TiptapArticleContentSchema = z.object({
  format: z.literal("tiptap"),
  schemaVersion: z.number().int().positive(),
  doc: ArticleDocumentSchema
});

export const ArticleContentSchema = z.discriminatedUnion("format", [
  MarkdownArticleContentSchema,
  TiptapArticleContentSchema
]);
~~~

ArticleDocumentSchema comes from @tworiver/content-engine/schema and verifies the JSON shape; the API content service performs full schema validation and complexity checks.

- [ ] **Step 4: Split response and input schemas**

PostTranslationSchema is the response shape and includes content plus deprecated contentMarkdown:

~~~ts
export const PostTranslationSchema = PostTranslationMetadataSchema.extend({
  content: ArticleContentSchema,
  contentMarkdown: z.string(),
  canRestoreMarkdown: z.boolean().default(false),
  restoreMarkdownSnapshotAt: DateTimeStringSchema.nullable().default(null)
});
~~~

PostTranslationInputSchema is a union:

- canonical branch requires content and rejects contentMarkdown;
- legacy branch requires contentMarkdown, rejects content, and transforms to content.format=markdown.

UpsertPostInputSchema uses PostTranslationInputSchema and adds optional expectedUpdatedAt. Preserve the current UpsertPostInput TypeScript convenience defaults for isPinned, isFeatured, and coverUrl.

- [ ] **Step 5: Update existing schema fixtures**

Existing response fixtures now include:

~~~ts
content: { format: "markdown", markdown: "Body" },
contentMarkdown: "Body"
~~~

Legacy mutation fixtures remain valid and prove compatibility.

- [ ] **Step 6: Run tests and build**

Run:

~~~powershell
pnpm --filter @tworiver/api test -- sharedSchemas.test.ts
pnpm --filter @tworiver/shared build
pnpm --filter @tworiver/web typecheck
~~~

Expected: PASS after callers compile against the additive response type.

- [ ] **Step 7: Commit**

~~~powershell
git add packages/shared/src/schemas/publishing.ts apps/api/tests/sharedSchemas.test.ts
git commit -m "feat(shared): add article content format contracts"
~~~

### Task 6: Add the Additive SQLite Migration and Invariants

**Files:**
- Modify: apps/api/src/db/schema.sql
- Modify: apps/api/src/db/migrate.ts
- Modify: apps/api/tests/migrations.admin-parity.test.ts

- [ ] **Step 1: Write failing fresh/legacy/idempotency tests**

Assert fresh and migrated post_translations have:

~~~ts
expect(columns).toEqual(expect.arrayContaining([
  "content_format",
  "content_json",
  "content_schema_version",
  "content_text",
  "migration_source_markdown",
  "migration_source_created_at"
]));
expect(db.prepare(
  "SELECT content_format, content_json, content_schema_version, content_text, migration_source_markdown, migration_source_created_at FROM post_translations"
).get()).toEqual({
  content_format: "markdown",
  content_json: null,
  content_schema_version: null,
  content_text: "旧正文",
  migration_source_markdown: null,
  migration_source_created_at: null
});
~~~

Also assert migration twice leaves one version 5 row, invalid format combinations fail, valid legacy inserts from the old repository shape still pass, and foreign_key_check is empty.

- [ ] **Step 2: Run migration tests and verify RED**

Run: pnpm --filter @tworiver/api test -- migrations.admin-parity.test.ts

Expected: FAIL because the columns and migration version do not exist.

- [ ] **Step 3: Extend fresh schema**

Add to post_translations:

~~~sql
content_format TEXT NOT NULL DEFAULT 'markdown'
  CHECK (content_format IN ('markdown', 'tiptap')),
content_json TEXT CHECK (content_json IS NULL OR json_valid(content_json)),
content_schema_version INTEGER,
content_text TEXT NOT NULL DEFAULT '',
migration_source_markdown TEXT,
migration_source_created_at TEXT,
CHECK (
  (content_format = 'markdown' AND content_json IS NULL AND content_schema_version IS NULL)
  OR
  (content_format = 'tiptap' AND content_json IS NOT NULL AND content_schema_version >= 1)
),
CHECK (
  (migration_source_markdown IS NULL AND migration_source_created_at IS NULL)
  OR
  (migration_source_markdown IS NOT NULL AND migration_source_created_at IS NOT NULL)
),
~~~

- [ ] **Step 4: Implement migration v5**

Use addColumnIfMissing for the six columns, iterate existing rows to backfill content_text with extractMarkdownText, create insert/update guard triggers equivalent to the fresh CHECK, then insert schema_migrations version 5 only after all operations succeed. Wrap backfill, trigger creation, and version insertion in one better-sqlite3 transaction.

When v5 actually runs, emit one structured migration event containing fromVersion, toVersion, scannedRows, and backfilledRows. Do not emit titles, locale text, Markdown, JSON, or extracted content_text; idempotent startup after v5 emits no duplicate migration event.

The trigger condition rejects:

~~~sql
NEW.content_format NOT IN ('markdown', 'tiptap')
OR (NEW.content_format = 'markdown' AND (NEW.content_json IS NOT NULL OR NEW.content_schema_version IS NOT NULL))
OR (NEW.content_format = 'tiptap' AND (NEW.content_json IS NULL OR NEW.content_schema_version IS NULL OR NEW.content_schema_version < 1))
OR (NEW.content_json IS NOT NULL AND json_valid(NEW.content_json) = 0)
OR ((NEW.migration_source_markdown IS NULL) <> (NEW.migration_source_created_at IS NULL))
~~~

- [ ] **Step 5: Run migration and existing API tests**

Run:

~~~powershell
pnpm --filter @tworiver/api test -- migrations.admin-parity.test.ts posts.test.ts
pnpm --filter @tworiver/api typecheck
~~~

Expected: PASS; old mutation SQL still inserts Markdown rows through defaults.

- [ ] **Step 6: Commit**

~~~powershell
git add apps/api/src/db/schema.sql apps/api/src/db/migrate.ts apps/api/tests/migrations.admin-parity.test.ts
git commit -m "feat(api): add dual-format article storage"
~~~

### Task 7: Implement the Server Content Preparation Service

**Files:**
- Create: apps/api/src/services/articleContentService.ts
- Create: apps/api/tests/articleContentService.test.ts

- [ ] **Step 1: Write failing service tests**

~~~ts
test("prepares Markdown storage fields", () => {
  expect(prepareArticleContent({
    format: "markdown",
    markdown: "# Intro\\n\\nBody"
  })).toEqual({
    contentFormat: "markdown",
    contentMarkdown: "# Intro\\n\\nBody",
    contentJson: null,
    contentSchemaVersion: null,
    contentText: "Intro\\n\\nBody"
  });
});

test("normalizes TipTap and derives compatibility fields", () => {
  const result = prepareArticleContent({
    format: "tiptap",
    schemaVersion: 1,
    doc: headingWithoutId
  });
  expect(result.contentFormat).toBe("tiptap");
  expect(result.contentJson).toContain('"type":"doc"');
  expect(result.contentMarkdown).toContain("## Intro");
  expect(result.contentText).toContain("Intro");
  expect(JSON.parse(result.contentJson ?? "").content[0].attrs.id).toMatch(/^h_/);
});

test("maps content validation failures to safe codes", () => {
  expect(() => prepareArticleContent(unsafeDocumentContent)).toThrow(
    expect.objectContaining({ code: "unsafe-link", path: expect.any(Array) })
  );
});
~~~

- [ ] **Step 2: Run service tests and verify RED**

Run: pnpm --filter @tworiver/api test -- articleContentService.test.ts

Expected: FAIL because the service is missing.

- [ ] **Step 3: Implement the prepared storage contract**

~~~ts
export interface PreparedArticleContent {
  contentFormat: "markdown" | "tiptap";
  contentMarkdown: string;
  contentJson: string | null;
  contentSchemaVersion: number | null;
  contentText: string;
}

export function prepareArticleContent(content: ArticleContent): PreparedArticleContent;
~~~

Markdown uses extractMarkdownText. TipTap calls migrateArticleDocument, normalizeArticleDocument, validateArticleDocument, projectArticleToMarkdown, and extractArticleText in that order. JSON.stringify uses the normalized document and no pretty-printing.

- [ ] **Step 4: Add error mapping**

Define ArticleContentInputError with code, path, and publicMessage. Map unknown exceptions to content-processing-failed without including the document in logs or messages.

- [ ] **Step 5: Run tests**

Run:

~~~powershell
pnpm --filter @tworiver/api test -- articleContentService.test.ts
pnpm --filter @tworiver/api typecheck
~~~

Expected: PASS.

- [ ] **Step 6: Commit**

~~~powershell
git add apps/api/src/services/articleContentService.ts apps/api/tests/articleContentService.test.ts
git commit -m "feat(api): prepare canonical article content"
~~~

### Task 8: Hydrate Canonical Content and UPSERT Translations

**Files:**
- Modify: apps/api/src/repositories/postsRepository.ts
- Modify: apps/api/tests/posts.test.ts

- [ ] **Step 1: Write failing repository/API behavior tests**

Add tests that:

- create a legacy payload and receive content.format=markdown plus contentMarkdown;
- create a TipTap draft and receive normalized JSON;
- update one locale without changing its created_at;
- preserve migration_source_markdown and migration_source_created_at during normal TipTap updates;
- remove a language omitted from the request;
- reject an update with stale expectedUpdatedAt.

Use direct SQL assertions:

~~~ts
const stored = app.db.prepare(
  "SELECT content_format, content_json, content_schema_version, content_text, created_at FROM post_translations WHERE post_id = ? AND locale = 'en'"
).get(postId);
expect(stored).toEqual(expect.objectContaining({
  content_format: "tiptap",
  content_schema_version: 1,
  content_text: "Intro"
}));
~~~

- [ ] **Step 2: Run post tests and verify RED**

Run: pnpm --filter @tworiver/api test -- posts.test.ts

Expected: FAIL because hydration and persistence only understand content_markdown.

- [ ] **Step 3: Extend translation rows and hydration**

Select content_format, content_json, content_schema_version, content_text, migration_source_markdown, and migration_source_created_at in single and batched hydration. Map rows:

~~~ts
const content = row.content_format === "tiptap"
  ? {
      format: "tiptap" as const,
      schemaVersion: row.content_schema_version ?? 1,
      doc: JSON.parse(row.content_json ?? "{}")
    }
  : {
      format: "markdown" as const,
      markdown: row.content_markdown
    };

return {
  locale: row.locale,
  title: row.title,
  summary: row.summary,
  content,
  contentMarkdown: row.content_markdown,
  canRestoreMarkdown: row.migration_source_markdown !== null,
  restoreMarkdownSnapshotAt: row.migration_source_created_at,
  seoTitle: row.seo_title,
  seoDescription: row.seo_description
};
~~~

Do not expose migration_source_markdown through public post responses.

- [ ] **Step 4: Replace delete/reinsert with per-locale UPSERT**

For every parsed translation call prepareArticleContent. Use INSERT ... ON CONFLICT(post_id, locale) DO UPDATE for title, summary, content fields, SEO, and updated_at; do not update created_at, migration_source_markdown, or migration_source_created_at.

After UPSERTs, delete translations not present in the submitted locale set using a parameterized NOT IN clause. Keep tag replacement in the same outer article transaction.

- [ ] **Step 5: Add optimistic update protection**

If expectedUpdatedAt exists, the posts UPDATE includes:

~~~sql
WHERE id = ? AND updated_at = ?
~~~

If changes is zero but the post exists, throw PostUpdateConflictError. Generate the new timestamp after reading expectedUpdatedAt and return the rehydrated post.

- [ ] **Step 6: Run tests**

Run:

~~~powershell
pnpm --filter @tworiver/api test -- posts.test.ts articleContentService.test.ts
pnpm --filter @tworiver/api typecheck
~~~

Expected: PASS.

- [ ] **Step 7: Commit**

~~~powershell
git add apps/api/src/repositories/postsRepository.ts apps/api/tests/posts.test.ts
git commit -m "feat(api): persist canonical article translations"
~~~

### Task 9: Integrate Canonical CRUD Errors and the Server Publish Gate

**Files:**
- Modify: apps/api/src/config.ts
- Modify: .env.example
- Modify: apps/api/src/routes/adminPostRoutes.ts
- Modify: apps/api/tests/config.test.ts
- Modify: apps/api/tests/posts.test.ts

- [ ] **Step 1: Write failing route/config tests**

Add tests for:

~~~ts
expect(loadConfig({ TIPTAP_PUBLISH_ENABLED: "true" }).TIPTAP_PUBLISH_ENABLED).toBe(true);

expect(invalidContentResponse.statusCode).toBe(400);
expect(invalidContentResponse.json()).toEqual({
  message: "Article content is invalid",
  code: "unsafe-link",
  path: ["content", 0, "marks", 0, "attrs", "href"]
});

expect(staleUpdateResponse.statusCode).toBe(409);
expect(staleUpdateResponse.json()).toEqual({ message: "Post was updated elsewhere" });

expect(disabledTiptapPublishResponse.statusCode).toBe(409);
expect(disabledTiptapPublishResponse.json()).toEqual({
  message: "TipTap publishing is not enabled"
});
~~~

- [ ] **Step 2: Run focused tests and verify RED**

Run: pnpm --filter @tworiver/api test -- config.test.ts posts.test.ts

Expected: FAIL because the config flag and error mappings are missing.

- [ ] **Step 3: Add the publish gate configuration**

Add TIPTAP_PUBLISH_ENABLED to AppConfig and parse only the literal true as enabled. Keep the property optional on hand-built test configs so unrelated test fixtures remain source-compatible:

~~~ts
export interface AppConfig {
  // existing fields
  TIPTAP_PUBLISH_ENABLED?: boolean;
}

TIPTAP_PUBLISH_ENABLED: process.env.TIPTAP_PUBLISH_ENABLED === "true"
~~~

Add TIPTAP_PUBLISH_ENABLED=false to .env.example.

- [ ] **Step 4: Map content and concurrency errors**

adminPostRoutes maps:

- ArticleContentInputError → 400 with message/code/path;
- PostUpdateConflictError → 409;
- all existing slug/taxonomy errors retain current status and messages.

Before create/update with status=published, reject the request if any translation has content.format=tiptap and config.TIPTAP_PUBLISH_ENABLED is not true.

- [ ] **Step 5: Confirm logs exclude body content**

Log only:

~~~ts
request.log.warn({
  postId: id,
  locale: error.locale,
  contentCode: error.code,
  contentPath: error.path
}, "Article content validation failed");
~~~

Do not log request.body, content JSON, Markdown, or AI text.

Emit structured save events with postId, locales, content formats, schema versions, result, and duration. Failure events use the stable error code/path; they never include title, summary, Markdown, JSON, or AI text.

- [ ] **Step 6: Run API tests**

Run:

~~~powershell
pnpm --filter @tworiver/api test -- config.test.ts posts.test.ts sharedSchemas.test.ts
pnpm --filter @tworiver/api typecheck
~~~

Expected: PASS.

- [ ] **Step 7: Commit**

~~~powershell
git add .env.example apps/api/src/config.ts apps/api/src/routes/adminPostRoutes.ts apps/api/tests/config.test.ts apps/api/tests/posts.test.ts
git commit -m "feat(api): gate and validate tiptap publishing"
~~~

### Task 10: Add Per-Locale Conversion Preview, Confirm, and Restore

**Files:**
- Modify: apps/api/src/repositories/postsRepository.ts
- Modify: apps/api/src/services/articleContentService.ts
- Modify: apps/api/src/routes/adminPostRoutes.ts
- Modify: packages/shared/src/schemas/publishing.ts
- Modify: apps/api/tests/posts.test.ts
- Modify: apps/api/tests/sharedSchemas.test.ts

- [ ] **Step 1: Add failing conversion contract tests**

Define and test:

~~~ts
export const ArticleLocaleParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
  locale: LocaleSchema
});

export const ConvertArticleContentInputSchema = z.object({
  expectedUpdatedAt: DateTimeStringSchema
});

export const MarkdownConversionPreviewSchema = z.object({
  originalMarkdown: z.string(),
  document: ArticleDocumentSchema.nullable(),
  projectedMarkdown: z.string().nullable(),
  canConvert: z.boolean(),
  blockers: z.array(ConversionIssueSchema),
  warnings: z.array(ConversionIssueSchema)
});
~~~

PostTranslationSchema gains canRestoreMarkdown: z.boolean().default(false) and restoreMarkdownSnapshotAt: DateTimeStringSchema.nullable().default(null). Never add the actual migration snapshot to an API response.

- [ ] **Step 2: Add failing route tests**

Cover:

1. Preview returns converted JSON and does not change database columns.
2. Preview of a TipTap translation returns 409.
3. Confirm re-runs conversion, stores the exact source Markdown snapshot, and changes only the selected locale.
4. Stale expectedUpdatedAt returns 409 and writes nothing.
5. Restore returns the original Markdown, clears JSON/version/snapshot, and updates content_text.
6. Restore of a new TipTap article without a snapshot returns 409.

- [ ] **Step 3: Run tests and verify RED**

Run: pnpm --filter @tworiver/api test -- sharedSchemas.test.ts posts.test.ts

Expected: FAIL because conversion contracts and routes are absent.

- [ ] **Step 4: Implement repository helpers**

Add focused operations:

~~~ts
export function getPostTranslationState(
  db: BlogDatabase,
  postId: number,
  locale: Locale
): PostTranslationStorageRow | undefined;

export function convertPostTranslationToTiptap(
  db: BlogDatabase,
  postId: number,
  locale: Locale,
  expectedUpdatedAt: string
): PostRecord;

export function restorePostTranslationMarkdown(
  db: BlogDatabase,
  postId: number,
  locale: Locale,
  expectedUpdatedAt: string
): PostRecord;
~~~

Conversion reads the current Markdown inside the transaction, calls previewMarkdownConversion again, rejects blockers, writes migration_source_markdown and migration_source_created_at only if both are currently null, writes normalized TipTap fields, and updates posts.updated_at with optimistic concurrency.

Restore copies migration_source_markdown to content_markdown, derives content_text with extractMarkdownText, sets format=markdown, clears JSON/version/snapshot/snapshot timestamp, and updates posts.updated_at in the same transaction.

- [ ] **Step 5: Add the three admin routes**

~~~text
POST /api/admin/posts/:id/translations/:locale/tiptap-preview
POST /api/admin/posts/:id/translations/:locale/convert-to-tiptap
POST /api/admin/posts/:id/translations/:locale/restore-markdown
~~~

Preview accepts no content body and reads the stored Markdown. Confirm/restore require expectedUpdatedAt. All routes remain behind existing admin session and CSRF handling.

Log preview issue counts, successful conversion schema version, restore timestamp, locale, postId, duration, and failure code. Do not log source/projected Markdown.

- [ ] **Step 6: Hydrate canRestoreMarkdown**

Map canRestoreMarkdown from migration_source_markdown !== null and restoreMarkdownSnapshotAt from migration_source_created_at in admin and public responses. This exposes capability and time, not snapshot contents.

- [ ] **Step 7: Run tests**

Run:

~~~powershell
pnpm --filter @tworiver/api test -- sharedSchemas.test.ts posts.test.ts
pnpm --filter @tworiver/api typecheck
~~~

Expected: PASS.

- [ ] **Step 8: Commit**

~~~powershell
git add packages/shared/src/schemas/publishing.ts apps/api/src/repositories/postsRepository.ts apps/api/src/services/articleContentService.ts apps/api/src/routes/adminPostRoutes.ts apps/api/tests
git commit -m "feat(api): add explicit article format conversion"
~~~

### Task 11: Make Resource Reference Checks Format-Aware

**Files:**
- Modify: apps/api/src/services/resourceReferenceService.ts
- Modify: apps/api/tests/uploads.test.ts
- Modify: apps/api/tests/uploadCleanup.test.ts

- [ ] **Step 1: Write failing TipTap resource tests**

Insert one Markdown translation and one TipTap translation where content_markdown is deliberately empty but content_json contains:

~~~json
{
  "type": "doc",
  "content": [{
    "type": "image",
    "attrs": {
      "src": "/uploads/resources/shared/reference.png",
      "alt": "reference",
      "title": null
    }
  }]
}
~~~

Assert referenceCount includes both translations, resource deletion returns 409, orphan cleanup retains the TipTap image, and the TipTap compatibility projection is not double-counted.

Add a corrupt TipTap JSON row and assert resource deletion is conservatively blocked.

- [ ] **Step 2: Run upload suites and verify RED**

Run: pnpm --filter @tworiver/api test -- uploads.test.ts uploadCleanup.test.ts

Expected: FAIL because post references only scan content_markdown.

- [ ] **Step 3: Replace the post Markdown COUNT with a format-aware scan**

Read post translation rows once:

~~~ts
interface PostContentReferenceRow {
  content_format: "markdown" | "tiptap";
  content_markdown: string;
  content_json: string | null;
  content_schema_version: number | null;
}
~~~

For Markdown rows, count one row when content_markdown contains the URL using the existing escaped substring semantics. For TipTap rows, parse/migrate/validate JSON and count one row when collectArticleResourceReferences contains the URL. Do not examine the TipTap Markdown projection.

If any TipTap row cannot be parsed or validated, return one conservative reference for every deletion query and emit a safe warning without document data.

- [ ] **Step 4: Keep other content reference sources unchanged**

Cover URLs, pages, projects, About, users, and site settings retain their existing SQL paths. countResourceReferences remains the public service API.

- [ ] **Step 5: Run upload and cleanup tests**

Run:

~~~powershell
pnpm --filter @tworiver/api test -- uploads.test.ts uploadCleanup.test.ts uploadStorage.test.ts
pnpm --filter @tworiver/api typecheck
~~~

Expected: PASS.

- [ ] **Step 6: Commit**

~~~powershell
git add apps/api/src/services/resourceReferenceService.ts apps/api/tests/uploads.test.ts apps/api/tests/uploadCleanup.test.ts
git commit -m "fix(api): protect resources referenced by tiptap"
~~~

### Task 12: Add the Public JSON Renderer Before Enabling Publish

**Files:**
- Create: packages/content-engine/src/renderArticleHtml.ts
- Create: packages/content-engine/tests/renderArticleHtml.test.ts
- Modify: packages/content-engine/src/browser.ts
- Create: apps/web/src/utils/renderArticleDocument.ts
- Create: apps/web/src/utils/renderArticleDocument.test.ts
- Modify: apps/web/src/utils/renderMarkdownDocument.ts
- Modify: apps/web/src/utils/renderMarkdownDocument.test.ts
- Modify: apps/web/src/components/MarkdownPreview.tsx
- Modify: apps/web/src/components/MarkdownPreview.test.tsx
- Modify: apps/web/src/pages/PostPage.tsx
- Modify: apps/web/src/pages/PostPage.test.tsx

- [ ] **Step 1: Write failing pure HTML mapping tests**

Test every v1 node/mark and escaping:

~~~ts
test("renders only the v1 mapping and escapes attrs/text", () => {
  const html = renderArticleHtml(documentWithAllNodes);
  expect(html).toContain('<h2 id="intro">Intro</h2>');
  expect(html).toContain('<pre><code class="language-ts">');
  expect(html).toContain('<img src="/uploads/a.png" alt="Diagram">');
  expect(html).not.toContain("<script");
});

test("throws on an unhandled node instead of dropping content", () => {
  expect(() => renderArticleHtml({
    type: "doc",
    content: [{ type: "futureNode", content: [{ type: "text", text: "Do not lose me" }] }]
  })).toThrow(/unhandled-node/);
});
~~~

- [ ] **Step 2: Run content renderer tests and verify RED**

Run: pnpm --filter @tworiver/content-engine test -- renderArticleHtml.test.ts

Expected: FAIL because renderArticleHtml is absent.

- [ ] **Step 3: Implement a browser-safe explicit mapper**

renderArticleHtml imports document types and urlPolicy only, not full ProseMirror validation, @tiptap/react, Editor, EditorView, lowlight, or articleExtensions. Its exhaustive switch and attribute checks form the browser render boundary. Implement escapeHtml, renderChildren, renderMarks, and a switch for every allowed node.

Required output:

- headings preserve attrs.id;
- code block language becomes a conservative language-* class;
- image outputs src/alt/title only;
- links output href/title and rel for external HTTP(S);
- tables use semantic table/thead-equivalent cell tags without inline styles;
- hardBreak is br and horizontalRule is hr.

Export only browser-safe types and renderArticleHtml from @tworiver/content-engine/browser.

- [ ] **Step 4: Write failing unified Web renderer tests**

~~~ts
test("renders Markdown and TipTap to one document contract", () => {
  expect(renderArticleDocument(markdownTranslation, labels).headings[0]?.text).toBe("Intro");
  expect(renderArticleDocument(tiptapTranslation, labels).headings[0]).toEqual({
    id: "intro",
    level: 2,
    text: "Intro"
  });
});

test("falls back to compatibility Markdown on JSON failure", () => {
  const rendered = renderArticleDocument(corruptTiptapTranslation, labels, {
    context: { postId: 42, slug: "fallback-post" },
    onFallback: onRenderFallback
  });
  expect(rendered.html).toContain("Fallback body");
  expect(onRenderFallback).toHaveBeenCalledWith(expect.objectContaining({
    locale: "en",
    schemaVersion: 1
  }));
});
~~~

The fallback callback receives postId, slug, locale, schemaVersion, and a stable error code. PostPage supplies that context and the default handler writes one structured console warning without content. Tests assert the event contains no html, doc, markdown, title, or summary fields.

- [ ] **Step 5: Extract shared article enhancements**

Move DOM enhancement responsibilities out of renderMarkdownDocument into renderArticleDocument:

~~~ts
export function renderArticleDocument(
  translation: Pick<PostTranslation, "locale" | "content" | "contentMarkdown">,
  labels: MarkdownLabels,
  options: {
    context?: { postId: number; slug: string };
    onFallback?: (event: ArticleRenderFallback) => void;
  } = {}
): RenderedArticleDocument;
~~~

Markdown source calls the current marked/highlight/sanitize path. TipTap calls renderArticleHtml then sanitizeMarkdownHtml. Both pass through enhanceCodeBlocks, enhanceTables, enhanceImages, and addHeadingIds. A TipTap fallback event is emitted only when both context and onFallback are supplied; PostPage always supplies both. Preview-only callers may omit context and must still receive the compatibility rendering without leaking document content into logs.

Change addHeadingIds to preserve a valid existing heading ID and only generate the current Unicode slug for missing/colliding IDs. Keep H1/H2/H3 collection behavior.

- [ ] **Step 6: Update MarkdownPreview and PostPage**

MarkdownPreview accepts one of:

~~~ts
type ArticlePreviewSource =
  | { markdown: string; translation?: never; document?: never }
  | { translation: PostTranslation; markdown?: never; document?: never }
  | { document: RenderedArticleDocument; markdown?: never; translation?: never };
~~~

PostPage memoizes renderArticleDocument(translation, labels, { context: { postId: post.id, slug: post.slug }, onFallback: logArticleRenderFallback }) and passes the same result to MarkdownPreview and ArticleTableOfContents. Existing Markdown callers remain source-compatible.

- [ ] **Step 7: Run rendering tests and build**

Run:

~~~powershell
pnpm --filter @tworiver/content-engine test -- renderArticleHtml.test.ts
pnpm --filter @tworiver/web test -- renderArticleDocument.test.ts renderMarkdownDocument.test.ts MarkdownPreview.test.tsx PostPage.test.tsx
pnpm --filter @tworiver/web typecheck
pnpm --filter @tworiver/web build
~~~

Expected: PASS; the public article behavior is green before publish is enabled.

- [ ] **Step 8: Commit**

~~~powershell
git add packages/content-engine apps/web/src/utils apps/web/src/components/MarkdownPreview* apps/web/src/pages/PostPage*
git commit -m "feat(web): render canonical article documents"
~~~

### Task 13: Build the TipTap Editor Core and Fixed Toolbar

**Files:**
- Create: apps/web/src/editor/ArticleEditor.tsx
- Create: apps/web/src/editor/ArticleEditor.test.tsx
- Create: apps/web/src/editor/ArticleEditorToolbar.tsx
- Create: apps/web/src/editor/ArticleEditorToolbar.test.tsx
- Create: apps/web/src/editor/ArticleLinkPopover.tsx
- Create: apps/web/src/editor/ArticleTableControls.tsx
- Create: apps/web/src/editor/CodeBlockLanguageSelect.tsx
- Modify: apps/web/src/styles/global.scss
- Modify: apps/web/src/styles/markdown.scss

- [ ] **Step 1: Write failing editor mount/update tests**

~~~tsx
test("loads JSON and emits updated JSON", async () => {
  const onChange = vi.fn();
  render(<ArticleEditor value={paragraphDocument("Hello")} onChange={onChange} locale="en" />);
  const editor = screen.getByRole("textbox", { name: "Article body" });
  expect(editor).toHaveTextContent("Hello");
  await userEvent.type(editor, " world");
  expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ type: "doc" }));
});

test("replaces server-normalized value without emitting a dirty update", async () => {
  const onChange = vi.fn();
  const view = render(<ArticleEditor value={paragraphDocument("A")} onChange={onChange} locale="en" />);
  view.rerender(<ArticleEditor value={paragraphDocument("B")} onChange={onChange} locale="en" />);
  expect(screen.getByRole("textbox", { name: "Article body" })).toHaveTextContent("B");
  expect(onChange).not.toHaveBeenCalled();
});

test("reports invalid content and never replaces it with an empty document", () => {
  const onContentError = vi.fn();
  render(<ArticleEditor value={invalidDocument} onChange={vi.fn()} onContentError={onContentError} locale="en" />);
  expect(onContentError).toHaveBeenCalled();
  expect(screen.queryByRole("textbox", { name: "Article body" })).not.toBeInTheDocument();
});
~~~

- [ ] **Step 2: Run editor tests and verify RED**

Run: pnpm --filter @tworiver/web test -- ArticleEditor.test.tsx

Expected: FAIL because editor components do not exist.

- [ ] **Step 3: Implement ArticleEditor**

Props:

~~~ts
export interface ArticleEditorProps {
  value: ArticleDocument;
  locale: Locale;
  disabled?: boolean;
  onChange: (document: ArticleDocument) => void;
  onContentError?: (error: Error) => void;
  uploadImage?: (file: File) => Promise<{ url: string }>;
}
~~~

Import articleExtensions from @tworiver/content-engine/editor. Use useEditor with articleExtensions, injectCSS=false, immediatelyRender=false, enableContentCheck=true, content=value, and onUpdate calling onChange(editor.getJSON() as ArticleDocument). Use a ref guard while setContent(value, { emitUpdate:false, errorOnInvalidContent:true }) synchronizes successful server results.

Render EditorContext.Provider, ArticleEditorToolbar, EditorContent, and status/error slots. The editor DOM uses role=textbox, aria-multiline=true, localized aria-label, spellCheck=true, and data-locale.

- [ ] **Step 4: Write failing toolbar command tests**

Test paragraph/H2/H3, bold/italic/strike/code, lists, quote, link, code block language, image button callback, table insertion/row/column deletion, horizontal rule, undo, and redo. Test disabled states outside a table and when editor is read-only.

- [ ] **Step 5: Implement the focused toolbar**

Use useEditorState selectors so toolbar state changes do not rerender the entire editor wrapper. Commands use editor.chain().focus() and explicit operations:

~~~ts
editor.chain().focus().toggleHeading({ level: 2 }).run();
editor.chain().focus().toggleBold().run();
editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
editor.chain().focus().setCodeBlock({ language }).run();
~~~

ArticleLinkPopover validates href with the same isAllowedLink helper before setLink. Do not add underline, color, alignment, slash menu, bubble menu, drag handle, or arbitrary style commands.

- [ ] **Step 6: Add editor styles**

Add scoped .article-rich-editor rules for:

- fixed toolbar wrapping at narrow widths;
- visible focus ring;
- ProseMirror minimum height and readable line height;
- selected nodes and table cells;
- blockquote, code block, image, horizontal rule, list, and table parity;
- disabled/read-only state;
- 320px horizontal overflow protection.

Do not change public .markdown-body appearance in this task.

- [ ] **Step 7: Run editor tests and Web checks**

Run:

~~~powershell
pnpm --filter @tworiver/web test -- ArticleEditor.test.tsx ArticleEditorToolbar.test.tsx
pnpm --filter @tworiver/web typecheck
~~~

Expected: PASS.

- [ ] **Step 8: Commit**

~~~powershell
git add apps/web/src/editor apps/web/src/styles/global.scss apps/web/src/styles/markdown.scss
git commit -m "feat(web): add tiptap article editor core"
~~~

### Task 14: Add Image Upload, File Handling, and Unsaved-State Protection

**Files:**
- Create: apps/web/src/editor/useArticleImageUpload.ts
- Create: apps/web/src/editor/useArticleImageUpload.test.ts
- Create: apps/web/src/editor/useUnsavedArticleWarning.ts
- Create: apps/web/src/editor/useUnsavedArticleWarning.test.ts
- Modify: apps/web/src/editor/ArticleEditor.tsx
- Modify: apps/web/src/editor/ArticleEditor.test.tsx
- Modify: apps/web/src/api/admin.ts
- Modify: apps/web/src/api/admin.test.ts

- [ ] **Step 1: Write failing upload API compatibility tests**

Keep the existing multipart request and assert the structured URL remains available independently of Markdown:

~~~ts
const result = await uploadAdminPostImage({ postUid, file });
expect(result).toEqual({
  url: "/uploads/images/posts/p_11111111-1111-4111-8111-111111111111/photo.png",
  markdown: "![图片](/uploads/images/posts/p_11111111-1111-4111-8111-111111111111/photo.png)"
});
~~~

No API change is required for the first TipTap image node; it consumes result.url.

- [ ] **Step 2: Write failing image hook tests**

Cover accepted MIME types, missing post UID, duplicate concurrent upload prevention, upload failure, selection restoration, and alt text:

~~~ts
test("uploads first and inserts a persistent image node only on success", async () => {
  upload.mockResolvedValue({ url: "/uploads/a.png", markdown: "![图片](/uploads/a.png)" });
  const result = await handler.insertFile(file, { position: 7, selectedText: "Diagram" });
  expect(upload).toHaveBeenCalledWith({ postUid, file });
  expect(result).toEqual({
    type: "image",
    attrs: { src: "/uploads/a.png", alt: "Diagram", title: null },
    position: 7
  });
});

test("returns an error and no node when upload fails", async () => {
  upload.mockRejectedValue(new Error("network"));
  await expect(handler.insertFile(file, selection)).rejects.toThrow("network");
  expect(insertNode).not.toHaveBeenCalled();
});
~~~

- [ ] **Step 3: Implement useArticleImageUpload**

The hook accepts postUid, upload function, localized error callback, and uploading-state callback. It allows jpeg/png/webp/gif, requires a saved post UID, replaces line breaks and closing brackets in selected alt text, and serializes uploads with an in-flight ref.

Return:

~~~ts
export interface ArticleImageUploadController {
  isUploading: boolean;
  chooseFile: (file: File, context: ImageInsertContext) => Promise<void>;
  onPasteFiles: (files: File[], editor: Editor) => void;
  onDropFiles: (files: File[], position: number, editor: Editor) => void;
}
~~~

The upload controller inserts editor.commands.insertContentAt(clampedPosition, imageNode) only after success. Uploading state is React UI state and never appears in editor.getJSON().

- [ ] **Step 4: Add FileHandler to ArticleEditor**

Append FileHandler.configure to the editor-only extensions:

~~~ts
FileHandler.configure({
  allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  onPaste(editor, files) {
    imageUpload.onPasteFiles(files, editor);
  },
  onDrop(editor, files, position) {
    imageUpload.onDropFiles(files, position, editor);
  }
})
~~~

The toolbar image button uses a hidden file input and the same controller. If the saved selection no longer exists, clamp the insert position to editor.state.doc.content.size and show a localized confirmation notice.

- [ ] **Step 5: Write and implement unsaved warning tests**

~~~ts
test("blocks beforeunload only while dirty", () => {
  const { rerender } = renderHook(({ dirty }) => useUnsavedArticleWarning(dirty), {
    initialProps: { dirty: false }
  });
  expect(dispatchBeforeUnload().defaultPrevented).toBe(false);
  rerender({ dirty: true });
  expect(dispatchBeforeUnload().defaultPrevented).toBe(true);
});
~~~

The hook registers beforeunload only while dirty and removes it on cleanup. Route-level navigation confirmation remains in AdminEditorPage because it owns save state and navigation.

- [ ] **Step 6: Run tests**

Run:

~~~powershell
pnpm --filter @tworiver/web test -- admin.test.ts useArticleImageUpload.test.ts useUnsavedArticleWarning.test.ts ArticleEditor.test.tsx
pnpm --filter @tworiver/web typecheck
~~~

Expected: PASS.

- [ ] **Step 7: Commit**

~~~powershell
git add apps/web/src/editor apps/web/src/api/admin.ts apps/web/src/api/admin.test.ts
git commit -m "feat(web): add tiptap image and draft safety"
~~~

### Task 15: Integrate TipTap Drafts into AdminEditorPage

**Files:**
- Create: apps/web/src/editor/ArticleFormatActions.tsx
- Create: apps/web/src/editor/ArticleFormatActions.test.tsx
- Create: apps/web/src/env.d.ts
- Modify: apps/web/src/pages/AdminEditorPage.tsx
- Modify: apps/web/src/pages/AdminEditorPage.test.tsx
- Modify: apps/web/src/styles/global.scss
- Modify: .env.example

- [ ] **Step 1: Write failing draft-model tests**

Add AdminEditorPage tests for:

1. Existing Markdown posts still show Markdown body and mode tabs.
2. Existing TipTap posts show Article body and no editable Markdown source.
3. The two locales can hold different formats.
4. Switching locale preserves unsaved TipTap JSON.
5. Saving sends canonical content plus expectedUpdatedAt.
6. Server-normalized JSON replaces the dirty baseline after save.
7. New rich-text entry is hidden unless VITE_TIPTAP_NEW_ARTICLE_ENABLED=true.
8. Existing TipTap content always opens even when the new-article flag is false.
9. Publish is disabled in the UI unless VITE_TIPTAP_PUBLISH_ENABLED=true.
10. Invalid stored TipTap JSON shows a readonly compatibility preview and disables every save/publish action for that locale.
11. A 409 stale update keeps the draft, shows a reload-required message, and never silently reapplies the stale response.

Core assertion:

~~~ts
expect(updateAdminPost).toHaveBeenCalledWith(postId, expect.objectContaining({
  expectedUpdatedAt: originalUpdatedAt,
  translations: expect.arrayContaining([
    expect.objectContaining({
      locale: "en",
      content: {
        format: "tiptap",
        schemaVersion: 1,
        doc: expect.objectContaining({ type: "doc" })
      }
    })
  ])
}));
~~~

- [ ] **Step 2: Run page tests and verify RED**

Run: pnpm --filter @tworiver/web test -- AdminEditorPage.test.tsx

Expected: FAIL because TranslationDraft is Markdown-only.

- [ ] **Step 3: Replace the local translation draft model**

Use:

~~~ts
interface TranslationDraft {
  title: string;
  summary: string;
  content: ArticleContent;
  contentMarkdown: string;
}

type TranslationDrafts = Record<Locale, TranslationDraft>;
~~~

EMPTY_TRANSLATIONS starts as Markdown for compatibility. Add emptyArticleDocument() for an explicit rich-text choice. buildInput submits content for every populated locale and expectedUpdatedAt for updates.

hasTranslationContent and slug generation use content.markdown for Markdown, and extractArticleProse(content.doc) for TipTap.

- [ ] **Step 4: Render by the active translation format**

Markdown branch retains all current search, source/split/preview, drag/drop, and outline behavior. TipTap branch renders:

~~~tsx
<ArticleEditor
  key={activeLocale}
  value={currentTranslation.content.doc}
  locale={activeLocale}
  uploadImage={uploadCurrentPostImage}
  onChange={(doc) => updateTranslationContent({
    format: "tiptap",
    schemaVersion: ARTICLE_DOCUMENT_SCHEMA_VERSION,
    doc
  })}
  onContentError={setEditorRecoveryError}
/>
~~~

Do not mount Markdown textarea, Markdown search, or Markdown mode tabs in the TipTap branch.

When ArticleEditor reports invalid content, render MarkdownPreview from contentMarkdown in a readonly recovery panel, show the safe error number, and mark the active locale non-savable. Switching to a healthy locale is allowed; whole-post save/publish remains blocked until every submitted locale is valid.

- [ ] **Step 5: Add new-article format choice**

ArticleFormatActions renders Use rich text and Use Markdown only when:

- there is no postId;
- both locale bodies are empty;
- VITE_TIPTAP_NEW_ARTICLE_ENABLED is true.

Choosing rich text changes only the active locale to a TipTap empty document. Choosing Markdown preserves the current behavior. After any body content is entered, format choice is locked.

- [ ] **Step 6: Add typed feature flags and publish UX**

env.d.ts declares:

~~~ts
interface ImportMetaEnv {
  readonly VITE_TIPTAP_NEW_ARTICLE_ENABLED?: string;
  readonly VITE_TIPTAP_PUBLISH_ENABLED?: string;
}
~~~

Add both flags as false in .env.example. If a TipTap translation exists and the publish flag is false, disable publish/republish with localized text. The API remains the final gate.

VITE_TIPTAP_NEW_ARTICLE_ENABLED controls both new rich-text creation and the Markdown-to-TipTap conversion entry, matching the approved rollout design. It never hides reading or restoring an existing TipTap translation.

- [ ] **Step 7: Add dirty baseline and navigation handling**

Serialize metadata plus both normalized translation drafts into one baseline string after load/save. useUnsavedArticleWarning compares current serialization with the baseline. Existing save failures preserve draft state. On save success, rebuild state and baseline from the returned post.

- [ ] **Step 8: Run tests**

Run:

~~~powershell
pnpm --filter @tworiver/web test -- AdminEditorPage.test.tsx ArticleFormatActions.test.tsx
pnpm --filter @tworiver/web typecheck
~~~

Expected: PASS; all existing Markdown editor tests remain green.

- [ ] **Step 9: Commit**

~~~powershell
git add .env.example apps/web/src/env.d.ts apps/web/src/editor/ArticleFormatActions* apps/web/src/pages/AdminEditorPage* apps/web/src/styles/global.scss
git commit -m "feat(web): integrate tiptap article drafts"
~~~

### Task 16: Add Conversion Preview and Restore UI

**Files:**
- Modify: apps/web/src/api/admin.ts
- Modify: apps/web/src/api/admin.test.ts
- Modify: apps/web/src/editor/ArticleFormatActions.tsx
- Modify: apps/web/src/editor/ArticleFormatActions.test.tsx
- Modify: apps/web/src/pages/AdminEditorPage.tsx
- Modify: apps/web/src/pages/AdminEditorPage.test.tsx
- Modify: apps/web/src/styles/global.scss

- [ ] **Step 1: Write failing API client tests**

~~~ts
await previewPostTranslationTiptap(postId, "en");
await convertPostTranslationToTiptap(postId, "en", { expectedUpdatedAt });
await restorePostTranslationMarkdown(postId, "en", { expectedUpdatedAt });

expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
  "/api/admin/posts/12/translations/en/tiptap-preview",
  "/api/admin/posts/12/translations/en/convert-to-tiptap",
  "/api/admin/posts/12/translations/en/restore-markdown"
]);
~~~

Assert all state-changing calls are POST JSON requests and include expectedUpdatedAt.

- [ ] **Step 2: Write failing conversion UI tests**

Cover:

- conversion button appears only for saved Markdown translations when VITE_TIPTAP_NEW_ARTICLE_ENABLED is true;
- dirty articles must be saved before preview;
- preview shows original Markdown, projected Markdown, warnings, and blockers;
- confirm is disabled when canConvert=false;
- successful confirm replaces the returned post state and active editor;
- restore appears only when canRestoreMarkdown=true and displays restoreMarkdownSnapshotAt;
- restore confirmation warns that TipTap edits are discarded;
- API failure leaves the current editor state untouched.

- [ ] **Step 3: Run tests and verify RED**

Run: pnpm --filter @tworiver/web test -- admin.test.ts ArticleFormatActions.test.tsx AdminEditorPage.test.tsx

Expected: FAIL because conversion client/UI operations are absent.

- [ ] **Step 4: Implement API client contracts**

~~~ts
export function previewPostTranslationTiptap(postId: number, locale: Locale) {
  return apiRequest<MarkdownConversionPreview>(
    "/api/admin/posts/" + postId + "/translations/" + locale + "/tiptap-preview",
    { method: "POST" }
  );
}
~~~

Confirm and restore return { post: PublicPost } and send expectedUpdatedAt.

- [ ] **Step 5: Extend ArticleFormatActions**

For a saved Markdown translation, open a modal with two readonly pre elements, structured warning/blocker lists, Cancel, and Convert actions. For a converted TipTap translation with canRestoreMarkdown, show Restore original Markdown; require a second confirmation displaying restoreMarkdownSnapshotAt. The request still sends the current post.updatedAt as expectedUpdatedAt for concurrency.

The modal has role=dialog, aria-modal=true, a localized accessible name, Escape close, focus return, and body scroll lock.

- [ ] **Step 6: Synchronize returned post state**

AdminEditorPage passes a single applyServerPost(post) function to save, convert, and restore flows. This function updates metadata/translations, clears stale warnings, changes the active body renderer by content.format, and resets the dirty baseline.

- [ ] **Step 7: Run tests**

Run:

~~~powershell
pnpm --filter @tworiver/web test -- admin.test.ts ArticleFormatActions.test.tsx AdminEditorPage.test.tsx
pnpm --filter @tworiver/web typecheck
~~~

Expected: PASS.

- [ ] **Step 8: Commit**

~~~powershell
git add apps/web/src/api/admin* apps/web/src/editor/ArticleFormatActions* apps/web/src/pages/AdminEditorPage* apps/web/src/styles/global.scss
git commit -m "feat(web): add article format migration controls"
~~~

### Task 17: Preserve TipTap Topology During AI Translation

**Files:**
- Create: packages/content-engine/src/translationSegments.ts
- Create: packages/content-engine/tests/translationSegments.test.ts
- Modify: packages/content-engine/src/index.ts
- Modify: apps/api/src/services/ai/translationDraftService.ts
- Modify: apps/api/src/routes/adminPostRoutes.ts
- Modify: apps/api/tests/posts.test.ts
- Modify: apps/web/src/api/admin.ts
- Modify: apps/web/src/pages/AdminEditorPage.tsx
- Modify: apps/web/src/pages/AdminEditorPage.test.tsx

- [ ] **Step 1: Write failing segment topology tests**

~~~ts
test("groups marked text segments by block and excludes code", () => {
  expect(buildArticleTranslationBlocks(sourceDocument)).toEqual([
    {
      blockId: "0",
      segments: [
        { id: "0.0", kind: "text", text: "Hello " },
        { id: "0.1", kind: "text", text: "world" }
      ]
    },
    {
      blockId: "2",
      segments: [{ id: "2.attrs.alt", kind: "image-alt", text: "Diagram" }]
    }
  ]);
});

test("applies text only and preserves structure, marks, URLs, code, and heading IDs", () => {
  const translated = applyArticleTranslationBlocks(sourceDocument, translatedBlocks);
  expect(stripText(translated)).toEqual(stripText(sourceDocument));
  expect(readTexts(translated)).toEqual(["你好", "世界", "图示"]);
});

test("rejects missing, duplicate, or unknown segment IDs", () => {
  expect(() => applyArticleTranslationBlocks(sourceDocument, invalidBlocks)).toThrow(/translation-topology-mismatch/);
});
~~~

- [ ] **Step 2: Run content tests and verify RED**

Run: pnpm --filter @tworiver/content-engine test -- translationSegments.test.ts

Expected: FAIL because translation segment functions do not exist.

- [ ] **Step 3: Implement stable translation segments**

Walk the document by numeric path. For each non-code block, group text nodes so the model receives context across marks while each segment keeps its exact path. Add image alt/title as attr segments. Do not emit link href/title, codeBlock text, heading ID, language, or node type.

applyArticleTranslationBlocks requires exactly the original segment ID set, preserves every non-text field, replaces only text/alt/title values, then runs normalizeArticleDocument and validateArticleDocument.

On topology mismatch, the API emits one structured warning with postId, sourceLocale, targetLocale, provider, stable code, expectedSegmentCount, and receivedSegmentCount. It must not log prompts, model output, titles, summaries, segment text, Markdown, or JSON.

- [ ] **Step 4: Write failing API translation tests**

Mock the AI provider returning:

~~~json
{
  "title": "中文标题",
  "summary": "中文摘要",
  "blocks": [{
    "blockId": "0",
    "segments": [
      { "id": "0.0", "text": "你好 " },
      { "id": "0.1", "text": "世界" }
    ]
  }]
}
~~~

Assert response content.format=tiptap, marks/URL/code/heading ID match source, compatibility Markdown is generated, no database post is written, and topology mismatch returns 502 with the target draft unchanged.

- [ ] **Step 5: Extend the AI route**

TranslateDraftInputSchema accepts source.content in addition to the legacy contentMarkdown branch. Markdown continues through the current prompt. TipTap:

1. validates source JSON;
2. builds blocks;
3. asks for JSON with title, summary, blocks and no other fields;
4. applies the response to a source clone;
5. calls prepareArticleContent;
6. returns a complete PostTranslation-compatible draft.

The system prompt explicitly says segment IDs and block IDs must remain unchanged and code/URLs are not included.

- [ ] **Step 6: Enable the TipTap translation button**

AdminEditorPage sends the active translation content. Existing confirmation before overwriting a non-empty target remains. A successful TipTap translation writes the returned TipTap document into the target local draft, preserves the active source draft, switches active locale, and does not save automatically.

- [ ] **Step 7: Run tests**

Run:

~~~powershell
pnpm --filter @tworiver/content-engine test -- translationSegments.test.ts
pnpm --filter @tworiver/api test -- posts.test.ts
pnpm --filter @tworiver/web test -- AdminEditorPage.test.tsx
pnpm --filter @tworiver/api typecheck
pnpm --filter @tworiver/web typecheck
~~~

Expected: PASS.

- [ ] **Step 8: Commit**

~~~powershell
git add packages/content-engine apps/api/src/services/ai/translationDraftService.ts apps/api/src/routes/adminPostRoutes.ts apps/api/tests/posts.test.ts apps/web/src/api/admin.ts apps/web/src/pages/AdminEditorPage*
git commit -m "feat: preserve article structure in ai translation"
~~~

### Task 18: Run Browser Migration Scenarios and Finish Rollout Documentation

**Files:**
- Create: tests/e2e/tiptap-editor.spec.ts
- Modify: tests/e2e/global-setup.ts
- Modify: tests/e2e/publishing.spec.ts
- Modify: apps/web/vite.config.ts
- Modify: README.md
- Modify: .env.example
- Modify: docs/superpowers/specs/2026-06-30-tiptap-article-editor-design.md

- [ ] **Step 1: Enable TipTap only in the E2E environment**

Before API/Vite startup in global-setup.ts:

~~~ts
process.env.TIPTAP_PUBLISH_ENABLED = "true";
process.env.VITE_TIPTAP_NEW_ARTICLE_ENABLED = "true";
process.env.VITE_TIPTAP_PUBLISH_ENABLED = "true";
~~~

Production defaults in .env.example remain false.

- [ ] **Step 2: Write the failing new-draft E2E**

The browser test:

1. logs in;
2. opens /admin/posts/new;
3. chooses Use rich text;
4. enters title and paragraph;
5. applies H2, bold, link, code block language, and a 2x2 table;
6. saves once to get postUid;
7. pastes or selects a real PNG and verifies an image node;
8. publishes;
9. opens the public URL;
10. verifies heading/TOC, formatted text, code copy, table, image, and image lightbox;
11. reloads the admin editor and verifies JSON restoration.

Use accessible roles rather than ProseMirror internals:

~~~ts
const body = page.getByRole("textbox", { name: "Article body" });
await body.fill("Intro");
await page.getByRole("button", { name: "Heading 2" }).click();
await expect(body.locator("h2")).toContainText("Intro");
~~~

- [ ] **Step 3: Write conversion and bilingual E2E scenarios**

Create a legacy bilingual Markdown post through the current UI. Convert only English, assert Chinese remains Markdown, edit/publish English TipTap, then restore English and verify the exact original Markdown reappears. Also verify unsaved English TipTap changes survive switching to Chinese and back.

- [ ] **Step 4: Keep the legacy publishing E2E explicit**

publishing.spec.ts continues to create Markdown via Markdown body and proves the feature flag does not force existing/new explicitly Markdown content through TipTap.

- [ ] **Step 5: Add an editor-only manual chunk**

Extend Vite manualChunks:

~~~ts
"tiptap-editor": [
  "@tiptap/react",
  "@tiptap/extension-file-handler",
  "@tiptap/core",
  "@tiptap/starter-kit",
  "@tiptap/extension-image",
  "@tiptap/extension-table",
  "@tiptap/extension-code-block-lowlight",
  "@tiptap/extension-unique-id"
]
~~~

The public renderer imports @tworiver/content-engine/browser only. It must not import @tworiver/content-engine/editor or the package root.

- [ ] **Step 6: Run focused E2E and verify GREEN**

Run:

~~~powershell
pnpm test:e2e -- --project=chromium tests/e2e/tiptap-editor.spec.ts
pnpm test:e2e -- --project=chromium tests/e2e/publishing.spec.ts
pnpm test:e2e -- --project=mobile-chrome tests/e2e/tiptap-editor.spec.ts
~~~

Expected: PASS.

- [ ] **Step 7: Run the complete verification matrix**

Run:

~~~powershell
pnpm check:encoding
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
~~~

Expected: every command PASS. Record the exact command outputs in the implementation handoff.

- [ ] **Step 8: Verify chunk isolation**

After pnpm --filter @tworiver/web build, inspect apps/web/dist/assets:

- the TipTap editor chunk is async from AdminEditorPage;
- index/public entry chunks do not import tiptap-editor;
- public rendering works with JavaScript loaded from the normal article/public chunks;
- no duplicate @tiptap/core versions exist in pnpm why output.

If the public entry imports tiptap-editor, stop and move the offending import to @tworiver/content-engine/browser before release.

- [ ] **Step 9: Document operations and mark the design implemented**

README.md documents:

- TIPTAP_PUBLISH_ENABLED;
- VITE_TIPTAP_NEW_ARTICLE_ENABLED;
- VITE_TIPTAP_PUBLISH_ENABLED;
- safe order: migrate API → deploy renderer → enable opt-in drafts → enable publish → enable conversion → make TipTap default;
- database/uploads backup before converting published articles;
- rollback rule: keep editing disabled on old code or accept Markdown projection downgrade.

Change the approved design status from 已批准，待实施 to 已实现 only after all checks pass. During execution use 实施中.

- [ ] **Step 10: Final commit**

~~~powershell
git add tests/e2e apps/web/vite.config.ts README.md .env.example docs/superpowers/specs/2026-06-30-tiptap-article-editor-design.md
git commit -m "test: verify tiptap article rollout"
~~~

## Specification Coverage Matrix

| Approved design area | Implementation tasks | Release proof |
| --- | --- | --- |
| Canonical dual-format model and v1 schema | 1-5 | Content-engine and shared-schema tests |
| Additive storage, invariants, and compatibility hydration | 6-9 | Fresh/legacy/idempotent migration and CRUD tests |
| Per-locale conversion, snapshot, timestamp, restore | 10, 16 | API, UI, bilingual conversion E2E |
| Resource lifecycle | 3, 11, 14 | Resource scan, upload, orphan-cleanup tests |
| Public JSON rendering and emergency fallback | 12 | Mapper, unified renderer, PostPage, build tests |
| Editor UX, toolbar, draft preservation, recovery | 13-16 | Component tests and new-draft E2E |
| AI topology preservation | 3, 17 | Segment and API translation tests |
| Feature flags, chunk isolation, rollout and rollback | 9, 12, 15, 18 | Full verification matrix and bundle inspection |

## Final Acceptance Checklist

- [ ] Legacy Markdown create/edit/publish/render remains green.
- [ ] TipTap JSON is the only editable authority for TipTap translations.
- [ ] Markdown compatibility projection is generated server-side and never directly edited.
- [ ] English and Chinese translations can use different formats.
- [ ] TipTap publishing cannot be enabled before the public JSON renderer.
- [ ] Conversion is previewed, optimistic-concurrency checked, per-locale, and snapshot-backed.
- [ ] Restore returns the original Markdown snapshot and clears TipTap authority.
- [ ] Resource deletion and orphan cleanup inspect TipTap image nodes without double-counting the projection.
- [ ] Public rendering preserves TOC, code copy, table wrapping, image lightbox, themes, and localization.
- [ ] The public entry does not load the TipTap React editor runtime.
- [ ] AI translation changes only identified text/alt/title segments and preserves topology.
- [ ] Invalid, oversized, over-deep, or unsafe documents fail without losing the local editor draft.
- [ ] Content engine, API, Web, build, encoding, and Playwright checks all pass.
