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

export type UseRealtimeSessionResult = {
  phase: Phase;
  transcript: TranscriptTurn[];
  interimSrc: string;
  interimTgt: string;
  inputStream: MediaStream | null;
  outputStream: MediaStream | null;
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
  const [error, setError] = useState<string | null>(null);

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

  const start = useCallback(
    async (sourceLanguage: string, targetLanguage: string, inputDeviceId: string) => {
      if (clientRef.current) return;
      setError(null);
      langRef.current = { src: sourceLanguage, tgt: targetLanguage };
      resetUtteranceState();

      const client = new RealtimeClient({
        sourceLanguage,
        targetLanguage,
        inputDeviceId,
      });
      clientRef.current = client;

      client.on("phasechange", (p) => setPhase(p));
      client.on("remotetrack", (stream) => setOutputStream(stream));
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
        setInputStream(client.getLocalStream());
        console.log("[useRealtimeSession] client.start succeeded");
      } catch (err) {
        console.error("[useRealtimeSession] client.start threw:", err);
        setError(err instanceof Error ? err.message : String(err));
        clientRef.current = null;
      }
    },
    [onSrcDelta, onSrcFinal, onTgtDelta, onTgtFinal, resetUtteranceState]
  );

  const stop = useCallback(async () => {
    const client = clientRef.current;
    clientRef.current = null;
    if (client) await client.stop();
    // Capture any in-flight utterance before tearing down state.
    commitUtterance();
    setInputStream(null);
    setOutputStream(null);
    setPhase("idle");
  }, [commitUtterance]);

  const setLanguages = useCallback((sourceLanguage: string, targetLanguage: string) => {
    langRef.current = { src: sourceLanguage, tgt: targetLanguage };
    clientRef.current?.setLanguages(sourceLanguage, targetLanguage);
  }, []);

  const clearTranscript = useCallback(() => {
    setTranscript([]);
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
      error,
      start,
      stop,
      setLanguages,
      clearTranscript,
    ]
  );
}
