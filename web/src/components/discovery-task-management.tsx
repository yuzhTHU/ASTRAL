"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  App,
  Button,
  Card,
  Checkbox,
  Drawer,
  Empty,
  Form,
  Input,
  Select,
  Space,
  Statistic,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  DeleteOutlined,
  PlusOutlined,
  ReloadOutlined,
  SaveOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import { api } from "@/lib/client";
import type { components } from "@/lib/harness-schema";

type Catalog = components["schemas"]["DiscoveryCatalog"];
type Task = Catalog["tasks"][number];
type TaskForm = Omit<Task, "files" | "data_locations"> & {
  files: string;
  data_locations: string;
};
const endpoint = "admin/discovery-tasks";
const empty = (): Task => ({
  name: "",
  topic: "",
  subject_zh: "",
  title: "",
  task: "",
  preparation: "",
  evaluation: "",
  enabled: false,
  data_locations: [],
  files: [],
  publisher_url: "",
  citation: "",
  data_stage: "",
  description_zh: "",
  description_en: "",
  relation_zh: "",
  summary_zh: "",
  summary_en: "",
});
const groups = [
  {
    key: "basic",
    label: "基本信息 / Basics",
    fields: [
      ["name", "任务标识 / Identifier"],
      ["topic", "分类 / Topic"],
      ["subject_zh", "卡片标题 / Card title"],
      ["title", "论文标题 / Paper title"],
      ["publisher_url", "论文链接 / Publisher URL"],
      ["citation", "引用 / Citation"],
      ["data_stage", "数据阶段 / Data stage"],
    ],
  },
  {
    key: "descriptions",
    label: "说明与公式 / Display",
    fields: [
      ["description_zh", "中文说明 / Chinese description"],
      ["description_en", "英文说明 / English description"],
      ["relation_zh", "关系说明 / Relation"],
      ["summary_zh", "中文公式摘要 / Chinese summary"],
      ["summary_en", "英文公式摘要 / English summary"],
    ],
  },
  {
    key: "prompts",
    label: "阶段提示词 / Prompts",
    fields: [
      ["task", "研究问题 / Research question"],
      ["preparation", "数据准备提示词 / Preparation prompt"],
      ["evaluation", "Evaluator 提示词 / Evaluation prompt"],
    ],
  },
] as const;
const required = new Set([
  "name",
  "topic",
  "subject_zh",
  "title",
  "task",
  "preparation",
  "evaluation",
]);
const wide = new Set(["title", "data_stage"]);

