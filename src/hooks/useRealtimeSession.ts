"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RealtimeClient } from "@/lib/realtime/RealtimeClient";
import type { Phase } from "@/lib/realtime/events";

export type TranscriptTurn = {
  id: number;
  src: string;
  tgt: string;
  srcText: string;
  tgtText: string;
  ts: number;
};

const MAX_TURNS = 500;

/** Mime type candidates for MediaRecorder, ordered by preference. */
const RECORD_MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/mp4",
];

function pickRecordMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  for (const m of RECORD_MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported?.(m)) return m;
  }
  return undefined;
}

export type SessionRecording = {
  srcBlob: Blob | null;
  tgtBlob: Blob | null;
  mime: string;
  startedAt: number;
  endedAt: number;
};

export type UseRealtimeSessionResult = {
  phase: Phase;
  transcript: TranscriptTurn[];
  interimSrc: string;
  interimTgt: string;
  inputStream: MediaStream | null;
  outputStream: MediaStream | null;
  recording: SessionRecording | null;
  error: string | null;
  start: (sourceLanguage: string, targetLanguage: string, inputDeviceId: string) => Promise<void>;
  stop: () => Promise<void>;
  setLanguages: (sourceLanguage: string, targetLanguage: string) => void;
  clearTranscript: () => void;
};

/**
 * Split text into sentences for per-sentence transcript blocks.
 *
 * - Western terminators (`.`, `!`, `?`) split when followed by whitespace
 *   to avoid breaking abbreviations like "Mr." or "U.S.".
 * - CJK terminators (`。`, `！`, `？`) always split — those scripts have no
 *   inter-sentence space convention.
 * - A trailing remainder without a terminator is also returned as a sentence
 *   (the caller passes the *finalised* text, so the tail is a real sentence).
 */
function splitSentences(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const sentences: string[] = [];
  let lastEnd = 0;
  const re = /[.!?]\s+|[。！？]\s*/g;
  while (re.exec(trimmed) !== null) {
    const piece = trimmed.slice(lastEnd, re.lastIndex).trim();
    if (piece) sentences.push(piece);
    lastEnd = re.lastIndex;
  }
  const tail = trimmed.slice(lastEnd).trim();
  if (tail) sentences.push(tail);
  return sentences;
}

