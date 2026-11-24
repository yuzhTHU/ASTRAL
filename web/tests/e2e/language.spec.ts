import { expect, test } from "@playwright/test";

const toggle =
  "html.ui-ready body div.research-workbench header button#language-toggle.header-toggle.language-toggle";

test("login validation and an outstanding login request follow the selected language", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page.locator("form").getByRole("alert")).toHaveText(
    "请填写此字段。",
  );
  await page.getByRole("button", { name: "Switch to English" }).click();
  await expect(page.locator("form").getByRole("alert")).toHaveText(
    "Please fill in this field.",
  );
  await page.getByLabel("Username", { exact: true }).fill("researcher");
  await page
    .getByLabel("Password", { exact: true })
    .fill("long-enough-password");

  const pending = page.waitForRequest("**/api/auth/login");
  let release!: () => void;
  const response = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/auth/login", async (route) => {
    await response;
    await route.fulfill({
      status: 401,
      json: { error: { message: "Invalid username or password" } },
    });
  });
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await pending;
  await page.getByRole("button", { name: "切换到中文" }).click();
  release();
  await expect(page.locator("form").getByRole("alert")).toHaveText(
    "用户名或密码错误",
  );
  await page.getByRole("button", { name: "Switch to English" }).click();
  await expect(page.locator("form").getByRole("alert")).toHaveText(
    "Invalid username or password",
  );
  await expect(page.getByLabel("Username")).toHaveValue("researcher");
  await page.reload();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  const missing = await page.goto("/missing-study-page");
  expect(missing!.status()).toBe(404);
  await expect(page.getByText("Page not found.")).toBeVisible();
  await page.getByRole("button", { name: "切换到中文" }).click();
  await expect(page.getByText("找不到此页面。")).toBeVisible();
});

