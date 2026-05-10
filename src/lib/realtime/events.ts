/**
 * Typed view of the events flowing on the WebRTC datachannel.
 *
 * The translation API is documented at
 * https://developers.openai.com/api/docs/guides/realtime-translation.
 *
 * We model events permissively — the union has explicit shapes for the
 * messages we react to, plus an `UnknownEvent` fallback so the parser can
 * still surface and log new types without crashing.
 */

export type Phase =
  | "idle"
  | "connecting"
  | "listening"
  | "translating"
  | "speaking"
  | "error";

export type SessionInfo = {
  id: string;
  model?: string;
};

export type ServerEvent =
  | { type: "session.created"; session: SessionInfo }
  | { type: "session.updated"; session: SessionInfo }
  | { type: "session.input_transcript.delta"; delta: string }
  | { type: "session.input_transcript.completed"; transcript: string }
  | { type: "session.output_transcript.delta"; delta: string }
  | { type: "session.output_transcript.completed"; transcript: string }
  | { type: "error"; error: { message: string; code?: string } }
  | UnknownEvent;

export type UnknownEvent = { type: string } & Record<string, unknown>;

export type ClientEvent =
  | {
      type: "session.update";
      session: {
        audio?: {
          output?: { language?: string; voice?: string };
        };
      };
    }
  | UnknownEvent;

/**
 * Live OpenAI Realtime API uses several event-type variants for transcripts
 * — the docs lag behind. Match permissively so transcripts work regardless
 * of which naming scheme is active.
 */

const INPUT_DELTA_TYPES = new Set([
  "session.input_transcript.delta",
  "conversation.item.input_audio_transcription.delta",
]);
const INPUT_DONE_TYPES = new Set([
  "session.input_transcript.completed",
  "conversation.item.input_audio_transcription.completed",
  "conversation.item.input_audio_transcription.done",
]);
const OUTPUT_DELTA_TYPES = new Set([
  "session.output_transcript.delta",
  "response.audio_transcript.delta",
  "response.output_audio_transcript.delta",
]);
const OUTPUT_DONE_TYPES = new Set([
  "session.output_transcript.completed",
  "response.audio_transcript.done",
  "response.output_audio_transcript.done",
]);

function readString(obj: unknown, key: string): string | null {
  if (obj && typeof obj === "object" && key in obj) {
    const v = (obj as Record<string, unknown>)[key];
    if (typeof v === "string") return v;
  }
  return null;
}

export function asInputTranscriptDelta(e: ServerEvent): string | null {
  if (!INPUT_DELTA_TYPES.has(e.type)) return null;
  return readString(e, "delta");
}

export function asInputTranscriptDone(e: ServerEvent): string | null {
  if (!INPUT_DONE_TYPES.has(e.type)) return null;
  return readString(e, "transcript") ?? readString(e, "text") ?? "";
}

export function asOutputTranscriptDelta(e: ServerEvent): string | null {
  if (!OUTPUT_DELTA_TYPES.has(e.type)) return null;
  return readString(e, "delta");
}

export function asOutputTranscriptDone(e: ServerEvent): string | null {
  if (!OUTPUT_DONE_TYPES.has(e.type)) return null;
  return readString(e, "transcript") ?? readString(e, "text") ?? "";
}

export function isErrorEvent(
  e: ServerEvent
): e is Extract<ServerEvent, { type: "error" }> {
  return e.type === "error";
}
