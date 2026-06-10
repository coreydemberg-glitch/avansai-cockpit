// Server-side PDF text extraction + lightweight heuristic parsers. Used by the
// upload routes to auto-title job descriptions and pre-fill resume contact info.
// Everything here is best-effort: extraction never throws, and the parsers
// degrade to nulls / a fallback rather than guessing badly.
import { extractText, getDocumentProxy } from 'unpdf';

// Pull the full text out of a PDF's bytes. unpdf wants a Uint8Array; a Buffer is
// already one, but we normalize so callers can pass either. Any failure (corrupt
// PDF, image-only scan, unpdf throwing) collapses to '' so the caller can fall
// back to file-name-based titling without a 500.
export async function extractPdfText(bytes: Buffer | Uint8Array): Promise<string> {
  try {
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const pdf = await getDocumentProxy(u8);
    const { text } = await extractText(pdf, { mergePages: true });
    return typeof text === 'string' ? text : '';
  } catch {
    return '';
  }
}

// Role keywords used to spot the line most likely to be the job title. A line
// containing one of these wins over the plain first line.
const ROLE_KEYWORDS =
  /\b(Engineer|Developer|Manager|Designer|Analyst|Lead|Director|Architect|Consultant|Specialist|Scientist|Administrator|Recruiter|Sales|Marketing|Product)\b/i;

// Labels recruiters often prefix the title with; we strip them off the front.
const TITLE_LABEL = /^\s*(Job\s*Title|Position|Role)\s*[:\-–]\s*/i;

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const URL_RE = /(https?:\/\/|www\.)/i;

// Guess a job title from the first chunk of a JD. We only consider the first ~15
// non-empty lines (titles live at the top), strip any "Job Title:" label, and
// prefer a line that reads like a role. Falls back to the first "meaningful"
// line, then to `fallback` (typically the file name) or 'Untitled role'.
export function parseJobTitle(text: string, fallback?: string): string {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .slice(0, 15)
    .map((l) => l.replace(TITLE_LABEL, '').trim())
    .filter((l) => l.length > 0);

  const clip = (s: string) => s.slice(0, 80).trim();

  // A line that obviously isn't a title: an email, a URL, or an all-caps banner
  // (often the company name splashed across the top of the page).
  const isNoise = (l: string) =>
    EMAIL_RE.test(l) ||
    URL_RE.test(l) ||
    (l.length > 3 && l === l.toUpperCase() && /[A-Z]/.test(l));

  // First choice: a line that names a role.
  const roleLine = lines.find((l) => ROLE_KEYWORDS.test(l) && !EMAIL_RE.test(l) && !URL_RE.test(l));
  if (roleLine) return clip(roleLine);

  // Otherwise the first line that isn't email/URL/all-caps noise.
  const meaningful = lines.find((l) => !isNoise(l));
  if (meaningful) return clip(meaningful);

  return fallback ?? 'Untitled role';
}

// Pull an email + first name off the top of a resume. Email is a straight regex
// over the whole document. First name comes from the first line that plausibly
// reads as a person's name (top of the page, letters only), Capitalized.
export function parseResumeContact(text: string): {
  email: string | null;
  firstName: string | null;
} {
  const emailMatch = text.match(EMAIL_RE);
  const email = emailMatch ? emailMatch[0] : null;

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .slice(0, 15);

  // A plausible name line: only letters/spaces/hyphens/apostrophes, 2..30 chars,
  // no '@' and no digits. Resumes lead with the candidate's name.
  const nameLine = lines.find(
    (l) =>
      l.length >= 2 &&
      l.length <= 30 &&
      !l.includes('@') &&
      !/\d/.test(l) &&
      /^[A-Za-z][A-Za-z'\-\s]*$/.test(l)
  );

  let firstName: string | null = null;
  if (nameLine) {
    const token = nameLine.split(/\s+/)[0];
    if (token) {
      firstName =
        token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
    }
  }

  return { email, firstName };
}
