"use client";
import { AstralWordmark } from "./astral-wordmark";
import { LanguageButton } from "./language-button";
import { localizedError, useUiLanguage } from "./ui-language";
import { useManagementText } from "./management-text";

import { Alert, Button, Result, Spin } from "antd";
import {
  ArrowLeftOutlined,
  ExperimentOutlined,
  TeamOutlined,
  ToolOutlined,
  ApiOutlined,
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
  const destinations = [
    {
      href: "/admin",
      icon: <TeamOutlined aria-hidden />,
      label: t("账号与注册", "Accounts"),
    },
    {
      href: "/admin/discovery-tasks",
      icon: <ExperimentOutlined aria-hidden />,
      label: t("样例任务", "Samples"),
    },
    {
      href: "/admin/models",
      icon: <ApiOutlined aria-hidden />,
      label: t("共享模型", "Models"),
    },
    {
      href: "/admin/tools",
      icon: <ToolOutlined aria-hidden />,
      label: t("工具配置", "Tools"),
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
            <div className="admin-access-actions">
              <LanguageButton />
              <Button href="/">{t("返回工作台", "Workbench")}</Button>
            </div>
          }
        />
      ) : (
        <div className="admin-layout">
          <header id="admin-header" className="admin-header">
            <Link
              href="/admin"
              id="admin-home-link"
              className="admin-brand"
              aria-label={t("ASTRAL 管理控制台", "ASTRAL Administration")}
            >
              <AstralWordmark />
              <span className="admin-section-name">
                {t("管理控制台", "Administration")}
              </span>
            </Link>
            <LanguageButton
              id="admin-language-toggle"
              className="header-toggle language-toggle"
            />
            <UserAccountMenu
              id="admin-account-menu-trigger"
              username={identity.username}
            />
            <Link
              href="/"
              id="admin-workbench-link"
              className="header-toggle admin-workbench-link"
              aria-label={t("返回工作台", "Back to workbench")}
              title={t("返回工作台", "Back to workbench")}
            >
              <ArrowLeftOutlined aria-hidden />
              <span>{t("返回工作台", "Back to workbench")}</span>
            </Link>
          </header>
          <nav
            id="admin-navigation"
            className="admin-navigation"
            aria-label={t("管理导航", "Administration")}
          >
            {destinations.map(({ href, icon, label }) => (
              <Link
                key={href}
                href={href}
                aria-current={path === href ? "page" : undefined}
              >
                {icon}
                {label}
              </Link>
            ))}
          </nav>
          <main id="admin-main" className="admin-content">
            {children}
          </main>
        </div>
      )}
    </ManagementSurface>
  );
}
