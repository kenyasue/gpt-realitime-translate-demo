"use client";

import { useEffect, useRef, useState } from "react";

const N_BARS = 64;

export type WaveformOptions = {
  stream: MediaStream | null;
  active: boolean;
  /** oklch hue + chroma for bar fill (lightness fixed at 0.78–0.80 by caller). */
  colorWithAlpha: (alpha: number) => string;
};

export function useWaveform(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  { stream, active, colorWithAlpha }: WaveformOptions
): { level: number } {
  const [level, setLevel] = useState(0);

  // analyser plumbing
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);

  useEffect(() => {
    if (!stream) return;
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ac = new Ctor();
    audioCtxRef.current = ac;

    const src = ac.createMediaStreamSource(stream);
    const analyser = ac.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.6;
    src.connect(analyser);
    analyserRef.current = analyser;
    dataRef.current = new Uint8Array(new ArrayBuffer(analyser.fftSize));

    return () => {
      try {
        src.disconnect();
      } catch {
        /* noop */
      }
      analyserRef.current = null;
      dataRef.current = null;
      audioCtxRef.current = null;
      void ac.close();
    };
  }, [stream]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;

    function resize() {
      if (!canvas) return;
      const r = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(r.width * dpr));
      canvas.height = Math.max(1, Math.floor(r.height * dpr));
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const history: number[] = new Array(N_BARS).fill(0);
    let raf = 0;

    function draw(t: number) {
      raf = requestAnimationFrame(draw);
      if (!canvas || !ctx) return;
      const W = canvas.width;
      const H = canvas.height;
      ctx.clearRect(0, 0, W, H);

      let amp: number;
      const analyser = analyserRef.current;
      const data = dataRef.current;
      if (active && analyser && data) {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        amp = Math.sqrt(sum / data.length);
      } else if (active) {
        amp = 0.15 + 0.1 * Math.sin(t * 0.005);
      } else {
        amp = 0.04;
      }
      setLevel(amp);

      history.shift();
      const noise = (Math.random() - 0.5) * 0.4;
      history.push(Math.max(0.04, amp * (1 + noise) * 2.4));

      const pad = 12 * dpr;
      const innerW = W - pad * 2;
      const gap = 3 * dpr;
      const barW = (innerW - gap * (N_BARS - 1)) / N_BARS;
      const midY = H / 2;
      const r = Math.min(barW / 2, 4 * dpr);

      for (let i = 0; i < N_BARS; i++) {
        const h = Math.min(H * 0.85, history[i] * H * 0.7);
        const x = pad + i * (barW + gap);
        const edgeFade =
          Math.min(1, i / 6) * Math.min(1, (N_BARS - i - 1) / 6);
        ctx.fillStyle = colorWithAlpha(0.25 + 0.65 * edgeFade);
        roundedRect(ctx, x, midY - h / 2, barW, h, r);
        ctx.fill();
      }
    }
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [canvasRef, active, colorWithAlpha]);

  return { level };
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
