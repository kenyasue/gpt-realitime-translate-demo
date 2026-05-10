/**
 * `HTMLAudioElement.setSinkId` is Chromium-only as of 2026. Safari ignores
 * the call (or throws). Centralise the feature detection here.
 */

type SinkCapableAudio = HTMLAudioElement & {
  setSinkId: (deviceId: string) => Promise<void>;
};

export function supportsSinkId(): boolean {
  if (typeof window === "undefined") return false;
  return "setSinkId" in HTMLMediaElement.prototype;
}

export async function setOutputSink(
  el: HTMLAudioElement,
  deviceId: string
): Promise<void> {
  if (!supportsSinkId()) return;
  await (el as SinkCapableAudio).setSinkId(deviceId === "default" ? "" : deviceId);
}
