import {
  asInputTranscriptDelta,
  asInputTranscriptDone,
  asOutputTranscriptDelta,
  asOutputTranscriptDone,
  isErrorEvent,
  type ClientEvent,
  type Phase,
  type ServerEvent,
} from "./events";

const REALTIME_CALLS_URL =
  "https://api.openai.com/v1/realtime/translations/calls";

export type RealtimeClientOptions = {
  sourceLanguage: string;
  targetLanguage: string;
  inputDeviceId?: string;
  /** Endpoint on our own Next.js server that mints ephemeral client secrets. */
  sessionEndpoint?: string;
};

type Listeners = {
  phasechange:           (p: Phase) => void;
  inputtranscriptdelta:  (delta: string) => void;
  inputtranscriptfinal:  (text: string) => void;
  outputtranscriptdelta: (delta: string) => void;
  outputtranscriptfinal: (text: string) => void;
  remotetrack:           (stream: MediaStream) => void;
  unknown:               (event: ServerEvent) => void;
  error:                 (err: Error) => void;
};

type EventName = keyof Listeners;

export class RealtimeClient {
  private opts: Required<RealtimeClientOptions>;
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private localStream: MediaStream | null = null;
  private listeners = new Map<EventName, Set<unknown>>();
  private phase: Phase = "idle";
  /** Queued client events to flush once the datachannel opens. */
  private pendingClientEvents: ClientEvent[] = [];
  private statsInterval: ReturnType<typeof setInterval> | null = null;

  constructor(options: RealtimeClientOptions) {
    this.opts = {
      sourceLanguage: options.sourceLanguage,
      targetLanguage: options.targetLanguage,
      inputDeviceId: options.inputDeviceId ?? "default",
      sessionEndpoint: options.sessionEndpoint ?? "/api/session",
    };
  }

  /* ---------- public API ---------- */

  on<K extends EventName>(name: K, cb: Listeners[K]): () => void {
    let set = this.listeners.get(name);
    if (!set) {
      set = new Set<unknown>();
      this.listeners.set(name, set);
    }
    set.add(cb);
    return () => {
      set!.delete(cb);
    };
  }

  getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  getPhase(): Phase {
    return this.phase;
  }

