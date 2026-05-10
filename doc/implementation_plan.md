# Implementation Plan — Echo · Realtime Translator

A single-screen Next.js 15 web app that streams microphone audio through OpenAI's
Realtime Translation API (`gpt-realtime-translate`) over WebRTC and plays the
translated audio back in real time, with input/output waveforms and a live
transcript.

## 0. Reference materials

- **Design source**: `doc/Realtime Translator _standalone_.html` (decoded artifact at `doc/_design_extracted.html`).
- **API guide**: <https://developers.openai.com/api/docs/guides/realtime-translation>.
- **Existing scaffold**: Next.js 15 App Router + TypeScript + SCSS modules (no Tailwind). See `package.json`, `next.config.ts`, `src/styles/_variables.scss`.

## 1. Goals & non-goals

### In scope (matches the 14 requirements)
1. Single screen with one big Start/Stop control.
2. Browser captures mic, streams to OpenAI, plays translated audio back.
3. User selects input device (mic), output device (speaker via `setSinkId`), and output volume.
4. User selects source and target languages.
5. Dark, soft, modern theme (oklch palette ported from the design HTML).
6. Live input waveform (real Web Audio analyser) and output waveform (analyser on remote audio track).
7. Live transcript (source + translation) with interim word-by-word streaming.
8. All real-time — no batched roundtrips.

### Out of scope (for v1)
- Saving / exporting transcripts.
- Multiple simultaneous sessions.
- Mobile-app packaging (PWA basics only).
- Auth / rate limiting beyond the ephemeral-token mint.
- Persisted user preferences across sessions (localStorage is acceptable but not required).

## 2. Architecture overview

```
 ┌────────── Browser ──────────┐                   ┌──── Next.js server ────┐
 │  React UI                   │   POST /api/      │   /api/session         │
 │  ├─ Start/Stop              │   session         │   reads OPENAI_API_KEY │
 │  ├─ Lang pickers            │ ────────────────▶ │   POSTs to OpenAI for  │
 │  ├─ Device selects          │   { src,tgt }     │   ephemeral secret     │
 │  ├─ Volume                  │ ◀──────────────── │                        │
 │  ├─ Wave canvases           │   { client_secret,│                        │
 │  └─ Transcript pane         │     session_id }  │                        │
 │                             │                   └────────────────────────┘
 │  RealtimeClient (WebRTC)    │
 │  ├─ getUserMedia(mic)       │   SDP exchange      ┌────── OpenAI ───────┐
 │  ├─ RTCPeerConnection       │ ◀─────────────────▶ │  /v1/realtime/      │
 │  ├─ DataChannel (events)    │   PCM16 audio /     │  translations/calls │
 │  └─ <audio sinkId=...>      │   data events       │  gpt-realtime-      │
 │                             │                     │  translate          │
 └─────────────────────────────┘                     └─────────────────────┘
```

The browser **never** sees the OpenAI API key. The server route mints a short-lived
client secret; the browser uses that secret to authenticate the WebRTC SDP exchange
directly with OpenAI. Audio frames flow over the peer connection (low-latency, no
proxying through our server). Control / event messages flow on a `RTCDataChannel`.

## 3. Tech stack

| Concern              | Choice                                          | Reason |
|----------------------|-------------------------------------------------|--------|
| Framework            | Next.js 15 (App Router) + React 19              | Already scaffolded. Server route + client component model fits the ephemeral-token pattern cleanly. |
| Language             | TypeScript (strict)                             | Already configured. |
| Styling              | SCSS + CSS Modules                              | User requirement (no Tailwind). |
| Audio capture        | `navigator.mediaDevices.getUserMedia`           | Standard. |
| Audio output routing | `HTMLAudioElement.setSinkId`                    | Per-device output (Chromium / Edge). Fall back gracefully on Safari. |
| Realtime transport   | `RTCPeerConnection` + `RTCDataChannel`          | Per OpenAI's recommendation for browser clients. |
| Visualisation        | `AnalyserNode` + `<canvas>` + `requestAnimationFrame` | Same approach as the design source. |
| State                | React `useState` / `useReducer` only            | Single screen, no global store needed for v1. |
| Lint                 | `eslint-config-next` flat config                | Already configured. |

Add to `package.json`:
- (no extra runtime deps — everything is browser-native or in `next` itself)

## 4. Repository layout (target)

