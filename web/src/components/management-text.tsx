"use client";

import { localizedError, useUiLanguage } from "./ui-language";

export type ManagementTranslator = (zh: string, en: string) => string;
const chinese: ManagementTranslator = (zh) => zh;
const english: ManagementTranslator = (_, en) => en;

export function useManagementText(): ManagementTranslator {
  return useUiLanguage() === "en" ? english : chinese;
}

// Imperative confirmations and Ant Design validation errors keep their React
// nodes after creation. Subscribe inside the node so open messages stay live.
export function LiveText({ zh, en }: { zh: string; en: string }) {
  return useManagementText()(zh, en);
}

export type Notice = { error: string } | { success: "saved" | "deleted" };
export function NoticeText({ notice }: { notice: Notice }) {
  const lang = useUiLanguage();
  if ("error" in notice) return localizedError(notice.error, lang);
  if (notice.success === "deleted") return lang === "en" ? "Deleted" : "已删除";
  return lang === "en" ? "Saved" : "已保存";
}
