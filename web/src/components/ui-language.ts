"use client";

import { useSyncExternalStore } from "react";
import { flushSync } from "react-dom";

export type UiLanguage = "zh" | "en";
const preference = "sr-harness-language";
const changed = "astral-ui-language-change";
const defaultLanguage = (): UiLanguage => "zh";

export function getUiLanguage(): UiLanguage {
  if (typeof window === "undefined") return defaultLanguage();
  return window.localStorage.getItem(preference) === "en" ? "en" : "zh";
}

// The workbench and its same-origin viewer subscribe to the same event target.
// Native storage events deliver the preference to separate tabs.
function eventTarget(): Window {
  try {
    if (window.parent.location.origin === window.location.origin)
      return window.parent;
  } catch {
    // An independently embedded page can still toggle its own language.
  }
  return window;
}

function documentLanguage(language: UiLanguage) {
  const tag = language === "en" ? "en" : "zh-CN";
  if (document.documentElement.lang === tag) return;
  document.documentElement.lang = tag;
  const description = document.querySelector<HTMLMetaElement>(
    'meta[name="description"]',
  );
  if (description)
    description.content =
      language === "en"
        ? "Human–AI interactive astronomy discovery"
        : "人机交互天文发现平台";
}

export function setUiLanguage(language: UiLanguage) {
  window.localStorage.setItem(preference, language === "en" ? "en" : "zh-CN");
  documentLanguage(language);
  // Commit React menus and forms in the same click as the imperative workbench.
  flushSync(() => eventTarget().dispatchEvent(new Event(changed)));
}

export function subscribeUiLanguage(notify: (language: UiLanguage) => void) {
  const target = eventTarget();
  let current = getUiLanguage();
  documentLanguage(current);
  function update() {
    const next = getUiLanguage();
    if (current === next) return;
    current = next;
    documentLanguage(next);
    notify(next);
  }
  function onStorage(event: StorageEvent) {
    if (
      event.storageArea === window.localStorage &&
      (event.key === preference || event.key === null)
    )
      update();
  }
  target.addEventListener(changed, update);
  window.addEventListener("storage", onStorage);
  return () => {
    target.removeEventListener(changed, update);
    window.removeEventListener("storage", onStorage);
  };
}

export function useUiLanguage() {
  return useSyncExternalStore(
    subscribeUiLanguage,
    getUiLanguage,
    defaultLanguage,
  );
}

const errors: Record<string, string> = {
  "Invalid username or password": "用户名或密码错误",
  "Username must be 3–64 characters; password must be 12–1024 characters":
    "用户名须为 3 至 64 个字符，密码须为 12 至 1024 个字符",
  "Username is unavailable": "用户名不可用",
  "Account unavailable": "账号不可用",
  "Please sign in": "请先登录",
  "Registration is closed": "注册已关闭",
  "Invitation is invalid or expired": "邀请无效或已过期",
  "Administrator access required": "需要管理员权限",
  "Only ordinary user accounts may be changed here": "这里只能修改普通用户账号",
  "Only administrators can publish shared configurations":
    "只有管理员可以发布共享配置",
  "Only administrators can change or test shared tool configurations":
    "只有管理员可以更改或测试共享工具配置",
  "Endpoint must use HTTP or HTTPS": "端点地址必须使用 HTTP 或 HTTPS",
  "An API key is required": "请输入 API 密钥",
  "Azure requires endpoint and API version": "Azure 需要端点地址和 API 版本",
  "Model configuration not found": "找不到模型配置",
  "Model not found": "找不到模型",
  "Select or configure a model first": "请先选择或配置模型",
  "Conversation not found": "找不到会话",
  "Conversation is archived": "会话已归档",
  "Unable to create conversation": "无法创建会话",
  "Session creation is being reconciled; retry": "正在同步会话创建状态，请重试",
  "A valid idempotency key is required": "请求需要有效的幂等键",
  "Idempotency key required": "请求缺少幂等键",
  "Credential encryption key is not configured": "尚未配置凭据加密密钥",
  "Harness connection is not configured": "尚未配置 Harness 连接",
  "Harness capacity exceeded; retry shortly": "Harness 已满载，请稍后重试",
  "Harness is unavailable; check session state before retrying":
    "Harness 暂时不可用，请检查会话状态后重试",
  "Operation timed out; check state before retrying":
    "操作超时，请检查状态后重试",
  "context.data/manifest.json does not exist; prepare data first":
    "缺少 context.data/manifest.json，请先准备数据",
  "Too many attempts; retry later": "尝试次数过多，请稍后重试",
  "Untrusted request origin": "请求来源不受信任",
  "Invalid request fields": "请求字段无效",
  "Invalid JSON": "JSON 格式无效",
  "Operation failed; refresh and retry": "操作失败，请刷新后重试",
  "Concurrent update; refresh and retry": "数据已被更新，请刷新后重试",
  "Request too large": "请求内容过大",
  "Method not allowed": "请求方法不受支持",
  "Unknown operation": "未知操作",
  "Not found": "找不到请求的资源",
  "Failed to fetch": "网络请求失败",
  "Unknown configurable tool or agent": "未知的可配置工具或 Agent",
  "Tool configuration changed; reload before saving":
    "工具配置已更新，请重新加载后再保存",
  "Unknown tool configuration fields": "工具配置含有未知字段",
  "timeout_seconds must be between 0.1 and 120":
    "请求超时须在 0.1 到 120 秒之间",
  "proxy_mode must be direct or custom": "连接方式须为直连或自定义代理",
  "Direct connection must not specify a proxy URL":
    "直连模式下不能指定代理地址",
  "Proxy must be an HTTP/HTTPS address without credentials, path, query or fragment":
    "代理地址须使用 HTTP 或 HTTPS，且不能包含凭据、路径、查询参数或片段",
  "Data locations must be inside the shared sample data root":
    "数据位置须位于共享样例数据目录中",
  "Input basenames must be unique": "输入文件或目录的名称不能重复",
  "Overlapping data locations": "数据位置不能重叠",
  "Task catalog changed; reload before saving":
    "任务列表已更新，请重新加载后再保存",
  "Invalid task fields": "任务字段无效",
  "Configure readable data locations before enabling the task":
    "启用任务前请配置可读取的数据位置",
  "Task identifier already used": "任务标识已被使用",
  "Task identifier is immutable": "不能更改任务标识",
  "Task not found": "找不到任务",
  "Task not found or disabled": "任务不存在或已停用",
  "Order must contain every task exactly once":
    "排序必须包含所有任务，每个任务仅出现一次",
  "Load failed": "加载失败",
};

export function localizedError(error: unknown, language: UiLanguage): string {
  const message =
    error instanceof Error
      ? error.message
      : String(error).replace(/^Error: /, "");
  if (language === "en") return message;
  const harnessStatus = /^Harness operation failed \((\d+)\)$/.exec(message);
  if (harnessStatus) return `Harness 操作失败（${harnessStatus[1]}）`;
  const status = /^Request failed \((\d+)\)$/.exec(message);
  if (status) return `请求失败（${status[1]}）`;
  return Object.hasOwn(errors, message) ? errors[message] : message;
}