test("the header updates open portals, pending study cards and profile options without remounting", async ({
  page,
  context,
}) => {
  const username = `language-${Date.now()}`;
  const credentials = { username, password: "language-test-password" };
  for (const action of ["register", "login"]) {
    expect(
      (
        await page.request.post(`/api/auth/${action}`, {
          headers: { origin: "http://localhost:3100" },
          data: credentials,
        })
      ).ok(),
    ).toBeTruthy();
  }
  const searchDescription =
    "Search the public web for scientific literature, documentation, and domain context.";
  await page.route("**/harness/capabilities*", (route) =>
    route.fulfill({
      json: {
        tools: [
          { name: "web_search", description: searchDescription },
          { name: "observatory_plugin", description: "Observatory metadata." },
        ],
        skills: [],
        default_tools: [],
        default_skills: [],
      },
    }),
  );
  await page.goto("/");
  await expect(page.locator(toggle)).toBeVisible();
  await expect(page.locator("#conversation-title")).toHaveText("未命名对话");

  // A second workbench lets us click the real header while a modal or menu
  // in the first one holds focus.
  const control = await context.newPage();
  await control.goto("/");
  const switchLanguage = () => control.locator(toggle).click();
  const languageButtonName = /^(Switch to English|切换到中文)$/;
  await page.locator("#account-settings").click();
  const account = page.locator("dialog.account-dialog");
  await expect(
    account.getByRole("navigation", { name: "账号设置" }),
  ).toBeVisible();
  await expect(
    account.getByRole("button", { name: languageButtonName }),
  ).toHaveCount(0);
  await account.getByLabel("名称", { exact: true }).fill("Model draft");
  await switchLanguage();
  await expect(
    account.getByRole("navigation", { name: "Account settings" }),
  ).toBeVisible();
  await expect(account.getByLabel("Name", { exact: true })).toHaveValue(
    "Model draft",
  );
  await switchLanguage();
  await account.getByRole("button", { name: "关闭账号设置" }).click();

  await page.getByRole("button", { name: `用户菜单：${username}` }).click();
  await expect(page.getByRole("menuitem", { name: "退出登录" })).toBeVisible();
  await switchLanguage();
  await expect(page.getByRole("menuitem", { name: "Logout" })).toBeVisible();
  await expect(page.locator("#conversation-title")).toHaveText(
    "Unnamed Conversation",
  );
  await page.keyboard.press("Escape");

  let release!: () => void;
  const response = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/harness/data/discovery-tasks", async (route) => {
    await response;
    await route.fulfill({
      json: {
        tasks: [
          {
            name: "fixture",
            topic: "FRB",
            title: "Radio bursts",
            subject_zh: "射电暴",
            available: true,
            description_zh: "研究样例",
            description_en: "Sample study",
            summary_zh: "$$y=x$$",
            summary_en: "$$y=x$$",
            citation: "Test et al.",
          },
        ],
      },
    });
  });
  await page.locator("#create-demo").click();
  await expect(page.locator("#demo-picker-status")).toHaveText(
    "Checking data…",
  );
  await switchLanguage();
  await expect(page.locator("#demo-picker-status")).toHaveText(
    "正在检查任务数据…",
  );
  release();
  const card = page.locator('[data-discovery-task="fixture"]');
  await expect(card).toContainText("研究样例");
  await expect(
    page
      .locator("#demo-picker")
      .getByRole("button", { name: languageButtonName }),
  ).toHaveCount(0);
  await switchLanguage();
  await expect(card).toContainText("Sample study");
  await expect(card).toHaveAccessibleName(/Radio bursts/);
  await page.locator("#demo-picker-close").click();

  await page.locator("#data-agent-settings-toggle").click();
  const select = page.locator("#data-model-profile");
  await expect(select).toHaveAccessibleName("data model configuration");
  const original = await select.elementHandle();
  await switchLanguage();
  await expect(select).toHaveAccessibleName("数据准备模型配置");
  await expect(select.locator("option").first()).toHaveText(
    "默认（个人覆盖 / 共享默认）",
  );
  expect(
    await original!.evaluate(
      (node) => node === document.querySelector("#data-model-profile"),
    ),
  ).toBe(true);
  await page.locator('[data-data-settings-tab="capabilities"]').click();
  const option = page
    .locator("#data-tool-options label")
    .filter({ has: page.locator('[value="web_search"]') });
  const description = option.locator(".capability-description");
  await expect(description).toHaveText(/\p{Script=Han}/u);
  await option.getByRole("checkbox").check();
  await switchLanguage();
  await expect(description).toHaveText(searchDescription);
  await expect(option).toHaveAttribute("title", searchDescription);
  await expect(option.getByRole("checkbox")).toBeChecked();
  await expect(page.locator("#data-tool-options")).toContainText(
    "Observatory metadata.",
  );

  // Explicit names remain user content even if they match the old default.
  await page.locator("#data-settings-cancel").click();
  await page.locator("#conversation-title").click();
  const editor = page.locator("#conversation-title-input");
  await expect(editor).toHaveValue("");
  await editor.fill("Unnamed Conversation");
  const renamed = page.waitForResponse(
    (r) =>
      r.request().method() === "PATCH" &&
      /\/api\/conversations\/[^/]+$/.test(r.url()),
  );
  await editor.press("Enter");
  expect((await renamed).ok()).toBeTruthy();
  await switchLanguage();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await expect(page.locator("#conversation-title")).toHaveText(
    "Unnamed Conversation",
  );

  const filename = "observations.csv";
  const csv = "x,y\n1,2\n2,4";
  await page.locator("#file-input").setInputFiles({
    name: filename,
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await page.getByRole("button", { name: filename, exact: true }).click();
  const preview = page.getByRole("dialog", { name: filename });
  await expect(preview.getByRole("button", { name: "关闭" })).toBeVisible();
  await expect(
    preview.getByRole("button", { name: languageButtonName }),
  ).toHaveCount(0);
  await switchLanguage();
  await expect(preview.locator("#preview-text")).toHaveText(csv);
  await preview.getByRole("button", { name: "Close", exact: true }).click();
  await expect(preview).toBeHidden();

  const fileButton = page.getByRole("button", { name: filename, exact: true });
  const fileRow = page.locator(".file").filter({ has: fileButton });
  await fileRow.getByLabel("More actions").click();
  await fileRow.getByRole("button", { name: "Delete", exact: true }).click();
  const confirmation = page.locator("#delete-file-dialog");
  await expect(confirmation).toHaveAccessibleName(
    `Delete “${filename}”? The contents of a directory will also be deleted.`,
  );
  await expect(confirmation.getByRole("button")).toHaveCount(2);
  await expect(
    confirmation.getByRole("button", { name: "Cancel" }),
  ).toBeFocused();
  await switchLanguage();
  await expect(confirmation).toHaveAccessibleName(
    `确定删除“${filename}”吗？目录中的内容也会被删除。`,
  );
  await expect(
    confirmation.getByRole("button", { name: "删除" }),
  ).toBeVisible();
  await confirmation.getByRole("button", { name: "取消" }).click();
  await expect(confirmation).toBeHidden();
  await expect(fileButton).toBeVisible();
});
