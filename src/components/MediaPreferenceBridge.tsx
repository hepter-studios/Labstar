import { useEffect, useRef } from "react";
import {
  DEFAULT_APP_SETTINGS,
  loadAppSettings,
  subscribeToAppSettings,
  type AppSettings,
} from "../lib/app-settings";

function applySelect(select: HTMLSelectElement, deviceId: string) {
  if (!deviceId || select.value === deviceId) return;
  if (!Array.from(select.options).some((option) => option.value === deviceId)) return;
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
  setter?.call(select, deviceId);
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

export function MediaPreferenceBridge() {
  const settings = useRef<AppSettings>(DEFAULT_APP_SETTINGS);

  useEffect(() => {
    let cancelled = false;
    let frame: number | null = null;

    const apply = () => {
      frame = null;
      const selects = Array.from(document.querySelectorAll<HTMLSelectElement>(".voice-room select"));
      for (const select of selects) {
        const hasMicrophone = settings.current.preferredMicrophone
          && Array.from(select.options).some((option) => option.value === settings.current.preferredMicrophone);
        const hasCamera = settings.current.preferredCamera
          && Array.from(select.options).some((option) => option.value === settings.current.preferredCamera);
        if (hasMicrophone) applySelect(select, settings.current.preferredMicrophone);
        else if (hasCamera) applySelect(select, settings.current.preferredCamera);
      }
    };

    const scheduleApply = () => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(apply);
    };

    void loadAppSettings().then((value) => {
      if (!cancelled) {
        settings.current = value;
        scheduleApply();
      }
    });
    const unsubscribe = subscribeToAppSettings((value) => {
      settings.current = value;
      scheduleApply();
    });
    const observer = new MutationObserver(scheduleApply);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      cancelled = true;
      unsubscribe();
      observer.disconnect();
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, []);

  return null;
}
