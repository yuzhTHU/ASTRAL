"use client";
import { LanguageButton } from "./language-button";
import { localizedError, useUiLanguage } from "./ui-language";
import { useManagementText } from "./management-text";

import {
  Alert,
  Button,
  Layout,
  Menu,
  Result,
  Space,
  Spin,
  Tag,
  Typography,
} from "antd";
import {
  ArrowLeftOutlined,
  ExperimentOutlined,
  TeamOutlined,
  ToolOutlined,
  ApiOutlined,
  SafetyCertificateOutlined,
} from "@ant-design/icons";
import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/client";
import { ManagementSurface } from "./management-surface";
import { UserAccountMenu } from "./user-account-menu";

export function AdminShell({ children }: { children: ReactNode }) {
  const t = useManagementText();
  const lang = useUiLanguage();
  const path = usePathname();
  const [identity, setIdentity] = useState<{
    username: string;
    role: string;
  } | null>(null);
  const [failure, setFailure] = useState("");
  useEffect(() => {
    api("auth/me")
      .then(setIdentity)
      .catch((e) => setFailure(String(e)));
  }, []);
  const items = [
    {
      key: "/admin",
      icon: <TeamOutlined aria-hidden />,
      label: <Link href="/admin">{t("账号与注册", "Accounts")}</Link>,
    },
    {
      key: "/admin/discovery-tasks",
      icon: <ExperimentOutlined aria-hidden />,
      label: (
        <Link href="/admin/discovery-tasks">{t("样例任务", "Samples")}</Link>
      ),
    },
    {
      key: "/admin/models",
      icon: <ApiOutlined aria-hidden />,
      label: <Link href="/admin/models">{t("共享模型", "Models")}</Link>,
    },
    {
      key: "/admin/tools",
      icon: <ToolOutlined aria-hidden />,
      label: <Link href="/admin/tools">{t("工具配置", "Tools")}</Link>,
    },
  ];
  return (
    <ManagementSurface>
      {!identity ? (
        <div className="admin-loading">
          <LanguageButton />
          {failure ? (
            <Alert
              type="error"
              showIcon
              title={localizedError(failure, lang)}
              description={<a href="/">{t("返回登录", "Sign in")}</a>}
            />
          ) : (
            <Spin
              description={t("正在加载管理控制台…", "Loading administration…")}
            />
          )}
        </div>
      ) : identity.role !== "admin" ? (
        <Result
          status="403"
          title={t("仅管理员可访问", "Administrators only")}
          extra={
            <Space>
              <LanguageButton />
              <Button href="/">{t("返回工作台", "Workbench")}</Button>
            </Space>
          }
        />
      ) : (
        <Layout className="admin-layout">
          <Layout.Header className="admin-header">
            <Link href="/admin" className="admin-brand">
              <span className="admin-brand-mark">A</span>
              <span>
                ASTRAL <small>{t("管理控制台", "Administration")}</small>
              </span>
            </Link>
            <Space size="middle">
              <Tag
                icon={<SafetyCertificateOutlined aria-hidden />}
                color="blue"
              >
                {t("管理员", "Administrator")}
              </Tag>
              <LanguageButton />
              <UserAccountMenu username={identity.username} />
              <Button icon={<ArrowLeftOutlined aria-hidden />} href="/">
                {t("返回工作台", "Back to workbench")}
              </Button>
            </Space>
          </Layout.Header>
          <Layout>
            <Layout.Sider
              width={246}
              className="admin-sidebar"
              breakpoint="lg"
              collapsedWidth={0}
            >
              <Typography.Text type="secondary" className="admin-nav-caption">
                {t("平台管理", "PLATFORM")}
              </Typography.Text>
              <Menu mode="inline" selectedKeys={[path]} items={items} />
              <div className="admin-sidebar-note">
                {t("ASTRAL · 科研平台", "ASTRAL · Research platform")}
              </div>
            </Layout.Sider>
            <Layout.Content className="admin-content">
              <nav className="admin-mobile-nav">
                <Menu mode="horizontal" selectedKeys={[path]} items={items} />
              </nav>
              {children}
            </Layout.Content>
          </Layout>
        </Layout>
      )}
    </ManagementSurface>
  );
}
