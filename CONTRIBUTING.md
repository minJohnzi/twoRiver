# Contributing

Thanks for helping improve TwoRiver Blog.

## Project Layout

```text
.
|-- apps/
|   |-- api/          # Fastify API, SQLite schema, repositories, routes, tests
|   `-- web/          # React/Vite frontend
|-- packages/
|   `-- shared/       # Shared Zod schemas and TypeScript types
|-- scripts/          # Deployment, diagnostics, and maintenance scripts
|-- tests/
|   `-- e2e/          # Playwright end-to-end tests
|-- docs/             # Deployment, operations, and QA documentation
|-- .github/          # GitHub Actions workflows and repository automation
|-- .env.example      # Local environment template
`-- package.json      # Workspace scripts
```

## Local Setup

```bash
pnpm install
cp .env.example .env
pnpm api:migrate
pnpm api:seed-admin
pnpm dev
```

## Verification

Run these before opening a pull request:

```bash
pnpm check:encoding
pnpm typecheck
pnpm test
pnpm build
```

Use `pnpm test:e2e` when changing authentication, publishing, routing, or deployment-sensitive flows.

On Windows PowerShell, if the `pnpm.ps1` shim is blocked by execution policy, use the `.cmd` shim:

```powershell
C:\nvm4w\nodejs\pnpm.cmd test
```

## What Not To Commit

Do not commit local secrets, runtime databases, uploads, dependency folders, build outputs, test reports, or agent working notes. These are covered by `.gitignore`.
