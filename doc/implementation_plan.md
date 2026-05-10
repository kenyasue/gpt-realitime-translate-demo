# Implementation Plan — Echo · Realtime Translator

A single-screen Next.js 15 web app that streams microphone audio through OpenAI's
Realtime Translation API (`gpt-realtime-translate`) over WebRTC and plays the
translated audio back in real time, with input/output waveforms and a live
transcript.

## 0. Reference materials

- **Canonical design**: [`doc/design.html`](./design.html) — single static HTML file, no JS, no bundler. Open it in a browser to see exactly what the finished app must look like. **All CSS in §10 is copied verbatim from this file.**
- **Original artifact** (read-only): `doc/Realtime Translator _standalone_.html` — the Claude artifact that produced the design. Kept only as a historical record of the interaction prototype (waveforms drawn on canvas, simulated transcript loop). Don't port from it directly; port from `design.html`.
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
         "model": "gpt-realtime-translate",
         "audio": { "output": { "language": "<targetLanguage>" } }
       }
     }
     ```
     Note: the schema is intentionally minimal. Sending `session.type` or `session.audio.input.format` returns HTTP 400 "Unknown parameter".
  3. Forward the upstream JSON to the client. The secret may arrive as `{ value, expires_at }` at the top level or nested under `client_secret` depending on API version — `RealtimeClient.mintSession` accepts both.
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

## 8. UI components — port from `doc/design.html`

`doc/design.html` is the **canonical visual spec**. Open it in a browser and
match what you see, pixel-for-pixel. The HTML there is intentionally close to
what each React component should output — class names, DOM structure, and
nesting all transfer directly.

**Porting workflow per component**:
1. Find the matching block in `design.html` (each is delimited by an HTML comment, e.g. `<!-- Top bar -->`).
2. Copy the markup into `Component.tsx` and translate HTML attributes to JSX (`class` → `className`, `for` → `htmlFor`, self-closing tags, `aria-*` unchanged).
3. Move the matching CSS rules from `design.html`'s `<style>` into `Component.module.scss`. Keep selectors as-is — they're already scoped by the markup tree.
4. Replace literal text / attribute values with props or hook state.
5. Verify by diffing visually against `design.html` in the same browser.

### 8.1 `Translator.tsx` (top-level client component)
- Maps to: the `<div class="root">` wrapper.
- Owns the `useRealtimeSession()` hook.
- Lifts `srcLang`, `tgtLang`, `inputDevice`, `outputDevice`, `volume`, `mobileLeft`, `mobileRight` state.
- Renders `<TopBar/>`, `<CenterColumn/>`, `<Transcript/>`, `<SettingsPane/>` in DOM order — the CSS grid (`grid-template-columns: 40% 40% 20%`) handles the visual placement.

### 8.2 `TopBar.tsx`
- Maps to: `<header class="topbar">` in `design.html`.
- Brand block, status pill (phase + flag pair), Clear button, mobile drawer toggles.
- The status pill's `<span class="status-dot ph-listening">` class is dynamic: swap `ph-listening` / `ph-translating` / `ph-speaking` from the `phase` prop to drive the pulse colour.

### 8.3 `LangPicker.tsx`
- Maps to: `<div class="lang-picker left">` and `<div class="lang-picker right">`.
- The static design shows the closed state. For the open state, render the popover after the trigger:
  ```tsx
  <div className={styles['lang-menu']}>
    <div className={styles['lang-menu-inner']}>
      {LANGUAGES.map(l => <button className={cn(styles['lang-item'], l.code === value && styles['is-active'])}>...</button>)}
    </div>
  </div>
  ```
  CSS rules `.lang-menu` / `.lang-menu-inner` / `.lang-item` exist in the original design CSS — copy them from `_design_extracted.html` (lines 357–392) since the static `design.html` only shows the closed state.
- Click-outside closes (mousedown listener on document).
- `LANGUAGES` constant moves to `src/lib/realtime/languages.ts` (15 entries — copy the array from `_design_extracted.html` lines 861–877).

### 8.4 `InputWave.tsx`
- Maps to: `<div class="wave-wrap">` containing the input SVG.
- Replace the static `<svg>` group with `<canvas className={styles['wave-canvas']} />`.
- Takes a `MediaStream` prop (the same stream the `RealtimeClient` is using), creates `AudioContext` + `AnalyserNode` (`fftSize: 1024`, `smoothingTimeConstant: 0.6`), draws 64 rounded bars on each `requestAnimationFrame` tick.
- DPR-aware canvas (`canvas.width = rect.width * devicePixelRatio`), `ResizeObserver`, edge-fade colours `oklch(0.78 0.085 285 / α)` where `α = 0.25 + 0.65 * edgeFade`.
- The label overlay (`<div class="wave-label">`) stays as static markup; its `wave-meter` text reads from the analyser RMS state.

### 8.5 `OutputWave.tsx`
- Maps to: the second `<div class="wave-wrap">` (output bars).
- Same canvas pattern as `InputWave`, but the analyser is fed the **remote** `MediaStream` from `pc.ontrack`. Use output accent `oklch(0.80 0.080 200 / α)`.
- Crucially: this component also **owns the single `<audio>` element** that plays the translated audio (`autoPlay`, `playsInline`, no `muted`). That audio element is what `setSinkId` and `volume` apply to. Hide it with `display: none` — it's not visible, only audible.

### 8.6 `StartButton.tsx`
- Maps to: `<button class="start-btn is-active">` in `design.html`.
- Pill button with orb. Modifier classes:
  - `is-active` when session is running (the design currently shows this state).
  - `ph-speaking` when phase is speaking (alternate orb colour).
- Swap the inner SVG between the "mic" icon (idle) and the "stop square" icon (active) — both icons are in `_design_extracted.html` lines 1530–1540.
- Toggles `useRealtimeSession.start()` / `.stop()` on click.

### 8.7 `Transcript.tsx`
- Maps to: `<section class="transcript-pane">`.
- Render the array of completed turns + a "live" turn carrying `interimSrc` / `interimTgt`. The design shows two completed turns plus one interim turn — match that structure exactly.
- Auto-scroll to bottom on new content (`ref.current.scrollTo({ top: 1e9, behavior: 'smooth' })`).
- Empty state: when no turns and no interim text, render the `<div class="empty">` with the gradient eye (CSS for `.empty` and `.empty-eye` is in the original design — copy from `_design_extracted.html` lines 520–546). The static `design.html` doesn't show this state because it's pre-populated for visual completeness.

### 8.8 `SettingsPane.tsx`
- Maps to: `<aside class="settings">` in `design.html`.
- Two `<select>` elements (input, output) populated from `useDevices()`. The design shows hard-coded `<option>` examples — replace with `devices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label}</option>)`.
- Output select disabled with hint text on browsers without `setSinkId`.
- Volume slider (0..1, step 0.01). Bind `style={{ '--pct': `${value * 100}%` }}` so the linear-gradient track fills proportionally.
- Meta grid: model, latency, voice, permission state. Latency cell reads from `pc.getStats()` round-trip-time when active, otherwise `—`.
- Hint footer with `space` / `esc` keyboard shortcuts.

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

## 10. Styling — port the CSS from `doc/design.html`

`doc/design.html` contains the entire stylesheet for the app in one `<style>`
block, organised under labelled section comments. **Don't rewrite it — split
it.** The plan:

### 10.1 Distribute the rules

| Source block in `design.html`              | Destination                             |
|--------------------------------------------|-----------------------------------------|
| `/* Design tokens */` (`:root { … }`)      | `src/styles/_theme.scss`                |
| `/* Reset + base */`                       | `src/app/globals.scss`                  |
| `body::before` ambient gradient            | `src/app/globals.scss`                  |
| Scrollbar rules                            | `src/app/globals.scss`                  |
| `/* Layout */` (`.root`, `.main`)          | `src/components/Translator/Translator.module.scss` |
| `/* Top bar */`                            | `src/components/TopBar/TopBar.module.scss` |
| `/* Center column */` (lang-pair, swap)    | `src/components/Translator/Translator.module.scss` (or split a `CenterColumn` module) |
| `/* Waveforms */`                          | `src/components/Waveform/Waveform.module.scss` |
| `/* Start button */`                       | `src/components/StartButton/StartButton.module.scss` |
| `/* Transcript pane */`                    | `src/components/Transcript/Transcript.module.scss` |
| `/* Settings */` (controls, slider, meta)  | `src/components/SettingsPane/SettingsPane.module.scss` |

### 10.2 `_theme.scss` (copy verbatim from `design.html`)

```scss
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

