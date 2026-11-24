import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";

test("Ant Design administration manages accounts, registration and shared models", async ({
  page,
  browser,
}, info) => {
  const stamp = Date.now();
  const username = `console-admin-${stamp}`,
    password = "console-password-123456",
    origin = "http://localhost:3100";
  execFileSync(process.execPath, ["--import", "tsx", "scripts/admin.ts"], {
    env: {
      ...process.env,
      DB_DIALECT: "sqlite",
      DATABASE_URL: "file:./test-e2e.db",
      ADMIN_USERNAME: username,
      ADMIN_PASSWORD: password,
    },
    stdio: "pipe",
  });
  expect(
    (
      await page.request.post("/api/auth/login", {
        headers: { origin },
        data: { username, password },
      })
    ).ok(),
  ).toBeTruthy();
  await page.request.put("/api/admin/registration", {
    headers: { origin },
    data: { mode: "open" },
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.locator("html")).toHaveClass(/ui-ready/);
  const workbenchLogo = await page
    .locator("header .brand img")
    .getAttribute("src");
  await page.locator("#account-settings").click();
  await expect(page).toHaveURL("http://localhost:3100/admin");
  await expect(page.getByRole("heading", { name: "账号与注册" })).toBeVisible();
  const header = page.getByRole("banner");
  await expect(header.locator("#admin-home-link img")).toHaveAttribute(
    "src",
    workbenchLogo!,
  );
  await expect(page.getByRole("main")).toHaveCount(1);
  const nav = page.getByRole("navigation", { name: "管理导航" });
  await expect(nav.getByRole("link")).toHaveCount(4);
  await expect(nav.locator('a[aria-current="page"]')).toHaveAttribute(
    "href",
    "/admin",
  );
  await header.getByRole("button", { name: "Switch to English" }).click();
  await expect(
    header.getByRole("link", { name: "Back to workbench" }),
  ).toHaveAttribute("href", "/");
  await header.getByRole("button", { name: "切换到中文" }).click();
  await page.getByRole("button", { name: "创建用户" }).click();
  const ordinaryName = `console-user-${stamp}`;
  await page.getByLabel("新建用户名").fill(ordinaryName);
  // The workbench remains open in a second tab while administration is active.
  const workbench = await page.context().newPage();
  await workbench.goto("/");
  const language = workbench.locator(
    "html.ui-ready .research-workbench header button#language-toggle",
  );
  await page.getByRole("button", { name: "创建", exact: true }).click();
  await expect(page.getByText("请输入至少 12 个字符的密码")).toBeVisible();
  await language.click();
  await expect(
    page.getByText("Enter a password of at least 12 characters."),
  ).toBeVisible();
  await expect(page.getByLabel("New username")).toHaveValue(ordinaryName);
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "Close", exact: true }),
  ).toBeVisible();
  await language.click();
  await page.getByLabel("新用户密码").fill(password);
  await page.getByRole("button", { name: "创建", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("已保存");
  await page.getByLabel("搜索用户").fill(ordinaryName);
  const row = page.getByRole("row").filter({ hasText: ordinaryName });
  await expect(row).toContainText("正常");
  const ordinary = await browser.newContext();
  expect(
    (
      await ordinary.request.post(origin + "/api/auth/login", {
        headers: { origin },
        data: { username: ordinaryName, password },
      })
    ).ok(),
  ).toBeTruthy();
  await row.getByRole("button", { name: "禁用", exact: true }).click();
  await language.click();
  await expect(page.getByRole("dialog")).toContainText(
    `Disable account “${ordinaryName}”?`,
  );
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "Disable account", exact: true }),
  ).toBeVisible();
  await language.click();
  await expect(page.getByRole("dialog")).toContainText(
    `禁用账号“${ordinaryName}”？`,
  );
  await workbench.close();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "禁用账号", exact: true })
    .click();
  await expect(row).toContainText("已禁用");
  expect((await ordinary.request.get(origin + "/api/auth/me")).status()).toBe(
    401,
  );
  await row.getByRole("button", { name: "启用", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "启用账号", exact: true })
    .click();
  await expect(row).toContainText("正常");
  await row.getByRole("button", { name: "重置密码" }).click();
  const nextPassword = "new-console-password-123456";
  await page.getByLabel("重置密码", { exact: true }).fill(nextPassword);
  await page.getByRole("button", { name: "更新密码" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  expect(
    (
      await ordinary.request.post(origin + "/api/auth/login", {
        headers: { origin },
        data: { username: ordinaryName, password: nextPassword },
      })
    ).ok(),
  ).toBeTruthy();
  try {
    await page.getByLabel("注册策略").click();
    await page.getByRole("option", { name: "邀请注册", exact: true }).click();
    await expect
      .poll(
        async () =>
          (await (await page.request.get("/api/auth/mode")).json()).mode,
      )
      .toBe("invite");
    await page.getByRole("button", { name: "创建邀请" }).click();
    await expect(
      page.getByText("邀请链接 · 一次性使用，七天后过期"),
    ).toBeVisible();
    await expect(
      page.getByText(/http:\/\/localhost:3100\/\?invitation=/),
    ).toBeVisible();
  } finally {
    await page.request.put("/api/admin/registration", {
      headers: { origin },
      data: { mode: "open" },
    });
  }
  await page.getByLabel("搜索用户").clear();
  await page.screenshot({
    path: info.outputPath("admin-accounts.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page
    .getByRole("link", { name: "共享模型", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "添加共享模型" }).click();
  const modelName = `Shared model ${stamp}`,
    secret = "test-key-never-reflected";
  await page.getByLabel("模型配置名称").fill(modelName);
  await page.getByLabel("模型标识").fill("test-model");
  await page.getByLabel("模型端点地址").fill("https://models.test/v1");
  await page.getByLabel("模型 API 密钥").fill(secret);
  await page.getByRole("button", { name: "保存模型" }).click();
  await expect(page.getByRole("status")).toHaveText("已保存");
  await page.getByRole("button", { name: modelName, exact: true }).click();
  await expect(page.getByLabel("模型 API 密钥")).toHaveValue("");
  await page.getByLabel("模型配置名称").fill(modelName + " edited");
  await page.getByRole("button", { name: "保存模型" }).click();
  await expect(
    page.getByRole("button", { name: modelName + " edited", exact: true }),
  ).toBeVisible();
  const visible = await (
    await ordinary.request.get(origin + "/api/models")
  ).json();
  const model = visible.models.find(
    (m: any) => m.name === modelName + " edited",
  );
  expect(model.shared).toBe(true);
  expect(model.configured).toBe(true);
  expect(JSON.stringify(visible)).not.toContain(secret);
  expect(
    (
      await ordinary.request.delete(origin + `/api/models/${model.id}`, {
        headers: { origin },
      })
    ).status(),
  ).toBe(404);
  const userPage = await ordinary.newPage();
  await userPage.goto(origin + "/admin/models");
  await expect(userPage.getByText("仅管理员可访问")).toBeVisible();
  const modelRow = page
    .getByRole("row")
    .filter({ hasText: modelName + " edited" });
  await modelRow.getByRole("button", { name: "删除", exact: true }).click();
  await page.getByRole("button", { name: "确认删除", exact: true }).click();
  await expect(modelRow).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin/discovery-tasks");
  await expect(page.getByRole("heading", { name: "样例任务" })).toBeVisible();
  await expect(nav.locator('a[aria-current="page"]')).toHaveAttribute(
    "href",
    "/admin/discovery-tasks",
  );
  await expect(
    header.getByRole("button", { name: "Switch to English" }),
  ).toBeInViewport();
  await expect(
    header.getByRole("link", { name: "返回工作台" }),
  ).toBeInViewport();
  await page.screenshot({
    path: info.outputPath("admin-mobile.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page
    .getByRole("button", {
      name: `用户菜单：${username}`,
      exact: true,
    })
    .click();
  await page.getByRole("menuitem", { name: "退出登录", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "登录", exact: true }),
  ).toBeVisible();
  expect((await page.request.get("/api/auth/me")).status()).toBe(401);
  expect(errors).toEqual([]);
  await ordinary.close();
});
