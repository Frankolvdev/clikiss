import { selectVisibleVideo } from "./feed-model";

type Registration = { element: HTMLVideoElement; ratio: number; setActive: (active: boolean) => void };
const videos = new Map<string, Registration>();
let current: string | null = null;
let dialogs: MutationObserver | null = null;

function select() {
  const dialog=Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]')).filter((element)=>element.getClientRects().length).at(-1);
  const next = document.hidden ? null : selectVisibleVideo(Array.from(videos, ([id, video]) => ({ id, ratio:dialog&&!dialog.contains(video.element)?0:video.ratio, centerDistance: Math.abs(video.element.getBoundingClientRect().top + video.element.clientHeight / 2 - window.innerHeight / 2) })));
  if (next === current) return;
  // Stop first; only then activate the next video, including when both intersect the viewport.
  videos.forEach((video, id) => { if (id !== next) { video.element.pause(); video.setActive(false); } });
  current = next;
  if (next) videos.get(next)?.setActive(true);
}

export function registerFeedVideo(id: string, element: HTMLVideoElement, setActive: (active: boolean) => void) {
  if (!videos.size) {
    document.addEventListener("visibilitychange", select);
    dialogs = new MutationObserver(select);
    dialogs.observe(document.body, { childList: true, subtree: true });
  }
  videos.set(id, { element, setActive, ratio: 0 });
  return {
    visibility(ratio: number) { const item = videos.get(id); if (item) item.ratio = ratio; select(); },
    dispose() { element.pause(); videos.delete(id); if (current === id) current = null; select(); if (!videos.size) { document.removeEventListener("visibilitychange", select); dialogs?.disconnect(); dialogs = null; } },
  };
}

export function suspendFeedPlayback() {
  videos.forEach((video) => { video.element.pause(); video.setActive(false); });
  current = null;
}
