import { describe, expect, it } from 'vitest';
import { detectResourceType } from './detect-resource';

describe('detectResourceType', () => {
  it('detects PDFs by extension', () => {
    expect(detectResourceType('https://arxiv.org/pdf/2401.12345.pdf', '')).toBe('pdf');
    expect(detectResourceType('https://example.com/paper.PDF?x=1', '')).toBe('pdf');
  });

  it('detects video hosts', () => {
    expect(detectResourceType('https://www.youtube.com/watch?v=abc', '')).toBe('video');
    expect(detectResourceType('https://youtu.be/abc', '')).toBe('video');
    expect(detectResourceType('https://vimeo.com/12345', '')).toBe('video');
  });

  it('detects course platforms', () => {
    expect(detectResourceType('https://www.coursera.org/learn/ml', '')).toBe('course');
    expect(detectResourceType('https://www.udemy.com/course/rust', '')).toBe('course');
    expect(detectResourceType('https://brilliant.org/courses/x', '')).toBe('course');
  });

  it('falls back to article for ordinary pages', () => {
    expect(detectResourceType('https://someblog.com/post/kalman', 'A blog post')).toBe('article');
  });

  it('handles empty/invalid input without throwing', () => {
    expect(detectResourceType('', '')).toBe('article');
    expect(detectResourceType('not a url', '')).toBe('article');
  });
});
