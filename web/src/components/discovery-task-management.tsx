"use client";
import {
  useManagementText,
  LiveText,
  NoticeText,
  type Notice,
  type ManagementTranslator,
} from "./management-text";

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
  Flex,
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
  CloseCircleFilled,
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
function taskGroups(t: ManagementTranslator) {
  return [
    {
      key: "basic",
      label: t("基本信息", "Basics"),
      fields: [
        ["name", t("任务标识", "Identifier")],
        ["topic", t("分类", "Topic")],
        ["subject_zh", t("卡片标题", "Card title")],
        ["title", t("论文标题", "Paper title")],
        ["publisher_url", t("论文链接", "Publisher URL")],
        ["citation", t("引用", "Citation")],
        ["data_stage", t("数据阶段", "Data stage")],
      ],
    },
    {
      key: "descriptions",
      label: t("说明与公式", "Display"),
      fields: [
        ["description_zh", t("中文说明", "Chinese description")],
        ["description_en", t("英文说明", "English description")],
        ["relation_zh", t("关系说明", "Relation")],
        ["summary_zh", t("中文公式摘要", "Chinese summary")],
        ["summary_en", t("英文公式摘要", "English summary")],
      ],
    },
    {
      key: "prompts",
      label: t("阶段提示词", "Prompts"),
      fields: [
        ["task", t("研究问题", "Research question")],
        ["preparation", t("数据准备提示词", "Preparation prompt")],
        ["evaluation", t("Evaluator 提示词", "Evaluation prompt")],
      ],
    },
  ] as const;
}
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
  const t = useManagementText();
  const { modal } = App.useApp();
  const [form] = Form.useForm<TaskForm>();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [selected, setSelected] = useState<Task | null>(null);
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("basic");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const groups = taskGroups(t);
  const creating = !selected;
  async function refresh() {
    setLoading(true);
    try {
      setCatalog(await api<Catalog>(endpoint));
      setNotice(null);
    } catch (e) {
      setNotice({ error: String(e) });
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
      title: <LiveText zh="放弃未保存的修改？" en="Discard changes?" />,
      okText: <LiveText zh="放弃修改" en="Discard" />,
      cancelText: <LiveText zh="继续编辑" en="Keep editing" />,
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
      setNotice({ success: "saved" });
      return next;
    } catch (e) {
      setNotice({ error: String(e) });
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
      title: (
        <LiveText
          zh={`删除“${selected.subject_zh || selected.name}”？`}
          en={`Delete “${selected.title || selected.name}”?`}
        />
      ),
      content: (
        <LiveText
          zh="原始数据和已加载的会话会保留。删除后无法复用此任务标识。"
          en="The original data and existing sessions will be preserved. This task identifier cannot be reused."
        />
      ),
      okText: <LiveText zh="确认删除" en="Delete" />,
      cancelText: <LiveText zh="取消" en="Cancel" />,
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
  const searchTerm = query.trim().toLowerCase();
  const filtered =
    catalog?.tasks.filter(
      (t) =>
        [t.name, t.topic, t.subject_zh, t.title].some((v) =>
          v.toLowerCase().includes(searchTerm),
        ) &&
        (status === "all" || t.enabled === (status === "enabled")),
    ) || [];
  const filteredOrder = searchTerm !== "" || status !== "all";
  return (
    <section className="admin-page" aria-labelledby="sample-tasks-title">
      <header className="admin-page-heading">
        <Typography.Title id="sample-tasks-title" level={1}>
          {t("样例任务", "Sample tasks")}
        </Typography.Title>
        <Flex gap="small" align="center">
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
            {t("刷新", "Reload")}
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined aria-hidden />}
            disabled={busy || loading}
            onClick={() => edit(null)}
          >
            {t("添加任务", "Add task")}
          </Button>
        </Flex>
      </header>
      <div className="admin-stats">
        <Card>
          <Statistic
            title={t("全部任务", "Total")}
            value={catalog?.tasks.length || 0}
          />
        </Card>
        <Card>
          <Statistic
            title={t("已启用", "Enabled")}
            value={catalog?.tasks.filter((t) => t.enabled).length || 0}
          />
        </Card>
        <Card>
          <Statistic
            title={t("已禁用", "Disabled")}
            value={catalog?.tasks.filter((t) => !t.enabled).length || 0}
          />
        </Card>
      </div>
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
      <Card>
        <search className="admin-toolbar">
          <Input
            className="admin-search"
            aria-label={t("搜索样例任务", "Search sample tasks")}
            prefix={<SearchOutlined aria-hidden />}
            placeholder={t(
              "搜索任务、分类或论文标题",
              "Search by task, topic or paper title",
            )}
            allowClear={{
              clearIcon: (
                <CloseCircleFilled aria-label={t("清除搜索", "Clear search")} />
              ),
            }}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <Select
            virtual={false}
            id="sample-task-status"
            aria-label={t("样例任务状态", "Sample task status")}
            value={status}
            onChange={setStatus}
            style={{ width: 180 }}
            options={[
              { value: "all", label: t("全部状态", "All") },
              { value: "enabled", label: t("已启用", "Enabled") },
              { value: "disabled", label: t("已禁用", "Disabled") },
            ]}
          />
          {filteredOrder && (
            <Button
              onClick={() => {
                setQuery("");
                setStatus("all");
              }}
            >
              {t("清除筛选", "Clear filters")}
            </Button>
          )}
          {(catalog?.tasks.length ?? 0) > 1 && (
            <Typography.Text type="secondary">
              {filteredOrder
                ? t(
                    "清除筛选后可调整顺序。",
                    "Clear the filters to reorder tasks.",
                  )
                : t(
                    "调整顺序后自动保存。",
                    "Order changes are saved automatically.",
                  )}
            </Typography.Text>
          )}
        </search>
        <Table<Task>
          rowKey="name"
          className="discovery-task-table"
          loading={loading}
          dataSource={filtered}
          pagination={false}
          scroll={{ x: 760 }}
          locale={{
            emptyText: catalog && (
              <Empty
                description={
                  catalog.tasks.length
                    ? t("没有符合筛选条件的任务", "No matching tasks")
                    : t("还没有样例任务", "No sample tasks yet")
                }
              />
            ),
          }}
          onRow={(task) =>
            ({
              "data-testid": `task-${task.name}`,
            }) as React.HTMLAttributes<HTMLTableRowElement>
          }
          columns={[
            {
              title: t("顺序", "Order"),
              width: 85,
              render: (_, task) => (
                <Typography.Text type="secondary">
                  {(catalog?.tasks.findIndex((t) => t.name === task.name) ||
                    0) + 1}
                </Typography.Text>
              ),
            },
            {
              title: t("任务", "Task"),
              key: "task",
              render: (_, task) => (
                <>
                  <Button
                    type="link"
                    className="admin-table-title"
                    onClick={() => edit(task)}
                  >
                    {t(task.subject_zh, task.title || task.name)}
                  </Button>
                  <span className="admin-table-subtitle">{task.name}</span>
                </>
              ),
            },
            {
              title: t("分类", "Topic"),
              dataIndex: "topic",
              width: 100,
              render: (value: string) => <Tag>{value}</Tag>,
            },
            {
              title: t("状态", "Status"),
              dataIndex: "enabled",
              width: 150,
              render: (value: boolean) => (
                <Tag color={value ? "success" : "default"}>
                  {value ? t("已启用", "Enabled") : t("已禁用", "Disabled")}
                </Tag>
              ),
            },
            {
              title: t("数据", "Data"),
              width: 130,
              render: (_, task) => {
                const count = task.data_locations?.length || 0;
                return (
                  <Typography.Text type="secondary">
                    {count
                      ? t(
                          `${count} 个位置`,
                          `${count} location${count === 1 ? "" : "s"}`,
                        )
                      : t("未配置", "Not set")}
                  </Typography.Text>
                );
              },
            },
            {
              title: t("排序", "Sort"),
              key: "sort",
              width: 100,
              render: (_, task) => {
                const index =
                  catalog?.tasks.findIndex((t) => t.name === task.name) || 0;
                return (
                  <Flex gap={4}>
                    <Tooltip title={t("上移", "Move up")}>
                      <Button
                        aria-label={`${t("上移", "Move up")} ${task.name}`}
                        icon={<ArrowUpOutlined aria-hidden />}
                        disabled={busy || dirty || filteredOrder || index === 0}
                        onClick={() => move(task, -1)}
                      />
                    </Tooltip>
                    <Tooltip title={t("下移", "Move down")}>
                      <Button
                        aria-label={`${t("下移", "Move down")} ${task.name}`}
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
                  </Flex>
                );
              },
            },
          ]}
        />
      </Card>
      <Drawer
        title={
          creating ? t("添加任务", "Add task") : t("任务详情", "Task details")
        }
        open={open}
        size="min(850px, 100vw)"
        onClose={() =>
          discard(() => {
            setOpen(false);
            setDirty(false);
          })
        }
        forceRender
        extra={dirty && <Tag color="orange">{t("未保存", "Unsaved")}</Tag>}
        footer={
          <Flex gap="small" justify={creating ? "flex-end" : "space-between"}>
            {!creating && (
              <Button
                danger
                icon={<DeleteOutlined aria-hidden />}
                disabled={busy}
                onClick={remove}
              >
                {t("删除任务", "Delete task")}
              </Button>
            )}
            <Flex gap="small" align="center">
              <Button
                disabled={busy}
                onClick={() =>
                  discard(() => {
                    setOpen(false);
                    setDirty(false);
                  })
                }
              >
                {t("取消", "Cancel")}
              </Button>
              <Button
                type="primary"
                icon={<SaveOutlined aria-hidden />}
                loading={busy}
                onClick={() => form.submit()}
              >
                {t("保存任务", "Save task")}
              </Button>
            </Flex>
          </Flex>
        }
      >
        {notice && "error" in notice && (
          <Alert
            className="admin-notice"
            type="error"
            showIcon
            title={
              <span role="status">
                <NoticeText notice={notice} />
              </span>
            }
          />
        )}
        <Form
          name="sample-task"
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
            id="sample-task-fields"
            activeKey={activeTab}
            onChange={setActiveTab}
            items={[
              ...groups.map((group) => ({
                key: group.key,
                label: group.label,
                forceRender: true,
                children: (
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
                        extra={
                          key === "preparation"
                            ? t(
                                "用 {inputs} 插入数据文件或目录名。",
                                "Use {inputs} for data file or folder names.",
                              )
                            : key === "summary_zh" || key === "summary_en"
                              ? t(
                                  "在任务卡片中显示，支持 Markdown 和 LaTeX。",
                                  "Shown on the task card. Supports Markdown and LaTeX.",
                                )
                              : undefined
                        }
                        rules={[
                          {
                            required: required.has(key),
                            message: <LiveText zh="请填写此项" en="Required" />,
                          },
                          ...(key === "name"
                            ? [
                                {
                                  pattern: /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/,
                                  message: (
                                    <LiveText
                                      zh="以英文字母或数字开头，后续也可使用下划线和短横线。"
                                      en="Start with a letter or digit. Underscores and hyphens are allowed after it."
                                    />
                                  ),
                                },
                              ]
                            : []),
                        ]}
                      >
                        {group.key === "basic" ? (
                          <Input
                            aria-label={label}
                            disabled={key === "name" && !creating}
                            maxLength={key === "name" ? 128 : undefined}
                          />
                        ) : (
                          <Input.TextArea
                            aria-label={label}
                            autoSize={{ minRows: 4, maxRows: 12 }}
                          />
                        )}
                      </Form.Item>
                    ))}
                  </div>
                ),
              })),
              {
                key: "data",
                label: t("数据与发布", "Data"),
                forceRender: true,
                children: (
                  <>
                    <Form.Item
                      name="data_locations"
                      label={t("数据位置", "Data locations")}
                      extra={t(
                        "每行一个文件或目录，供会话只读访问。路径须位于 ASTRAL_SAMPLE_DATA_ROOT 下，默认根目录为 ASTRAL_PROJECT_ROOT/data。",
                        "Enter one file or directory per line. Sessions have read-only access. Paths must be under ASTRAL_SAMPLE_DATA_ROOT (default: ASTRAL_PROJECT_ROOT/data).",
                      )}
                    >
                      <Input.TextArea
                        aria-label={t("数据位置", "Data locations")}
                        autoSize={{ minRows: 4, maxRows: 10 }}
                        placeholder="Gaia/study/observations.csv"
                      />
                    </Form.Item>
                    <Form.Item
                      name="files"
                      label={t("参考文件名", "Reference file names")}
                      extra={t(
                        "每行一个。实际加载的文件由「数据位置」决定。",
                        "Enter one name per line. Data locations determine which files are loaded.",
                      )}
                    >
                      <Input.TextArea
                        aria-label={t("参考文件名", "Reference file names")}
                        autoSize={{ minRows: 2, maxRows: 6 }}
                      />
                    </Form.Item>
                    <Form.Item
                      name="enabled"
                      valuePropName="checked"
                      extra={t(
                        "启用前，每个数据位置都须可读且非空。",
                        "Each data location must be readable and nonempty before enabling the task.",
                      )}
                    >
                      <Checkbox aria-label={t("启用此任务", "Enabled")}>
                        {t("启用此任务", "Enabled")}
                      </Checkbox>
                    </Form.Item>
                  </>
                ),
              },
            ]}
          />
        </Form>
      </Drawer>
    </section>
  );
}
