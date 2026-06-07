# Minimal Bilingual Tech Blog Design

Date: 2026-06-07

## Goal

Build a personal minimalist technical blog that supports Chinese and English content, a private single-admin publishing backend, Markdown editing with live preview, and deployment to an Ubuntu server.

The first release should be stable, easy to operate, and intentionally small. It should cover publishing and reading technical articles well, while leaving a clean extension point for future AI features such as DeepSeek-powered summaries, tag suggestions, and translation drafts.

## Confirmed Choices

- Frontend: React, Vite, TypeScript.
- Backend: Node.js, Fastify, TypeScript.
- Database: SQLite.
- Repository shape: single full-stack monorepo.
- Admin model: one administrator using username and password.
- Editor: Markdown with live preview.
- Deployment: Ubuntu, Nginx, systemd, SQLite file storage.

## Repository Structure

```text
apps/
  web/
    React + Vite application for the public blog and admin UI.
  api/
    Fastify API server, SQLite access, authentication, and admin endpoints.
packages/
  shared/
    Shared TypeScript types used by the frontend and backend.
docs/
  superpowers/specs/
    Design and implementation planning documents.
```

The monorepo keeps frontend and backend code together without turning the project into a large platform. Shared request and response types can live in `packages/shared` once both apps need them.

## Public Blog

The public site is a minimal technical blog with bilingual reading support.

Required pages:

- Home page with published article list, language switcher, and tag filtering.
- Article detail page addressed by slug, with Chinese and English content switching when both translations exist.
- About page with a short personal profile, technical focus, and contact links.
- Admin entry route that leads to the login screen when unauthenticated.

Public article rendering uses Markdown content stored in SQLite. The renderer must support headings, links, lists, tables, inline code, fenced code blocks, and readable technical typography.

The public UI should be quiet and content-focused: restrained navigation, strong readability, no heavy decorative layout, and responsive behavior for mobile and desktop.

## Admin Backend UI

The admin UI is private and optimized for one owner.

Required admin screens:

- Login page with username and password.
- Article list with filters for draft/published status, tags, and translation completeness.
- Article editor with fields for common post metadata and per-language content.

Article editor fields:

- Slug.
- Status: draft or published.
- Tags.
- Published date.
- Chinese title, summary, and Markdown body.
- English title, summary, and Markdown body.
- Live Markdown preview for the active language.

Editor actions:

- Save draft.
- Publish.
- Unpublish by changing status back to draft.
- Edit existing article.

The first release does not need multi-user roles, rich media asset management, comments, analytics, newsletters, or a full CMS workflow.

## Data Model

The core SQLite schema should be normalized around posts and translations.

```text
users
  id
  username
  password_hash
  created_at
  updated_at

posts
  id
  slug
  status
  published_at
  created_at
  updated_at

post_translations
  id
  post_id
  locale
  title
  summary
  content_markdown
  seo_title
  seo_description
  created_at
  updated_at

tags
  id
  slug
  name
  created_at
  updated_at

post_tags
  post_id
  tag_id
```

`posts` stores shared publishing state. `post_translations` stores localized content for `zh` and `en`. This avoids duplicating publication state while keeping each language independently editable.

## API Design

Public endpoints:

```text
GET /api/posts
GET /api/posts/:slug
GET /api/tags
```

Admin endpoints:

```text
POST /api/auth/login
POST /api/auth/logout
GET /api/auth/me

GET /api/admin/posts
POST /api/admin/posts
GET /api/admin/posts/:id
PUT /api/admin/posts/:id
DELETE /api/admin/posts/:id

GET /api/admin/tags
POST /api/admin/tags
PUT /api/admin/tags/:id
DELETE /api/admin/tags/:id
```

AI extension endpoints can be added later without changing article CRUD:

```text
POST /api/admin/ai/summary
POST /api/admin/ai/tags
POST /api/admin/ai/translate
POST /api/admin/ai/seo
```

## Authentication

Admin authentication uses username and password with secure password hashing. The server creates an authenticated session and sends it through an HttpOnly cookie.

Authentication rules:

- Admin endpoints require a valid session.
- Session cookies are HttpOnly.
- Passwords are never stored in plain text.
- First admin account creation should be handled by an explicit setup script or seed command, not by a public registration page.

## AI Extension Point

DeepSeek API support is not part of the first publishing release, but the backend should reserve a clean service boundary for it.

Planned module boundary:

```text
apps/api/src/services/ai/
  aiClient.ts
  summaryService.ts
  tagSuggestionService.ts
  translationDraftService.ts
```

The article editor can later call admin-only AI endpoints to generate summaries, suggest tags, draft translations, or generate SEO descriptions. AI-generated content should return to the editor for administrator review before being saved or published.

## Deployment

Ubuntu deployment uses Nginx for static frontend hosting and reverse proxying to the API.

```text
Nginx
  /       -> apps/web/dist
  /api    -> Fastify API service

systemd
  tworiver-blog-api.service -> Node.js Fastify server

SQLite
  /var/lib/tworiver-blog/blog.sqlite
```

The backend should read configuration from environment variables:

```text
NODE_ENV
PORT
DATABASE_PATH
SESSION_SECRET
ADMIN_USERNAME
ADMIN_PASSWORD
DEEPSEEK_API_KEY
DEEPSEEK_BASE_URL
```

`DEEPSEEK_*` variables are optional until AI features are implemented.

## Testing And Verification

Initial verification should include:

- TypeScript checks for frontend and backend.
- Backend tests for authentication, public post reading, and admin post CRUD.
- Frontend smoke checks for public pages and admin editor behavior.
- Browser verification for desktop and mobile layout.
- Ubuntu deployment documentation with concrete Nginx and systemd examples.

## Out Of Scope For First Release

- Multi-author accounts.
- Role-based permissions.
- Public comments.
- Newsletter subscriptions.
- Search indexing beyond simple local filtering.
- Full media library.
- AI content generation implementation.
- Server-side rendering.
- PostgreSQL or MySQL support.

## Acceptance Criteria

- A visitor can browse published posts, filter by tag, and read Chinese or English versions.
- The administrator can log in, create a draft, edit Chinese and English Markdown content with live preview, publish it, and later update it.
- Draft posts are not visible on the public site.
- Admin APIs are inaccessible without authentication.
- The application can be built and deployed to Ubuntu with Nginx, systemd, and SQLite.
- The architecture leaves a clear path to add DeepSeek API features later without rewriting article storage or admin publishing flows.