```
src/
├── app/
│   ├── api/
│   │   └── session/
│   │       └── route.ts             # POST mints ephemeral client secret
│   ├── layout.tsx
│   ├── page.tsx                     # composes <Translator />
│   ├── globals.scss
│   └── page.module.scss             # (existing — will be replaced/extended)
├── components/
│   ├── Translator/
│   │   ├── Translator.tsx           # top-level client component
│   │   └── Translator.module.scss
│   ├── TopBar/
│   │   ├── TopBar.tsx               # brand, status pill, clear button
│   │   └── TopBar.module.scss
│   ├── LangPicker/
│   │   ├── LangPicker.tsx
│   │   └── LangPicker.module.scss
│   ├── Waveform/
│   │   ├── InputWave.tsx            # analyser on local mic stream
│   │   ├── OutputWave.tsx           # analyser on remote audio track
│   │   └── Waveform.module.scss
│   ├── StartButton/
│   │   ├── StartButton.tsx
│   │   └── StartButton.module.scss
│   ├── Transcript/
│   │   ├── Transcript.tsx
│   │   └── Transcript.module.scss
│   └── SettingsPane/
│       ├── SettingsPane.tsx         # device selects + volume + meta
│       └── SettingsPane.module.scss
├── lib/
│   ├── realtime/
│   │   ├── RealtimeClient.ts        # WebRTC + datachannel wrapper
│   │   ├── events.ts                # typed server / client events
│   │   └── languages.ts             # LANGUAGES constant
│   └── audio/
│       ├── analyser.ts              # helper to create AnalyserNode + RAF loop
│       └── sink.ts                  # setSinkId helper with feature detect
├── hooks/
│   ├── useDevices.ts                # enumerateDevices + devicechange listener
│   ├── useRealtimeSession.ts        # owns RealtimeClient lifecycle
│   └── useKeyboardShortcuts.ts      # space / esc
└── styles/
    ├── _variables.scss              # extend with full oklch palette
    ├── _mixins.scss
    └── _theme.scss                  # design tokens (gradients, shadows)
```

## 5. Server: `/api/session`

`src/app/api/session/route.ts`

- **Method**: POST
- **Body**: `{ sourceLanguage: string; targetLanguage: string; voice?: string }`
- **Behaviour**:
  1. Read `process.env.OPENAI_API_KEY` (throw 500 if missing).
  2. POST `https://api.openai.com/v1/realtime/translations/client_secrets` with body:
     ```json
     {
       "session": {
         "type": "realtime.translation",
         "model": "gpt-realtime-translate",
         "audio": {
           "input":  { "format": { "type": "pcm16", "rate": 24000 } },
           "output": { "format": { "type": "pcm16", "rate": 24000 }, "language": "<targetLanguage>" }
         }
       }
     }
     ```
  3. Return only the response body fields the client needs:
     ```ts
     { client_secret: { value, expires_at }, session: { id, model, ... } }
     ```
- **Cache**: `cache: 'no-store'` and `export const dynamic = 'force-dynamic'`.
- **Errors**: surface OpenAI's status code; redact upstream error bodies in production.

## 6. Client: `RealtimeClient` wrapper (`src/lib/realtime/RealtimeClient.ts`)

A small class that hides WebRTC plumbing.

```ts
type ClientEvents = {
  phasechange:        (p: 'idle'|'connecting'|'listening'|'translating'|'speaking'|'error') => void;
  inputtranscript:    (delta: string, final: boolean) => void;
  outputtranscript:   (delta: string, final: boolean) => void;
  remotetrack:        (stream: MediaStream) => void;
  error:              (err: Error) => void;
};

class RealtimeClient {
  constructor(opts: { sourceLanguage: string; targetLanguage: string; inputDeviceId?: string });
  on<K extends keyof ClientEvents>(ev: K, cb: ClientEvents[K]): void;
  async start(): Promise<void>;   // mint token, getUserMedia, peer connect, datachannel
  async stop(): Promise<void>;    // close pc, stop tracks, dispatch idle
  setVolume(v: number): void;     // 0..1, applied to <audio>.volume
  async setOutputSink(deviceId: string): Promise<void>;  // setSinkId on <audio>
  async setLanguages(src: string, tgt: string): Promise<void>; // send session.update
}
```

### Connection sequence (inside `start()`)
1. `POST /api/session` → ephemeral `client_secret`.
2. `getUserMedia({ audio: { deviceId, echoCancellation: true, noiseSuppression: true } })`.
3. `pc = new RTCPeerConnection()`.
4. Add the local audio track to `pc`.
5. `pc.ontrack = e => emit('remotetrack', e.streams[0])`.
6. `dc = pc.createDataChannel('oai-events')`.
7. `dc.onmessage` → parse JSON, dispatch event-type handlers (see §7).
8. `offer = await pc.createOffer({ offerToReceiveAudio: true })` → `pc.setLocalDescription(offer)`.
9. POST the SDP to `https://api.openai.com/v1/realtime/translations/calls?model=gpt-realtime-translate`
   with `Authorization: Bearer <client_secret>`, `Content-Type: application/sdp`.
10. `await pc.setRemoteDescription({ type: 'answer', sdp: <responseText> })`.
11. When `dc.onopen`, send `session.update` carrying current target language and any voice settings.

