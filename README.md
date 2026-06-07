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
