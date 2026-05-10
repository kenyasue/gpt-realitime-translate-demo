"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { TopBar } from "@/components/TopBar/TopBar";
import { LangPicker } from "@/components/LangPicker/LangPicker";
import { InputWave } from "@/components/Waveform/InputWave";
import { OutputWave } from "@/components/Waveform/OutputWave";
import { StartButton } from "@/components/StartButton/StartButton";
import { Transcript } from "@/components/Transcript/Transcript";
import { SettingsPane, type PermissionState } from "@/components/SettingsPane/SettingsPane";
import { useDevices } from "@/hooks/useDevices";
import { useRealtimeSession } from "@/hooks/useRealtimeSession";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { setOutputSink, supportsSinkId } from "@/lib/audio/sink";
import {
  INPUT_LANGUAGES,
  OUTPUT_LANGUAGES,
  findLanguage,
  isOutputLanguage,
} from "@/lib/realtime/languages";
import { audioExtension, downloadBlob, timestampSlug } from "@/lib/download";
import styles from "./Translator.module.scss";

export function Translator() {
  const [srcLang, setSrcLang] = useState("en");
  const [tgtLang, setTgtLang] = useState("ja");
  const [inputDevice, setInputDevice] = useState("default");
  const [outputDevice, setOutputDevice] = useState("default");
  const [volume, setVolume] = useState(0.8);
  const [permission, setPermission] = useState<PermissionState>("prompt");
  const [latencyMs] = useState<number | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  const { inputs, outputs, refresh } = useDevices();
  const session = useRealtimeSession();

  // Wire remote stream onto the hidden <audio> element.
  // We re-run on every outputStream identity change — and the
  // RealtimeClient re-emits the same stream on track unmute, so this
  // effect doubles as the "kick playback when audio actually arrives"
  // trigger.
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    if (!session.outputStream) {
      el.srcObject = null;
      return;
    }
    // Only re-assign srcObject if it changed, otherwise just resume.
    if (el.srcObject !== session.outputStream) {
      el.srcObject = session.outputStream;
    }
    const tracks = session.outputStream.getAudioTracks();
    const t = tracks[0];
    console.log("[Translator] remote stream attached", {
      tracks: tracks.length,
      muted: t?.muted,
      enabled: t?.enabled,
      readyState: t?.readyState,
      audioPaused: el.paused,
      audioMuted: el.muted,
      audioVolume: el.volume,
      audioReadyState: el.readyState,
    });
    el.muted = false;
    el.play().then(
      () => console.log("[Translator] audio.play() ok, paused=", el.paused),
      (err) => console.warn("[Translator] audio.play() rejected:", err)
    );
  }, [session.outputStream]);

  // Apply volume + sink whenever they change
  useEffect(() => {
    const el = audioRef.current;
    if (el) el.volume = volume;
  }, [volume]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el || !supportsSinkId()) return;
    void setOutputSink(el, outputDevice).catch((err) => {
      console.warn("setSinkId failed:", err);
    });
  }, [outputDevice]);

  // Push language updates to the active session — but only when the
  // language actually changes. Depending on `session` (which is a fresh
  // memo on every internal state tick) sends a session.update for every
  // re-render, which spams the server with redundant updates.
  const setLanguagesRef = useRef(session.setLanguages);
  setLanguagesRef.current = session.setLanguages;
  useEffect(() => {
    setLanguagesRef.current(srcLang, tgtLang);
  }, [srcLang, tgtLang]);

  const handleToggle = useCallback(async () => {
    console.log("[Translator] handleToggle, phase=", session.phase);
    if (session.phase === "idle" || session.phase === "error") {
      // request permission first so device labels populate
      try {
        const probe = await navigator.mediaDevices.getUserMedia({ audio: true });
        probe.getTracks().forEach((t) => t.stop());
        setPermission("granted");
        await refresh();
        console.log("[Translator] mic permission granted");
      } catch (err) {
        console.warn("[Translator] mic permission denied:", err);
        setPermission("denied");
      }
      console.log("[Translator] calling session.start", { srcLang, tgtLang, inputDevice });
      await session.start(srcLang, tgtLang, inputDevice);
      console.log("[Translator] session.start returned");
    } else {
      await session.stop();
    }
  }, [session, srcLang, tgtLang, inputDevice, refresh]);

  const canSwap = isOutputLanguage(srcLang);
  const handleSwap = useCallback(() => {
    if (!isOutputLanguage(srcLang)) return;
    setSrcLang(tgtLang);
    setTgtLang(srcLang);
  }, [srcLang, tgtLang]);

  const handleDownloadTranscript = useCallback(() => {
    if (session.transcript.length === 0) return;
    const lines = session.transcript.flatMap((t) => {
      const ts = new Date(t.ts).toLocaleTimeString();
      const srcName = findLanguage(t.src).label.toUpperCase();
      const tgtName = findLanguage(t.tgt).label.toUpperCase();
      return [
        `[${ts}] ${findLanguage(t.src).flag} → ${findLanguage(t.tgt).flag}`,
        `${srcName}: ${t.srcText}`,
        `${tgtName}: ${t.tgtText}`,
        "",
      ];
    });
    const text = lines.join("\n");
    downloadBlob(text, `transcript-${timestampSlug()}.txt`);
  }, [session.transcript]);

  const handleDownloadOriginalAudio = useCallback(() => {
    const blob = session.recording?.srcBlob;
    if (!blob) return;
    const ext = audioExtension(session.recording!.mime);
    const ts = timestampSlug(new Date(session.recording!.startedAt));
    downloadBlob(blob, `original-${srcLang}-${ts}.${ext}`);
  }, [session.recording, srcLang]);

  const handleDownloadTranslatedAudio = useCallback(() => {
    const blob = session.recording?.tgtBlob;
    if (!blob) return;
    const ext = audioExtension(session.recording!.mime);
    const ts = timestampSlug(new Date(session.recording!.startedAt));
    downloadBlob(blob, `translated-${tgtLang}-${ts}.${ext}`);
  }, [session.recording, tgtLang]);

  useKeyboardShortcuts({
    onToggle: () => void handleToggle(),
    onStop: () => {
      if (session.phase !== "idle" && session.phase !== "error") void session.stop();
    },
  });

  return (
    <div className={styles.root}>
      <TopBar
        phase={session.phase}
        sourceLanguage={srcLang}
        targetLanguage={tgtLang}
        transcriptCount={session.transcript.length}
        hasOriginalAudio={Boolean(session.recording?.srcBlob)}
        hasTranslatedAudio={Boolean(session.recording?.tgtBlob)}
        onClear={session.clearTranscript}
        onDownloadTranscript={handleDownloadTranscript}
        onDownloadOriginalAudio={handleDownloadOriginalAudio}
        onDownloadTranslatedAudio={handleDownloadTranslatedAudio}
      />

      <main className={styles.main}>
        <section className={styles.center}>
          <div className={styles.langPair}>
            <LangPicker
              value={srcLang}
              onChange={setSrcLang}
              side="left"
              languages={INPUT_LANGUAGES}
            />
            <button
              type="button"
              className={styles.swap}
              onClick={handleSwap}
              disabled={!canSwap}
              title={canSwap ? "Swap languages" : "Source language can't be a translation target"}
              aria-label="Swap languages"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" strokeWidth="1.6"
                   strokeLinecap="round" strokeLinejoin="round">
                <path d="M7 4l-3 3 3 3" />
                <path d="M4 7h13a3 3 0 013 3" />
                <path d="M17 20l3-3-3-3" />
                <path d="M20 17H7a3 3 0 01-3-3" />
              </svg>
            </button>
            <LangPicker
              value={tgtLang}
              onChange={setTgtLang}
              side="right"
              languages={OUTPUT_LANGUAGES}
            />
          </div>

          <div className={styles.waves}>
            <InputWave
              stream={session.inputStream}
              active={session.phase !== "idle" && session.phase !== "error"}
              errorText={
                permission === "denied"
                  ? "permission denied"
                  : session.error && session.inputStream === null
                  ? session.error
                  : null
              }
            />
            <OutputWave
              stream={session.outputStream}
              active={session.outputStream != null}
            />
          </div>

          <StartButton phase={session.phase} onToggle={() => void handleToggle()} />
        </section>

        <Transcript
          turns={session.transcript}
          interimSrc={session.interimSrc}
          interimTgt={session.interimTgt}
          phase={session.phase}
          sourceLanguage={srcLang}
          targetLanguage={tgtLang}
        />

        <SettingsPane
          inputDevices={inputs}
          outputDevices={outputs}
          inputDevice={inputDevice}
          outputDevice={outputDevice}
          volume={volume}
          permission={permission}
          latencyMs={latencyMs}
          onInputDeviceChange={setInputDevice}
          onOutputDeviceChange={setOutputDevice}
          onVolumeChange={setVolume}
        />
      </main>

      {session.error && (
        <div className={styles.errorBanner} role="alert">
          {session.error}
        </div>
      )}

      <audio ref={audioRef} className={styles.audio} autoPlay playsInline />
    </div>
  );
}
