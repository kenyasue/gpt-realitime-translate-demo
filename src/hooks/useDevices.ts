"use client";

import { useCallback, useEffect, useState } from "react";

export type DeviceList = {
  inputs: MediaDeviceInfo[];
  outputs: MediaDeviceInfo[];
};

export function useDevices(): DeviceList & { refresh: () => void } {
  const [devices, setDevices] = useState<DeviceList>({ inputs: [], outputs: [] });

  const refresh = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) {
      return;
    }
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      setDevices({
        inputs: list.filter((d) => d.kind === "audioinput"),
        outputs: list.filter((d) => d.kind === "audiooutput"),
      });
    } catch {
      // ignore — UI just shows the system-default option
    }
  }, []);

  useEffect(() => {
    refresh();
    const md = navigator.mediaDevices;
    if (!md?.addEventListener) return;
    const handler = () => {
      void refresh();
    };
    md.addEventListener("devicechange", handler);
    return () => md.removeEventListener("devicechange", handler);
  }, [refresh]);

  return { ...devices, refresh };
}
