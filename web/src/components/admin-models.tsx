"use client";
import {
  useManagementText,
  LiveText,
  NoticeText,
  type Notice,
} from "./management-text";

import { useEffect, useState } from "react";
import {
  Alert,
  App,
  Button,
  Card,
  Checkbox,
  Drawer,
  Form,
  Input,
  Select,
  Flex,
  Table,
  Tag,
  Typography,
} from "antd";
import {
  DeleteOutlined,
  PlusOutlined,
  ReloadOutlined,
  SaveOutlined,
} from "@ant-design/icons";
import { api, type ModelSummary } from "@/lib/client";

const providers = [
  "compatible",
  "openrouter",
  "openai",
  "azure",
  "deepseek",
  "siliconflow",
  "gemini",
  "lmstudio",
];
type ModelForm = {
  name: string;
  provider: string;
  model: string;
  endpoint: string;
  api_key: string;
  api_version: string;
  isDefault: boolean;
};
const initial: ModelForm = {
  name: "",
  provider: "compatible",
  model: "",
  endpoint: "",
  api_key: "",
  api_version: "",
  isDefault: false,
};

export function AdminModels() {
  const t = useManagementText();
  const { modal } = App.useApp();
  const [form] = Form.useForm<ModelForm>();
  const provider = Form.useWatch("provider", form);
  const [models, setModels] = useState<ModelSummary[]>([]);
  const [editing, setEditing] = useState<ModelSummary | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  async function refresh() {
    setLoading(true);
    try {
      setModels(
        (await api("models")).models.filter((m: ModelSummary) => m.shared),
      );
    } catch (e) {
      setNotice({ error: String(e) });
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  function edit(model: ModelSummary | null) {
    setEditing(model);
    setOpen(true);
    setDirty(false);
    setNotice(null);
    form.setFieldsValue({
      ...initial,
      ...model,
      api_key: "",
      api_version: model?.api_version || "",
    });
  }
  function close() {
    if (!dirty) {
      setOpen(false);
      return;
    }
    modal.confirm({
      title: <LiveText zh="放弃未保存的修改？" en="Discard changes?" />,
      okText: <LiveText zh="放弃修改" en="Discard" />,
      cancelText: <LiveText zh="继续编辑" en="Keep editing" />,
      onOk: () => {
        form.setFieldValue("api_key", "");
        setOpen(false);
        setDirty(false);
      },
    });
  }
  async function save(values: ModelForm) {
    setBusy(true);
    setNotice(null);
    try {
      await api(
        editing ? `models/${editing.id}` : "models",
        editing ? "PUT" : "POST",
        {
          ...values,
          shared: true,
          api_key: values.api_key || undefined,
          api_version: values.api_version || undefined,
        },
      );
      form.setFieldValue("api_key", "");
      setDirty(false);
      setOpen(false);
      await refresh();
      setNotice({ success: "saved" });
    } catch (e) {
      setNotice({ error: String(e) });
    } finally {
      setBusy(false);
    }
  }
  function remove(model: ModelSummary) {
    modal.confirm({
      title: <LiveText zh="删除共享模型配置？" en="Delete shared model?" />,
      content: model.name,
      okText: <LiveText zh="确认删除" en="Delete" />,
      okButtonProps: { danger: true },
      cancelText: <LiveText zh="取消" en="Cancel" />,
      onOk: async () => {
        setBusy(true);
        try {
          await api(`models/${model.id}`, "DELETE");
          await refresh();
          setNotice({ success: "deleted" });
        } catch (e) {
          setNotice({ error: String(e) });
          throw e;
        } finally {
          setBusy(false);
        }
      },
    });
  }
  return (
    <section className="admin-page" aria-labelledby="models-title">
      <header className="admin-page-heading">
        <Typography.Title id="models-title" level={1}>
          {t("共享模型", "Shared models")}
        </Typography.Title>
        <Flex gap="small" align="center">
          <Button
            icon={<ReloadOutlined aria-hidden />}
            disabled={busy}
            onClick={refresh}
          >
            {t("刷新", "Reload")}
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined aria-hidden />}
            onClick={() => edit(null)}
          >
            {t("添加共享模型", "Add model")}
          </Button>
        </Flex>
      </header>
      {notice && !open && (
        <Alert
          className="admin-notice"
          type={"error" in notice ? "error" : "success"}
          showIcon
          title={
            <span role="status">
              <NoticeText notice={notice} />
            </span>
          }
        />
      )}
      <Alert
        className="admin-notice"
        type="info"
        showIcon
        title={t(
          "优先使用个人默认模型。调用失败时会报错，不会自动改用共享模型。",
          "Personal defaults take priority. If a call fails, it returns an error without retrying with the shared model.",
        )}
      />
      <Card>
        <Table<ModelSummary>
          rowKey="id"
          loading={loading}
          dataSource={models}
          scroll={{ x: 800 }}
          pagination={{ pageSize: 10, hideOnSinglePage: true }}
          columns={[
            {
              title: t("配置名称", "Name"),
              dataIndex: "name",
              render: (name: string, model) => (
                <Flex orientation="vertical" align="flex-start" gap={2}>
                  <Button
                    type="link"
                    className="admin-table-title"
                    onClick={() => edit(model)}
                  >
                    {name}
                  </Button>
                  {model.isDefault && (
                    <Tag color="blue">{t("共享默认", "Default")}</Tag>
                  )}
                </Flex>
              ),
            },
            {
              title: t("供应商", "Provider"),
              dataIndex: "provider",
              render: (value: string) => (
                <Tag>
                  {value === "compatible"
                    ? t("兼容接口", "Compatible API")
                    : value}
                </Tag>
              ),
            },
            { title: t("模型", "Model"), dataIndex: "model" },
            {
              title: t("端点地址", "Endpoint"),
              dataIndex: "endpoint",
              render: (value: string) => (
                <span className="admin-table-endpoint">
                  {value || t("供应商默认", "Provider default")}
                </span>
              ),
            },
            {
              title: t("密钥", "Key"),
              key: "key",
              render: () => <Tag color="success">{t("已设置", "Set")}</Tag>,
            },
            {
              title: t("操作", "Actions"),
              key: "actions",
              render: (_, model) => (
                <Button
                  danger
                  size="small"
                  icon={<DeleteOutlined aria-hidden />}
                  disabled={busy}
                  onClick={() => remove(model)}
                >
                  {t("删除", "Delete")}
                </Button>
              ),
            },
          ]}
        />
      </Card>
      <Drawer
        open={open}
        size="min(680px, 100vw)"
        title={
          editing
            ? t("编辑共享模型", "Edit model")
            : t("添加共享模型", "Add model")
        }
        onClose={close}
        forceRender
        footer={
          <Flex gap="small" justify="flex-end">
            <Button onClick={close} disabled={busy}>
              {t("取消", "Cancel")}
            </Button>
            <Button
              type="primary"
              icon={<SaveOutlined aria-hidden />}
              loading={busy}
              onClick={() => form.submit()}
            >
              {t("保存模型", "Save model")}
            </Button>
          </Flex>
        }
      >
        {notice && "error" in notice && (
          <Alert
            className="admin-notice"
            type="error"
            title={
              <span role="status">
                <NoticeText notice={notice} />
              </span>
            }
            showIcon
          />
        )}
        <Form
          name="shared-model"
          form={form}
          layout="vertical"
          disabled={busy}
          onFinish={save}
          onValuesChange={() => setDirty(true)}
        >
          <Form.Item
            name="name"
            label={t("配置名称", "Name")}
            rules={[
              {
                required: true,
                max: 100,
                message: (
                  <LiveText
                    zh="请输入名称（最多 100 个字符）"
                    en="Enter a name of up to 100 characters."
                  />
                ),
              },
            ]}
          >
            <Input aria-label={t("模型配置名称", "Model configuration name")} />
          </Form.Item>
          <Form.Item
            name="provider"
            label={t("供应商", "Provider")}
            rules={[
              {
                required: true,
                message: (
                  <LiveText zh="请填写此项" en="This field is required." />
                ),
              },
            ]}
          >
            <Select
              virtual={false}
              aria-label={t("模型供应商", "Model provider")}
              options={providers.map((p) => ({
                value: p,
                label: p === "compatible" ? t("兼容接口", "Compatible API") : p,
              }))}
            />
          </Form.Item>
          <Form.Item
            name="model"
            label={
              provider === "azure"
                ? t("部署名", "Deployment")
                : t("模型名称", "Model")
            }
            rules={[
              {
                required: true,
                max: 256,
                message: (
                  <LiveText
                    zh="请输入模型标识（最多 256 个字符）"
                    en="Enter a model identifier of up to 256 characters."
                  />
                ),
              },
            ]}
          >
            <Input aria-label={t("模型标识", "Model identifier")} />
          </Form.Item>
          <Form.Item
            name="endpoint"
            label={t("端点地址", "Endpoint")}
            rules={[
              {
                required: provider === "azure",
                message: (
                  <LiveText zh="请填写此项" en="This field is required." />
                ),
              },
              {
                pattern: /^https?:\/\//,
                message: (
                  <LiveText
                    zh="请输入 HTTP/HTTPS 地址"
                    en="Enter an HTTP or HTTPS address."
                  />
                ),
              },
            ]}
          >
            <Input
              aria-label={t("模型端点地址", "Model endpoint")}
              placeholder="https://example.com/v1"
            />
          </Form.Item>
          {provider === "azure" && (
            <Form.Item
              name="api_version"
              label={t("API 版本", "API Version")}
              rules={[
                {
                  required: true,
                  message: (
                    <LiveText zh="请填写此项" en="This field is required." />
                  ),
                },
              ]}
            >
              <Input aria-label={t("API 版本", "API Version")} />
            </Form.Item>
          )}
          <Form.Item
            name="api_key"
            label={t("API 密钥", "API Key")}
            rules={[
              {
                required: !editing,
                message: (
                  <LiveText zh="请填写此项" en="This field is required." />
                ),
              },
            ]}
            extra={
              editing
                ? t("留空保留当前密钥", "Leave empty to keep existing key")
                : t(
                    "密钥加密保存，保存后无法查看原文。",
                    "The key is stored encrypted. You can replace it after saving, but cannot view it again.",
                  )
            }
          >
            <Input.Password
              aria-label={t("模型 API 密钥", "Model API key")}
              autoComplete="new-password"
            />
          </Form.Item>
          <Form.Item name="isDefault" valuePropName="checked">
            <Checkbox>{t("设为共享默认配置", "Shared default")}</Checkbox>
          </Form.Item>
        </Form>
      </Drawer>
    </section>
  );
}
