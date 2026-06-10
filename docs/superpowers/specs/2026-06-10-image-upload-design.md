# Image Upload Design

Date: 2026-06-10

## Goal

Add first-release image upload support to the admin post editor so the author can insert screenshots and article images into Markdown without relying on external image hosting.

The feature should be small, predictable, and easy to deploy. Images are stored on local disk beside the SQLite database, grouped by stable post UID, and inserted into the editor as Markdown image links.

## Confirmed Choices

- Scope: images only.
- Supported formats: `jpg`, `jpeg`, `png`, `webp`, and `gif`.
- Explicitly unsupported: `svg`, PDFs, archives, documents, executables, and generic binary attachments.
- Storage: local disk, following the database directory by default.
- Image processing: original file is preserved; no compression, resizing, or format conversion.
- Max file size: 10 MB per image.
- Editor entry points: button upload, drag-and-drop upload, and paste upload.
- Post resource grouping: images are stored under a stable post UID folder, not under slug.
- Article deletion: best-effort cleanup of that post UID image folder; cleanup failure is logged but does not block article deletion.

## Data Model

Add a stable UID to `posts`:

```sql
uid TEXT NOT NULL UNIQUE
```

The UID is generated when a post is created:

```text
p_<uuid>
```

Example:

```text
p_f47ac10b-58cc-4372-a567-0e02b2c3d479
```

The UID is immutable. Changing a post slug does not change image URLs or image directories.

Existing posts need a migration path that assigns a UID to every row missing one. The implementation can do this during migration by generating `p_<uuid>` values for existing rows before enforcing uniqueness and non-null behavior.

## Storage Layout

Uploads live beside the database by default. If:

```text
DATABASE_PATH=/var/lib/tworiver-blog/blog.sqlite
```

then uploaded post images are stored under:

```text
/var/lib/tworiver-blog/uploads/images/posts/<post_uid>/<image_uid>.<ext>
```

In local development, this defaults to:

```text
apps/api/data/uploads/images/posts/<post_uid>/<image_uid>.<ext>
```

Public URLs use:

```text
/uploads/images/posts/<post_uid>/<image_uid>.<ext>
```

The upload root should be derived from `dirname(DATABASE_PATH)` by default. A future `UPLOADS_DIR` override can be added later if deployment needs more flexibility, but it is not required for the first release.

## API Design

Add an authenticated, CSRF-protected admin endpoint:

```text
POST /api/admin/uploads/images
```

Request:

```text
multipart/form-data
postUid=<post_uid>
file=<image file>
```

Response:

```json
{
  "url": "/uploads/images/posts/<post_uid>/<image_uid>.png",
  "markdown": "![图片](/uploads/images/posts/<post_uid>/<image_uid>.png)"
}
```

Validation rules:

- The requester must be an authenticated admin.
- CSRF validation is required.
- `postUid` must match an existing post.
- File size must be 10 MB or less.
- File extension must be one of `jpg`, `jpeg`, `png`, `webp`, or `gif`.
- MIME type must match an allowed image type.
- SVG is rejected even if a browser reports it as an image.
- Original filenames are not used for storage.
- Stored filenames use a generated image UID, for example `<uuid>.<ext>`.

Error handling:

- `400` for missing `postUid`, missing file, unsupported type, or oversized file.
- `401` or `403` through existing auth and CSRF behavior.
- `404` when `postUid` does not match an existing post.
- `500` for unexpected storage failures.

## Static Serving

Development can serve uploaded files from the Fastify API under:

```text
/uploads/*
```

Production should serve uploaded files directly from Nginx. If the database lives at `/var/lib/tworiver-blog/blog.sqlite`, Nginx should expose:

```nginx
location /uploads/ {
    alias /var/lib/tworiver-blog/uploads/;
    try_files $uri =404;
}
```

The uploads directory must be treated as static files only. It must not execute scripts or server-side code.

## Editor Workflow

The post editor supports three upload paths:

1. Button upload: click an upload image button and select a file.
2. Drag-and-drop: drag an image onto the Markdown textarea.
3. Paste upload: paste an image or screenshot into the Markdown textarea.

All three paths use the same upload API and insertion logic.

If the article has no post UID yet, upload is blocked with a clear message:

```text
请先保存草稿再上传图片。
```

This means a new article must be saved as a draft before images can be uploaded. The first release does not create empty drafts automatically.

On successful upload, Markdown is inserted at the current cursor position:

```md
![图片](/uploads/images/posts/<post_uid>/<image_uid>.png)
```

If text is selected in the Markdown textarea, the selected text becomes the alt text:

```md
![部署架构图](/uploads/images/posts/<post_uid>/<image_uid>.png)
```

If no text is selected, the default alt text is:

```text
图片
```

Upload behavior:

- Show a simple uploading state.
- Disable duplicate upload actions while an upload is in flight.
- On failure, show an editor error and leave Markdown unchanged.
- On success, update the Markdown textarea and keep focus in the editor when possible.

## Delete Behavior

When an article is permanently deleted through:

```text
DELETE /api/admin/posts/:id
```

the API should also attempt to delete:

```text
<uploads-root>/images/posts/<post_uid>/
```

Cleanup is best effort:

- The article deletion remains the primary operation.
- If image directory deletion fails, the API logs the cleanup failure.
- Cleanup failure does not turn a successful article deletion into an API failure.

This avoids blocking article deletion because of a filesystem cleanup issue while still making the intended lifecycle explicit.

## Security Notes

- Do not trust the original filename.
- Do not preserve directory separators or user-provided paths.
- Validate both extension and MIME type.
- Reject SVG.
- Limit single image size to 10 MB.
- Store uploads outside the frontend build output.
- Serve uploads as static files only.
- Do not expose directory listings.
- Do not accept uploads from public routes.

## Deployment Notes

Uploads are part of persistent application data. Backups should include both:

```text
blog.sqlite
uploads/
```

Deployment scripts and Ubuntu documentation should mention that `/var/lib/tworiver-blog` contains both SQLite data and uploaded images.

## Out Of Scope

- Image compression.
- WebP conversion.
- Resize variants or thumbnails.
- Media library UI.
- Image delete UI.
- Unused image cleanup.
- Batch upload management.
- Generic attachment upload.
- Object storage such as S3, R2, or OSS.
- Automatic draft creation before upload.
- Moving images when slug changes.

## Acceptance Criteria

- Existing and new posts have stable `uid` values.
- An authenticated admin can upload a supported image up to 10 MB for a saved post.
- Unsupported file types, SVG, oversized images, missing files, and unknown post UIDs are rejected.
- Button upload inserts Markdown image syntax into the active editor body.
- Drag-and-drop upload inserts Markdown image syntax into the active editor body.
- Paste upload inserts Markdown image syntax into the active editor body.
- Selected text becomes the inserted image alt text.
- A new unsaved article cannot upload images and shows a clear save-draft-first message.
- Public article rendering can display uploaded images from `/uploads/...`.
- Deleting an article attempts to remove that article UID image directory without blocking successful article deletion if cleanup fails.
