"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, type ModelSummary } from "@/lib/client";
import { AccountForm } from "@/components/accounts";
import { ModelManager } from "@/components/models";
import { ResearchWorkspace } from "@/components/research/workspace";
export default function Page() {
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
        <main>Loading…</main>
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
        <AccountForm
          onLogin={setUser}
          en={
            typeof document !== "undefined" &&
            document.documentElement.lang === "en"
          }
        />
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
              aria-label="Close account settings"
              onClick={() => dialog.current?.close()}
            >
              ×
            </button>
            <nav aria-label="Account settings">
              <button>模型配置 / Models</button>
              <a href="/tools" target="_blank" rel="noopener noreferrer">
                工具配置 / Tools
              </a>
              {user.role === "admin" && (
                <a
                  href="/admin/discovery-tasks"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  样例任务 / Sample tasks
                </a>
              )}
              {user.role === "admin" && (
                <a href="/admin" target="_blank" rel="noopener noreferrer">
                  管理 / Admin
                </a>
              )}
              <span>{user.username}</span>
              <button
                onClick={async () => {
                  await api("auth/logout", "POST", {});
                  location.reload();
                }}
              >
                退出 / Sign out
              </button>
            </nav>
            {error && <p role="alert">{error}</p>}
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
