# CLAUDE.md — Implementation Guardrails

Guidance for any AI assistant (Claude or otherwise) working on this repo.
Read this file before editing code. Keep it short; update it when assumptions change.

## Project at a glance

- **What**: One-screen web app — push to talk, translation streams back as audio + transcript.
- **API**: OpenAI Realtime Translation (`gpt-realtime-translate`) over **WebRTC**.
- **Stack**: Next.js 15 App Router, React 19, TypeScript (strict), SCSS Modules. **No Tailwind.**
- **Authoritative docs**:
  - `doc/implementation_plan.md` — phased plan, file layout, event protocol.
  - `doc/Realtime Translator _standalone_.html` — visual / interaction reference (bundler artifact; decoded copy at `doc/_design_extracted.html`).
  - <https://developers.openai.com/api/docs/guides/realtime-translation> — API source of truth.

## Hard rules

1. **Never expose `OPENAI_API_KEY` to the browser.**
   The key lives in `.env.local` and is read **only** inside `src/app/api/session/route.ts`. The browser must obtain a short-lived ephemeral `client_secret` from that route and use it to authenticate the WebRTC SDP exchange directly with OpenAI.
2. **No Tailwind.** Styling is SCSS modules + CSS custom properties. Theme tokens live in `src/styles/_variables.scss` / `_theme.scss` as `--bg-0`, `--accent-in`, etc.
3. **No global state library** (Redux, Zustand, Jotai, etc.) for v1. Local component state + a single `useRealtimeSession` hook is sufficient.
4. **No new heavy dependencies** without explicit request. Audio capture, analysis, WebRTC, and `setSinkId` are all native browser APIs. Avoid wrapper libraries.
5. **Don't ship the `_standalone_.html` artifact's runtime** (Babel standalone, embedded fonts). Use `next/font/google` for Geist + Geist Mono and write JSX/TS directly.

## API quick reference (so you don't have to re-fetch)

- **Server endpoint to mint a session**: `POST https://api.openai.com/v1/realtime/translations/client_secrets`
  Body skeleton:
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
  Returns `{ client_secret: { value, expires_at }, session: { id, ... } }`.
- **WebRTC SDP exchange**: `POST https://api.openai.com/v1/realtime/translations/calls?model=gpt-realtime-translate`
  Headers: `Authorization: Bearer <client_secret.value>`, `Content-Type: application/sdp`, body is the local SDP offer. Response body is the SDP answer.
- **Datachannel events we read**: `session.input_transcript.delta`, `session.input_transcript.completed`, `session.output_transcript.delta`, `session.output_transcript.completed`, `error`. Audio comes via the WebRTC `track` event, **not** via `output_audio.delta` (we ignore that path).
- **Switch target language at runtime**: send `session.update` with `audio.output.language`.

## Component conventions

- **Client components**: anything that touches `navigator`, `RTCPeerConnection`, `AudioContext`, or `useState` lives under `src/components/` and starts with `'use client';`.
- **One component = one folder** with `Component.tsx` + `Component.module.scss`.
- **Class names** come from CSS Modules (`styles.foo`). Don't use string class concatenation libraries; a `cn(...args: (string|false|undefined)[])` helper in `src/lib/cn.ts` is fine if needed.
- **`<canvas>` waveforms** must scale by `devicePixelRatio` and use a `ResizeObserver`. Don't allocate a new `AudioContext` per render — create once in a ref, close in cleanup.
- **`<audio>` element for output**: a single hidden `<audio autoPlay playsInline>` whose `srcObject` is the remote `MediaStream` from `pc.ontrack`. Apply `.volume` and `.setSinkId(...)` to *that* element. Don't attempt to route audio through `AudioContext.destination` for playback — you'll lose `setSinkId`.

## Phase workflow

Build in the phases described in `doc/implementation_plan.md` §11. After each phase:

1. `npm run lint` must pass.
2. `npm run build` must pass.
3. Manually verify the phase's acceptance criteria in Chrome.

Don't open subsequent phases' files until the current phase is green.

## Things that look like bugs but aren't

- `enumerateDevices()` returns labels of `""` until `getUserMedia` has succeeded once. Re-call it after permission grants.
- `setSinkId` is a Promise; it can reject with `NotAllowedError` if the user hasn't interacted with the page. Always call from a click handler (or right after one).
- Safari does not implement `setSinkId`. Detect via `'setSinkId' in HTMLMediaElement.prototype` and disable the output device select gracefully.
- Mobile Chromium suspends the `AudioContext` until a user gesture. The first call to `start()` is that gesture; resume contexts there.

## Files you should not touch without a reason

- `next-env.d.ts` (auto-generated).
- `.gitignore` (already comprehensive).
- `LICENSE`.
- `doc/Realtime Translator _standalone_.html` (read-only design reference). Edit the decoded `doc/_design_extracted.html` copy if you need to extract more snippets, but don't commit changes to either file.

## When in doubt

- Prefer **smaller diffs** that match the design 1:1 over creative reinterpretation.
- Prefer **native APIs** over wrappers.
- If the OpenAI API surface seems to differ from what's documented here, log the unknown event types to the console and update this file rather than silently swallowing them.