### Stop sequence
- `pc.getSenders().forEach(s => s.track?.stop())` → `pc.close()` → drop refs → emit `phasechange('idle')`.

## 7. Datachannel event handling (`src/lib/realtime/events.ts`)

The translation API streams a flat sequence of typed JSON messages on the
datachannel. We only care about a subset:

| Server event                            | Effect |
|-----------------------------------------|--------|
| `session.created`                       | confirm, log |
| `session.input_transcript.delta`        | append to interim source text → emit `inputtranscript(delta, false)` |
| `session.input_transcript.completed`    | finalise current source line |
| `session.output_transcript.delta`       | append to interim target text → emit `outputtranscript(delta, false)` |
| `session.output_transcript.completed`   | finalise current target line, push transcript turn |
| `session.output_audio.delta`            | (audio is already routed via WebRTC `ontrack` — we ignore this; binary path is the peer connection itself) |
| `error`                                 | emit `error(...)` |

Define discriminated-union types so `switch (msg.type)` is exhaustive in TS.

Phase derivation (single source of truth in the hook, not the client):
- `connecting` while `start()` is in flight.
- `listening` from input voice activity detection (we approximate by "RMS of mic > threshold for 100ms").
- `translating` between final input and first output delta.
- `speaking` while output transcript or audio deltas are arriving.
- `idle` after `stop()` or no activity for >800ms post-output.

## 8. UI components — port from design

The reference `App` in `_design_extracted.html` is one big file. We split it:

### 8.1 `Translator.tsx` (top-level client component)
- Owns the `useRealtimeSession()` hook.
- Lifts `srcLang`, `tgtLang`, `inputDevice`, `outputDevice`, `volume`, `mobileLeft`, `mobileRight` state.
- Renders `<TopBar/>`, `<SettingsPane/>` (left aside), `<CenterColumn/>`, `<Transcript/>`.

### 8.2 `TopBar.tsx`
- Brand block + status pill (phase + flag pair) + Clear button + drawer toggles for mobile.

### 8.3 `LangPicker.tsx`
- Custom dropdown (button + popover list). Click-outside closes.
- `LANGUAGES` constant moves to `src/lib/realtime/languages.ts` (15 entries, same as design).

### 8.4 `InputWave.tsx`
- Replaces the design's standalone analyser path: takes a `MediaStream` from props (the same stream the `RealtimeClient` is using), creates `AudioContext` + `AnalyserNode`, draws 64 rounded bars.
- DPR-aware canvas, `ResizeObserver`, edge-fade colours `oklch(0.78 0.085 285 / α)`.

### 8.5 `OutputWave.tsx`
- Takes the **remote** `MediaStream` from `pc.ontrack`, runs an `AnalyserNode` on it.
- Same renderer as `InputWave` but with output accent `oklch(0.80 0.080 200 / α)`.
- Crucially: **drives a single `<audio>` element** (`autoPlay`, `playsInline`, no `muted`). That audio element is what `setSinkId` and `volume` apply to.

### 8.6 `StartButton.tsx`
- Big pill button with orb. Active variants `is-active`, `ph-speaking`. Pulse animation.
- Toggles `useRealtimeSession.start()` / `.stop()`.

### 8.7 `Transcript.tsx`
- Renders array of completed turns + a "live" turn carrying `interimSrc` / `interimTgt` strings.
- Auto-scrolls to bottom on new content.
- Empty state with the gradient eye.

### 8.8 `SettingsPane.tsx`
- Two `<select>` elements (input, output) populated from `useDevices()`.
- Output select disabled with hint text on browsers without `setSinkId`.
- Volume slider (0..1, step 0.01). Applies live via `client.setVolume`.
- Meta grid: model, latency, voice, permission state.
- Hint footer with `space` / `esc` keys.

## 9. Hooks

### `useDevices.ts`
- Calls `navigator.mediaDevices.enumerateDevices()` on mount and on `devicechange`.
- Returns `{ inputs: MediaDeviceInfo[], outputs: MediaDeviceInfo[], refresh() }`.
- Note: device labels are empty until permission is granted, so call `refresh()` after `getUserMedia` succeeds.

### `useRealtimeSession.ts`
- Wraps `RealtimeClient`. Exposes:
  - `phase`, `transcript`, `interimSrc`, `interimTgt`, `inputStream`, `outputStream`, `error`.
  - `start()`, `stop()`, `setLanguages(src,tgt)`, `setVolume(v)`, `setOutputSink(id)`.
- Subscribes to client events on mount, cleans up on unmount.

### `useKeyboardShortcuts.ts`
- `Space` → toggle start (when not focused in an input).
- `Escape` → stop if active.

## 10. Styling — port the design tokens

Replace `src/styles/_variables.scss` with a pure-CSS-custom-properties theme so
the original `oklch(...)` values from the design transfer 1:1:

