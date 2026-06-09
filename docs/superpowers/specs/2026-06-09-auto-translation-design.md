# Editor-Triggered Auto Translation Design

Date: 2026-06-09

## Goal

Add a controlled auto-translation workflow to the TwoRiver admin editor so the administrator can write one language version of a post and generate the other language as an editable draft.

The first release should be explicit, reviewable, and low risk. Translation is triggered by an editor button, returns draft content to the form, and never writes directly to the database. The administrator reviews and saves the result through the existing post save or publish actions.

## Confirmed Choices

- Trigger: editor button, not automatic save-time or publish-time translation.
- Persistence: API returns a draft translation only; it does not update posts.
- Overwrite behavior: if the target language already has content, the frontend asks for confirmation before replacing all target fields.
- Translation engine: `ztrans` is integrated as an independent API dependency.
- Glossary: first release includes a small default glossary in the API layer.
- Scope: post translation only; no batch jobs, queue, public translation, or glossary management UI.

## Current Context

TwoRiver already stores bilingual post content in `post_translations` with `zh` and `en` locales. The admin editor has language tabs and editable fields for both languages, but both versions are currently filled manually.

The API has a minimal `draftTranslation` helper that only translates Markdown body text. The `ztrans` project provides a richer `translatePostTranslation` adapter for TwoRiver-shaped post translation objects. It translates title, summary, Markdown body, and optional SEO fields while preserving Markdown structure and returning validation warnings.

## User Workflow

In the article editor, the administrator selects the source language tab and fills in the title, summary, and Markdown body. They click a translation button near the language tabs:

- From Chinese: `Translate to EN`.
- From English: `Translate to Chinese`.

If the target language fields are empty, the editor calls the translation API immediately. If any target title, summary, Markdown body, or SEO field already has content, the editor asks for confirmation before calling the API. Canceling the confirmation leaves the form unchanged and does not call the API.

When translation succeeds, the frontend writes the returned translation into the target language fields and switches the active tab to the target language. The administrator can edit the generated draft and then save or publish through the existing buttons.

## API Design

Add an authenticated, CSRF-protected admin route:

```text
POST /api/admin/posts/translate-draft
```

Request body:

```ts
{
  source: {
    locale: "zh" | "en";
    title: string;
    summary: string;
    contentMarkdown: string;
    seoTitle?: string | null;
    seoDescription?: string | null;
  };
  targetLocale: "zh" | "en";
}
```

Response body:

```ts
{
  translation: {
    locale: "zh" | "en";
    title: string;
    summary: string;
    contentMarkdown: string;
    seoTitle: string | null;
    seoDescription: string | null;
  };
  warnings: string[];
  chunks: Array<{
    index: number;
    inputChars: number;
    outputChars: number;
    warnings: string[];
  }>;
}
```

Validation rules:

- `source.locale` and `targetLocale` must be different.
- The source title or Markdown body must contain non-whitespace content.
- Locale values are limited to `zh` and `en`.
- The endpoint never receives or writes a `postId`.

## Translation Service

Add an API service boundary around `ztrans.translatePostTranslation`. The route should not call `ztrans` directly; it should call a local service that maps TwoRiver config, default glossary, and error handling into a stable application contract.

The service passes the source translation object, target locale, provider config, and default glossary to `translatePostTranslation`.

Provider configuration uses existing DeepSeek-compatible variables:

```text
DEEPSEEK_API_KEY
DEEPSEEK_BASE_URL
```

Add `DEEPSEEK_MODEL` with a default of `deepseek-chat` so the provider config is explicit for `ztrans`.

The existing simple `draftTranslation` helper can remain for now, but the editor auto-translation workflow should use the new `ztrans`-backed service.

## Default Glossary

The first release keeps glossary data in code. It is intentionally small and focused on stable technical terms:

```ts
[
  { source: "TwoRiver", target: "TwoRiver", note: "Project name; do not translate." },
  { source: "Fastify", target: "Fastify" },
  { source: "SQLite", target: "SQLite" },
  { source: "Markdown", target: "Markdown" },
  { source: "DeepSeek", target: "DeepSeek" },
  { source: "TypeScript", target: "TypeScript" },
  { source: "React", target: "React" },
  { source: "Vite", target: "Vite" }
]
```

Future releases can move the glossary to a config file or admin-managed database table. That is out of scope for the first release.

## Frontend Design

Add a translation action to `AdminEditorPage` near the writing language tabs. The action uses the active language as the source and the other language as the target.

Frontend state additions:

- Translation loading state to disable duplicate clicks.
- Translation error message shown in the writing card.
- Translation warnings shown after a successful response when present.

On success:

- Replace the target language fields with the API response.
- Switch the active editor language to the target locale.
- Show any warnings as a non-blocking review prompt.

On failure:

- Keep all existing form fields unchanged.
- Show a concise error in the editor.

## Error Handling

The route should return stable errors that the frontend can display clearly:

- `400` for invalid input, same source and target locale, or empty source content.
- `401` or `403` through existing admin auth and CSRF behavior.
- `503` when the AI provider is not configured.
- `502` when the provider request fails.
- `500` for unexpected server errors.

`ztrans` warnings are not fatal. They should be returned with the draft translation so the administrator can inspect the generated Markdown before saving.

## Testing And Verification

API tests:

- Successful Chinese to English draft translation.
- Successful English to Chinese draft translation.
- Same source and target locale returns `400`.
- Empty source content returns `400`.
- Missing provider key returns `503`.
- `ztrans` warnings are included in the response.

Frontend tests:

- Clicking the translation button calls the API and fills the target language fields.
- Existing target content triggers confirmation.
- Canceling confirmation does not call the API.
- Translation failure leaves the form unchanged.
- Warnings are displayed after successful translation.

Project verification:

- `pnpm --filter @tworiver/api test`.
- `pnpm --filter @tworiver/web test`.
- `pnpm --filter @tworiver/api typecheck`.
- `pnpm --filter @tworiver/web typecheck`.

## Out Of Scope

- Automatic translation during save or publish.
- Direct database writes from the translation endpoint.
- Batch translation for multiple posts.
- Background queue or polling.
- Admin glossary management UI.
- Public visitor-triggered translation.
- Translation memory or diff-based partial retranslation.

## Acceptance Criteria

- The administrator can generate an English draft from Chinese post content in the editor.
- The administrator can generate a Chinese draft from English post content in the editor.
- Existing target language content is never overwritten without confirmation.
- Generated translations are editable before saving.
- The translation endpoint does not create or update database records.
- Provider configuration errors and provider failures are visible to the administrator.
- Markdown structure warnings from `ztrans` are surfaced without blocking draft insertion.
