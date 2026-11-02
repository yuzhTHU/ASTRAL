import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
async function choose(page: any, label: string, option: string) {
  await page.getByLabel(label, { exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

test("ordinary users can inspect but cannot modify shared tool settings", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Register / 注册账号" }).click();
  await page
    .getByLabel("用户名", { exact: true })
    .fill(`tool-user-${Date.now()}`);
  await page.getByLabel("密码", { exact: true }).fill("test-password-123456");
  await page.getByRole("button", { name: "注册", exact: true }).click();
  await expect(page.locator("html")).toHaveClass(/ui-ready/);
  await page.locator("#account-settings").click();
  const popup = context.waitForEvent("page");
  await page.getByRole("link", { name: "工具配置 / Tools" }).click();
  const tools = await popup;
  await expect(
    tools.getByLabel("timeout_seconds", { exact: true }),
  ).toHaveValue("20");
  await tools.getByLabel("Configuration scope").click();
  await expect(tools.getByRole("option")).toHaveCount(2);
  await tools
    .getByRole("option", { name: "Agent 覆盖 / Agent override", exact: true })
    .click();
  await expect(tools.getByLabel("Configuration session")).toHaveCount(0);

  await expect(tools.getByLabel("Configuration session")).toHaveCount(0);
  await expect(
    tools.getByLabel("timeout_seconds", { exact: true }),
  ).toBeDisabled();
  for (const path of [
    "tool-configurations/web_fetch",
    "agents/data/tool-configurations/web_fetch",
  ]) {
    const options = {
      headers: { origin: "http://localhost:3100" },
      data: { settings: { timeout_seconds: 1 } },
    };
    expect((await tools.request.put(`/api/${path}`, options)).status()).toBe(
      403,
    );
    expect((await tools.request.delete(`/api/${path}`, options)).status()).toBe(
      403,
    );
    expect(
      (await tools.request.post(`/api/${path}/test`, options)).status(),
    ).toBe(403);
  }
  await tools.close();
  await page.getByRole("button", { name: "Close account settings" }).click();
  await page.getByRole("button", { name: /用户菜单 \/ User menu:/ }).click();
  await page
    .getByRole("menuitem", { name: "退出登录 / Logout", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "登录", exact: true }),
  ).toBeVisible();
  expect((await page.request.get("/api/auth/me")).status()).toBe(401);
});

test("shared Agent overrides and global defaults require no research session", async ({
  page,
}) => {
  const username = `tool-admin-${Date.now()}`;
  execFileSync(process.execPath, ["--import", "tsx", "scripts/admin.ts"], {
    env: {
      ...process.env,
      DB_DIALECT: "sqlite",
      DATABASE_URL: "file:./test-e2e.db",
      ADMIN_USERNAME: username,
      ADMIN_PASSWORD: "tool-admin-password-123456",
    },
    stdio: "pipe",
  });
  expect(
    (
      await page.request.post("/api/auth/login", {
        headers: { origin: "http://localhost:3100" },
        data: { username, password: "tool-admin-password-123456" },
      })
    ).ok(),
  ).toBeTruthy();
  await page.goto("/tools?scope=session&session=removed");
  const timeout = page.getByLabel("timeout_seconds", { exact: true });
  const scope = page.getByLabel("Configuration scope");
  const source = page.getByTestId("configuration-source");
  const save = async (value: string) => {
    await timeout.fill(value);
    const response = page.waitForResponse(
      (r) =>
        r.request().method() === "PUT" &&
        r.url().includes("/tool-configurations/"),
    );
    await page
      .getByRole("button", { name: "保存配置 / Save configuration" })
      .click();
    const result = await response;
    expect(result.ok()).toBeTruthy();
    return result.json();
  };
  await expect(timeout).toHaveValue("20");
  await expect(
    page.locator(".ant-select").filter({ has: scope }),
  ).toContainText("全局默认值");
  await scope.click();
  await expect(page.getByRole("option")).toHaveCount(2);
  await page.keyboard.press("Escape");
  await expect(page).not.toHaveURL(/session=/);
  await choose(page, "proxy_mode", "custom");
  await page
    .getByLabel("proxy_url", { exact: true })
    .fill("http://proxy.test:8899");
  await save("2.5");
  await expect(source).toContainText("全局默认值");
  await choose(page, "Configuration scope", "Agent 覆盖 / Agent override");
  await expect(timeout).toHaveValue("2.5");
  await expect(page.getByLabel("Configuration session")).toHaveCount(0);
  const saved = await save("7.5");
  expect(saved).toMatchObject({
    source: "agent",
    settings: {
      timeout_seconds: 7.5,
      proxy_mode: "custom",
      proxy_url: "http://proxy.test:8899",
    },
    revision: 1,
  });
  await page.reload();
  await expect(timeout).toHaveValue("7.5");
  await page.getByLabel("Tool test target").fill("https://example.com/science");
  await page
    .getByRole("button", { name: "测试已保存配置 / Test saved configuration" })
    .click();
  await expect(page.getByTestId("tool-test-result")).toContainText("连接成功");
  await choose(page, "Configuration agent", "符号回归 / Search");
  await expect(timeout).toHaveValue("2.5");
  await choose(page, "Configurable tool", "web_search");
  await expect(timeout).toHaveValue("15");
  await choose(page, "Configurable tool", "web_fetch");
  await choose(page, "Configuration scope", "全局默认值 / Global defaults");
  await expect(timeout).toHaveValue("2.5");
  await save("9.5");
  await choose(page, "Configuration scope", "Agent 覆盖 / Agent override");
  await choose(page, "Configuration agent", "数据准备 / Data preparation");
  await expect(timeout).toHaveValue("7.5");
  await page
    .getByRole("button", {
      name: "取消覆盖，使用上级默认值 / Inherit defaults",
    })
    .click();
  await expect(source).toContainText("全局默认值");
  await expect(timeout).toHaveValue("9.5");
  expect(
    (await (await page.request.get("/api/conversations")).json()).conversations,
  ).toEqual([]);
  await choose(page, "Configuration scope", "全局默认值 / Global defaults");
  await expect(
    page.getByRole("button", { name: "恢复内置默认值 / Reset defaults" }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "恢复内置默认值 / Reset defaults" })
    .click();
  await expect(source).toContainText("内置默认值");
});