```scss
// _theme.scss
:root {
  --bg-0: oklch(0.17 0.012 270);
  --bg-1: oklch(0.21 0.014 270);
  --bg-2: oklch(0.24 0.016 270);
  --bg-3: oklch(0.28 0.018 270);
  --line:      oklch(0.32 0.020 270);
  --line-soft: oklch(0.28 0.018 270 / 0.6);
  --fg-0: oklch(0.97 0.005 270);
  --fg-1: oklch(0.82 0.010 270);
  --fg-2: oklch(0.62 0.012 270);
  --fg-3: oklch(0.45 0.014 270);
  --accent-in:   oklch(0.78 0.085 285);
  --accent-out:  oklch(0.80 0.080 200);
  --accent-warn: oklch(0.78 0.090 35);
  --shadow-1: 0 1px 0 oklch(1 0 0 / 0.04) inset, 0 1px 2px oklch(0 0 0 / 0.4);
  --shadow-2: 0 10px 40px -10px oklch(0 0 0 / 0.6);
}
```

`globals.scss` provides:
- `box-sizing` reset, `html/body` 100% height, hidden body overflow (single screen).
- Geist font import via `next/font/google` in `layout.tsx` (no manual `@font-face`).
- Ambient gradient on `body::before`.
- Custom scrollbar styling.

Each component's `.module.scss` `@use "variables" as *;` for shared spacing
helpers but reads colours via `var(--…)` for live theming flexibility.

### Fonts
Use `next/font/google` for Geist + Geist Mono and apply via class names in
`layout.tsx`. Don't ship the woff2 binaries the artifact embedded.

## 11. Phased delivery

| Phase | Scope | Acceptance |
|-------|-------|------------|
| **P1 — Visual shell** | Port theme, layout, all components rendering with **mock state** (no API). Drawer behaviour on mobile. Keyboard shortcuts. | The page looks identical to `_design_extracted.html`. Lighthouse a11y ≥ 90. |
| **P2 — Mic + waves** | `getUserMedia`, real `InputWave`, device enumeration, volume slider wired to a silent `<audio>` element. | Bars react to voice. Switching input device updates the analyser. Permission denial shows `mic unavailable`. |
| **P3 — Server route** | `/api/session` mints ephemeral token. Client logs the response on Start. | curl-equivalent shows `{ client_secret: {...} }`. |
| **P4 — WebRTC translate** | Full `RealtimeClient` wired up; remote audio plays; output wave reacts. Phase machine drives status pill. | Speaking English produces translated audio in the chosen target language within ~1s. |
| **P5 — Transcript streaming** | Interim + final source/translation text rendered as in design. | Live cursor blinks; turns commit on completion. |
| **P6 — Polish** | `setSinkId`, error toasts, latency readout (RTT from `pc.getStats`), graceful Safari fallback, README/CLAUDE updates. | All 14 user requirements demonstrably met. |

Each phase ends with `npm run build` + manual smoke test in Chrome.

## 12. Risks & mitigations

| Risk | Mitigation |
|------|------------|
| OpenAI API surface changes wording (e.g. `session.input_transcript.delta` vs `response.input_audio_transcription.delta`) | Centralise event parsing in `events.ts`; add a permissive fallback that logs unknown event types to console. |
| Safari lacks `setSinkId` | Feature-detect; disable the output `<select>` and show "system default" hint. |
| `getUserMedia` denied | Show a banner; let the user retry from the Start button. Permission state is already a meta cell in the design. |
| Mobile autoplay restrictions on remote audio | Audio element is created inside the user-gesture handler that calls `start()`. Avoid muting/unmuting during the session. |
| Unbounded transcript memory | Cap to last 200 turns (FIFO). |
| Ephemeral token leak via shared logs | Server route never logs the secret. Browser `console.debug` only logs `session_id`. |

## 13. Testing

For v1 (single-screen demo), focus on smoke tests rather than a full unit-test
suite:

- **Component render tests** with Vitest + React Testing Library on `LangPicker`, `Transcript`, `SettingsPane` — verify keyboard nav and a11y labels.
- **`RealtimeClient` unit tests** with a fake `RTCPeerConnection` (a hand-rolled mock that records SDP exchanges and feeds simulated datachannel messages).
- **Manual checklist** in `doc/manual-test.md` covering each of the 14 requirements.

(Test infra is *not* added in P1–P3 to avoid stalling the demo. Phase P6 introduces it.)

## 14. Open questions

1. **Voice selection** — the design shows "alloy · soft" as a meta cell. Is voice configurable, or fixed for v1? *Default: fixed `alloy`, expose later.*
2. **Persistence** — should language/device choices survive reload? *Default: yes via `localStorage`, write in P6.*
3. **Translation direction enforcement** — the API streams output in the target language, but should we also send the source language hint? *The API auto-detects; we still UI-expose it for clarity.*
