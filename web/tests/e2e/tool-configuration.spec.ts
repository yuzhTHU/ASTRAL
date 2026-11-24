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
  await page.getByRole("button", { name: "注册账号" }).click();
  await page
    .getByLabel("用户名", { exact: true })
    .fill(`tool-user-${Date.now()}`);
  await page.getByLabel("密码", { exact: true }).fill("test-password-123456");
  await page.getByRole("button", { name: "注册", exact: true }).click();
  await expect(page.locator("html")).toHaveClass(/ui-ready/);
  await page.locator("#account-settings").click();
  const popup = context.waitForEvent("page");
  await page.getByRole("link", { name: "工具配置" }).click();
  const tools = await popup;
  await expect(tools.getByLabel("请求超时（秒）", { exact: true })).toHaveValue(
    "20",
  );
  await tools.getByLabel("配置范围").click();
  await expect(tools.getByRole("option")).toHaveCount(2);
  await tools
    .getByRole("option", { name: "Agent 专用设置", exact: true })
    .click();
  await expect(
    tools.getByText("只读。修改配置和测试连接需要管理员权限。"),
  ).toBeVisible();
  await expect(tools.getByLabel("Configuration session")).toHaveCount(0);
  await expect(tools.getByRole("button", { name: "测试连接" })).toBeDisabled();
  await expect(
    tools.getByLabel("请求超时（秒）", { exact: true }),
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
  await page.getByRole("button", { name: "关闭账号设置" }).click();
  await page.getByRole("button", { name: /用户菜单：/ }).click();
  await page.getByRole("menuitem", { name: "退出登录", exact: true }).click();
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
  const timeout = page.getByLabel("请求超时（秒）", { exact: true });
  const scope = page.getByLabel("配置范围");
  const source = page.getByTestId("configuration-source");
  const save = async (value: string) => {
    await timeout.fill(value);
    const response = page.waitForResponse(
      (r) =>
        r.request().method() === "PUT" &&
        r.url().includes("/tool-configurations/"),
    );
    await page.getByRole("button", { name: "保存配置", exact: true }).click();
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
  await choose(page, "连接方式", "自定义代理");
  await expect(page.getByText(/填写 Harness 服务器可访问的/)).toBeVisible();
  await expect(page.getByRole("button", { name: "测试连接" })).toBeDisabled();
  await expect(page.getByText("先保存修改，再测试连接。")).toBeVisible();
  await page
    .getByLabel("代理地址", { exact: true })
    .fill("http://proxy.test:8899");
  await save("2.5");
  await expect(source).toContainText("全局默认值");
  await choose(page, "配置范围", "Agent 专用设置");
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
  await page.getByLabel("测试目标").fill("https://example.com/science");
  await page.getByRole("button", { name: "测试连接" }).click();
  await expect(page.getByTestId("tool-test-result")).toContainText("连接成功");
  await choose(page, "配置的 Agent", "符号回归");
  await expect(timeout).toHaveValue("2.5");
  await choose(page, "可配置工具", "web_search");
  await expect(timeout).toHaveValue("15");
  await choose(page, "可配置工具", "web_fetch");
  await choose(page, "配置范围", "全局默认值");
  await expect(timeout).toHaveValue("2.5");
  await save("9.5");
  await choose(page, "配置范围", "Agent 专用设置");
  await choose(page, "配置的 Agent", "数据准备");
  await expect(timeout).toHaveValue("7.5");
  await page
    .getByRole("button", {
      name: "清除专用设置",
    })
    .click();
  await expect(source).toContainText("全局默认值");
  await expect(timeout).toHaveValue("9.5");
  expect(
    (await (await page.request.get("/api/conversations")).json()).conversations,
  ).toEqual([]);
  await choose(page, "配置范围", "全局默认值");
  await expect(
    page.getByRole("button", { name: "恢复内置默认值" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "恢复内置默认值" }).click();
  await expect(source).toContainText("内置默认值");
});
