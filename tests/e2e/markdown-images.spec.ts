import { deflateSync } from "node:zlib";
import { expect, test } from "@playwright/test";

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBytes = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  const crc = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 0);
  return Buffer.concat([length, typeBytes, data, crc]);
}

function makeWidePng(width = 1440, height = 520): Buffer {
  const bytesPerRow = width * 4 + 1;
  const raw = Buffer.alloc(bytesPerRow * height);

  for (let y = 0; y < height; y += 1) {
    const rowStart = y * bytesPerRow;
    raw[rowStart] = 0;
    for (let x = 0; x < width; x += 1) {
      const offset = rowStart + 1 + x * 4;
      raw[offset] = Math.round(32 + (x / width) * 176);
      raw[offset + 1] = Math.round(80 + (y / height) * 120);
      raw[offset + 2] = 190;
      raw[offset + 3] = 255;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("tworiver_admin_locale", "en");
    window.localStorage.setItem("tworiver_locale", "en");
  });
});

test("article images fit the markdown width and open a larger preview", async ({ page }) => {
  const suffix = Date.now().toString(36);
  const slug = `e2e-image-${suffix}`;
  const title = `E2E Image ${suffix}`;

  await page.goto("/admin/login");
  await page.getByLabel("Username").fill("admin");
  await page.getByLabel("Password").fill("secret1234567");
  await page.getByRole("button", { name: "Unlock admin" }).click();
  await expect(page.getByRole("heading", { name: "Publishing console" })).toBeVisible();

  await page.goto("/admin/posts/new");
  await page.getByLabel("Slug").fill(slug);
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Markdown body").fill("Before the image.\n\nAfter the image.");
  await page.locator(".editor-actions").getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("heading", { name: "Edit post" })).toBeVisible();

  const markdownBody = page.getByLabel("Markdown body");
  await markdownBody.focus();
  await markdownBody.press("Control+A");
  await markdownBody.press("End");
  await page.getByLabel("Upload image file").setInputFiles({
    name: "wide-article-image.png",
    mimeType: "image/png",
    buffer: makeWidePng()
  });
  await expect(markdownBody).toHaveValue(/\/uploads\/images\/posts\/p_[0-9a-f-]+\/.+\.png/);

  await page.locator(".editor-actions").getByRole("button", { name: "Publish" }).click();
  await expect(page.getByRole("link", { name: "Preview" })).toBeVisible();

  await page.goto(`/posts/${slug}`);
  await expect(page.getByRole("heading", { name: title })).toBeVisible();

  const articleImageButton = page.locator(".markdown-body [data-markdown-image='true']");
  await expect(articleImageButton).toBeVisible();

  const inlineMetrics = await articleImageButton.evaluate((button) => {
    const markdownBodyElement = button.closest(".markdown-body");
    const image = button.querySelector("img");
    if (!markdownBodyElement || !image) {
      throw new Error("Missing markdown image elements");
    }

    const bodyRect = markdownBodyElement.getBoundingClientRect();
    const buttonRect = button.getBoundingClientRect();
    const imageRect = image.getBoundingClientRect();
    return {
      bodyWidth: bodyRect.width,
      buttonWidth: buttonRect.width,
      imageWidth: imageRect.width,
      imageHeight: imageRect.height,
      cursor: window.getComputedStyle(button).cursor
    };
  });

  expect(inlineMetrics.buttonWidth).toBeLessThanOrEqual(inlineMetrics.bodyWidth + 1);
  expect(inlineMetrics.imageWidth).toBeLessThanOrEqual(inlineMetrics.bodyWidth + 1);
  expect(inlineMetrics.imageWidth).toBeGreaterThan(240);
  expect(inlineMetrics.imageHeight).toBeGreaterThan(40);
  expect(inlineMetrics.cursor).toBe("zoom-in");

  await articleImageButton.click();
  const previewDialog = page.getByRole("dialog", { name: "Image preview" });
  await expect(previewDialog).toBeVisible();

  const previewMetrics = await previewDialog.locator("img").evaluate((image) => {
    const rect = image.getBoundingClientRect();
    return {
      imageWidth: rect.width,
      imageHeight: rect.height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight
    };
  });
  expect(previewMetrics.imageWidth).toBeLessThanOrEqual(previewMetrics.viewportWidth);
  expect(previewMetrics.imageHeight).toBeLessThanOrEqual(previewMetrics.viewportHeight);

  await page.getByRole("button", { name: "Close image preview" }).click();
  await expect(previewDialog).toBeHidden();
});
