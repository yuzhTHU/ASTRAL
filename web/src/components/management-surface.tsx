"use client";

import { App, ConfigProvider, theme } from "antd";
import { useEffect, useRef, useState, type ReactNode } from "react";

/** Ant Design themes and popup containers stay within the management surface. */
export function ManagementSurface({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const sync = () =>
      setDark(localStorage.getItem("sr-harness-theme") === "dark");
    sync();
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  return (
    <div
      ref={root}
      className="admin-surface"
      data-theme={dark ? "dark" : "light"}
    >
      <ConfigProvider
        theme={{
          algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm,
          token: {
            colorPrimary: dark ? "#8aa6ff" : "#344a95",
            borderRadius: 9,
            fontFamily: "Inter, system-ui, sans-serif",
            fontSize: 14,
          },
          components: {
            Layout: {
              headerBg: dark ? "#172238" : "#fff",
              siderBg: dark ? "#172238" : "#fff",
            },
          },
        }}
        getPopupContainer={(trigger) =>
          (trigger && trigger !== document.body ? trigger.parentElement : null) ||
          root.current || document.body
        }
      >
        <App>{children}</App>
      </ConfigProvider>
    </div>
  );
}
