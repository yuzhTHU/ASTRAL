"use client";
import { LocalizedForm } from "./localized-form";
import { LanguageButton } from "./language-button";
import { localizedError, useUiLanguage } from "./ui-language";
import {
  useManagementText,
  type ManagementTranslator,
} from "./management-text";
import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Col,
  Form,
  Input,
  InputNumber,
  Row,
  Select,
  Skeleton,
  Flex,
  Tag,
  Typography,
} from "antd";
import {
  DownOutlined,
  UpOutlined,
  ExperimentOutlined,
  SaveOutlined,
  UndoOutlined,
} from "@ant-design/icons";
import { capabilityDescription } from "./research/capability-descriptions";
import { ManagementSurface } from "./management-surface";
import { api } from "@/lib/client";
import type { components } from "@/lib/harness-schema";

type Configuration = components["schemas"]["ToolConfigurationRecord"];
type Property = {
  type: string | string[];
  title?: string;
  description?: string;
  enum?: string[];
  minimum?: number;
  maximum?: number;
  maxLength?: number;
};
type Tool = {
  name: string;
  description: string;
  defaults: Record<string, unknown>;
  configuration_schema: { properties: Record<string, Property> };
};

// Catalog identifiers and submitted enum values stay stable across languages.
function propertyTitle(
  name: string,
  property: Property,
  t: ManagementTranslator,
) {
  switch (name) {
    case "timeout_seconds":
      return t("请求超时（秒）", "Timeout (seconds)");
    case "proxy_mode":
      return t("连接方式", "Connection");
    case "proxy_url":
      return t("代理地址", "Proxy URL");
    default:
      return property.title || name;
  }
}
function connectionDetail(message: string, t: ManagementTranslator) {
  switch (message) {
    case "Connection succeeded":
      return t("连接成功", message);
    case "Target blocked access":
      return t("目标网站拒绝访问", message);
    case "Connection failed; check proxy, timeout and public target URL":
      return t("连接失败，请检查代理、超时设置和目标公网地址", message);
    default:
      return message;
  }
}
export function ToolConfigurationPage({
  embedded = false,
}: {
  embedded?: boolean;
}) {
  const t = useManagementText();
  return embedded ? (
    <ToolConfigurationContent embedded />
  ) : (
    <ManagementSurface>
      <div className="admin-standalone">
        <Flex gap="small" align="center">
          <Button href="/">{t("← 返回科研工作台", "← Workbench")}</Button>
          <LanguageButton />
        </Flex>
        <ToolConfigurationContent />
      </div>
    </ManagementSurface>
  );
}

