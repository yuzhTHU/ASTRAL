import { afterEach, expect, it, vi } from "vitest";
import { api, requestId } from "../src/lib/client";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

it("generates UUID v4 without the secure-context-only randomUUID API", () => {
  const crypto = globalThis.crypto;
  vi.stubGlobal("crypto", {
    getRandomValues: crypto.getRandomValues.bind(crypto),
  });
  const ids = Array.from({ length: 100 }, requestId);
  expect(ids.every((id) => uuid.test(id))).toBe(true);
  expect(new Set(ids).size).toBe(ids.length);
});

it("preserves the same command key across a network failure on HTTP", async () => {
  const crypto = globalThis.crypto;
  vi.stubGlobal("crypto", {
    getRandomValues: crypto.getRandomValues.bind(crypto),
  });
  const mock = vi
    .spyOn(globalThis, "fetch")
    .mockRejectedValueOnce(new TypeError("Network failed"))
    .mockResolvedValueOnce(new Response('{"id":"created"}'))
    .mockResolvedValueOnce(new Response('{"id":"next"}'));
  const body = { name: "HTTP test" };
  await expect(api("conversations", "POST", body)).rejects.toThrow(
    "Network failed",
  );
  await api("conversations", "POST", body);
  await api("conversations", "POST", body);
  const keys = mock.mock.calls.map(
    ([, init]) => (init!.headers as Record<string, string>)["idempotency-key"],
  );
  expect(keys[0]).toMatch(uuid);
  expect(keys[1]).toBe(keys[0]);
  expect(keys[2]).not.toBe(keys[0]);
});
