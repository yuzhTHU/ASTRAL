import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";

test("administrator manages sample definitions, order and enabled state; ordinary users cannot mutate", async ({
  page,
  browser,
}, info) => {
  const username = `sample-admin-${Date.now()}`;
  const password = "sample-admin-password-123456";
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
  const origin = "http://localhost:3100";
  expect(
    (
      await page.request.post("/api/auth/login", {
        headers: { origin },
        data: { username, password },
      })
    ).ok(),
  ).toBeTruthy();
  await page.goto("/admin/discovery-tasks");
  await expect(
    page.locator(".discovery-task-table tbody tr[data-testid]"),
  ).toHaveCount(7);
  const search = page.getByRole("textbox", { name: "搜索样例任务" });
  await search.fill("no-such-sample");
  await expect(page.getByText("没有符合筛选条件的任务")).toBeVisible();
  await expect(page.getByText("清除筛选后可调整顺序。")).toBeVisible();
  await page.getByRole("button", { name: "清除筛选" }).click();
  await page
    .getByTestId("task-Chen_NatureAstronomy2023")
    .getByRole("button", { name: /双模/ })
    .click();
  await expect(page.locator(".admin-surface .ant-drawer-open")).toBeVisible();
  await page.getByRole("tab", { name: "数据与发布" }).click();
  await expect(
    page.getByLabel("启用此任务", { exact: true }),
  ).not.toBeChecked();
  await expect(page.getByLabel("数据位置", { exact: true })).toHaveValue("");
  await page.getByRole("tab", { name: "阶段提示词" }).click();
  expect(
    await page.getByLabel("数据准备提示词", { exact: true }).inputValue(),
  ).toContain("{inputs}");
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await page.getByRole("button", { name: "添加任务", exact: true }).click();
  const name = `study-${Date.now()}`;
  const labels: Record<string, string> = {
    name: "任务标识",
    topic: "分类",
    subject_zh: "卡片标题",
    title: "论文标题",
    task: "研究问题",
    preparation: "数据准备提示词",
    evaluation: "Evaluator 提示词",
    citation: "引用",
    summary_zh: "中文公式摘要",
    description_zh: "中文说明",
    description_en: "英文说明",
  };
  for (const [field, value] of Object.entries({
    name,
    topic: "New topic",
    subject_zh: "可管理的样例",
    title: "Managed study",
    task: "Find the relation",
    preparation: "Prepare {inputs}",
    evaluation: "Evaluate the observations",
    citation: "(Researcher, 2026)",
    summary_zh: "研究摘要：$$y=2x$$",
    description_zh: "管理员维护的数据样例",
    description_en: "Administrator maintained sample",
  })) {
    const tab = ["task", "preparation", "evaluation"].includes(field)
      ? "阶段提示词"
      : ["summary_zh", "description_zh", "description_en"].includes(field)
        ? "说明与公式"
        : "基本信息";
    await page.getByRole("tab", { name: tab }).click();
    await page.getByLabel(labels[field], { exact: true }).fill(value);
  }
  await page.getByRole("button", { name: "保存任务" }).click();
  await expect(page.getByRole("status")).toHaveText("已保存");
  await expect(
    page.locator(".discovery-task-table tbody tr[data-testid]"),
  ).toHaveCount(8);
  await page.getByRole("button", { name: `上移 ${name}`, exact: true }).click();
  await expect(
    page.locator(".discovery-task-table tbody tr[data-testid]").nth(6),
  ).toHaveAttribute("data-testid", `task-${name}`);
  await page
    .getByTestId(`task-${name}`)
    .getByRole("button", { name: /可管理/ })
    .click();
  await page.getByRole("tab", { name: "数据与发布" }).click();
  await page
    .getByLabel("数据位置", { exact: true })
    .fill("/samples/observations.csv");
  await page.getByLabel("启用此任务", { exact: true }).check();
  await page.getByRole("button", { name: "保存任务" }).click();
  await expect(page.getByRole("status")).toHaveText("已保存");
  await page.reload();
  await page
    .getByTestId(`task-${name}`)
    .getByRole("button", { name: /可管理/ })
    .click();
  await page.getByRole("tab", { name: "数据与发布" }).click();
  await expect(page.getByLabel("数据位置", { exact: true })).toHaveValue(
    "/samples/observations.csv",
  );
  await expect(page.getByLabel("启用此任务", { exact: true })).toBeChecked();
  await page.screenshot({
    path: info.outputPath("sample-admin-light.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.evaluate(() => localStorage.setItem("sr-harness-theme", "dark"));
  await page.reload();
  await expect(page.locator(".admin-surface")).toHaveCSS(
    "color-scheme",
    "dark",
  );
  await page
    .getByTestId(`task-${name}`)
    .getByRole("button", { name: /可管理/ })
    .click();
  await page.screenshot({
    path: info.outputPath("sample-admin-dark.png"),
    fullPage: true,
    animations: "disabled",
  });

  const ordinary = await browser.newContext();
  const user = `sample-user-${Date.now()}`;
  await ordinary.request.post(`${origin}/api/auth/register`, {
    headers: { origin },
    data: { username: user, password },
  });
  await ordinary.request.post(`${origin}/api/auth/login`, {
    headers: { origin },
    data: { username: user, password },
  });
  for (const [method, path] of [
    ["GET", ""],
    ["POST", ""],
    ["PUT", "/order"],
    ["PUT", `/${name}`],
    ["DELETE", `/${name}`],
  ]) {
    expect(
      (
        await ordinary.request.fetch(
          `${origin}/api/admin/discovery-tasks${path}`,
          { method, headers: { origin }, data: {} },
        )
      ).status(),
    ).toBe(403);
  }
  const workbench = await ordinary.newPage();
  const errors: string[] = [];
  workbench.on("pageerror", (e) => errors.push(e.message));
  await workbench.goto(origin);
  await expect(workbench.locator("html")).toHaveClass(/ui-ready/);
  await workbench.locator("#create-demo").click();
  await expect(workbench.locator("#demo-picker .demo-option")).toHaveCount(1);
  const card = workbench.locator(`[data-discovery-task="${name}"]`);
  await expect(card).toContainText("(Researcher, 2026)");
  await expect(card).toContainText("管理员维护的数据样例");
  await card.click();
  await expect(workbench.locator("#demo-picker")).not.toBeVisible();
  await expect(workbench.locator("#data-agent-input")).toHaveValue(
    "Prepare observations.csv",
  );
  await expect(workbench.locator("#problem-description")).toHaveValue(
    "Find the relation",
  );
  await expect(workbench.locator("#files")).toContainText("observations.csv");
  expect(errors).toEqual([]);

  await page.getByRole("button", { name: "删除任务" }).click();
  await page.getByRole("button", { name: "确认删除", exact: true }).click();
  await expect(
    page.locator(".discovery-task-table tbody tr[data-testid]"),
  ).toHaveCount(7);
  await page.reload();
  await expect(page.getByTestId(`task-${name}`)).toHaveCount(0);
  await ordinary.close();
});
