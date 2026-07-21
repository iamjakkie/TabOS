import type { StudyResourceType } from '../shared/study';

const VIDEO_HOSTS = ['youtube.com', 'youtu.be', 'vimeo.com', 'twitch.tv'];
const COURSE_HOSTS = [
  'coursera.org', 'udemy.com', 'edx.org', 'brilliant.org', 'khanacademy.org',
  'pluralsight.com', 'udacity.com', 'skillshare.com', 'datacamp.com', 'codecademy.com',
];

// Best-effort resource-type guess for a page the user is viewing in the browser.
// Deliberately conservative: PDFs and known video/course hosts are recognized,
// everything else defaults to "article" (the safest generic web resource).
export function detectResourceType(url: string, _title: string): StudyResourceType {
  let host = '';
  let pathname = '';
  try {
    const parsed = new URL(url);
    host = parsed.hostname.replace(/^www\./, '').toLowerCase();
    pathname = parsed.pathname.toLowerCase();
  } catch {
    return 'article';
  }

  if (/\.pdf(?:$|[?#])/i.test(url) || pathname.endsWith('.pdf')) return 'pdf';
  if (VIDEO_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) return 'video';
  if (COURSE_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) return 'course';
  return 'article';
}
