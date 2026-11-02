"use client";
import { memo, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { UserAccountMenu } from "@/components/user-account-menu";
import { PlatformMarkup } from "./platform-markup";
import { TreeMarkup } from "./tree-markup";
import { styles as platformStyles } from "./platform-styles";
import { styles as treeStyles } from "./tree-styles";
import { mountPlatform } from "./platform-controller";
import { mountTree } from "./tree-controller";

const Platform = memo(PlatformMarkup),
  Tree = memo(TreeMarkup);
export function ResearchWorkspace({
  manage,
  openSettings = manage,
  username,
}: {
  manage: () => void;
  openSettings?: () => void;
  username?: string;
}) {
  const [accountSlot, setAccountSlot] = useState<HTMLElement | null>(null);
  const root = useRef<HTMLDivElement>(null),
    manageRef = useRef(manage),
    settingsRef = useRef(openSettings);
  manageRef.current = manage;
  settingsRef.current = openSettings;
  useEffect(() => {
    setAccountSlot(
      root.current!.querySelector<HTMLElement>("#header-user-menu-slot"),
    );
    let dispose: (() => void) | undefined;
    // Cancel Strict Mode's first setup before touching the DOM.
    const timer = setTimeout(() => {
      dispose = mountPlatform(
        root.current!,
        () => manageRef.current(),
        () => settingsRef.current(),
      );
    }, 0);
    return () => {
      clearTimeout(timer);
      dispose?.();
      document.documentElement.classList.remove("ui-ready");
    };
  }, []);
  return (
    <div ref={root} className="research-workbench">
      <style>{platformStyles}</style>
      <style>{`.research-workbench{display:contents}.profile-field{grid-column:1/-1;display:grid;gap:8px}.profile-field small{color:var(--muted);overflow-wrap:anywhere}.profile-field button{justify-self:start}label[hidden]{display:none!important}.account-dialog{width:min(850px,95vw);max-height:90vh;overflow:auto;border:1px solid var(--line);border-radius:12px;padding:20px;background:var(--bg);color:var(--ink)}.account-dialog::backdrop{background:#0b122477}.account-dialog-close{float:right}`}</style>
      <Platform />
      {accountSlot &&
        username &&
        createPortal(
          <UserAccountMenu username={username} workbench />,
          accountSlot,
        )}
    </div>
  );
}
export function ResearchTree() {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let dispose: (() => void) | undefined;
    const timer = setTimeout(() => {
      dispose = mountTree(root.current!);
    }, 0);
    return () => {
      clearTimeout(timer);
      dispose?.();
    };
  }, []);
  return (
    <div ref={root} className="research-tree" style={{ display: "contents" }}>
      <style>{treeStyles}</style>
      <style>{`:root[data-theme="dark"] .node-label,:root[data-theme="dark"] .root-label{fill:var(--ink)}`}</style>
      <Tree />
    </div>
  );
}