export function DiscoveryTaskManagement() {
  const { modal } = App.useApp();
  const [form] = Form.useForm<TaskForm>();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [selected, setSelected] = useState<Task | null>(null);
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("basic");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{
    text: string;
    error?: boolean;
  } | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const creating = !selected;
  async function refresh() {
    setLoading(true);
    try {
      setCatalog(await api<Catalog>(endpoint));
      setNotice(null);
    } catch (e) {
      setNotice({ text: String(e), error: true });
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  function discard(next: () => void) {
    if (!dirty) {
      next();
      return;
    }
    modal.confirm({
      title: "放弃未保存的修改？ / Discard changes?",
      okText: "放弃修改 / Discard",
      cancelText: "继续编辑 / Keep editing",
      onOk: next,
    });
  }
  function edit(task: Task | null) {
    discard(() => {
      const value = task || empty();
      setSelected(task);
      setOpen(true);
      setActiveTab("basic");
      setDirty(false);
      setNotice(null);
      form.setFieldsValue({
        ...value,
        files: (value.files || []).join("\n"),
        data_locations: (value.data_locations || []).join("\n"),
      });
    });
  }
  async function mutate(path: string, method: string, body?: unknown) {
    setBusy(true);
    setNotice(null);
    try {
      const next = await api<Catalog>(path, method, body);
      setCatalog(next);
      setDirty(false);
      setNotice({ text: "已保存 / Saved" });
      return next;
    } catch (e) {
      setNotice({ text: String(e), error: true });
      return null;
    } finally {
      setBusy(false);
    }
  }
  async function save(values: TaskForm) {
    if (!catalog) return;
    const task = {
      ...values,
      files: values.files.split("\n").filter((v) => v.trim()),
      data_locations: values.data_locations.split("\n").filter((v) => v.trim()),
    };
    const next = await mutate(
      creating ? endpoint : `${endpoint}/${encodeURIComponent(task.name)}`,
      creating ? "POST" : "PUT",
      { task, expected_revision: catalog.revision },
    );
    if (next) {
      setSelected(next.tasks.find((t) => t.name === task.name) || null);
      setOpen(false);
    }
  }
  async function move(task: Task, offset: number) {
    if (!catalog) return;
    const names = catalog.tasks.map((t) => t.name),
      index = names.indexOf(task.name);
    [names[index], names[index + offset]] = [
      names[index + offset],
      names[index],
    ];
    await mutate(`${endpoint}/order`, "PUT", {
      names,
      expected_revision: catalog.revision,
    });
  }
  function remove() {
    if (!selected || !catalog) return;
    modal.confirm({
      title: "删除任务？ / Delete task?",
      content: "原始数据和已加载会话会保留。任务将从样例列表中移除。",
      okText: "确认删除 / Delete",
      cancelText: "取消 / Cancel",
      okButtonProps: { danger: true },
      onOk: async () => {
        const next = await mutate(
          `${endpoint}/${encodeURIComponent(selected.name)}?expected_revision=${catalog.revision}`,
          "DELETE",
        );
        if (!next) throw new Error("Delete failed");
        setSelected(null);
        setOpen(false);
      },
    });
  }
  const filtered =
    catalog?.tasks.filter(
      (t) =>
        [t.name, t.topic, t.subject_zh, t.title].some((v) =>
          v.toLowerCase().includes(query.toLowerCase()),
        ) &&
        (status === "all" || t.enabled === (status === "enabled")),
    ) || [];
  const filteredOrder = query.trim() !== "" || status !== "all";
  return (
    <main className="admin-page">
      <div className="admin-page-heading">
        <div>
          <Typography.Title level={2}>样例任务 / Sample tasks</Typography.Title>
          <p>维护科研任务、阶段提示词与共享数据入口。</p>
        </div>
        <Space>
          <Button
            icon={<ReloadOutlined aria-hidden />}
            disabled={busy}
            onClick={() =>
              discard(() => {
                setOpen(false);
                setDirty(false);
                void refresh();
              })
            }
          >
            刷新 / Reload
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined aria-hidden />}
            disabled={busy || loading}
            onClick={() => edit(null)}
          >
            添加任务 / Add task
          </Button>
        </Space>
      </div>
      <div className="admin-stats">
        <Card>
          <Statistic
            title="全部任务 / Total"
            value={catalog?.tasks.length || 0}
          />
        </Card>
        <Card>
          <Statistic
            title="已启用 / Enabled"
            value={catalog?.tasks.filter((t) => t.enabled).length || 0}
          />
        </Card>
        <Card>
          <Statistic
            title="已禁用 / Disabled"
            value={catalog?.tasks.filter((t) => !t.enabled).length || 0}
          />
        </Card>
      </div>
      {notice && !open && (
        <Alert
          className="admin-notice"
          type={notice.error ? "error" : "success"}
          showIcon
          title={<span role="status">{notice.text}</span>}
        />
      )}
      <Card>
        <div className="admin-toolbar">
          <Input
            className="admin-search"
            aria-label="Search sample tasks"
            prefix={<SearchOutlined aria-hidden />}
            placeholder="搜索名称、分类或论文 / Search"
            allowClear
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <Select
            virtual={false}
            aria-label="Sample task status"
            value={status}
            onChange={setStatus}
            style={{ width: 180 }}
            options={[
              { value: "all", label: "全部状态 / All" },
              { value: "enabled", label: "已启用 / Enabled" },
              { value: "disabled", label: "已禁用 / Disabled" },
            ]}
          />
          <Typography.Text type="secondary">
            通过上下箭头调整展示顺序，立即保存。
          </Typography.Text>
        </div>
        {filteredOrder && (
          <Alert
            className="admin-notice"
            type="info"
            showIcon
            title="清除筛选后可调整全局顺序 / Clear filters to reorder"
          />
        )}
        <Table<Task>
          rowKey="name"
          className="discovery-task-table"
          loading={loading}
          dataSource={filtered}
          pagination={false}
          scroll={{ x: 760 }}
          locale={{ emptyText: <Empty description="暂无任务 / No tasks" /> }}
          onRow={(task) =>
            ({
              "data-testid": `task-${task.name}`,
            }) as React.HTMLAttributes<HTMLTableRowElement>
          }
          columns={[
            {
              title: "顺序 / Order",
              width: 85,
              render: (_, task) => (
                <Typography.Text type="secondary">
                  {(catalog?.tasks.findIndex((t) => t.name === task.name) ||
                    0) + 1}
                </Typography.Text>
              ),
            },
            {
              title: "任务 / Task",
              key: "task",
              render: (_, task) => (
                <>
                  <Button
                    type="link"
                    className="admin-table-title"
                    onClick={() => edit(task)}
                  >
                    {task.subject_zh}
                  </Button>
                  <span className="admin-table-subtitle">{task.name}</span>
                </>
              ),
            },
            {
              title: "分类 / Topic",
              dataIndex: "topic",
              width: 100,
              render: (value: string) => <Tag>{value}</Tag>,
            },
            {
              title: "状态 / Status",
              dataIndex: "enabled",
              width: 150,
              render: (value: boolean) => (
                <Tag color={value ? "success" : "default"}>
                  {value ? "已启用 / Enabled" : "已禁用 / Disabled"}
                </Tag>
              ),
            },
            {
              title: "数据 / Data",
              width: 130,
              render: (_, task) => (
                <Typography.Text type="secondary">
                  {(task.data_locations || []).length
                    ? `${(task.data_locations || []).length} 个位置`
                    : "未配置 / Not set"}
                </Typography.Text>
              ),
            },
            {
              title: "排序 / Sort",
              key: "sort",
              width: 100,
              render: (_, task) => {
                const index =
                  catalog?.tasks.findIndex((t) => t.name === task.name) || 0;
                return (
                  <Space size={4}>
                    <Tooltip title="上移 / Move up">
                      <Button
                        aria-label={`Move up ${task.name}`}
                        icon={<ArrowUpOutlined aria-hidden />}
                        disabled={busy || dirty || filteredOrder || index === 0}
                        onClick={() => move(task, -1)}
                      />
                    </Tooltip>
                    <Tooltip title="下移 / Move down">
                      <Button
                        aria-label={`Move down ${task.name}`}
                        icon={<ArrowDownOutlined aria-hidden />}
                        disabled={
                          busy ||
                          dirty ||
                          filteredOrder ||
                          index === (catalog?.tasks.length || 0) - 1
                        }
                        onClick={() => move(task, 1)}
                      />
                    </Tooltip>
                  </Space>
                );
              },
            },
          ]}
        />
      </Card>
      <Drawer
        title={creating ? "添加任务 / Add task" : "任务详情 / Task details"}
        open={open}
        size="min(850px, 100vw)"
        onClose={() =>
          discard(() => {
            setOpen(false);
            setDirty(false);
          })
        }
        forceRender
        extra={dirty && <Tag color="orange">未保存 / Unsaved</Tag>}
        footer={
          <Space style={{ width: "100%", justifyContent: "space-between" }}>
            <span>
              {!creating && (
                <Button
                  danger
                  icon={<DeleteOutlined aria-hidden />}
                  disabled={busy}
                  onClick={remove}
                >
                  删除任务 / Delete task
                </Button>
              )}
            </span>
            <Space>
              <Button
                disabled={busy}
                onClick={() =>
                  discard(() => {
                    setOpen(false);
                    setDirty(false);
                  })
                }
              >
                取消 / Cancel
              </Button>
              <Button
                type="primary"
                icon={<SaveOutlined aria-hidden />}
                loading={busy}
                onClick={() => form.submit()}
              >
                保存任务 / Save task
              </Button>
            </Space>
          </Space>
        }
      >
        {notice?.error && (
          <Alert
            className="admin-notice"
            type="error"
            showIcon
            title={<span role="status">{notice.text}</span>}
          />
        )}
        <Form
          form={form}
          layout="vertical"
          disabled={busy}
          onValuesChange={() => setDirty(true)}
          onFinish={save}
          onFinishFailed={({ errorFields }) => {
            const field = String(errorFields[0]?.name[0]);
            setActiveTab(
              groups.find((g) => g.fields.some((f) => f[0] === field))?.key ||
                "data",
            );
          }}
        >
          <Tabs
            activeKey={activeTab}
            onChange={setActiveTab}
            items={[
              ...groups.map((group) => ({
                key: group.key,
                label: group.label,
                forceRender: true,
                children: (
                  <>
                    {group.key === "prompts" && (
                      <Alert
                        className="admin-form-note"
                        type="info"
                        title={
                          <>
                            数据准备提示词可使用 <code>{"{inputs}"}</code>{" "}
                            插入文件名；其他花括号会原样保留。
                          </>
                        }
                      />
                    )}
                    {group.key === "descriptions" && (
                      <Alert
                        className="admin-form-note"
                        type="info"
                        title="公式摘要支持 Markdown 和 LaTeX，仅用于样例卡片展示。"
                      />
                    )}
                    <div
                      className={
                        group.key === "basic" ? "admin-fields" : undefined
                      }
                    >
                      {group.fields.map(([key, label]) => (
                        <Form.Item
                          key={key}
                          name={key}
                          label={label}
                          className={wide.has(key) ? "wide" : undefined}
                          rules={[
                            {
                              required: required.has(key),
                              message: "请填写此项 / Required",
                            },
                            ...(key === "name"
                              ? [
                                  {
                                    pattern:
                                      /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/,
                                    message: "使用字母、数字、下划线或短横线",
                                  },
                                ]
                              : []),
                          ]}
                        >
                          {group.key === "basic" ? (
                            <Input
                              aria-label={key}
                              disabled={key === "name" && !creating}
                              maxLength={key === "name" ? 128 : undefined}
                            />
                          ) : (
                            <Input.TextArea
                              aria-label={key}
                              autoSize={{ minRows: 4, maxRows: 12 }}
                            />
                          )}
                        </Form.Item>
                      ))}
                    </div>
                  </>
                ),
              })),
              {
                key: "data",
                label: "数据与发布 / Data",
                forceRender: true,
                children: (
                  <>
                    <Alert
                      className="admin-form-note"
                      type="info"
                      showIcon
                      title="共享数据以只读方式关联到会话"
                      description="填写 Harness 中的文件或目录，每行一个。位置必须位于 ASTRAL_SAMPLE_DATA_ROOT 内；未设置时使用 ASTRAL_PROJECT_ROOT/data。启用前需要可读的非空数据。"
                    />
                    <Form.Item
                      name="data_locations"
                      label="数据位置 / Data locations"
                    >
                      <Input.TextArea
                        aria-label="data_locations"
                        autoSize={{ minRows: 4, maxRows: 10 }}
                        placeholder="Gaia/study/observations.csv"
                      />
                    </Form.Item>
                    <Form.Item
                      name="files"
                      label="参考文件名 / Reference file names"
                      extra="每行一个，仅作说明，不会自动挂载。"
                    >
                      <Input.TextArea
                        aria-label="files"
                        autoSize={{ minRows: 2, maxRows: 6 }}
                      />
                    </Form.Item>
                    <Form.Item name="enabled" valuePropName="checked">
                      <Checkbox aria-label="enabled">
                        启用此任务 / Enabled
                      </Checkbox>
                    </Form.Item>
                  </>
                ),
              },
            ]}
          />
        </Form>
      </Drawer>
    </main>
  );
}