export function useRealtimeSession(): UseRealtimeSessionResult {
  const clientRef = useRef<RealtimeClient | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [transcript, setTranscript] = useState<TranscriptTurn[]>([]);
  const [interimSrc, setInterimSrc] = useState("");
  const [interimTgt, setInterimTgt] = useState("");
  const [inputStream, setInputStream] = useState<MediaStream | null>(null);
  const [outputStream, setOutputStream] = useState<MediaStream | null>(null);
  const [recording, setRecording] = useState<SessionRecording | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Recorder plumbing for the original (mic) and translated (remote) streams.
  // Recorders start when their stream first becomes available and stop when
  // the session ends; chunks accumulate in the chunk refs.
  const inputRecorderRef = useRef<MediaRecorder | null>(null);
  const outputRecorderRef = useRef<MediaRecorder | null>(null);
  const inputChunksRef = useRef<Blob[]>([]);
  const outputChunksRef = useRef<Blob[]>([]);
  const recordMimeRef = useRef<string | undefined>(undefined);
  const recordStartRef = useRef<number>(0);

  // Per-utterance accumulators. We commit one or more blocks per utterance,
  // triggered by target completion (the only reliable end-of-utterance event).
  // No cross-utterance state — eliminates the desync that caused source or
  // target to occasionally vanish.
  const srcBufRef = useRef("");
  const tgtBufRef = useRef("");
  const turnIdRef = useRef(0);
  const langRef = useRef<{ src: string; tgt: string }>({ src: "en", tgt: "ja" });

  const pushBlock = useCallback((srcText: string, tgtText: string) => {
    if (!srcText && !tgtText) return;
    const id = ++turnIdRef.current;
    setTranscript((prev) => {
      const next = [
        ...prev,
        {
          id,
          src: langRef.current.src,
          tgt: langRef.current.tgt,
          srcText,
          tgtText,
          ts: Date.now(),
        },
      ];
      return next.length > MAX_TURNS ? next.slice(-MAX_TURNS) : next;
    });
  }, []);

  const commitUtterance = useCallback(() => {
    const src = srcBufRef.current.trim();
    const tgt = tgtBufRef.current.trim();
    srcBufRef.current = "";
    tgtBufRef.current = "";
    setInterimSrc("");
    setInterimTgt("");
    if (!src && !tgt) return;

    const srcSentences = splitSentences(src);
    const tgtSentences = splitSentences(tgt);
    const count = Math.max(srcSentences.length, tgtSentences.length, 1);
    console.log(
      `[useRealtimeSession] commit utterance: ${srcSentences.length} src / ${tgtSentences.length} tgt → ${count} block(s)`
    );
    for (let i = 0; i < count; i++) {
      pushBlock(srcSentences[i] ?? "", tgtSentences[i] ?? "");
    }
  }, [pushBlock]);

  const onSrcDelta = useCallback((delta: string) => {
    srcBufRef.current += delta;
    setInterimSrc(srcBufRef.current);
  }, []);

  const onSrcFinal = useCallback((text: string) => {
    // Prefer the server-authoritative final transcript when it's provided.
    if (text) srcBufRef.current = text;
    setInterimSrc(srcBufRef.current);
    // Don't commit yet — we wait for target completion to know the
    // utterance is fully translated.
  }, []);

  const onTgtDelta = useCallback((delta: string) => {
    tgtBufRef.current += delta;
    setInterimTgt(tgtBufRef.current);
  }, []);

  const onTgtFinal = useCallback(
    (text: string) => {
      if (text) tgtBufRef.current = text;
      // Target completion is the authoritative end-of-utterance signal.
      // Commit whatever accumulated on both sides.
      commitUtterance();
    },
    [commitUtterance]
  );

  const resetUtteranceState = useCallback(() => {
    srcBufRef.current = "";
    tgtBufRef.current = "";
    setInterimSrc("");
    setInterimTgt("");
  }, []);

  const startRecorder = useCallback(
    (
      stream: MediaStream,
      recorderRef: React.MutableRefObject<MediaRecorder | null>,
      chunksRef: React.MutableRefObject<Blob[]>
    ) => {
      if (typeof MediaRecorder === "undefined") return;
      // Only start once per stream; some browsers fire `ontrack` more than
      // once for a stream (e.g. on unmute).
      if (recorderRef.current) return;
      try {
        const mime = recordMimeRef.current;
        const mr = mime
          ? new MediaRecorder(stream, { mimeType: mime })
          : new MediaRecorder(stream);
        chunksRef.current = [];
        mr.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
        };
        mr.onerror = (e) => console.warn("[recorder] error:", e);
        mr.start(1000); // flush a chunk every second so we don't lose data on crash
        recorderRef.current = mr;
      } catch (err) {
        console.warn("[recorder] start failed:", err);
      }
    },
    []
  );

  const stopRecorder = useCallback(
    async (recorderRef: React.MutableRefObject<MediaRecorder | null>) => {
      const mr = recorderRef.current;
      if (!mr) return;
      recorderRef.current = null;
      if (mr.state === "inactive") return;
      await new Promise<void>((resolve) => {
        const done = () => resolve();
        mr.addEventListener("stop", done, { once: true });
        try {
          mr.stop();
        } catch {
          resolve();
        }
      });
    },
    []
  );

  const start = useCallback(
    async (sourceLanguage: string, targetLanguage: string, inputDeviceId: string) => {
      if (clientRef.current) return;
      setError(null);
      setRecording(null);
      langRef.current = { src: sourceLanguage, tgt: targetLanguage };
      resetUtteranceState();
      recordMimeRef.current = pickRecordMime();
      recordStartRef.current = Date.now();
      inputChunksRef.current = [];
      outputChunksRef.current = [];

      const client = new RealtimeClient({
        sourceLanguage,
        targetLanguage,
        inputDeviceId,
      });
      clientRef.current = client;

      client.on("phasechange", (p) => setPhase(p));
      client.on("remotetrack", (stream) => {
        setOutputStream(stream);
        startRecorder(stream, outputRecorderRef, outputChunksRef);
      });
      client.on("inputtranscriptdelta", onSrcDelta);
      client.on("inputtranscriptfinal", onSrcFinal);
      client.on("outputtranscriptdelta", onTgtDelta);
      client.on("outputtranscriptfinal", onTgtFinal);
      client.on("unknown", (event) => {
        console.debug("[realtime] unknown event:", event);
      });
      client.on("error", (err) => setError(err.message));

      try {
        await client.start();
        const local = client.getLocalStream();
        setInputStream(local);
        if (local) startRecorder(local, inputRecorderRef, inputChunksRef);
        console.log("[useRealtimeSession] client.start succeeded");
      } catch (err) {
        console.error("[useRealtimeSession] client.start threw:", err);
        setError(err instanceof Error ? err.message : String(err));
        clientRef.current = null;
      }
    },
    [onSrcDelta, onSrcFinal, onTgtDelta, onTgtFinal, resetUtteranceState, startRecorder]
  );

  const stop = useCallback(async () => {
    // Stop recorders BEFORE the client tears down media tracks — once tracks
    // end, MediaRecorder.stop() can fail to flush its final chunk.
    await Promise.all([stopRecorder(inputRecorderRef), stopRecorder(outputRecorderRef)]);
    const mime = recordMimeRef.current ?? "audio/webm";
    const srcBlob = inputChunksRef.current.length
      ? new Blob(inputChunksRef.current, { type: mime })
      : null;
    const tgtBlob = outputChunksRef.current.length
      ? new Blob(outputChunksRef.current, { type: mime })
      : null;
    inputChunksRef.current = [];
    outputChunksRef.current = [];
    if (srcBlob || tgtBlob) {
      setRecording({
        srcBlob,
        tgtBlob,
        mime,
        startedAt: recordStartRef.current,
        endedAt: Date.now(),
      });
    }

    const client = clientRef.current;
    clientRef.current = null;
    if (client) await client.stop();
    // Capture any in-flight utterance before tearing down state.
    commitUtterance();
    setInputStream(null);
    setOutputStream(null);
    setPhase("idle");
  }, [commitUtterance, stopRecorder]);

  const setLanguages = useCallback((sourceLanguage: string, targetLanguage: string) => {
    langRef.current = { src: sourceLanguage, tgt: targetLanguage };
    clientRef.current?.setLanguages(sourceLanguage, targetLanguage);
  }, []);

  const clearTranscript = useCallback(() => {
    setTranscript([]);
    setRecording(null);
    resetUtteranceState();
  }, [resetUtteranceState]);

  useEffect(() => {
    return () => {
      void clientRef.current?.stop();
      clientRef.current = null;
    };
  }, []);

  return useMemo(
    () => ({
      phase,
      transcript,
      interimSrc,
      interimTgt,
      inputStream,
      outputStream,
      recording,
      error,
      start,
      stop,
      setLanguages,
      clearTranscript,
    }),
    [
      phase,
      transcript,
      interimSrc,
      interimTgt,
      inputStream,
      outputStream,
      recording,
      error,
      start,
      stop,
      setLanguages,
      clearTranscript,
    ]
  );
}
