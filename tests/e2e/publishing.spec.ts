import { expect, test } from "@playwright/test";

test("admin can publish, hide drafts, delete published content, and logout", async ({ page }) => {
  const suffix = Date.now().toString(36);
  const categorySlug = `e2e-category-${suffix}`;
  const categoryName = `E2E Category ${suffix}`;
  const publishedSlug = `e2e-published-${suffix}`;
  const draftSlug = `e2e-draft-${suffix}`;
  const publishedTitle = `E2E Published ${suffix}`;
  const draftTitle = `E2E Draft ${suffix}`;

  await page.goto("/admin/login");
  await page.getByPlaceholder(/用户名或邮箱|Username or email/).fill("admin");
  await page.getByPlaceholder(/请输入您的安全密码|Enter your secure password/).fill("secret1234567");
  const loginResponsePromise = page.waitForResponse((response) => response.url().includes("/api/auth/login"));
  await page.getByRole("button", { name: /验证并登录控制台|Verify and enter console|Unlock admin/ }).click();
  const loginResponse = await loginResponsePromise;
  expect(loginResponse.status()).toBe(200);
  await expect(page.getByRole("heading", { name: /仪表盘|Dashboard/ })).toBeVisible();

  await page.goto("/admin/categories");
  await page.getByRole("button", { name: /新增大分类|New category|立即新建|Create now/ }).first().click();
  await page.getByLabel(/URL Slug/).fill(categorySlug);
  await page.getByLabel(/中文分类名称|Chinese category name/).fill(categoryName);
  await page.getByRole("dialog").getByRole("button", { name: /确认保存|Save/ }).click();
  await expect(page.getByText(categorySlug)).toBeVisible();

  await page.goto("/admin/posts/new");
  await page.getByRole("textbox", { name: "Slug", exact: true }).fill(publishedSlug);
  await page.getByRole("combobox", { name: /分类|Category/ }).selectOption(categorySlug);
  await page.getByLabel(/标题|Title/).fill(publishedTitle);
  await page.getByLabel("Markdown body").fill(`# ${publishedTitle}\n\nPublished content.`);
  await page.locator(".editor-actions").getByRole("button", { name: /^(发布|Publish)$/ }).click();
  await expect(page.getByRole("heading", { name: /编辑文章|Edit post/ })).toBeVisible();

  await page.goto("/");
  await expect(page.getByRole("link", { name: publishedTitle })).toBeVisible();

  await page.goto("/admin/posts/new");
  await page.getByRole("textbox", { name: "Slug", exact: true }).fill(draftSlug);
  await page.getByLabel(/标题|Title/).fill(draftTitle);
  await page.getByLabel("Markdown body").fill(`# ${draftTitle}\n\nDraft content.`);
  await page.getByRole("button", { name: /保存草稿|Save draft/ }).click();
  await expect(page.getByRole("heading", { name: /编辑文章|Edit post/ })).toBeVisible();

  await page.goto("/");
  await expect(page.getByRole("link", { name: draftTitle })).toHaveCount(0);

  await page.goto(`/admin/posts`);
  const publishedPostRow = page
    .getByRole("button", { name: publishedTitle })
    .locator("xpath=ancestor::div[contains(@class, 'admin-post-table__row')][1]");
  await expect(publishedPostRow.getByText(publishedSlug)).toBeVisible();
  await Promise.all([
    page.waitForURL(/\/admin\/posts\/\d+$/),
    publishedPostRow.locator("a").click(),
  ]);
  await expect(page.getByRole("heading", { name: /编辑文章|Edit post/ })).toBeVisible();
  await page.getByRole("button", { name: /删除|Delete/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: /确认删除|Delete/ }).click();
  await expect(page.getByRole("heading", { name: /文章列表|Posts/ })).toBeVisible();

  await page.goto("/");
  await expect(page.getByRole("link", { name: publishedTitle })).toHaveCount(0);

  await page.goto("/admin/posts");
  const menuButton = page.getByRole("button", { name: /打开后台导航|Open admin navigation/ });
  if (await menuButton.isVisible()) {
    await menuButton.click();
  }
  await page.getByRole("button", { name: /退出登录|Log out|Logout/i }).click();
  await expect(page.getByRole("heading", { name: /进入写作中控室|Enter the writing cockpit|TwoRiver/ })).toBeVisible();

  await page.goto("/admin/posts");
  await expect(page.getByRole("heading", { name: /进入写作中控室|Enter the writing cockpit|TwoRiver/ })).toBeVisible();
});