  async start(): Promise<void> {
    if (this.pc) return;
    this.setPhase("connecting");
    try {
      const clientSecret = await this.mintSession();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId:
            this.opts.inputDeviceId && this.opts.inputDeviceId !== "default"
              ? { exact: this.opts.inputDeviceId }
              : undefined,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      this.localStream = stream;

      const pc = new RTCPeerConnection();
      this.pc = pc;

      // Match the cookbook demo's setup order exactly:
      // (1) create data channel before anything else,
      // (2) wire ontrack / state listeners,
      // (3) addTrack last.
      // SDP m-section ordering follows this construction order, and the
      // realtime-translation endpoint is sensitive to it.
      const dc = pc.createDataChannel("oai-events");
      this.dc = dc;
      dc.onopen = () => this.onChannelOpen();
      dc.onmessage = (msg) => this.onChannelMessage(msg);
      dc.onclose = () => console.log("[RealtimeClient] datachannel closed");
      dc.onerror = () => this.emit("error", new Error("datachannel error"));

      pc.ontrack = (e) => {
        console.log("[RealtimeClient] ontrack", {
          kind: e.track.kind,
          streams: e.streams.length,
          id: e.track.id,
          muted: e.track.muted,
          enabled: e.track.enabled,
        });
        e.track.onunmute = () => {
          console.log("[RealtimeClient] remote track unmuted");
          if (e.streams[0]) this.emit("remotetrack", e.streams[0]);
        };
        e.track.onmute = () => {
          console.log("[RealtimeClient] remote track muted");
        };
        e.track.onended = () => {
          console.log("[RealtimeClient] remote track ended");
        };
        const remote = e.streams[0];
        if (remote) this.emit("remotetrack", remote);
      };

      pc.onconnectionstatechange = () => {
        console.log("[RealtimeClient] connectionState =", pc.connectionState);
      };
      pc.oniceconnectionstatechange = () => {
        console.log("[RealtimeClient] iceConnectionState =", pc.iceConnectionState);
      };

      for (const track of stream.getAudioTracks()) {
        pc.addTrack(track, stream);
      }

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const sdpResponse = await fetch(REALTIME_CALLS_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${clientSecret}`,
          "Content-Type": "application/sdp",
        },
        body: offer.sdp,
      });
      if (!sdpResponse.ok) {
        const detail = await sdpResponse.text().catch(() => "");
        throw new Error(
          `WebRTC SDP exchange failed (${sdpResponse.status}): ${detail.slice(0, 200)}`
        );
      }
      const answerSdp = await sdpResponse.text();
      await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });

      this.startStatsPolling();
      this.setPhase("listening");
    } catch (err) {
      this.setPhase("error");
      this.emit(
        "error",
        err instanceof Error ? err : new Error(String(err))
      );
      await this.stop();
      throw err;
    }
  }

  async stop(): Promise<void> {
    this.stopStatsPolling();
    if (this.pc) {
      this.pc.getSenders().forEach((s) => {
        s.track?.stop();
      });
      this.pc.close();
      this.pc = null;
    }
    if (this.localStream) {
      this.localStream.getTracks().forEach((t) => t.stop());
      this.localStream = null;
    }
    this.dc = null;
    this.pendingClientEvents = [];
    this.setPhase("idle");
  }

  setLanguages(sourceLanguage: string, targetLanguage: string): void {
    this.opts.sourceLanguage = sourceLanguage;
    this.opts.targetLanguage = targetLanguage;
    this.sendClientEvent({
      type: "session.update",
      session: {
        audio: { output: { language: targetLanguage } },
      },
    });
  }

  /* ---------- internals ---------- */

  private async mintSession(): Promise<string> {
    const res = await fetch(this.opts.sessionEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceLanguage: this.opts.sourceLanguage,
        targetLanguage: this.opts.targetLanguage,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(
        `Session mint failed (${res.status}): ${detail.slice(0, 200)}`
      );
    }
    const json = (await res.json()) as {
      client_secret?: { value?: string };
      value?: string;
    };
    const value = json.client_secret?.value ?? json.value;
    if (!value) throw new Error("Session response missing client_secret.value");
    return value;
  }

  private onChannelOpen(): void {
    console.log("[RealtimeClient] datachannel open");
    // Don't blast a session.update on open — the language was set in the
    // client_secret mint, and re-sending it can clobber server defaults
    // (notably turn_detection / VAD). Only flush queued events from the
    // app (e.g. mid-session language changes).
    for (const pending of this.pendingClientEvents) this.sendClientEventNow(pending);
    this.pendingClientEvents = [];
  }

  private onChannelMessage(msg: MessageEvent<string>): void {
    let event: ServerEvent;
    try {
      event = JSON.parse(msg.data) as ServerEvent;
    } catch {
      return;
    }

    // Surface the actual session config so we can inspect VAD / turn detection.
    if (event.type === "session.created" || event.type === "session.updated") {
      console.log("[RealtimeClient]", event.type, JSON.stringify(event, null, 2));
    }

    const inDelta = asInputTranscriptDelta(event);
    if (inDelta !== null) {
      this.setPhase("listening");
      this.emit("inputtranscriptdelta", inDelta);
      return;
    }
    const inDone = asInputTranscriptDone(event);
    if (inDone !== null) {
      this.setPhase("translating");
      this.emit("inputtranscriptfinal", inDone);
      return;
    }
    const outDelta = asOutputTranscriptDelta(event);
    if (outDelta !== null) {
      this.setPhase("speaking");
      this.emit("outputtranscriptdelta", outDelta);
      return;
    }
    const outDone = asOutputTranscriptDone(event);
    if (outDone !== null) {
      this.emit("outputtranscriptfinal", outDone);
      this.setPhase("listening");
      return;
    }
    // Drive phase from server-side audio buffer state when transcripts
    // aren't available — at minimum the user gets a "speaking" indicator
    // so the OutputWave lights up.
    if (event.type === "output_audio_buffer.started") {
      this.setPhase("speaking");
      return;
    }
    if (
      event.type === "output_audio_buffer.stopped" ||
      event.type === "output_audio_buffer.cleared"
    ) {
      this.setPhase("listening");
      return;
    }
    if (isErrorEvent(event)) {
      this.emit("error", new Error(event.error.message));
      return;
    }

    this.emit("unknown", event);
  }

  private sendClientEvent(event: ClientEvent): void {
    if (this.dc?.readyState === "open") {
      this.sendClientEventNow(event);
    } else {
      this.pendingClientEvents.push(event);
    }
  }

  private sendClientEventNow(event: ClientEvent): void {
    try {
      this.dc?.send(JSON.stringify(event));
    } catch (err) {
      this.emit("error", err instanceof Error ? err : new Error(String(err)));
    }
  }

  private startStatsPolling(): void {
    this.stopStatsPolling();
    let lastBytesSent = 0;
    let lastBytesReceived = 0;
    this.statsInterval = setInterval(async () => {
      const pc = this.pc;
      if (!pc) return;
      try {
        const stats = await pc.getStats();
        let bytesSent = 0;
        let bytesReceived = 0;
        let packetsSent = 0;
        let packetsReceived = 0;
        stats.forEach((report) => {
          if (report.type === "outbound-rtp" && (report as { kind?: string }).kind === "audio") {
            bytesSent = (report as { bytesSent?: number }).bytesSent ?? 0;
            packetsSent = (report as { packetsSent?: number }).packetsSent ?? 0;
          }
          if (report.type === "inbound-rtp" && (report as { kind?: string }).kind === "audio") {
            bytesReceived = (report as { bytesReceived?: number }).bytesReceived ?? 0;
            packetsReceived = (report as { packetsReceived?: number }).packetsReceived ?? 0;
          }
        });
        const sentDelta = bytesSent - lastBytesSent;
        const recvDelta = bytesReceived - lastBytesReceived;
        lastBytesSent = bytesSent;
        lastBytesReceived = bytesReceived;
        console.log(
          `[RealtimeClient] rtp 1s: sent ${sentDelta}B/${packetsSent}pkts | recv ${recvDelta}B/${packetsReceived}pkts`
        );
      } catch (err) {
        console.warn("[RealtimeClient] getStats failed:", err);
      }
    }, 1000);
  }

  private stopStatsPolling(): void {
    if (this.statsInterval) {
      clearInterval(this.statsInterval);
      this.statsInterval = null;
    }
  }

  private setPhase(p: Phase): void {
    if (this.phase === p) return;
    this.phase = p;
    this.emit("phasechange", p);
  }

  private emit<K extends EventName>(name: K, ...args: Parameters<Listeners[K]>): void {
    const set = this.listeners.get(name);
    if (!set) return;
    for (const cb of set) {
      try {
        (cb as (...a: unknown[]) => void)(...args);
      } catch (err) {
        // keep iterating other listeners; surface via console rather than re-emit
        console.error("[RealtimeClient] listener threw:", err);
      }
    }
  }
}
