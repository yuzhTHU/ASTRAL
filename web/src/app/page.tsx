"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, type ModelSummary } from "@/lib/client";
import { AccountForm } from "@/components/accounts";
import { ModelManager } from "@/components/models";
import { ResearchWorkspace } from "@/components/research/workspace";
import { localizedError, useUiLanguage } from "@/components/ui-language";
import { LanguageButton } from "@/components/language-button";

export default function Page() {
  const language = useUiLanguage();
  const en = language === "en";
  const [user, setUser] = useState<any>(null),
    [ready, setReady] = useState(false),
    [models, setModels] = useState<ModelSummary[]>([]),
    [error, setError] = useState(""),
    [management, setManagement] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    api("auth/me")
      .then(setUser)
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);
  const refresh = useCallback(async () => {
    setModels((await api("models")).models);
  }, []);
  useEffect(() => {
    if (user) refresh().catch((e) => setError(String(e)));
  }, [user, refresh]);
  function manage() {
    setManagement(true);
    dialog.current?.showModal();
    refresh().catch((e) => setError(String(e)));
  }
  function openSettings() {
    if (user?.role === "admin") location.assign("/admin");
    else manage();
  }
  if (!ready)
    return (
      <div
        className="account-surface"
        data-theme={
          typeof document === "undefined"
            ? "light"
            : document.documentElement.dataset.theme || "light"
        }
      >
        <main>{en ? "Loading…" : "正在加载…"}</main>
      </div>
    );
  if (!user)
    return (
      <div
        className="account-surface"
        data-theme={
          typeof document === "undefined"
            ? "light"
            : document.documentElement.dataset.theme || "light"
        }
      >
        <div className="account-language">
          <LanguageButton />
        </div>
        <AccountForm onLogin={setUser} en={en} />
      </div>
    );
  return (
    <>
      <ResearchWorkspace
        manage={manage}
        openSettings={openSettings}
        username={user.username}
      />
      <dialog
        ref={dialog}
        className="account-dialog"
        onClose={() => setManagement(false)}
      >
        {management && (
          <div
            className="account-surface"
            data-theme={
              typeof document === "undefined"
                ? "light"
                : document.documentElement.dataset.theme || "light"
            }
          >
            <button
              className="account-dialog-close"
              aria-label={en ? "Close account settings" : "关闭账号设置"}
              onClick={() => dialog.current?.close()}
            >
              ×
            </button>
            <nav aria-label={en ? "Account settings" : "账号设置"}>
              <button>{en ? "Models" : "模型配置"}</button>
              <a href="/tools" target="_blank" rel="noopener noreferrer">
                {en ? "Tools" : "工具配置"}
              </a>
              {user.role === "admin" && (
                <a
                  href="/admin/discovery-tasks"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {en ? "Sample tasks" : "样例任务"}
                </a>
              )}
              {user.role === "admin" && (
                <a href="/admin" target="_blank" rel="noopener noreferrer">
                  {en ? "Admin" : "管理"}
                </a>
              )}
              <span>{user.username}</span>
              <button
                onClick={async () => {
                  await api("auth/logout", "POST", {});
                  location.reload();
                }}
              >
                {en ? "Sign out" : "退出"}
              </button>
            </nav>
            {error && <p role="alert">{localizedError(error, language)}</p>}
            <ModelManager
              models={models}
              admin={user.role === "admin"}
              refresh={refresh}
            />
          </div>
        )}
      </dialog>
    </>
  );
}
