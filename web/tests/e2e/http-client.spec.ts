import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import ts from "typescript";

test("the API client works on a real insecure HTTP origin", async ({
  page,
}) => {
  const source = await readFile("src/lib/client.ts", "utf8");
  const script = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  }).outputText;
  let key = "";
  await page.route("http://astral-http.test/**", async (route) => {
    if (new URL(route.request().url()).pathname === "/api/conversations") {
      key = route.request().headers()["idempotency-key"];
      await route.fulfill({ json: { id: "http-session" } });
    } else
      await route.fulfill({
        contentType: "text/html",
        body: `<!doctype html><meta charset="utf-8"><script type="module">${script}\nwindow.testApi=api;</script>`,
      });
  });
  await page.goto("http://astral-http.test/");
  expect(await page.evaluate(() => window.isSecureContext)).toBe(false);
  expect(await page.evaluate(() => typeof crypto.randomUUID)).toBe("undefined");
  const result = await page.evaluate(async () =>
    (window as any).testApi("conversations", "POST", { name: "HTTP study" }),
  );
  expect(result.id).toBe("http-session");
  expect(key).toMatch(/^[0-9a-f-]{36}$/);
});
