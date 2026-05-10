"use client";

import { useCallback, useRef } from "react";
import { cn } from "@/lib/cn";
import { useWaveform } from "./useWaveform";
import styles from "./Waveform.module.scss";

export type OutputWaveProps = {
  stream: MediaStream | null;
  active: boolean;
};

export function OutputWave({ stream, active }: OutputWaveProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const colorWithAlpha = useCallback(
    (a: number) => `oklch(0.80 0.080 200 / ${a})`,
    []
  );
  const { level } = useWaveform(canvasRef, { stream, active, colorWithAlpha });

  return (
    <div className={styles.wrap}>
      <canvas ref={canvasRef} className={styles.canvas} />
      <div className={styles.label}>
        <span className={cn(styles.dot, styles.dotOut)} />
        <span className="mono">OUTPUT</span>
        <span className={cn(styles.meter, "mono")}>
          {active ? (level * 100).toFixed(0).padStart(2, "0") : "00"}
        </span>
      </div>
    </div>
  );
}
