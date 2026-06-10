# TwoRiver Blog

TwoRiver Blog is a minimal bilingual technical blog. It pairs a React/Vite frontend with a Fastify API, SQLite persistence, and a single-admin publishing workflow.

## Features

- Bilingual post content in Chinese and English
- Public blog pages with post lists, individual post pages, tags, markdown rendering, and syntax highlighting
- Admin login protected by an HTTP-only session cookie
- Admin post editor with draft/published status, tag assignment, and markdown preview
- Admin image uploads for post Markdown, stored under the database data directory
- Shared Zod schemas for frontend/API type safety
- SQLite migrations and admin seeding scripts
- Optional DeepSeek-compatible AI service helpers for summary, tag, and translation drafting

## Tech Stack

- **Package manager:** pnpm workspace
- **Frontend:** React 19, React Router, Vite, marked, highlight.js
- **API:** Fastify, better-sqlite3, argon2, Zod
- **Shared package:** TypeScript schemas and inferred types
- **Testing:** Vitest, Testing Library, jsdom

## Repository Layout

```text
.
|-- apps/
|   |-- api/          # Fastify API, SQLite schema, repositories, routes, tests
|   `-- web/          # React/Vite frontend
|-- packages/
|   `-- shared/       # Shared Zod schemas and TypeScript types
|-- docs/
|   |-- deployment/   # Current Ubuntu deployment and operations notes
|   |-- superpowers/  # Historical design and implementation planning records
|   `-- checklist.md  # Manual QA checklist
|-- scripts/          # Server deployment and update scripts
|-- .env.example
|-- package.json
`-- pnpm-workspace.yaml
```

## Requirements

- Node.js 22 or newer is recommended
- pnpm 9.15.4, matching the `packageManager` field in `package.json`

## Getting Started

Install dependencies:

```bash
pnpm install
```

Create a local environment file:

```bash
cp .env.example .env
```

Edit `.env` before first run. For local development, the defaults are usable except that `SESSION_SECRET` must be at least 32 characters and `ADMIN_PASSWORD` must be at least 12 characters.

Run the database migration and seed the first admin user:

```bash
pnpm api:migrate
pnpm api:seed-admin
```

Start both the API and frontend:

```bash
pnpm dev
```

By default:

- API: `http://localhost:4000`
- Web app: Vite will print the local frontend URL, usually `http://localhost:5173`
- Admin login: `/admin/login`

## Environment Variables

| Name | Purpose | Default/example |
| --- | --- | --- |
| `NODE_ENV` | Runtime mode: `development`, `test`, or `production` | `development` |
| `PORT` | Fastify API port | `4000` |
| `DATABASE_PATH` | SQLite database file path | `./apps/api/data/blog.sqlite` |
| `SESSION_SECRET` | Session signing secret; use a long random value | `replace-with-at-least-32-random-characters` |
| `ADMIN_USERNAME` | Seeded admin username | `admin` |
| `ADMIN_PASSWORD` | Seeded admin password; must be at least 12 characters | `change-me-before-deploy` |
| `CORS_ALLOWED_ORIGINS` | Comma-separated trusted browser origins in production | `https://example.me,https://www.example.me` |
| `DEEPSEEK_API_KEY` | Optional API key for AI helper services | empty |
| `DEEPSEEK_BASE_URL` | DeepSeek-compatible API base URL | `https://api.deepseek.com` |
| `VITE_API_BASE_URL` | Frontend API base URL | `http://localhost:4000` |

Production startup rejects the default `SESSION_SECRET` and `ADMIN_PASSWORD`, so replace both before deploying. Production also requires `CORS_ALLOWED_ORIGINS`.

For same-origin production deployment through Nginx, do not set `VITE_API_BASE_URL`; the frontend should call `/api/...` on the same domain.

Uploaded images are stored under `<database-dir>/uploads/`, where `<database-dir>` is the directory containing `DATABASE_PATH`. Back up both the SQLite database and the `uploads/` directory.

## Common Commands

```bash
pnpm dev              # Run API and web app in development mode
pnpm build            # Build all workspace packages
pnpm typecheck        # Type-check all workspace packages
pnpm test             # Run all tests
pnpm test:e2e         # Run Playwright end-to-end tests
pnpm lint             # Run the lint/type-check script in each package
pnpm api:migrate      # Apply SQLite schema migrations
pnpm api:seed-admin   # Create or update the configured admin user
```

Package-scoped commands are also available:

```bash
pnpm --filter @tworiver/api test
pnpm --filter @tworiver/web test
pnpm --filter @tworiver/api build
pnpm --filter @tworiver/web build
```

## Deployment Scripts

Interactive first-time setup on an Ubuntu server:

```bash
bash scripts/deploy-setup.sh
```

Reusable update flow after new commits are available:

```bash
bash scripts/deploy-update.sh
```

The update script skips deployment when `git pull` does not change the current commit. Use `--force` to rebuild and restart anyway:

```bash
bash scripts/deploy-update.sh --force
```

Before running the scripts on a server, syntax-check them:

```bash
bash -n scripts/deploy-setup.sh
bash -n scripts/deploy-update.sh
```

## API Overview

Public endpoints:

- `GET /api/health`
- `GET /api/posts`
- `GET /api/posts/:slug`
- `GET /api/tags`
- `GET /api/tags/:slug`
- `GET /api/categories`
- `GET /api/categories/:slug`
- `GET /api/about`

Authentication:

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`

Admin endpoints require a valid session cookie:

- `GET /api/admin/posts`
- `POST /api/admin/posts`
- `GET /api/admin/posts/:id`
- `PUT /api/admin/posts/:id`
- `DELETE /api/admin/posts/:id`
- `POST /api/admin/uploads/images`
- `GET /api/admin/categories`
- `POST /api/admin/categories`
- `PUT /api/admin/categories/:id`
- `DELETE /api/admin/categories/:id`
- `GET /api/admin/tags`
- `POST /api/admin/tags`
- `PUT /api/admin/tags/:id`
- `DELETE /api/admin/tags/:id`
- `GET /api/admin/about`
- `PUT /api/admin/about`

## Content Model

Posts have:

- A URL-safe `slug`
- A `draft` or `published` status
- An optional `publishedAt` timestamp
- Zero or more tags
- One or more translations in `zh` and/or `en`

Each translation stores a title, summary, markdown body, and optional SEO metadata.

## Deployment

See [docs/deployment/ubuntu.md](docs/deployment/ubuntu.md) for an Ubuntu deployment flow using:

- Nginx for the static frontend
- systemd for the Fastify API
- an interactive first-time setup script and a reusable update script
- GoDaddy DNS pointing at an Aliyun ECS public IP
- free HTTPS certificates from Let's Encrypt
- SQLite stored under the deployed project directory
