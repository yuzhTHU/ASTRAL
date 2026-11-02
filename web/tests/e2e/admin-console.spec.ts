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
  await page.locator("#account-settings").click();
  await expect(page).toHaveURL("http://localhost:3100/admin");
  await expect(
    page.getByRole("heading", { name: "账号与注册 / Accounts" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "创建用户 / Create user" }).click();
  const ordinaryName = `console-user-${stamp}`;
  await page.getByLabel("New username").fill(ordinaryName);
  await page.getByLabel("New user password").fill(password);
  await page
    .getByRole("button", { name: "创建 / Create", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText("已保存 / Saved");
  await page.getByLabel("Search users").fill(ordinaryName);
  const row = page.getByRole("row").filter({ hasText: ordinaryName });
  await expect(row).toContainText("正常 / Active");
  const ordinary = await browser.newContext();
  expect(
    (
      await ordinary.request.post(origin + "/api/auth/login", {
        headers: { origin },
        data: { username: ordinaryName, password },
      })
    ).ok(),
  ).toBeTruthy();
  await row
    .getByRole("button", { name: "禁用 / Disable", exact: true })
    .click();
  await page
    .getByRole("button", { name: "确认 / Confirm", exact: true })
    .click();
  await expect(row).toContainText("已禁用 / Disabled");
  expect((await ordinary.request.get(origin + "/api/auth/me")).status()).toBe(
    401,
  );
  await row.getByRole("button", { name: "启用 / Enable", exact: true }).click();
  await page
    .getByRole("button", { name: "确认 / Confirm", exact: true })
    .click();
  await expect(row).toContainText("正常 / Active");
  await row.getByRole("button", { name: "重置密码 / Reset password" }).click();
  const nextPassword = "new-console-password-123456";
  await page.getByLabel("Reset password", { exact: true }).fill(nextPassword);
  await page
    .getByRole("button", { name: "更新密码 / Update password" })
    .click();
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
    await page.getByLabel("Registration mode").click();
    await page
      .getByRole("option", { name: "邀请注册 / Invitation only", exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (await (await page.request.get("/api/auth/mode")).json()).mode,
      )
      .toBe("invite");
    await page
      .getByRole("button", { name: "创建邀请 / Create invitation" })
      .click();
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
  await page.getByLabel("Search users").clear();
  await page.screenshot({
    path: info.outputPath("admin-accounts.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page
    .getByRole("link", { name: "共享模型 / Models", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "添加共享模型 / Add model" }).click();
  const modelName = `Shared model ${stamp}`,
    secret = "test-key-never-reflected";
  await page.getByLabel("Model configuration name").fill(modelName);
  await page.getByLabel("Model identifier").fill("test-model");
  await page.getByLabel("Model endpoint").fill("https://models.test/v1");
  await page.getByLabel("Model API key").fill(secret);
  await page.getByRole("button", { name: "保存模型 / Save model" }).click();
  await expect(page.getByRole("status")).toHaveText("已保存 / Saved");
  await page.getByRole("button", { name: modelName, exact: true }).click();
  await expect(page.getByLabel("Model API key")).toHaveValue("");
  await page.getByLabel("Model configuration name").fill(modelName + " edited");
  await page.getByRole("button", { name: "保存模型 / Save model" }).click();
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
  await expect(
    userPage.getByText("仅管理员可访问 / Administrators only"),
  ).toBeVisible();
  const modelRow = page
    .getByRole("row")
    .filter({ hasText: modelName + " edited" });
  await modelRow
    .getByRole("button", { name: "删除 / Delete", exact: true })
    .click();
  await page
    .getByRole("button", { name: "确认删除 / Delete", exact: true })
    .click();
  await expect(modelRow).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin/discovery-tasks");
  await expect(
    page.getByRole("heading", { name: "样例任务 / Sample tasks" }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("admin-mobile.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page
    .getByRole("button", {
      name: `用户菜单 / User menu: ${username}`,
      exact: true,
    })
    .click();
  await page
    .getByRole("menuitem", { name: "退出登录 / Logout", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "登录", exact: true }),
  ).toBeVisible();
  expect((await page.request.get("/api/auth/me")).status()).toBe(401);
  expect(errors).toEqual([]);
  await ordinary.close();
});
