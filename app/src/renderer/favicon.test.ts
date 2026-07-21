import { describe, expect, it } from 'vitest';
import { faviconSrc } from './favicon';

describe('faviconSrc', () => {
  it('prefers a stored favicon when present', () => {
    expect(faviconSrc('data:image/png;base64,abc', 'https://example.com')).toBe('data:image/png;base64,abc');
  });

  it('derives a domain icon when no favicon is stored', () => {
    expect(faviconSrc(undefined, 'https://github.com/foo/bar')).toBe('https://icons.duckduckgo.com/ip3/github.com.ico');
    expect(faviconSrc('', 'https://www.youtube.com/watch?v=1')).toBe('https://icons.duckduckgo.com/ip3/www.youtube.com.ico');
  });

  it('returns null for non-http URLs or garbage', () => {
    expect(faviconSrc(undefined, 'about:blank')).toBeNull();
    expect(faviconSrc(undefined, 'not a url')).toBeNull();
    expect(faviconSrc(undefined, '')).toBeNull();
  });
});
