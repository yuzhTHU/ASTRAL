"use client";

import { setUiLanguage, useUiLanguage } from "./ui-language";

export function LanguageButton() {
  const en = useUiLanguage() === "en";
  const title = en ? "切换到中文" : "Switch to English";
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      lang={en ? "zh-CN" : "en"}
      onClick={() => setUiLanguage(en ? "zh" : "en")}
    >
      {en ? "中" : "EN"}
    </button>
  );
}
