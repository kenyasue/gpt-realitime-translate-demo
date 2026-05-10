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
 * Split text into completed sentences and a trailing partial.
 *
 * - Western terminators (`.`, `!`, `?`) only count when followed by whitespace,
 *   so abbreviations like "Mr." don't trigger a false split mid-stream.
 * - CJK terminators (`。`, `！`, `？`) always split — those scripts have no
 *   inter-sentence space convention.
 *
 * Use during delta streaming to peel off completed sentences while
 * `remainder` keeps the in-flight tail.
 */
function extractSentences(text: string): { sentences: string[]; remainder: string } {
  const sentences: string[] = [];
  let lastEnd = 0;
  const re = /[.!?]\s+|[。！？]/g;
  while (re.exec(text) !== null) {
    const end = re.lastIndex;
    const sentence = text.slice(lastEnd, end).trim();
    if (sentence) sentences.push(sentence);
    lastEnd = end;
  }
  return { sentences, remainder: text.slice(lastEnd) };
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

  // Sentence-pairing state. The src and tgt streams arrive independently;
  // we extract complete sentences from each and pair them FIFO so each
  // commit produces one block with both languages.
  const srcQueueRef = useRef<string[]>([]); // completed src sentences awaiting a pair
  const tgtQueueRef = useRef<string[]>([]); // completed tgt sentences awaiting a pair
  const srcBufRef = useRef("");             // current partial src sentence
  const tgtBufRef = useRef("");             // current partial tgt sentence
  const srcDoneRef = useRef(false);         // input_transcript.completed seen for this utterance
  const tgtDoneRef = useRef(false);         // output_transcript.completed seen for this utterance
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

  // Pair as many sentences as both queues currently support.
  const tryPair = useCallback(() => {
    while (srcQueueRef.current.length && tgtQueueRef.current.length) {
      pushBlock(srcQueueRef.current.shift()!, tgtQueueRef.current.shift()!);
    }
  }, [pushBlock]);

  // Once both completed events have fired, dump any remaining sentences
  // from either queue as solo blocks (mismatched counts can happen when
  // the model collapses or splits sentences across languages).
  const drainAfterUtterance = useCallback(() => {
    if (!srcDoneRef.current || !tgtDoneRef.current) return;
    while (srcQueueRef.current.length || tgtQueueRef.current.length) {
      const srcText = srcQueueRef.current.shift() ?? "";
      const tgtText = tgtQueueRef.current.shift() ?? "";
      if (!srcText && !tgtText) break;
      pushBlock(srcText, tgtText);
    }
    srcDoneRef.current = false;
    tgtDoneRef.current = false;
  }, [pushBlock]);

  const onSrcDelta = useCallback(
    (delta: string) => {
      srcBufRef.current += delta;
      const { sentences, remainder } = extractSentences(srcBufRef.current);
      if (sentences.length > 0) srcQueueRef.current.push(...sentences);
      srcBufRef.current = remainder;
      setInterimSrc(remainder);
      tryPair();
    },
    [tryPair]
  );

  const onTgtDelta = useCallback(
    (delta: string) => {
      tgtBufRef.current += delta;
      const { sentences, remainder } = extractSentences(tgtBufRef.current);
      if (sentences.length > 0) tgtQueueRef.current.push(...sentences);
      tgtBufRef.current = remainder;
      setInterimTgt(remainder);
      tryPair();
    },
    [tryPair]
  );

  const onSrcFinal = useCallback(
    (text: string) => {
      // Server-authoritative text — prefer it over our delta accumulation.
      const final = text || srcBufRef.current;
      const { sentences, remainder } = extractSentences(final);
      if (sentences.length > 0) srcQueueRef.current.push(...sentences);
      if (remainder.trim()) srcQueueRef.current.push(remainder.trim());
      srcBufRef.current = "";
      setInterimSrc("");
      srcDoneRef.current = true;
      tryPair();
      drainAfterUtterance();
    },
    [tryPair, drainAfterUtterance]
  );

  const onTgtFinal = useCallback(
    (text: string) => {
      const final = text || tgtBufRef.current;
      const { sentences, remainder } = extractSentences(final);
      if (sentences.length > 0) tgtQueueRef.current.push(...sentences);
      if (remainder.trim()) tgtQueueRef.current.push(remainder.trim());
      tgtBufRef.current = "";
      setInterimTgt("");
      tgtDoneRef.current = true;
      tryPair();
      drainAfterUtterance();
    },
    [tryPair, drainAfterUtterance]
  );

  const resetPairingState = useCallback(() => {
    srcQueueRef.current = [];
    tgtQueueRef.current = [];
    srcBufRef.current = "";
    tgtBufRef.current = "";
    srcDoneRef.current = false;
    tgtDoneRef.current = false;
    setInterimSrc("");
    setInterimTgt("");
  }, []);

  const start = useCallback(
    async (sourceLanguage: string, targetLanguage: string, inputDeviceId: string) => {
      if (clientRef.current) return;
      setError(null);
      langRef.current = { src: sourceLanguage, tgt: targetLanguage };
      resetPairingState();

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
        // Unknown events are non-fatal; log so the implementer can spot
        // protocol drift between this code and the live API.
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
    [onSrcDelta, onSrcFinal, onTgtDelta, onTgtFinal, resetPairingState]
  );

  const stop = useCallback(async () => {
    const client = clientRef.current;
    clientRef.current = null;
    if (client) await client.stop();
    setInputStream(null);
    setOutputStream(null);
    resetPairingState();
    setPhase("idle");
  }, [resetPairingState]);

  const setLanguages = useCallback((sourceLanguage: string, targetLanguage: string) => {
    langRef.current = { src: sourceLanguage, tgt: targetLanguage };
    clientRef.current?.setLanguages(sourceLanguage, targetLanguage);
  }, []);

  const clearTranscript = useCallback(() => {
    setTranscript([]);
    resetPairingState();
  }, [resetPairingState]);

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
