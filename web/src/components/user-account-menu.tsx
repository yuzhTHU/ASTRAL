"use client";

import { useEffect, useState } from "react";
import { Avatar, Button, ConfigProvider, Dropdown, theme } from "antd";
import { DownOutlined, LogoutOutlined } from "@ant-design/icons";
import { api } from "@/lib/client";

export function UserAccountMenu({
  username,
  workbench = false,
}: {
  username: string;
  workbench?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dark, setDark] = useState(false);
  useEffect(() => {
    if (!workbench) return;
    const sync = () =>
      setDark(
        (document.documentElement.dataset.theme ||
          localStorage.getItem("sr-harness-theme")) === "dark",
      );
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, [workbench]);
  const label = `用户菜单 / User menu: ${username}`;
  const content = (
    <Dropdown
      open={open}
      onOpenChange={(next, info) => {
        if (info.source === "trigger") setOpen(next);
      }}
      trigger={["click"]}
      menu={{
        items: [
          {
            key: "logout",
            icon: <LogoutOutlined aria-hidden />,
            label: busy ? "正在退出… / Logging out" : "退出登录 / Logout",
            disabled: busy,
            danger: true,
          },
          ...(error
            ? [
                {
                  key: "error",
                  label: <span role="alert">{error}</span>,
                  disabled: true,
                },
              ]
            : []),
        ],
        onClick: async ({ key }) => {
          if (key !== "logout" || busy) return;
          setBusy(true);
          setError("");
          try {
            await api("auth/logout", "POST", {});
            location.assign("/");
          } catch (e) {
            setError(String(e));
            setBusy(false);
            setOpen(true);
          }
        },
      }}
    >
      {workbench ? (
        <button
          type="button"
          className="header-toggle user-account-trigger"
          aria-label={label}
          title={username}
          aria-haspopup="menu"
          aria-expanded={open}
        >
          <span className="user-account-name">{username}</span>
          <DownOutlined aria-hidden />
        </button>
      ) : (
        <Button
          className="user-account-trigger"
          aria-label={label}
          title={username}
          aria-haspopup="menu"
          aria-expanded={open}
        >
          <Avatar size="small">{username[0]?.toUpperCase()}</Avatar>
          <span className="user-account-name">{username}</span>
          <DownOutlined aria-hidden />
        </Button>
      )}
    </Dropdown>
  );
  return workbench ? (
    <ConfigProvider
      theme={{
        algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: { colorPrimary: dark ? "#8aa6ff" : "#344a95", borderRadius: 9 },
      }}
      getPopupContainer={() => document.body}
    >
      {content}
    </ConfigProvider>
  ) : (
    content
  );
}
