export async function mediaDimensions(file: Blob): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = file.type.startsWith("video/");
    const element = document.createElement(video ? "video" : "img");
    let finished = false;
    const complete = () => {
      if (finished) return;
      finished = true; clearTimeout(timer);
      const width = video ? (element as HTMLVideoElement).videoWidth : (element as HTMLImageElement).naturalWidth;
      const height = video ? (element as HTMLVideoElement).videoHeight : (element as HTMLImageElement).naturalHeight;
      element.removeAttribute("src"); if (video) (element as HTMLVideoElement).load(); URL.revokeObjectURL(url);
      resolve({ width: width || 1, height: height || 1 });
    };
    const timer = window.setTimeout(complete, 5000);
    element.addEventListener(video ? "loadedmetadata" : "load", complete, { once: true });
    element.addEventListener("error", complete, { once: true });
    if (video) (element as HTMLVideoElement).preload = "metadata";
    element.src = url;
  });
}
