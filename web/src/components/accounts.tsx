"use client";
import { LocalizedForm } from "./localized-form";
import { localizedError } from "./ui-language";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
export function AccountForm({
  onLogin,
  en,
}: {
  onLogin: (u: any) => void;
  en: boolean;
}) {
  const [register, setRegister] = useState(false),
    [mode, setMode] = useState("open"),
    [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [invitation, setInvitation] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    api("auth/mode")
      .then((r) => setMode(r.mode))
      .catch((e) => setError(e.message));
    setInvitation(new URLSearchParams(location.search).get("invitation") || "");
  }, []);
  return (
    <main className="account">
      <h1>
        ASTRAL<span>✦</span>
      </h1>
      <p>
        {en
          ? "Human–AI interactive astronomy discovery"
          : "人机交互天文发现平台"}
      </p>
      <LocalizedForm
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            if (register)
              await api("auth/register", "POST", {
                username,
                password,
                invitation,
              });
            onLogin(await api("auth/login", "POST", { username, password }));
          } catch (e) {
            setError(String(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <h2>
          {register
            ? en
              ? "Create account"
              : "创建账号"
            : en
              ? "Sign in"
              : "登录"}
        </h2>
        <label>
          {en ? "Username" : "用户名"}
          <input
            autoComplete="username"
            required
            minLength={3}
            maxLength={64}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </label>
        <label>
          {en ? "Password" : "密码"}
          <input
            type="password"
            autoComplete={register ? "new-password" : "current-password"}
            required
            minLength={register ? 12 : 1}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {register && mode === "invite" && (
          <label>
            {en ? "Invitation code" : "邀请码"}
            <input
              required
              value={invitation}
              onChange={(e) => setInvitation(e.target.value)}
            />
          </label>
        )}
        <button className="primary" disabled={busy}>
          {busy
            ? "…"
            : register
              ? en
                ? "Register"
                : "注册"
              : en
                ? "Sign in"
                : "登录"}
        </button>
        {error && (
          <p role="alert" className="error">
            {localizedError(error, en ? "en" : "zh")}
          </p>
        )}
        {mode !== "admin" && (
          <button
            type="button"
            className="link"
            onClick={() => setRegister(!register)}
          >
            {register
              ? en
                ? "Sign in"
                : "已有账号"
              : en
                ? "Register"
                : "注册账号"}
          </button>
        )}
      </LocalizedForm>
    </main>
  );
}
