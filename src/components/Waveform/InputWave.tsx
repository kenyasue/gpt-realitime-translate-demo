"use client";

import { useCallback, useRef } from "react";
import { cn } from "@/lib/cn";
import { useWaveform } from "./useWaveform";
import styles from "./Waveform.module.scss";

export type InputWaveProps = {
  stream: MediaStream | null;
  active: boolean;
  errorText?: string | null;
};

export function InputWave({ stream, active, errorText }: InputWaveProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const colorWithAlpha = useCallback(
    (a: number) => `oklch(0.78 0.085 285 / ${a})`,
    []
  );
  const { level } = useWaveform(canvasRef, { stream, active, colorWithAlpha });

  return (
    <div className={styles.wrap}>
      <canvas ref={canvasRef} className={styles.canvas} />
      <div className={styles.label}>
        <span className={cn(styles.dot, styles.dotIn)} />
        <span className="mono">INPUT</span>
        <span className={cn(styles.meter, "mono")}>
          {(level * 100).toFixed(0).padStart(2, "0")}
        </span>
      </div>
      {errorText && <div className={cn(styles.err, "mono")}>mic unavailable · {errorText}</div>}
    </div>
  );
}
