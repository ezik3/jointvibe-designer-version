import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "jv_delivery_sound_enabled";
const VOLUME_STORAGE_KEY = "jv_delivery_sound_volume";
const EVENT_NAME = "jv:delivery-sound-enabled-changed";

export function getDeliverySoundEnabled(): boolean {
  if (typeof window === "undefined") return true;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  // default ON
  return raw !== "false";
}

export function setDeliverySoundEnabled(enabled: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, enabled ? "true" : "false");
  window.dispatchEvent(new Event(EVENT_NAME));
}

export function getDeliverySoundVolume(): number {
  if (typeof window === "undefined") return 70;
  const stored = Number(window.localStorage.getItem(VOLUME_STORAGE_KEY));
  return Number.isFinite(stored) ? Math.min(100, Math.max(0, stored)) : 70;
}

export function setDeliverySoundVolume(volume: number) {
  if (typeof window === "undefined") return;
  const normalized = Math.min(100, Math.max(0, Math.round(volume)));
  window.localStorage.setItem(VOLUME_STORAGE_KEY, String(normalized));
  window.dispatchEvent(new Event(EVENT_NAME));
}

export function useDeliverySoundEnabled() {
  const [enabled, setEnabledState] = useState<boolean>(() => getDeliverySoundEnabled());

  useEffect(() => {
    const sync = () => setEnabledState(getDeliverySoundEnabled());

    window.addEventListener(EVENT_NAME, sync);
    window.addEventListener("storage", sync);

    return () => {
      window.removeEventListener(EVENT_NAME, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const setEnabled = useCallback((next: boolean) => {
    setDeliverySoundEnabled(next);
    setEnabledState(next);
  }, []);

  return { enabled, setEnabled };
}

export function useDeliverySoundVolume() {
  const [volume, setVolumeState] = useState<number>(() => getDeliverySoundVolume());

  useEffect(() => {
    const sync = () => setVolumeState(getDeliverySoundVolume());

    window.addEventListener(EVENT_NAME, sync);
    window.addEventListener("storage", sync);

    return () => {
      window.removeEventListener(EVENT_NAME, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const setVolume = useCallback((next: number) => {
    setDeliverySoundVolume(next);
    setVolumeState(Math.min(100, Math.max(0, Math.round(next))));
  }, []);

  return { volume, setVolume };
}
