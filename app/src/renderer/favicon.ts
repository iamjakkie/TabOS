// Resolve the best favicon source for a tab. Prefers a real captured favicon;
// otherwise derives one from the domain so cold/never-loaded tabs still show a
// recognizable icon instead of a generic glyph. Returns null when no sensible
// icon exists (non-http URLs, garbage input).
export function faviconSrc(stored: string | undefined | null, url: string): string | null {
  if (stored) return stored;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return `https://icons.duckduckgo.com/ip3/${parsed.hostname}.ico`;
  } catch {
    return null;
  }
}
