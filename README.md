# Echo — Realtime Translator

A single-screen Next.js 15 demo that streams microphone audio through OpenAI's
Realtime Translation API (`gpt-realtime-translate`) over WebRTC and plays the
translated audio back instantly, with live waveforms and transcript.

> Status: **scaffold only** — see [`doc/implementation_plan.md`](doc/implementation_plan.md)
> for the phased plan that fills out the actual app.

## Features (planned)

- One-tap **Start / Stop** session.
- Pick **input mic**, **output speaker**, and **output volume**.
- Pick **source** and **target** languages from 15 presets.
- Real-time **input + output waveforms** (`AnalyserNode` + canvas).
- Live **transcript** with interim word-by-word streaming.
- Dark, soft, modern theme (oklch palette, Geist font).
- `Space` to start, `Esc` to stop.

## Prerequisites

| Tool        | Version            | Why                                        |
|-------------|--------------------|--------------------------------------------|
| Node.js     | ≥ 18.18 (20 LTS+ recommended) | Next.js 15 requirement.        |
| npm         | ≥ 10               | Bundled with Node 20.                      |
| OpenAI key  | account with Realtime API access | Server-side ephemeral-token mint. |
| Browser     | Chrome / Edge / Brave (Chromium) | Required for `setSinkId` + WebRTC. Safari works minus per-device output. |

## Quick start

```powershell
# 1. install
npm install

# 2. configure your key
copy .env.example .env.local
# then edit .env.local and set OPENAI_API_KEY=sk-...

# 3. run dev server
npm run dev
# open http://localhost:3000
```

The dev server hot-reloads SCSS modules and TypeScript. The first time you press
**Start**, the browser will prompt for microphone access — grant it.

## Environment variables

| Variable          | Required | Description                                            |
|-------------------|----------|--------------------------------------------------------|
| `OPENAI_API_KEY`  | yes      | Used **server-side only** by `/api/session` to mint ephemeral client secrets. Never sent to the browser. |

`.env.local` is git-ignored. `.env.example` is checked in as a template.

## Scripts

| Command           | What it does                                |
|-------------------|---------------------------------------------|
| `npm run dev`     | Next.js dev server with Turbopack.          |
| `npm run build`   | Production build.                           |
| `npm start`       | Run the production build.                   |
| `npm run lint`    | ESLint (flat config, `next/core-web-vitals`).|

## Project layout

```
src/
├── app/
│   ├── api/session/route.ts   # mints ephemeral OpenAI client secret
│   ├── layout.tsx
│   ├── page.tsx
│   └── globals.scss
├── components/                # UI: TopBar, LangPicker, Waveform, …
├── hooks/                     # useDevices, useRealtimeSession, …
├── lib/
│   ├── realtime/              # RealtimeClient (WebRTC) + event types
│   └── audio/                 # analyser + setSinkId helpers
└── styles/                    # _variables.scss, _mixins.scss, _theme.scss
doc/
├── implementation_plan.md     # phased build plan
└── Realtime Translator _standalone_.html  # design reference (artifact bundle)
CLAUDE.md                      # implementation guardrails for AI assistants
```

## How the API connection works

```
Browser ──POST /api/session──▶ Next.js route ──POST /v1/realtime/translations/client_secrets──▶ OpenAI
                                                                                                  │
Browser ◀────── ephemeral client_secret ◀──────────────────────────────────────────────────────────┘
   │
   │  WebRTC SDP exchange directly with
   │  https://api.openai.com/v1/realtime/translations/calls
   ▼
PCM16 audio + JSON events on RTCDataChannel
```

The browser **never** sees `OPENAI_API_KEY`. It only sees the short-lived
`client_secret` returned by our server route. Audio frames stream peer-to-peer
between the browser and OpenAI with no proxy hop.

See `doc/implementation_plan.md` §5–§7 for the full event protocol.

## Troubleshooting

| Symptom                                          | Cause / fix                                                      |
|--------------------------------------------------|------------------------------------------------------------------|
| "mic unavailable" in the input wave panel        | Browser denied microphone permission. Reset the site permission and reload. |
| Output device dropdown shows only "system default" | Browser doesn't support `HTMLAudioElement.setSinkId` (Safari, some Firefox configs). Choose your default OS output device instead. |
| `/api/session` returns 500                       | `OPENAI_API_KEY` missing or invalid. Check `.env.local`.         |
| `/api/session` returns 403                       | Your OpenAI account doesn't have Realtime API access yet.        |
| Translated audio plays once then stops           | Some browsers throttle background audio. Keep the tab focused.   |

## License

See [`LICENSE`](LICENSE).
