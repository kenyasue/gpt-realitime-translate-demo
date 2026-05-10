import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OPENAI_CLIENT_SECRETS_URL =
  "https://api.openai.com/v1/realtime/translations/client_secrets";

type RequestBody = {
  sourceLanguage?: string;
  targetLanguage?: string;
};

export async function POST(req: Request): Promise<Response> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not configured on the server." },
      { status: 500 }
    );
  }

  let body: RequestBody = {};
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    // body is optional; defaults below cover empty requests
  }
  const targetLanguage = body.targetLanguage ?? "es";

  // Body shape matches the official cookbook demo. The transcription model
  // on the input side is REQUIRED — without it the API doesn't run input
  // transcription, so server VAD never fires, and you get no translation
  // output at all even when the SDP exchange succeeds.
  // Source: https://github.com/openai/openai-cookbook/blob/main/examples/voice_solutions/realtime_translation_guide/browser-translation-demo/src/session.js
  const upstreamRequest = {
    session: {
      model: "gpt-realtime-translate",
      audio: {
        input: {
          transcription: { model: "gpt-realtime-whisper" },
          noise_reduction: null,
        },
        output: { language: targetLanguage },
      },
    },
  };

  let upstream: Response;
  try {
    upstream = await fetch(OPENAI_CLIENT_SECRETS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(upstreamRequest),
      cache: "no-store",
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Network error reaching OpenAI: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 }
    );
  }

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => "");
    // surface upstream status; redact the body so we never leak quota messages
    // verbatim, but include a short snippet to help debugging
    return NextResponse.json(
      {
        error: `OpenAI rejected session mint (${upstream.status})`,
        detail: detail.slice(0, 400),
      },
      { status: upstream.status }
    );
  }

  const payload = (await upstream.json()) as Record<string, unknown>;
  // Forward only the bits the client needs; never include the API key.
  return NextResponse.json(payload, { status: 200 });
}
