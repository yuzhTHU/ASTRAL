"use client";

import { useId, useState, type ComponentProps } from "react";
import { useUiLanguage } from "./ui-language";

/** Keep native constraint checking and focus the first invalid field. */
export function LocalizedForm({ children, ...props }: ComponentProps<"form">) {
  const en = useUiLanguage() === "en";
  const id = useId();
  const [field, setField] = useState<HTMLInputElement | null>(null);
  function clear() {
    if (field) {
      const remaining = (field.getAttribute("aria-describedby") || "")
        .split(/\s+/)
        .filter((value) => value && value !== id);
      if (remaining.length)
        field.setAttribute("aria-describedby", remaining.join(" "));
      else field.removeAttribute("aria-describedby");
      setField(null);
    }
  }
  let message = "";
  if (field?.validity.valueMissing)
    message = en ? "Please fill in this field." : "请填写此字段。";
  else if (field?.validity.tooShort)
    message = en
      ? `Enter at least ${field.minLength} characters.`
      : `请至少输入 ${field.minLength} 个字符。`;
  else if (field?.type === "url" && field.validity.typeMismatch)
    message = en ? "Enter a valid URL." : "请输入有效的网址。";
  else if (field && !field.validity.valid)
    message = en ? "Check this field." : "请检查此字段。";
  return (
    <form
      {...props}
      onInputCapture={clear}
      onClickCapture={(e) => {
        if ((e.target as HTMLElement).closest('button[type="button"]')) clear();
      }}
      onInvalidCapture={(e) => {
        if (!(e.target instanceof HTMLInputElement)) return;
        e.preventDefault();
        if (e.target !== e.currentTarget.querySelector("input:invalid")) return;
        clear();
        const description = e.target.getAttribute("aria-describedby");
        e.target.setAttribute(
          "aria-describedby",
          [description, id].filter(Boolean).join(" "),
        );
        e.target.focus();
        setField(e.target);
      }}
    >
      {children}
      {message && (
        <p id={id} className="error" role="alert">
          {message}
        </p>
      )}
    </form>
  );
}
