"use client";

import { useEffect, useSyncExternalStore } from "react";
import { audioPreference } from "./audio-preference";

export function useMediaAudio() {
  const muted = useSyncExternalStore(audioPreference.subscribe, audioPreference.get, () => true);
  useEffect(() => { try { audioPreference.hydrate(window.localStorage); } catch { /* Private browser storage may be unavailable. */ } }, []);
  return [muted, audioPreference.set] as const;
}
