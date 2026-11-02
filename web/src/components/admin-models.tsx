"use client";

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
  Space,
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
  const { modal } = App.useApp();
  const [form] = Form.useForm<ModelForm>();
  const provider = Form.useWatch("provider", form);
  const [models, setModels] = useState<ModelSummary[]>([]);
  const [editing, setEditing] = useState<ModelSummary | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState<{
    text: string;
    error?: boolean;
  } | null>(null);
  async function refresh() {
    setLoading(true);
    try {
      setModels(
        (await api("models")).models.filter((m: ModelSummary) => m.shared),
      );
    } catch (e) {
      setNotice({ text: String(e), error: true });
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
      title: "放弃未保存的修改？ / Discard changes?",
      okText: "放弃修改 / Discard",
      cancelText: "继续编辑 / Keep editing",
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
      setNotice({ text: "已保存 / Saved" });
    } catch (e) {
      setNotice({ text: String(e), error: true });
    } finally {
      setBusy(false);
    }
  }
  function remove(model: ModelSummary) {
    modal.confirm({
      title: "删除共享模型配置？ / Delete shared model?",
      content: model.name,
      okText: "确认删除 / Delete",
      okButtonProps: { danger: true },
      cancelText: "取消 / Cancel",
      onOk: async () => {
        setBusy(true);
        try {
          await api(`models/${model.id}`, "DELETE");
          await refresh();
          setNotice({ text: "已删除 / Deleted" });
        } catch (e) {
          setNotice({ text: String(e), error: true });
          throw e;
        } finally {
          setBusy(false);
        }
      },
    });
  }
  return (
    <main className="admin-page">
      <div className="admin-page-heading">
        <div>
          <Typography.Title level={2}>
            共享模型 / Shared models
          </Typography.Title>
          <p>发布供用户选择的模型配置，完整管理供应商、Endpoint 与凭据。</p>
        </div>
        <Space>
          <Button
            icon={<ReloadOutlined aria-hidden />}
            disabled={busy}
            onClick={refresh}
          >
            刷新 / Reload
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined aria-hidden />}
            onClick={() => edit(null)}
          >
            添加共享模型 / Add model
          </Button>
        </Space>
      </div>
      {notice && !open && (
        <Alert
          className="admin-notice"
          type={notice.error ? "error" : "success"}
          showIcon
          title={<span role="status">{notice.text}</span>}
        />
      )}
      <Alert
        className="admin-notice"
        type="info"
        showIcon
        title="共享默认配置可被个人配置整组覆盖"
        description="密钥不会回显；编辑时留空可保留原有密钥。个人配置失败时不会自动切换到共享付费配置。"
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
              title: "配置名称 / Name",
              dataIndex: "name",
              render: (name: string, model) => (
                <Space orientation="vertical" size={2}>
                  <Button
                    type="link"
                    className="admin-table-title"
                    onClick={() => edit(model)}
                  >
                    {name}
                  </Button>
                  {model.isDefault && (
                    <Tag color="blue">共享默认 / Default</Tag>
                  )}
                </Space>
              ),
            },
            {
              title: "供应商 / Provider",
              dataIndex: "provider",
              render: (value: string) => <Tag>{value}</Tag>,
            },
            { title: "模型 / Model", dataIndex: "model" },
            {
              title: "Endpoint",
              dataIndex: "endpoint",
              render: (value: string) => (
                <span className="admin-table-endpoint">
                  {value || "供应商默认 / Provider default"}
                </span>
              ),
            },
            {
              title: "密钥 / Key",
              key: "key",
              render: () => <Tag color="success">已设置 / Set</Tag>,
            },
            {
              title: "操作 / Actions",
              key: "actions",
              render: (_, model) => (
                <Button
                  danger
                  size="small"
                  icon={<DeleteOutlined aria-hidden />}
                  disabled={busy}
                  onClick={() => remove(model)}
                >
                  删除 / Delete
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
          editing ? "编辑共享模型 / Edit model" : "添加共享模型 / Add model"
        }
        onClose={close}
        forceRender
        footer={
          <Space style={{ width: "100%", justifyContent: "flex-end" }}>
            <Button onClick={close} disabled={busy}>
              取消 / Cancel
            </Button>
            <Button
              type="primary"
              icon={<SaveOutlined aria-hidden />}
              loading={busy}
              onClick={() => form.submit()}
            >
              保存模型 / Save model
            </Button>
          </Space>
        }
      >
        {notice?.error && (
          <Alert
            className="admin-notice"
            type="error"
            title={<span role="status">{notice.text}</span>}
            showIcon
          />
        )}
        <Form
          form={form}
          layout="vertical"
          disabled={busy}
          onFinish={save}
          onValuesChange={() => setDirty(true)}
        >
          <Form.Item
            name="name"
            label="配置名称 / Name"
            rules={[{ required: true, max: 100 }]}
          >
            <Input aria-label="Model configuration name" />
          </Form.Item>
          <Form.Item
            name="provider"
            label="供应商 / Provider"
            rules={[{ required: true }]}
          >
            <Select
              virtual={false}
              aria-label="Model provider"
              options={providers.map((p) => ({ value: p, label: p }))}
            />
          </Form.Item>
          <Form.Item
            name="model"
            label={
              provider === "azure" ? "部署名 / Deployment" : "模型名称 / Model"
            }
            rules={[{ required: true, max: 256 }]}
          >
            <Input aria-label="Model identifier" />
          </Form.Item>
          <Form.Item
            name="endpoint"
            label="Endpoint"
            rules={[
              { required: provider === "azure" },
              {
                validator: (_, value) =>
                  !value || /^https?:\/\//.test(value)
                    ? Promise.resolve()
                    : Promise.reject(new Error("请输入 HTTP/HTTPS 地址")),
              },
            ]}
          >
            <Input
              aria-label="Model endpoint"
              placeholder="https://example.com/v1"
            />
          </Form.Item>
          {provider === "azure" && (
            <Form.Item
              name="api_version"
              label="API Version"
              rules={[{ required: true }]}
            >
              <Input aria-label="API Version" />
            </Form.Item>
          )}
          <Form.Item
            name="api_key"
            label="API Key"
            rules={[{ required: !editing }]}
            extra={
              editing
                ? "留空保留当前密钥 / Leave empty to keep existing key"
                : "密钥加密保存，不会通过普通接口返回。"
            }
          >
            <Input.Password
              aria-label="Model API key"
              autoComplete="new-password"
            />
          </Form.Item>
          <Form.Item name="isDefault" valuePropName="checked">
            <Checkbox>设为共享默认配置 / Shared default</Checkbox>
          </Form.Item>
        </Form>
      </Drawer>
    </main>
  );
}
