"use client";
import { LocalizedForm } from "./localized-form";
import { useManagementText, NoticeText, type Notice } from "./management-text";
import { useState } from "react";
import { api, type ModelSummary } from "@/lib/client";
const initial = {
  name: "",
  provider: "openrouter",
  model: "",
  endpoint: "",
  api_key: "",
  api_version: "",
  shared: false,
  isDefault: false,
};
export function ModelManager({
  models,
  admin,
  refresh,
}: {
  models: ModelSummary[];
  admin: boolean;
  refresh: () => Promise<void>;
}) {
  const t = useManagementText();
  const [form, setForm] = useState(initial),
    [editing, setEditing] = useState(""),
    [notice, setNotice] = useState<Notice | null>(null);
  return (
    <section>
      <h2>{t("模型配置", "Model configurations")}</h2>
      <p>
        {t(
          "密钥和端点地址配套使用。个人配置失败时不会切换到共享账户。",
          "Keys and endpoints are used together. If a personal configuration fails, the platform will not switch to a shared account.",
        )}
      </p>
      {models.map((m) => (
        <article className="card" key={m.id}>
          <strong>{m.name}</strong>
          <span>
            {m.provider === "compatible"
              ? t("兼容接口", "Compatible API")
              : m.provider}{" "}
            · {m.model} {m.shared ? ` · ${t("共享", "Shared")}` : ""}{" "}
            {m.isDefault ? " ★" : ""}
          </span>
          <small>{m.endpoint}</small>
          <button
            disabled={m.shared && !admin}
            onClick={() => {
              setEditing(m.id);
              setForm({
                ...initial,
                ...m,
                api_key: "",
                api_version: m.api_version || "",
              });
            }}
          >
            {t("编辑", "Edit")}
          </button>
          <button
            disabled={m.shared && !admin}
            onClick={async () => {
              try {
                await api(`models/${m.id}`, "DELETE");
                await refresh();
              } catch (e) {
                setNotice({ error: String(e) });
              }
            }}
          >
            {t("删除", "Delete")}
          </button>
        </article>
      ))}
      <LocalizedForm
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await api(
              editing ? `models/${editing}` : "models",
              editing ? "PUT" : "POST",
              {
                ...form,
                api_key: form.api_key || undefined,
                api_version: form.api_version || undefined,
              },
            );
            setForm(initial);
            setEditing("");
            await refresh();
            setNotice({ success: "saved" });
          } catch (e) {
            setNotice({ error: String(e) });
          }
        }}
      >
        <h3>
          {editing
            ? t("编辑配置", "Edit configuration")
            : t("新增配置", "Add configuration")}
        </h3>
        <label>
          {t("名称", "Name")}
          <input
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </label>
        <label>
          {t("供应商", "Provider")}
          <select
            value={form.provider}
            onChange={(e) => setForm({ ...form, provider: e.target.value })}
          >
            {[
              "openrouter",
              "compatible",
              "azure",
              "openai",
              "deepseek",
              "siliconflow",
              "gemini",
              "lmstudio",
            ].map((p) => (
              <option key={p} value={p}>
                {p === "compatible" ? t("兼容接口", "Compatible API") : p}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("模型", "Model")}
          <input
            required
            value={form.model}
            onChange={(e) => setForm({ ...form, model: e.target.value })}
          />
        </label>
        <label>
          {t("端点地址", "Endpoint")}
          <input
            type="url"
            value={form.endpoint}
            onChange={(e) => setForm({ ...form, endpoint: e.target.value })}
          />
        </label>
        <label>
          {t("API 密钥", "API Key")}
          <input
            type="password"
            autoComplete="off"
            required={!editing}
            placeholder={
              editing ? t("留空保留", "Leave empty to keep current key") : ""
            }
            value={form.api_key}
            onChange={(e) => setForm({ ...form, api_key: e.target.value })}
          />
        </label>
        {form.provider === "azure" && (
          <label>
            {t("API 版本", "API Version")}
            <input
              value={form.api_version}
              onChange={(e) =>
                setForm({ ...form, api_version: e.target.value })
              }
            />
          </label>
        )}
        {admin && (
          <label>
            <input
              type="checkbox"
              checked={form.shared}
              onChange={(e) => setForm({ ...form, shared: e.target.checked })}
            />
            {t("发布为共享配置", "Shared")}
          </label>
        )}
        <label>
          <input
            type="checkbox"
            checked={form.isDefault}
            onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
          />
          {t("默认配置", "Default")}
        </label>
        <button className="primary">{t("保存", "Save")}</button>
        <button
          type="button"
          onClick={() => {
            setEditing("");
            setForm(initial);
          }}
        >
          {t("取消", "Cancel")}
        </button>
        <p role="status">{notice && <NoticeText notice={notice} />}</p>
      </LocalizedForm>
    </section>
  );
}
