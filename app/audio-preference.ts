type PreferenceStorage = Pick<Storage, "getItem" | "setItem">;

export function createAudioPreference() {
  let muted = true;
  let storage: PreferenceStorage | undefined;
  let initialized = false;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());
  return {
    get: () => muted,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    hydrate(source: PreferenceStorage) {
      if (initialized) return;
      initialized = true; storage = source;
      try { const saved = source.getItem("conecta-media-muted-v1"); if (saved === "true" || saved === "false") { const value = saved === "true"; if (muted !== value) { muted = value; notify(); } } } catch { /* Playback remains available without storage. */ }
    },
    set(value: boolean) {
      if (muted === value) return;
      muted = value;
      try { storage?.setItem("conecta-media-muted-v1", String(value)); } catch { /* Keep the session preference. */ }
      notify();
    },
  };
}

export const audioPreference = createAudioPreference();
