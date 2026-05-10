"use client";

import { cn } from "@/lib/cn";
import type { Phase } from "@/lib/realtime/events";
import styles from "./StartButton.module.scss";

export type StartButtonProps = {
  phase: Phase;
  onToggle: () => void;
};

export function StartButton({ phase, onToggle }: StartButtonProps) {
  const active = phase !== "idle" && phase !== "error";
  const speaking = phase === "speaking";

  return (
    <div className={styles.row}>
      <button
        type="button"
        className={cn(
          styles.btn,
          active && styles.btnActive,
          speaking && styles.btnSpeaking
        )}
        onClick={onToggle}
        aria-pressed={active}
      >
        <span className={styles.orb}>
          <span className={styles.orbInner} />
          {active ? (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M12 3v10" strokeLinecap="round" />
              <path d="M5 11a7 7 0 0014 0" />
              <path d="M12 18v3" strokeLinecap="round" />
              <rect x="9" y="3" width="6" height="10" rx="3" />
            </svg>
          )}
        </span>
        <span className={styles.text}>
          <span className={styles.title}>{active ? "Stop session" : "Start translating"}</span>
          <span className={cn(styles.sub, "mono")}>
            {active ? "tap to end · session is live" : "tap to grant mic & begin"}
          </span>
        </span>
      </button>
    </div>
  );
}
