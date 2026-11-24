"use client";

import { setUiLanguage, useUiLanguage } from "./ui-language";

export function LanguageButton({
  id,
  className,
}: {
  id?: string;
  className?: string;
}) {
  const en = useUiLanguage() === "en";
  const title = en ? "切换到中文" : "Switch to English";
  return (
    <button
      type="button"
      id={id}
      className={className}
      title={title}
      aria-label={title}
      lang={en ? "zh-CN" : "en"}
      onClick={() => setUiLanguage(en ? "zh" : "en")}
    >
      {en ? "中" : "EN"}
    </button>
  );
}
