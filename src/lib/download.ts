/** Trigger a browser download of `data` under `filename`. */
export function downloadBlob(data: Blob | string, filename: string, mime?: string): void {
  if (typeof window === "undefined") return;
  const blob =
    typeof data === "string"
      ? new Blob([data], { type: mime ?? "text/plain;charset=utf-8" })
      : data;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // give the browser a moment to start the download before revoking
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Map a recorded audio mime type to a sensible file extension. */
export function audioExtension(mime: string): string {
  if (mime.includes("mp4") || mime.includes("mp4a")) return "m4a";
  if (mime.includes("ogg")) return "ogg";
  return "webm";
}

/** Filesystem-safe ISO-ish timestamp (YYYYMMDD-HHMMSS, local time). */
export function timestampSlug(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-` +
    `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}
