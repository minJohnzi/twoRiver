import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("tworiver_admin_locale", "en");
    window.localStorage.setItem("tworiver_locale", "en");
  });
});

test("admin can convert a markdown draft, translate the TipTap draft, and publish the rollout batch", async ({ page }) => {
  const suffix = Date.now().toString(36);
  const slug = `e2e-tiptap-rollout-${suffix}`;
  const englishTitle = `TipTap rollout ${suffix}`;

  await page.goto("/admin/login");
  await page.getByPlaceholder("Username or email").fill("admin");
  await page.getByPlaceholder("Enter your secure password").fill("secret1234567");
  await page.getByRole("button", { name: /Verify and enter console|Unlock admin|解锁后台/ }).click();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

  await page.goto("/admin/posts/new");
  await page.getByRole("textbox", { name: "Slug", exact: true }).fill(slug);
  await page.getByLabel("Title").fill(englishTitle);
  await page.getByLabel("Markdown body").fill("## Intro\n\nRollout content.");
  await page.locator(".editor-actions").getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("heading", { name: "Edit post" })).toBeVisible();

  const previewButton = page.getByRole("button", { name: "Preview TipTap conversion" });
  await previewButton.scrollIntoViewIfNeeded();
  await previewButton.click();

  const conversionDialog = page.getByRole("dialog", { name: "Convert Markdown to rich text?" });
  await expect(conversionDialog).toBeVisible();
  await expect(conversionDialog.getByRole("heading", { name: "Intro" })).toBeVisible();
  await conversionDialog.getByRole("button", { name: "Convert to rich text" }).click();

  const articleBody = page.getByRole("textbox", { name: /Article body|文章正文/ });
  await expect(articleBody).toContainText("Rollout content.");
  await expect(page.getByRole("button", { name: "Restore Markdown snapshot" })).toBeVisible();

  const translateButton = page.getByRole("button", { name: "Translate to Chinese" });
  await translateButton.scrollIntoViewIfNeeded();
  await expect(translateButton).toBeEnabled();
  await translateButton.click();

  await expect(page.getByRole("textbox", { name: "Title" })).toHaveValue(`[ZH] ${englishTitle}`);
  await expect(page.getByRole("textbox", { name: /Article body|文章正文/ })).toContainText("[ZH] Rollout content.");

  const publishButton = page.locator(".editor-actions").getByRole("button", { name: "Publish" });
  await publishButton.scrollIntoViewIfNeeded();
  await publishButton.click();
  await expect(page.getByRole("link", { name: "Preview" })).toBeVisible();

  await page.goto(`/posts/${slug}`);
  await expect(page.getByRole("heading", { name: englishTitle })).toBeVisible();
  await expect(page.locator("article")).toContainText("Rollout content.");
});
