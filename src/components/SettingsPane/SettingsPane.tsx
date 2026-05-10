"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { cn } from "@/lib/cn";
import { supportsSinkId } from "@/lib/audio/sink";
import styles from "./SettingsPane.module.scss";

export type PermissionState = "prompt" | "granted" | "denied";

export type SettingsPaneProps = {
  inputDevices: MediaDeviceInfo[];
  outputDevices: MediaDeviceInfo[];
  inputDevice: string;
  outputDevice: string;
  volume: number;
  permission: PermissionState;
  latencyMs: number | null;
  onInputDeviceChange: (id: string) => void;
  onOutputDeviceChange: (id: string) => void;
  onVolumeChange: (v: number) => void;
};

export function SettingsPane({
  inputDevices,
  outputDevices,
  inputDevice,
  outputDevice,
  volume,
  permission,
  latencyMs,
  onInputDeviceChange,
  onOutputDeviceChange,
  onVolumeChange,
}: SettingsPaneProps) {
  // Defer the feature-detect to client-mount so server and first-client
  // renders agree (avoids React hydration mismatch). Optimistically assume
  // support on both — Chromium will stay `true`, Safari/Firefox flip to
  // `false` after mount and the "system only" badge appears.
  const [sinkSupported, setSinkSupported] = useState(true);
  useEffect(() => {
    setSinkSupported(supportsSinkId());
  }, []);

  const sliderStyle: CSSProperties = {
    ["--pct" as string]: `${Math.round(volume * 100)}%`,
  };

  return (
    <aside className={styles.aside}>
      <div className={styles.head}>
        <div>
          <div className={styles.title}>Audio</div>
          <div className={cn(styles.sub, "mono")}>devices · output</div>
        </div>
      </div>

      <div className={styles.body}>
        {/* Microphone */}
        <label className={styles.control}>
          <span className={cn(styles.label, "mono")}>MICROPHONE</span>
          <div className={styles.selectWrap}>
            <select
              value={inputDevice}
              onChange={(e) => onInputDeviceChange(e.target.value)}
            >
              <option value="default">System default</option>
              {inputDevices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `audioinput · ${d.deviceId.slice(0, 6)}`}
                </option>
              ))}
            </select>
            <span className={styles.caret}>▾</span>
          </div>
        </label>

        {/* Speaker */}
        <label className={styles.control}>
          <span className={cn(styles.label, "mono")}>
            SPEAKER
            {!sinkSupported && (
              <span className={styles.readout} title="Browser does not support setSinkId">
                system only
              </span>
            )}
          </span>
          <div className={styles.selectWrap}>
            <select
              value={outputDevice}
              onChange={(e) => onOutputDeviceChange(e.target.value)}
              disabled={!sinkSupported}
            >
              <option value="default">System default</option>
              {outputDevices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `audiooutput · ${d.deviceId.slice(0, 6)}`}
                </option>
              ))}
            </select>
            <span className={styles.caret}>▾</span>
          </div>
        </label>

        {/* Volume */}
        <label className={styles.control}>
          <span className={cn(styles.label, "mono")}>
            OUTPUT VOLUME
            <span className={cn(styles.readout, "mono")}>
              {Math.round(volume * 100)}
            </span>
          </span>
          <div className={styles.sliderRow}>
            <span className={styles.sliderIcon} aria-hidden="true">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M5 9v6h4l5 4V5L9 9H5z" />
              </svg>
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
              style={sliderStyle}
            />
            <span className={styles.sliderIcon} aria-hidden="true">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M5 9v6h4l5 4V5L9 9H5z" />
                <path d="M16 8a5 5 0 010 8" />
                <path d="M19 5a9 9 0 010 14" />
              </svg>
            </span>
          </div>
        </label>

        <div className={styles.hr} />

        {/* Meta */}
        <div className={styles.metaGrid}>
          <div className={styles.metaCell}>
            <div className={cn(styles.metaKey, "mono")}>MODEL</div>
            <div className={styles.metaVal}>gpt-realtime-translate</div>
          </div>
          <div className={styles.metaCell}>
            <div className={cn(styles.metaKey, "mono")}>LATENCY</div>
            <div className={styles.metaVal}>
              {latencyMs == null ? "—" : `~${latencyMs}ms`}
            </div>
          </div>
          <div className={styles.metaCell}>
            <div className={cn(styles.metaKey, "mono")}>VOICE</div>
            <div className={styles.metaVal}>alloy · soft</div>
          </div>
          <div className={styles.metaCell}>
            <div className={cn(styles.metaKey, "mono")}>PERM</div>
            <div
              className={cn(
                styles.metaVal,
                permission === "denied" && styles.metaWarn
              )}
            >
              {permission === "granted" ? "granted" : permission === "denied" ? "denied" : "pending"}
            </div>
          </div>
        </div>

        <div className={cn(styles.hint, "mono")}>
          <span className={styles.hintDot} />
          press <kbd className={styles.kbd}>space</kbd> to start ·{" "}
          <kbd className={styles.kbd}>esc</kbd> to stop
        </div>
      </div>
    </aside>
  );
}
