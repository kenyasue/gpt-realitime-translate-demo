"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { findLanguage, type Language } from "@/lib/realtime/languages";
import styles from "./LangPicker.module.scss";

export type LangPickerProps = {
  value: string;
  onChange: (code: string) => void;
  side: "left" | "right";
  languages: readonly Language[];
};

export function LangPicker({ value, onChange, side, languages }: LangPickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const lang = findLanguage(value);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const flagClass = side === "left" ? styles.flagIn : styles.flagOut;

  return (
    <div className={styles.picker} ref={ref}>
      <button
        type="button"
        className={styles.trigger}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={cn(styles.flag, flagClass, "mono")}>{lang.flag}</span>
        <span className={styles.text}>
          <span className={cn(styles.caption, "mono")}>
            {side === "left" ? "FROM" : "TO"}
          </span>
          <span className={styles.name}>{lang.label}</span>
        </span>
        <span className={styles.caret}>▾</span>
      </button>

      {open && (
        <div className={styles.menu} role="listbox">
          <div className={styles.menuInner}>
            {languages.map((l) => (
              <button
                key={l.code}
                type="button"
                role="option"
                aria-selected={l.code === value}
                className={cn(styles.item, l.code === value && styles.itemActive)}
                onClick={() => {
                  onChange(l.code);
                  setOpen(false);
                }}
              >
                <span className={cn(styles.flag, "mono")}>{l.flag}</span>
                <span>
                  <div className={styles.itemName}>{l.label}</div>
                  <div className={cn(styles.itemRegion, "mono")}>{l.region}</div>
                </span>
                {l.code === value && <span className={styles.check}>●</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
