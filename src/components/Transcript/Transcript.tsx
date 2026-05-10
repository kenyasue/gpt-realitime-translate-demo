"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";
import type { Phase } from "@/lib/realtime/events";
import { findLanguage } from "@/lib/realtime/languages";
import type { TranscriptTurn } from "@/hooks/useRealtimeSession";
import styles from "./Transcript.module.scss";

export type TranscriptProps = {
  turns: TranscriptTurn[];
  interimSrc: string;
  interimTgt: string;
  phase: Phase;
  sourceLanguage: string;
  targetLanguage: string;
};

const LIVE_LABEL: Record<Phase, string> = {
  idle: "ready…",
  connecting: "connecting…",
  listening: "hearing you…",
  translating: "translating…",
  speaking: "speaking…",
  error: "error",
};


export function Transcript({
  turns,
  interimSrc,
  interimTgt,
  phase,
  sourceLanguage,
  targetLanguage,
}: TranscriptProps) {
  const bodyRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 1e9, behavior: "smooth" });
  }, [turns, interimSrc, interimTgt]);

  const srcLang = findLanguage(sourceLanguage);
  const tgtLang = findLanguage(targetLanguage);
  const showLive = Boolean(interimSrc || interimTgt);
  const showEmpty = turns.length === 0 && !showLive;

  return (
    <section className={styles.pane}>
      <div className={styles.head}>
        <div>
          <div className={styles.title}>Transcript</div>
          <div className={cn(styles.sub, "mono")}>
            live · {turns.length} turn{turns.length === 1 ? "" : "s"}
          </div>
        </div>
        <div className={styles.legend}>
          <span className={styles.legendRow}>
            <span className={cn(styles.legendDot, styles.legendDotIn)} />
            <span className="mono">SOURCE</span>
          </span>
          <span className={styles.legendRow}>
            <span className={cn(styles.legendDot, styles.legendDotOut)} />
            <span className="mono">TRANSLATION</span>
          </span>
        </div>
      </div>

      <div className={styles.body} ref={bodyRef}>
        {showEmpty && (
          <div className={styles.empty}>
            <div className={styles.emptyEye} />
            <p>Start a session and your conversation will stream here, line by line.</p>
            <p className={cn(styles.emptyDim, "mono")}>
              microphone audio is processed locally before reaching OpenAI
            </p>
          </div>
        )}

        {turns.map((t) => {
          const tSrc = findLanguage(t.src);
          const tTgt = findLanguage(t.tgt);
          return (
            <div className={styles.turn} key={t.id}>
              <div className={cn(styles.meta, "mono")}>
                <span>
                  {new Date(t.ts).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </span>
                <span className={styles.metaDim}>·</span>
                <span>
                  {tSrc.flag} → {tTgt.flag}
                </span>
              </div>
              {t.srcText && (
                <div className={cn(styles.line, styles.lineSrc)}>
                  <span className={cn(styles.tag, styles.tagIn, "mono")}>{tSrc.flag}</span>
                  <span className={styles.text}>{t.srcText}</span>
                </div>
              )}
              {t.tgtText && (
                <div className={cn(styles.line, styles.lineTgt)}>
                  <span className={cn(styles.tag, styles.tagOut, "mono")}>{tTgt.flag}</span>
                  <span className={styles.text}>{t.tgtText}</span>
                </div>
              )}
            </div>
          );
        })}

        {showLive && (
          <div className={cn(styles.turn, styles.turnLive)}>
            <div className={cn(styles.meta, "mono")}>
              <span className={styles.pulse} />
              <span>{LIVE_LABEL[phase]}</span>
            </div>
            {interimSrc && (
              <div className={cn(styles.line, styles.lineSrc, styles.lineInterim)}>
                <span className={cn(styles.tag, styles.tagIn, "mono")}>{srcLang.flag}</span>
                <span className={styles.text}>
                  {interimSrc}
                  <span className={styles.cursor}>▌</span>
                </span>
              </div>
            )}
            {interimTgt && (
              <div className={cn(styles.line, styles.lineTgt, styles.lineInterim)}>
                <span className={cn(styles.tag, styles.tagOut, "mono")}>{tgtLang.flag}</span>
                <span className={styles.text}>
                  {interimTgt}
                  <span className={styles.cursor}>▌</span>
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