function ToolConfigurationContent({
  embedded = false,
}: {
  embedded?: boolean;
}) {
  const t = useManagementText();
  const lang = useUiLanguage();
  const [tools, setTools] = useState<Tool[]>([]),
    [scope, setScope] = useState("global"),
    [administrator, setAdministrator] = useState(false),
    [initialized, setInitialized] = useState(false),
    [role, setRole] = useState("data"),
    [tool, setTool] = useState("web_fetch"),
    [record, setRecord] = useState<Configuration | null>(null),
    [draft, setDraft] = useState<Record<string, any>>({}),
    [message, setMessage] = useState<
      "saved" | "restored" | { error: string } | null
    >(null),
    [busy, setBusy] = useState(false),
    [url, setUrl] = useState("https://example.com"),
    [dirty, setDirty] = useState(false),
    [testResult, setTestResult] = useState<any>(null);
  const definition = tools.find((t) => t.name === tool);
  const path =
    scope === "global"
      ? `tool-configurations/${tool}`
      : `agents/${role}/tool-configurations/${tool}`;
  const canEdit = administrator;
  const sourceNames = {
    builtin: t("内置默认值", "Built-in defaults"),
    global: t("全局默认值", "Global defaults"),
    agent: t("Agent 专用设置", "Agent-specific settings"),
  };
  useEffect(() => {
    Promise.all([api("tool-catalog"), api("auth/me")])
      .then(([catalog, user]) => {
        const selection = new URLSearchParams(location.search);
        const savedScope = selection.get("scope");
        if (savedScope && ["global", "agent"].includes(savedScope))
          setScope(savedScope);
        const savedRole = selection.get("role");
        if (savedRole && ["data", "evaluator", "search"].includes(savedRole))
          setRole(savedRole);
        const savedTool = selection.get("tool");
        if (catalog.tools.some((t: Tool) => t.name === savedTool))
          setTool(savedTool!);
        setAdministrator(user.role === "admin");
        setTools(catalog.tools);
        setInitialized(true);
      })
      .catch((e) => setMessage({ error: String(e) }));
  }, []);
  useEffect(() => {
    if (!initialized) return;
    const selection = new URLSearchParams({ scope, tool });
    if (scope !== "global") {
      selection.set("role", role);
    }
    history.replaceState(
      null,
      "",
      `${embedded ? "/admin/tools" : "/tools"}?${selection}`,
    );
    setRecord(null);
    let active = true;
    setMessage(null);
    setTestResult(null);
    api<Configuration>(path)
      .then((value) => {
        if (active) {
          setRecord(value);
          setDraft(value.settings);
          setDirty(false);
        }
      })
      .catch((e) => {
        if (active) setMessage({ error: String(e) });
      });
    return () => {
      active = false;
    };
  }, [path, scope, initialized, tool, role, embedded]);
  async function save() {
    if (!record || !canEdit) return;
    setBusy(true);
    setMessage(null);
    try {
      const value = await api<Configuration>(path, "PUT", {
        settings: draft,
        expected_revision: record.revision,
      });
      setRecord(value);
      setDraft(value.settings);
      setDirty(false);
      setMessage("saved");
      setTestResult(null);
    } catch (e) {
      setMessage({ error: String(e) });
    } finally {
      setBusy(false);
    }
  }
  const PageRegion = embedded ? "section" : "main";
  return (
    <PageRegion
      className="admin-page tool-configuration-page"
      aria-labelledby="tool-settings-title"
    >
      <header
        className="admin-page-heading"
        style={embedded ? undefined : { marginTop: 24 }}
      >
        <Typography.Title id="tool-settings-title" level={1}>
          {t("工具配置", "Tool configuration")}
        </Typography.Title>
        {initialized && !canEdit && (
          <Typography.Text type="secondary">
            {t(
              "只读。修改配置和测试连接需要管理员权限。",
              "Read only. An administrator can edit settings and test connections.",
            )}
          </Typography.Text>
        )}
      </header>
      <Card style={{ marginBottom: 24 }}>
        <Row gutter={[20, 16]}>
          <Col xs={24} md={8}>
            <Form.Item
              htmlFor="tool-settings-scope"
              label={t("配置范围", "Scope")}
              extra={
                scope === "global"
                  ? t(
                      "没有全局设置时，使用工具内置值。",
                      "The tool uses its built-in defaults until you set global defaults.",
                    )
                  : t(
                      "单独保存的设置优先于全局默认值。",
                      "Settings saved for this agent override the global defaults.",
                    )
              }
              layout="vertical"
              style={{ margin: 0 }}
            >
              <Select
                virtual={false}
                id="tool-settings-scope"
                aria-label={t("配置范围", "Configuration scope")}
                value={scope}
                disabled={busy || !initialized}
                style={{ width: "100%" }}
                onChange={setScope}
                options={[
                  {
                    value: "global",
                    label: t("全局默认值", "Global defaults"),
                  },
                  {
                    value: "agent",
                    label: t("Agent 专用设置", "Agent-specific settings"),
                  },
                ]}
              />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item
              htmlFor="tool-settings-tool"
              label={t("工具", "Tool")}
              extra={definition && capabilityDescription(definition, lang)}
              layout="vertical"
              style={{ margin: 0 }}
            >
              <Select
                virtual={false}
                id="tool-settings-tool"
                aria-label={t("可配置工具", "Configurable tool")}
                value={tool}
                disabled={busy || !initialized}
                style={{ width: "100%" }}
                onChange={setTool}
                options={tools.map((t) => ({ value: t.name, label: t.name }))}
              />
            </Form.Item>
          </Col>
          {scope === "agent" && (
            <Col xs={24} md={8}>
              <Form.Item
                htmlFor="tool-settings-agent"
                label="Agent"
                layout="vertical"
                style={{ margin: 0 }}
              >
                <Select
                  virtual={false}
                  id="tool-settings-agent"
                  aria-label={t("配置的 Agent", "Configuration agent")}
                  value={role}
                  disabled={busy || !initialized}
                  style={{ width: "100%" }}
                  onChange={setRole}
                  options={[
                    { value: "data", label: t("数据准备", "Data preparation") },
                    { value: "evaluator", label: t("评估器", "Evaluator") },
                    { value: "search", label: t("符号回归", "Search") },
                  ]}
                />
              </Form.Item>
            </Col>
          )}
        </Row>
      </Card>
      {message && (
        <Alert
          className="admin-notice"
          type={typeof message === "string" ? "success" : "error"}
          showIcon
          title={
            <span role="status">
              {message === "saved"
                ? t(
                    "配置已保存，从下一次工具调用生效",
                    "Saved. Changes take effect on the next tool call.",
                  )
                : message === "restored"
                  ? t("已恢复默认设置", "Defaults restored")
                  : localizedError(message.error, lang)}
            </span>
          }
        />
      )}
      {!definition || !record ? (
        <Card>
          <Skeleton active />
        </Card>
      ) : (
        <Row gutter={[24, 24]}>
          <Col xs={24} xl={14}>
            <Card
              title={t("网络配置", "Network settings")}
              extra={
                <Tag>
                  {t("版本", "Revision")}{" "}
                  <span data-testid="configuration-revision">
                    {record.revision}
                  </span>
                </Tag>
              }
            >
              <Typography.Paragraph data-testid="configuration-source">
                {t("当前使用：", "Using: ")}
                <Tag color="blue">{sourceNames[record.source]}</Tag>
              </Typography.Paragraph>
              <Form
                component={LocalizedForm}
                layout="vertical"
                onFinish={save}
                disabled={busy || !canEdit}
              >
                {Object.entries(definition.configuration_schema.properties).map(
                  ([name, property]) => {
                    const label = propertyTitle(name, property, t);
                    const fieldId = `tool-setting-${name}`;
                    const isProxy = name === "proxy_url";
                    const change = (value: unknown) => {
                      setDraft((old) => ({
                        ...old,
                        [name]: value,
                        ...(name === "proxy_mode" && value === "direct"
                          ? { proxy_url: null }
                          : {}),
                      }));
                      setDirty(true);
                      setTestResult(null);
                    };
                    return (
                      <Form.Item
                        key={name}
                        htmlFor={fieldId}
                        label={label}
                        extra={
                          isProxy
                            ? draft.proxy_mode === "custom" &&
                              t(
                                "填写 Harness 服务器可访问的 HTTP 或 HTTPS 代理地址，只含协议、主机和可选端口。",
                                "Enter an HTTP or HTTPS proxy reachable from the Harness server. Include only the scheme, host and optional port.",
                              )
                            : property.description
                        }
                      >
                        {property.enum ? (
                          <Select
                            virtual={false}
                            id={fieldId}
                            aria-label={label}
                            value={draft[name] ?? ""}
                            onChange={change}
                            options={property.enum.map((value) => ({
                              value,
                              label:
                                value === "direct"
                                  ? t("直接连接", "Direct connection")
                                  : value === "custom"
                                    ? t("自定义代理", "Custom proxy")
                                    : value,
                            }))}
                          />
                        ) : property.type === "number" ? (
                          <InputNumber
                            id={fieldId}
                            aria-label={label}
                            controls={{
                              upIcon: <UpOutlined aria-hidden />,
                              downIcon: <DownOutlined aria-hidden />,
                            }}
                            // The stepper buttons have hard-coded English names in rc-input-number.
                            ref={(control) => {
                              const stepper = control?.nativeElement;
                              stepper
                                ?.querySelector(".ant-input-number-action-up")
                                ?.setAttribute(
                                  "aria-label",
                                  t("增大数值", "Increase value"),
                                );
                              stepper
                                ?.querySelector(".ant-input-number-action-down")
                                ?.setAttribute(
                                  "aria-label",
                                  t("减小数值", "Decrease value"),
                                );
                            }}
                            min={property.minimum}
                            max={property.maximum}
                            value={draft[name]}
                            onChange={change}
                            style={{ width: "100%" }}
                          />
                        ) : (
                          <Input
                            id={fieldId}
                            aria-label={label}
                            type={isProxy ? "url" : "text"}
                            placeholder={
                              isProxy && draft.proxy_mode === "custom"
                                ? "https://proxy.example.org:8080"
                                : undefined
                            }
                            disabled={
                              busy ||
                              !canEdit ||
                              (isProxy && draft.proxy_mode !== "custom")
                            }
                            required={isProxy && draft.proxy_mode === "custom"}
                            maxLength={property.maxLength}
                            value={draft[name] ?? ""}
                            onChange={(e) => change(e.target.value || null)}
                          />
                        )}
                      </Form.Item>
                    );
                  },
                )}
                <Flex gap="small" align="center" wrap>
                  <Button
                    type="primary"
                    icon={<SaveOutlined aria-hidden />}
                    htmlType="submit"
                    loading={busy}
                  >
                    {t("保存配置", "Save configuration")}
                  </Button>
                  <Button
                    icon={<UndoOutlined aria-hidden />}
                    disabled={busy || !canEdit || !record.overridden}
                    onClick={async () => {
                      setBusy(true);
                      setMessage(null);
                      try {
                        const value = await api<Configuration>(
                          `${path}?expected_revision=${record.revision}`,
                          "DELETE",
                        );
                        setRecord(value);
                        setDraft(value.settings);
                        setDirty(false);
                        setTestResult(null);
                        setMessage("restored");
                      } catch (e) {
                        setMessage({ error: String(e) });
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    {scope === "global"
                      ? t("恢复内置默认值", "Reset defaults")
                      : t("清除专用设置", "Clear agent settings")}
                  </Button>
                </Flex>
              </Form>
            </Card>
          </Col>
          <Col xs={24} xl={10}>
            <Card
              title={
                <Flex gap="small" align="center">
                  <ExperimentOutlined aria-hidden />
                  {t("连接测试", "Connection test")}
                </Flex>
              }
            >
              <Typography.Paragraph type="secondary">
                {t(
                  "测试使用已保存的配置，不会启动 Agent 或调用模型。",
                  "Tests use the saved settings without starting an agent or calling a model.",
                )}
              </Typography.Paragraph>
              <Form.Item
                layout="vertical"
                htmlFor="tool-test-target"
                label={
                  tool === "web_fetch"
                    ? t("公开页面地址", "Public URL")
                    : t("搜索词", "Query")
                }
              >
                <Input
                  id="tool-test-target"
                  aria-label={t("测试目标", "Tool test target")}
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
              </Form.Item>
              <Button
                type="primary"
                ghost
                icon={<ExperimentOutlined aria-hidden />}
                disabled={busy || dirty || !url.trim() || !canEdit}
                loading={busy}
                onClick={async () => {
                  setBusy(true);
                  setMessage(null);
                  try {
                    setTestResult(
                      await api(
                        path + "/test",
                        "POST",
                        tool === "web_fetch" ? { url } : { query: url },
                      ),
                    );
                  } catch (e) {
                    setMessage({ error: String(e) });
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {t("测试连接", "Test connection")}
              </Button>
              {dirty && (
                <Alert
                  style={{ marginTop: 16 }}
                  type="warning"
                  showIcon
                  title={t(
                    "先保存修改，再测试连接。",
                    "Save your changes before testing.",
                  )}
                />
              )}
              {testResult && (
                <Alert
                  style={{ marginTop: 16 }}
                  type={testResult.ok ? "success" : "error"}
                  showIcon
                  title={
                    <span role="status" data-testid="tool-test-result">
                      {connectionDetail(testResult.message, t)} ·{" "}
                      {t("版本", "revision")}{" "}
                      {testResult.configuration_revision}
                    </span>
                  }
                />
              )}
            </Card>
          </Col>
        </Row>
      )}
    </PageRegion>
  );
}
