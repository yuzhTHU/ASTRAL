"use client";
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
  Space,
  Tag,
  Typography,
} from "antd";
import {
  ExperimentOutlined,
  SaveOutlined,
  UndoOutlined,
} from "@ant-design/icons";
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

export function ToolConfigurationPage({
  embedded = false,
}: {
  embedded?: boolean;
}) {
  return embedded ? (
    <ToolConfigurationContent embedded />
  ) : (
    <ManagementSurface>
      <div className="admin-standalone">
        <Button href="/">← 返回科研工作台 / Workbench</Button>
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
  const [tools, setTools] = useState<Tool[]>([]),
    [scope, setScope] = useState("global"),
    [administrator, setAdministrator] = useState(false),
    [initialized, setInitialized] = useState(false),
    [role, setRole] = useState("data"),
    [tool, setTool] = useState("web_fetch"),
    [record, setRecord] = useState<Configuration | null>(null),
    [draft, setDraft] = useState<Record<string, any>>({}),
    [message, setMessage] = useState(""),
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
    builtin: "内置默认值 / Built-in defaults",
    global: "全局默认值 / Global defaults",
    agent: "Agent 覆盖 / Agent override",
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
      .catch((e) => setMessage(String(e)));
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
    setMessage("");
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
        if (active) setMessage(String(e));
      });
    return () => {
      active = false;
    };
  }, [path, scope, initialized, tool, role, embedded]);
  async function save() {
    if (!record || !canEdit) return;
    setBusy(true);
    setMessage("");
    try {
      const value = await api<Configuration>(path, "PUT", {
        settings: draft,
        expected_revision: record.revision,
      });
      setRecord(value);
      setDraft(value.settings);
      setDirty(false);
      setMessage("配置已保存，从下一次工具调用生效 / Saved");
      setTestResult(null);
    } catch (e) {
      setMessage(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="admin-page tool-configuration-page">
      <div
        className="admin-page-heading"
        style={embedded ? undefined : { marginTop: 24 }}
      >
        <div>
          <Typography.Title level={2}>
            工具配置 / Tool configuration
          </Typography.Title>
          <p>全局默认值统一生效，按需为 Agent 类型单独覆盖。</p>
        </div>
        <Tag color={administrator ? "blue" : "default"}>
          {administrator ? "管理员 / Administrator" : "只读 / Read only"}
        </Tag>
      </div>
      <Alert
        className="admin-notice"
        type="info"
        showIcon
        title="Agent 覆盖 → 全局默认值 → 内置默认值"
        description="CLI 与本页面使用同一套 Harness 配置。代理地址从 Harness 中访问，支持不含认证信息的 HTTP/HTTPS 代理。"
      />
      {initialized && !administrator && (
        <Alert
          className="admin-notice"
          type="warning"
          showIcon
          title="全局默认值和 Agent 类型覆盖由管理员统一管理。"
        />
      )}
      <Card style={{ marginBottom: 24 }}>
        <Row gutter={[20, 16]}>
          <Col xs={24} md={8}>
            <Form.Item
              label="配置范围 / Scope"
              layout="vertical"
              style={{ margin: 0 }}
            >
              <Select
                virtual={false}
                aria-label="Configuration scope"
                value={scope}
                disabled={busy || !initialized}
                style={{ width: "100%" }}
                onChange={setScope}
                options={[
                  { value: "global", label: "全局默认值 / Global defaults" },
                  { value: "agent", label: "Agent 覆盖 / Agent override" },
                ]}
              />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item
              label="工具 / Tool"
              layout="vertical"
              style={{ margin: 0 }}
            >
              <Select
                virtual={false}
                aria-label="Configurable tool"
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
              <Form.Item label="Agent" layout="vertical" style={{ margin: 0 }}>
                <Select
                  virtual={false}
                  aria-label="Configuration agent"
                  value={role}
                  disabled={busy || !initialized}
                  style={{ width: "100%" }}
                  onChange={setRole}
                  options={[
                    { value: "data", label: "数据准备 / Data preparation" },
                    { value: "evaluator", label: "Evaluator" },
                    { value: "search", label: "符号回归 / Search" },
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
          type={
            message.includes("Saved") || message.includes("restored")
              ? "success"
              : "error"
          }
          showIcon
          title={<span role="status">{message}</span>}
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
              title="网络配置 / Network settings"
              extra={
                <Tag>
                  Revision{" "}
                  <span data-testid="configuration-revision">
                    {record.revision}
                  </span>
                </Tag>
              }
            >
              <Typography.Paragraph type="secondary">
                {definition.description}
              </Typography.Paragraph>
              <Typography.Paragraph data-testid="configuration-source">
                当前生效来源 / Source:{" "}
                <Tag color="blue">{sourceNames[record.source]}</Tag>
              </Typography.Paragraph>
              <Form
                layout="vertical"
                onFinish={save}
                disabled={busy || !canEdit}
              >
                {Object.entries(definition.configuration_schema.properties).map(
                  ([name, property]) => {
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
                        label={property.title || name}
                        extra={property.description}
                      >
                        {property.enum ? (
                          <Select
                            virtual={false}
                            aria-label={name}
                            value={draft[name] ?? ""}
                            onChange={change}
                            options={property.enum.map((value) => ({
                              value,
                              label: value,
                            }))}
                          />
                        ) : property.type === "number" ? (
                          <InputNumber
                            aria-label={name}
                            min={property.minimum}
                            max={property.maximum}
                            value={draft[name]}
                            onChange={change}
                            style={{ width: "100%" }}
                          />
                        ) : (
                          <Input
                            aria-label={name}
                            type={isProxy ? "url" : "text"}
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
                <Space wrap>
                  <Button
                    type="primary"
                    icon={<SaveOutlined aria-hidden />}
                    htmlType="submit"
                    loading={busy}
                  >
                    保存配置 / Save configuration
                  </Button>
                  <Button
                    icon={<UndoOutlined aria-hidden />}
                    disabled={busy || !canEdit || !record.overridden}
                    onClick={async () => {
                      setBusy(true);
                      setMessage("");
                      try {
                        const value = await api<Configuration>(
                          `${path}?expected_revision=${record.revision}`,
                          "DELETE",
                        );
                        setRecord(value);
                        setDraft(value.settings);
                        setDirty(false);
                        setTestResult(null);
                        setMessage(
                          "已恢复继承默认配置 / Inherited defaults restored",
                        );
                      } catch (e) {
                        setMessage(String(e));
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    {scope === "global"
                      ? "恢复内置默认值 / Reset defaults"
                      : "取消覆盖，使用上级默认值 / Inherit defaults"}
                  </Button>
                </Space>
              </Form>
            </Card>
          </Col>
          <Col xs={24} xl={10}>
            <Card
              title={
                <Space>
                  <ExperimentOutlined aria-hidden />
                  连接测试 / Connection test
                </Space>
              }
            >
              <Typography.Paragraph type="secondary">
                测试已保存的配置，不会启动 Agent 或调用大模型。
              </Typography.Paragraph>
              <Form layout="vertical">
                <Form.Item
                  label={
                    tool === "web_fetch"
                      ? "公开页面地址 / Public URL"
                      : "搜索词 / Query"
                  }
                >
                  <Input
                    aria-label="Tool test target"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                  />
                </Form.Item>
              </Form>
              <Button
                type="primary"
                ghost
                icon={<ExperimentOutlined aria-hidden />}
                disabled={busy || dirty || !url.trim() || !canEdit}
                loading={busy}
                onClick={async () => {
                  setBusy(true);
                  setMessage("");
                  try {
                    setTestResult(
                      await api(
                        path + "/test",
                        "POST",
                        tool === "web_fetch" ? { url } : { query: url },
                      ),
                    );
                  } catch (e) {
                    setMessage(String(e));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                测试已保存配置 / Test saved configuration
              </Button>
              {dirty && (
                <Alert
                  style={{ marginTop: 16 }}
                  type="warning"
                  showIcon
                  title="请先保存修改，再测试连接。"
                />
              )}
              {testResult && (
                <Alert
                  style={{ marginTop: 16 }}
                  type={testResult.ok ? "success" : "error"}
                  showIcon
                  title={
                    <span role="status" data-testid="tool-test-result">
                      {testResult.ok ? "连接成功" : "连接失败"} ·{" "}
                      {testResult.message} · revision{" "}
                      {testResult.configuration_revision}
                    </span>
                  }
                />
              )}
            </Card>
          </Col>
        </Row>
      )}
    </main>
  );
}
