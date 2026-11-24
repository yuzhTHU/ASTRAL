"use client";

import Link from "next/link";
import { LanguageButton } from "@/components/language-button";
import { useUiLanguage } from "@/components/ui-language";

export default function NotFound() {
  const en = useUiLanguage() === "en";
  return (
    <div className="account-surface">
      <div className="account-language">
        <LanguageButton />
      </div>
      <main className="account">
        <h1>404</h1>
        <p>{en ? "Page not found." : "找不到此页面。"}</p>
        <Link href="/">{en ? "Back to workbench" : "返回工作台"}</Link>
      </main>
    </div>
  );
}
