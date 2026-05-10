"use client";

import { useEffect } from "react";

export type KeyboardShortcuts = {
  onToggle?: () => void;
  onStop?: () => void;
};

export function useKeyboardShortcuts({ onToggle, onStop }: KeyboardShortcuts): void {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target?.matches?.("input, textarea, select, [contenteditable='true']")) return;

      if (e.code === "Space") {
        e.preventDefault();
        onToggle?.();
      } else if (e.code === "Escape") {
        onStop?.();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onToggle, onStop]);
}
