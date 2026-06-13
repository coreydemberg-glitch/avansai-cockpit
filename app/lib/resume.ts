// Shared résumé-text fetcher used to ground AI flows in a candidate's résumé
// (the candidate-chat command bar and the notes studio's submittal cleaner).
// Extracted from the candidate-chat route so both paths apply the SAME
// SSRF/timeout/size guards instead of re-implementing them.
import { extractPdfText } from '@/app/lib/pdf';

const RESUME_FETCH_TIMEOUT_MS = 8000; // never let a slow host stall the caller
const MAX_RESUME_BYTES = 15 * 1024 * 1024; // bound memory on a serverless instance
const DEFAULT_MAX_CHARS = 6000; // default cap so a long PDF can't blow the budget

// The résumé URL originates from our own DB (set by the upload-resume route to a
// Supabase Storage public URL), but we still validate it: only fetch when it
// points at OUR Supabase Storage host on https — refuse anything else and any
// redirect, so this can't be turned into a server-side request-forgery probe of
// internal/arbitrary URLs.
export function isAllowedResumeUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return false;
    const base = process.env.SUPABASE_URL;
    if (base) {
      if (u.origin !== new URL(base).origin) return false;
    } else if (!/\.supabase\.co$/i.test(u.hostname)) {
      return false;
    }
    return u.pathname.includes('/storage/v1/object/');
  } catch {
    return false;
  }
}

// Best-effort résumé text for grounding. Validates the host, bounds the request
// with a timeout + size cap, and extracts the PDF text; any failure (disallowed
// URL, non-PDF, too large, slow host, parse error) collapses to '' so the caller
// still works without it.
export async function fetchResumeText(
  url: string | null | undefined,
  maxChars: number = DEFAULT_MAX_CHARS
): Promise<string> {
  if (!url || !isAllowedResumeUrl(url)) return '';
  try {
    const res = await fetch(url, {
      redirect: 'error',
      signal: AbortSignal.timeout(RESUME_FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return '';
    const ct = res.headers.get('content-type') || '';
    if (ct && !/pdf/i.test(ct)) return '';
    const declared = Number(res.headers.get('content-length'));
    if (declared && declared > MAX_RESUME_BYTES) return '';
    const ab = await res.arrayBuffer();
    if (ab.byteLength > MAX_RESUME_BYTES) return '';
    const text = await extractPdfText(Buffer.from(ab));
    return text.slice(0, maxChars);
  } catch {
    return '';
  }
}
