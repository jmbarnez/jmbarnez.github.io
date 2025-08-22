// Color Utility: generate a deterministic unique color per UID using HSL
// This produces a visually distinct hue for each UID while keeping saturation and lightness
// within readable ranges.
export function getColorFromUID(uid) {
  if (!uid || typeof uid !== 'string') return '#9ca3af'; // fallback gray

  // Simple 32-bit hash from string
  let h = 2166136261 >>> 0;
  for (let i = 0; i < uid.length; i++) {
    h ^= uid.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }

  // Map hash to hue [0, 360), pick saturation and lightness for good contrast
  const hue = h % 360;
  const saturation = 62; // percent
  const lightness = 52; // percent

  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}