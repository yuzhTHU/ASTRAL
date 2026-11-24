const pending = new Map<string, string>();
/** Request deduplication IDs must also work on ordinary HTTP development hosts. */
export function requestId(): string {
  if (typeof globalThis.crypto.randomUUID === "function")
    return globalThis.crypto.randomUUID();
  // getRandomValues is available outside secure contexts; randomUUID is not.
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
let active = 0;
const queue: (() => void)[] = [];
async function withSlot<T>(work: () => Promise<T>): Promise<T> {
  await new Promise<void>((resolve) => {
    if (active < 3) {
      active++;
      resolve();
    } else queue.push(resolve);
  });
  try {
    return await work();
  } finally {
    active--;
    const next = queue.shift();
    if (next) {
      active++;
      next();
    }
  }
}
export async function api<T = any>(
  path: string,
  method = "GET",
  data?: unknown,
): Promise<T> {
  const signature = `${method}:${path}:${JSON.stringify(data)}`;
  const key = pending.get(signature) || requestId();
  const tracked =
    path === "conversations" ||
    /\/harness\/(start|data\/agent|evaluator\/agent\/start|control\/command)$/.test(
      path,
    );
  if (method !== "GET" && tracked) pending.set(signature, key);
  let response!: Response, result: any;
  for (let attempt = 0; attempt < 3; attempt++) {
    ({ response, result } = await withSlot(async () => {
      const response = await fetch(`/api/${path}`, {
        method,
        signal: AbortSignal.timeout(40000),
        headers: { "content-type": "application/json", "idempotency-key": key },
        ...(data === undefined ? {} : { body: JSON.stringify(data) }),
      });
      return { response, result: await response.json() };
    }));
    if (
      method !== "GET" ||
      ![429, 503].includes(response.status) ||
      attempt === 2
    )
      break;
    await new Promise((resolve) =>
      setTimeout(resolve, 1000 + Math.random() * 1000),
    );
  }
  if (!response.ok) {
    if (response.status < 500) pending.delete(signature);
    throw new Error(
      result.error?.message || `Request failed (${response.status})`,
    );
  }
  pending.delete(signature);
  return result;
}
export type Role = "search" | "data" | "evaluator";
export type ModelSummary = {
  id: string;
  owner: string;
  name: string;
  provider: string;
  endpoint: string;
  model: string;
  api_version?: string;
  shared: boolean;
  isDefault: boolean;
};
export type Conversation = {
  id: string;
  name: string;
  defaultName?: boolean;
  models: Partial<Record<Role, string>>;
};
