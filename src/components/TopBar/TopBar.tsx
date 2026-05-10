"use client";

import { cn } from "@/lib/cn";
import type { Phase } from "@/lib/realtime/events";
import { findLanguage } from "@/lib/realtime/languages";
import styles from "./TopBar.module.scss";

const PHASE_LABEL: Record<Phase, string> = {
  idle: "Ready",
  connecting: "Connecting",
  listening: "Listening",
  translating: "Translating",
  speaking: "Speaking",
  error: "Error",
};

const PHASE_DOT_CLASS: Record<Phase, string | undefined> = {
  idle: undefined,
  connecting: styles.phConnecting,
  listening: styles.phListening,
  translating: styles.phTranslating,
  speaking: styles.phSpeaking,
  error: styles.phError,
};

export type TopBarProps = {
  phase: Phase;
  sourceLanguage: string;
  targetLanguage: string;
  transcriptCount: number;
  onClear: () => void;
};

export function TopBar({
  phase,
  sourceLanguage,
  targetLanguage,
  transcriptCount,
  onClear,
}: TopBarProps) {
  const src = findLanguage(sourceLanguage);
  const tgt = findLanguage(targetLanguage);

  return (
    <header className={styles.topbar}>
      <div className={styles.brand}>
        <span className={styles.brandMark}>
          <svg viewBox="0 0 28 28" width="22" height="22" fill="none">
            <circle cx="14" cy="14" r="11" stroke="url(#brandGrad)" strokeWidth="1.6" />
            <circle cx="14" cy="14" r="5" stroke="url(#brandGrad)" strokeWidth="1.6" />
            <defs>
              <linearGradient id="brandGrad" x1="0" y1="0" x2="28" y2="28">
                <stop offset="0" stopColor="oklch(0.78 0.085 285)" />
                <stop offset="1" stopColor="oklch(0.80 0.080 200)" />
              </linearGradient>
            </defs>
          </svg>
        </span>
        <div>
          <div className={styles.brandName}>Echo</div>
          <div className={cn(styles.brandSub, "mono")}>realtime translator · v0.4</div>
        </div>
      </div>

      <div className={styles.statusPill}>
        <span className={cn(styles.statusDot, PHASE_DOT_CLASS[phase])} />
        <span className="mono">{PHASE_LABEL[phase].toUpperCase()}</span>
        <span className={styles.sep}>·</span>
        <span className={cn("mono", styles.dim)}>
          {src.flag}→{tgt.flag}
        </span>
      </div>

      <span className={styles.spacer} />

      <div className={styles.topActions}>
        <button
          type="button"
          className={cn(styles.ghostBtn, "mono")}
          onClick={onClear}
          disabled={transcriptCount === 0}
        >
          CLEAR
        </button>
      </div>
    </header>
  );
}
