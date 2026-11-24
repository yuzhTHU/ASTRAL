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
  Form,
  Input,
  Modal,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from "antd";
import {
  PlusOutlined,
  ReloadOutlined,
  LinkOutlined,
  CloseCircleFilled,
  SearchOutlined,
} from "@ant-design/icons";
import { api } from "@/lib/client";

type User = {
  id: string;
  username: string;
  role: "admin" | "user";
  disabled: boolean;
};
export function UserAdministration() {
  const t = useManagementText();
  const { modal } = App.useApp();
  const [users, setUsers] = useState<User[]>([]);
  const [mode, setMode] = useState("open");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [invitation, setInvitation] = useState("");
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [resetting, setResetting] = useState<User | null>(null);
  const [createForm] = Form.useForm();
  const [passwordForm] = Form.useForm();
  async function refresh() {
    setLoading(true);
    try {
      const [accounts, registration] = await Promise.all([
        api("admin/users"),
        api("admin/registration"),
      ]);
      setUsers(accounts.users);
      setMode(registration.mode);
    } catch (e) {
      setNotice({ error: String(e) });
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  async function action(fn: () => Promise<unknown>) {
    setBusy(true);
    setNotice(null);
    try {
      await fn();
      await refresh();
      setNotice({ success: "saved" });
      return true;
    } catch (e) {
      setNotice({ error: String(e) });
      return false;
    } finally {
      setBusy(false);
    }
  }
  function toggle(user: User) {
    modal.confirm({
      title: user.disabled ? (
        <LiveText zh="启用此账号？" en="Enable account?" />
      ) : (
        <LiveText zh="禁用此账号？" en="Disable account?" />
      ),
      content: (
        <>
          {user.username} ·{" "}
          <LiveText
            zh="修改后会撤销该用户当前登录状态。"
            en="This change signs the user out of all sessions."
          />
        </>
      ),
      okText: <LiveText zh="确认" en="Confirm" />,
      cancelText: <LiveText zh="取消" en="Cancel" />,
      okButtonProps: { danger: !user.disabled },
      onOk: async () => {
        if (
          !(await action(() =>
            api(`admin/users/${user.id}`, "PATCH", {
              disabled: !user.disabled,
            }),
          ))
        )
          throw new Error("Update failed");
      },
    });
  }
  return (
    <main className="admin-page">
      <div className="admin-page-heading">
        <div>
          <Typography.Title level={2}>
            {t("账号与注册", "Accounts")}
          </Typography.Title>
          <p>
            {t(
              "管理平台访问、注册策略与用户账号。",
              "Manage access to the platform, registration policies and user accounts.",
            )}
          </p>
        </div>
        <Space>
          <Button
            icon={<ReloadOutlined aria-hidden />}
            onClick={refresh}
            disabled={busy}
          >
            {t("刷新", "Reload")}
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined aria-hidden />}
            onClick={() => {
              createForm.resetFields();
              setCreating(true);
            }}
          >
            {t("创建用户", "Create user")}
          </Button>
        </Space>
      </div>
      <div className="admin-stats">
        <Card>
          <Statistic title={t("全部账号", "Total")} value={users.length} />
        </Card>
        <Card>
          <Statistic
            title={t("可用账号", "Active")}
            value={users.filter((u) => !u.disabled).length}
          />
        </Card>
        <Card>
          <Statistic
            title={t("管理员", "Administrators")}
            value={users.filter((u) => u.role === "admin").length}
          />
        </Card>
      </div>
      {notice && (
        <Alert
          className="admin-notice"
          showIcon
          type={"error" in notice ? "error" : "success"}
          title={
            <span role="status">
              <NoticeText notice={notice} />
            </span>
          }
        />
      )}
      <Card title={t("注册策略", "Registration")} style={{ marginBottom: 24 }}>
        <Space wrap size="large">
          <Select
            virtual={false}
            aria-label={t("注册策略", "Registration mode")}
            value={mode}
            disabled={busy || loading}
            style={{ width: 260 }}
            onChange={(next) =>
              action(() => api("admin/registration", "PUT", { mode: next }))
            }
            options={[
              { value: "open", label: t("开放注册", "Open") },
              { value: "invite", label: t("邀请注册", "Invitation only") },
              { value: "admin", label: t("管理员创建", "Admin-created") },
            ]}
          />
          <Button
            icon={<LinkOutlined aria-hidden />}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const result = await api("admin/invitations", "POST", {});
                setInvitation(`${location.origin}/?invitation=${result.token}`);
              } catch (e) {
                setNotice({ error: String(e) });
              } finally {
                setBusy(false);
              }
            }}
          >
            {t("创建邀请", "Create invitation")}
          </Button>
          <Typography.Text type="secondary">
            {t(
              "关闭开放注册后，既有账号仍可登录。",
              "Existing users can still sign in when open registration is closed.",
            )}
          </Typography.Text>
        </Space>
        {invitation && (
          <Alert
            style={{ marginTop: 16 }}
            type="info"
            showIcon
            title={t(
              "邀请链接 · 一次性使用，七天后过期",
              "Single-use invitation link, expires in seven days",
            )}
            description={
              <Typography.Paragraph
                copyable
                style={{ marginBottom: 0, overflowWrap: "anywhere" }}
              >
                {invitation}
              </Typography.Paragraph>
            }
          />
        )}
      </Card>
      <Card title={t("用户列表", "Users")}>
        <div className="admin-toolbar">
          <Input
            className="admin-search"
            aria-label={t("搜索用户", "Search users")}
            prefix={<SearchOutlined aria-hidden />}
            placeholder={t("搜索用户名", "Search users")}
            value={query}
            allowClear={{
              clearIcon: (
                <CloseCircleFilled aria-label={t("清除搜索", "Clear search")} />
              ),
            }}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <Table<User>
          rowKey="id"
          loading={loading}
          dataSource={users.filter((u) =>
            u.username.toLowerCase().includes(query.toLowerCase()),
          )}
          pagination={{ pageSize: 10, hideOnSinglePage: true }}
          scroll={{ x: 650 }}
          columns={[
            {
              title: t("用户名", "Username"),
              dataIndex: "username",
              render: (value: string) => (
                <Typography.Text strong>{value}</Typography.Text>
              ),
            },
            {
              title: t("角色", "Role"),
              dataIndex: "role",
              render: (value: string) => (
                <Tag color={value === "admin" ? "geekblue" : "default"}>
                  {value === "admin" ? t("管理员", "Admin") : t("用户", "User")}
                </Tag>
              ),
            },
            {
              title: t("状态", "Status"),
              dataIndex: "disabled",
              render: (value: boolean) => (
                <Tag color={value ? "default" : "success"}>
                  {value ? t("已禁用", "Disabled") : t("正常", "Active")}
                </Tag>
              ),
            },
            {
              title: t("操作", "Actions"),
              key: "actions",
              render: (_, user) =>
                user.role === "admin" ? (
                  <Typography.Text type="secondary">
                    {t("管理员账号", "Administrator account")}
                  </Typography.Text>
                ) : (
                  <Space>
                    <Button
                      size="small"
                      disabled={busy}
                      danger={!user.disabled}
                      onClick={() => toggle(user)}
                    >
                      {user.disabled
                        ? t("启用", "Enable")
                        : t("禁用", "Disable")}
                    </Button>
                    <Button
                      size="small"
                      disabled={busy}
                      onClick={() => {
                        passwordForm.resetFields();
                        setResetting(user);
                      }}
                    >
                      {t("重置密码", "Reset password")}
                    </Button>
                  </Space>
                ),
            },
          ]}
        />
      </Card>
      <Modal
        title={t("创建用户", "Create user")}
        open={creating}
        onCancel={() => setCreating(false)}
        footer={null}
        destroyOnHidden
      >
        <Form
          form={createForm}
          layout="vertical"
          onFinish={async (values) => {
            if (await action(() => api("admin/users", "POST", values)))
              setCreating(false);
          }}
        >
          <Form.Item
            name="username"
            label={t("用户名", "Username")}
            rules={[
              {
                required: true,
                min: 3,
                max: 64,
                message: (
                  <LiveText
                    zh="请输入 3 至 64 个字符的用户名"
                    en="Enter a username of 3 to 64 characters."
                  />
                ),
              },
            ]}
          >
            <Input
              aria-label={t("新建用户名", "New username")}
              autoComplete="off"
            />
          </Form.Item>
          <Form.Item
            name="password"
            label={t("初始密码", "Password")}
            rules={[
              {
                required: true,
                min: 12,
                message: (
                  <LiveText
                    zh="请输入至少 12 个字符的密码"
                    en="Enter a password of at least 12 characters."
                  />
                ),
              },
            ]}
          >
            <Input.Password
              aria-label={t("新用户密码", "New user password")}
              autoComplete="new-password"
            />
          </Form.Item>
          <Space>
            <Button type="primary" htmlType="submit" loading={busy}>
              {t("创建", "Create")}
            </Button>
            <Button onClick={() => setCreating(false)}>
              {t("取消", "Cancel")}
            </Button>
          </Space>
        </Form>
      </Modal>
      <Modal
        title={`${t("重置密码", "Reset password")} · ${resetting?.username || ""}`}
        open={!!resetting}
        onCancel={() => setResetting(null)}
        footer={null}
        destroyOnHidden
      >
        <Alert
          className="admin-notice"
          type="info"
          showIcon
          title={t(
            "密码更新后，该用户的所有登录状态将被撤销。",
            "Updating the password signs the user out of all sessions.",
          )}
        />
        <Form
          form={passwordForm}
          layout="vertical"
          onFinish={async (values) => {
            if (
              resetting &&
              (await action(() =>
                api(`admin/users/${resetting.id}`, "PATCH", values),
              ))
            )
              setResetting(null);
          }}
        >
          <Form.Item
            name="password"
            label={t("新密码", "New password")}
            rules={[
              {
                required: true,
                min: 12,
                message: (
                  <LiveText
                    zh="请输入至少 12 个字符的密码"
                    en="Enter a password of at least 12 characters."
                  />
                ),
              },
            ]}
          >
            <Input.Password
              aria-label={t("重置密码", "Reset password")}
              autoComplete="new-password"
            />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={busy}>
            {t("更新密码", "Update password")}
          </Button>
        </Form>
      </Modal>
    </main>
  );
}
