export const isYouTubeUrl = (value) => {
  if (!value) return false;

  try {
    const parsed = new URL(value, window.location.origin);
    const host = (parsed.hostname || "").toLowerCase();
    return ["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"].includes(host);
  } catch {
    return false;
  }
};

export const isBrowserWebcamSource = (value) => {
  if (!value) return false;
  return String(value).toLowerCase().startsWith("webcam://");
};

export const isNativeVideoUrl = (value) => {
  if (!value) return false;
  const lower = value.toLowerCase();
  return (
    lower.startsWith("http://") ||
    lower.startsWith("https://") ||
    lower.startsWith("blob:") ||
    lower.startsWith("/")
  );
};

export const isReplayableSourceKind = (sourceKind) =>
  ["file", "media_url", "youtube"].includes(sourceKind);
