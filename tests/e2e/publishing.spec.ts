import { expect, test } from "@playwright/test";

test("admin can publish, hide drafts, delete published content, and logout", async ({ page }) => {
  const suffix = Date.now().toString(36);
  const categorySlug = `e2e-category-${suffix}`;
  const publishedSlug = `e2e-published-${suffix}`;
  const draftSlug = `e2e-draft-${suffix}`;
  const publishedTitle = `E2E Published ${suffix}`;
  const draftTitle = `E2E Draft ${suffix}`;

  await page.goto("/admin/login");
  await page.getByLabel(/用户名|Username/).fill("admin");
  await page.getByLabel(/密码|Password/).fill("secret1234567");
  const loginResponsePromise = page.waitForResponse((response) => response.url().includes("/api/auth/login"));
  const meResponsePromise = page.waitForResponse((response) => response.url().includes("/api/auth/me"));
  await page.getByRole("button", { name: /解锁后台|Unlock admin/ }).click();
  const loginResponse = await loginResponsePromise;
  expect(loginResponse.status()).toBe(200);
  const meResponse = await meResponsePromise;
  expect(meResponse.status()).toBe(200);
  await expect(page.getByRole("heading", { name: /发布控制台|Publishing console/ })).toBeVisible();

  await page.goto("/admin/categories");
  await page.getByLabel("Slug").fill(categorySlug);
  await page.getByLabel(/名称|Name/).fill("E2E Category");
  await page.getByRole("button", { name: /保存|Save/ }).click();
  await expect(page.getByText(categorySlug)).toBeVisible();

  await page.goto("/admin/posts/new");
  await page.getByLabel("Slug").fill(publishedSlug);
  await page.getByLabel(/分类|Category/).selectOption(categorySlug);
  await page.getByLabel(/标签|Tags/).fill(`e2e-${suffix}`);
  await page.getByLabel(/标题|Title/).fill(publishedTitle);
  await page.getByLabel("Markdown body").fill(`# ${publishedTitle}\n\nPublished content.`);
  await page.getByRole("button", { name: /发布|Publish/ }).click();
  await expect(page.getByRole("heading", { name: /编辑文章|Edit post/ })).toBeVisible();

  await page.goto("/");
  await expect(page.getByRole("link", { name: publishedTitle })).toBeVisible();

  await page.goto("/admin/posts/new");
  await page.getByLabel("Slug").fill(draftSlug);
  await page.getByLabel(/标题|Title/).fill(draftTitle);
  await page.getByLabel("Markdown body").fill(`# ${draftTitle}\n\nDraft content.`);
  await page.getByRole("button", { name: /保存草稿|Save draft/ }).click();
  await expect(page.getByRole("heading", { name: /编辑文章|Edit post/ })).toBeVisible();

  await page.goto("/");
  await expect(page.getByRole("link", { name: draftTitle })).toHaveCount(0);

  await page.goto(`/admin/posts`);
  await page.getByRole("link", { name: new RegExp(publishedSlug) }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: /删除|Delete/ }).click();
  await expect(page.getByRole("heading", { name: /发布控制台|Publishing console/ })).toBeVisible();

  await page.goto("/");
  await expect(page.getByRole("link", { name: publishedTitle })).toHaveCount(0);

  await page.goto("/admin/posts");
  await page.getByRole("button", { name: /logout/i }).click();
  await expect(page.getByRole("heading", { name: /进入写作中控室|Enter the writing cockpit/ })).toBeVisible();

  await page.goto("/admin/posts");
  await expect(page.getByRole("heading", { name: /进入写作中控室|Enter the writing cockpit/ })).toBeVisible();
});