`_variables.scss` keeps Sass-time tokens only (spacing scale, breakpoints).
Colours are CSS custom properties so future theme switches don't require a
recompile.

### 10.3 `globals.scss`

- Imports `_theme.scss`.
- `box-sizing` reset, `html/body` 100% height, hidden body overflow (single-screen app).
- `body::before` ambient gradient (copy from `design.html`).
- Scrollbar styling.
- Body `font-family` uses the Geist class added via `next/font/google` in `layout.tsx` (see §10.4).

### 10.4 Fonts

Use `next/font/google` for Geist + Geist Mono in `src/app/layout.tsx`:

```tsx
import { Geist, Geist_Mono } from 'next/font/google';

const geist     = Geist({ subsets: ['latin'], variable: '--font-geist' });
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' });

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
```

Then in `globals.scss`:

```scss
body { font-family: var(--font-geist), -apple-system, BlinkMacSystemFont, sans-serif; }
.mono { font-family: var(--font-geist-mono), ui-monospace, monospace; }
```

This replaces the Google Fonts CDN `<link>` used in `design.html` (CDN was fine
for a static mockup; in production we self-host via `next/font` for cache and
privacy).

### 10.5 Modifier classes referenced from JSX

The static `design.html` shows fixed states. The React components must drive
these modifier classes from props/state:

| Modifier            | Trigger                                   |
|---------------------|-------------------------------------------|
| `.status-dot.ph-listening` / `.ph-translating` / `.ph-speaking` | `phase` prop on `<TopBar/>` |
| `.start-btn.is-active`     | `phase !== 'idle'`                  |
| `.start-btn.ph-speaking`   | `phase === 'speaking'`              |
| `.line.is-interim`         | rendered inside the live (in-progress) turn |
| `.turn-live`               | the trailing turn while transcript is streaming |
| `.lang-picker.left` / `.right` | hard-coded per instance (source vs target) |

When in doubt about a state's CSS, search `design.html` for the class — it's a
single file and `Ctrl-F` is your friend.

## 11. Phased delivery

| Phase | Scope | Acceptance |
|-------|-------|------------|
| **P1 — Visual shell** | Port theme, layout, all components rendering with **mock state** (no API). Drawer behaviour on mobile. Keyboard shortcuts. | Side-by-side with `doc/design.html` open in another tab, the running app is visually indistinguishable. Lighthouse a11y ≥ 90. |
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
