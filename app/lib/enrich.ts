// Enrichment seam for the contacts pipeline (Outbound + Referral share it).
//
// ── LIVE APOLLO PEOPLE ENRICHMENT ────────────────────────────────────────────
// Fills MISSING emails on uploaded rows via Apollo's REST API. We call the REST
// API directly (NOT the Apollo MCP — a deployed Next.js route can't reach MCP
// tools at runtime). Single match: POST /people/match (query-string params);
// batch: POST /people/bulk_match (JSON body, <=10 people/call). Auth is the
// `X-Api-Key` header — Apollo is deprecating keys-in-URL-params.
//
// EMAIL ONLY by design. We do not request phones or other fields.
//   TODO(apollo-phone): mobile / direct-dial enrichment. `reveal_phone_number`
//   is async (returns a request_id you poll) — out of scope for the email spec.
//
// Behavior contract (one bad row/chunk can NEVER kill the batch):
//   • A row that already has a usable email is NOT sent to Apollo (nothing to
//     unlock; saves a credit) → enrichment_status='enriched', email_status='ok'.
//   • A row missing an email is matched by name + company (+ linkedin_url):
//       – match w/ email      → email filled · enriched · ok
//       – match w/o email     → enriched · missing
//       – no match            → enriched · missing      (0 credits charged)
//       – API/transport error → failed   · missing      (retryable later)
//   • email_status='missing' feeds the existing Outbound "contact info not
//     provided" bucket (archive/retry) — unmatched rows never block the batch.
//   • If APOLLO_API_KEY is unset, this degrades to the prior no-op passthrough
//     (enrichment_status='pending') so local dev / un-provisioned envs still work.
//   • 429 / 5xx responses get bounded exponential-backoff retries (honoring
//     Retry-After); each request has a hard timeout so one slow call can't hang.
//
// Credits: Apollo charges exactly 1 credit per MATCHED person, 0 if not found.

import type { MappedContact } from './csv';

export type EnrichedContact = MappedContact & {
  enrichment_status: 'pending' | 'enriched' | 'failed';
  email_status: 'ok' | 'missing';
};

const APOLLO_BASE = 'https://api.apollo.io/api/v1';
const BULK_MAX = 10; // Apollo bulk_match hard cap: 10 people per call.
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_RETRIES = 3; // retries for 429 / 5xx only.

// Apollo returns this sentinel local-part when a person's email exists but is
// not unlocked on the account — treat it as "no email".
function hasUsableEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  if (/email_not_unlocked/i.test(email)) return false;
  return /.+@.+\..+/.test(email);
}

function apolloKey(): string | null {
  const k = process.env.APOLLO_API_KEY?.trim();
  return k ? k : null;
}

// Subset of the Apollo person payload we consume (email-only mapping).
type ApolloPerson = {
  email?: string | null;
  email_status?: string | null;
};

function emailFromPerson(p: ApolloPerson | null | undefined): string | null {
  const e = (p?.email ?? '').trim().toLowerCase();
  return hasUsableEmail(e) ? e : null;
}

// csv.ts only guarantees `first_name`; recover a last name from the full name
// so Apollo gets the strongest possible match signal.
function lastNameOf(row: MappedContact): string | null {
  if (row.name) {
    const parts = row.name.trim().split(/\s+/);
    if (parts.length > 1) return parts.slice(1).join(' ');
  }
  return null;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function backoffMs(res: Response | null, attempt: number): number {
  const retryAfter = res?.headers.get('retry-after');
  if (retryAfter) {
    const secs = Number(retryAfter);
    if (Number.isFinite(secs)) return Math.min(secs * 1000, 10_000);
  }
  return Math.min(500 * 2 ** attempt, 8_000); // 500ms, 1s, 2s, …
}

// fetch wrapper: X-Api-Key auth, per-request timeout, bounded retry on 429/5xx
// and transient network errors. Throws on a definitive non-OK response or after
// exhausting retries — callers isolate the failure to the affected row(s).
async function apolloFetch(url: string, init: RequestInit, key: string): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        ...init,
        signal: controller.signal,
        headers: {
          'X-Api-Key': key,
          'Content-Type': 'application/json',
          accept: 'application/json',
          ...(init.headers ?? {}),
        },
      });
      if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
        await sleep(backoffMs(res, attempt));
        continue;
      }
      if (!res.ok) {
        throw new Error(`Apollo ${res.status} ${res.statusText}`);
      }
      return res;
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_RETRIES) {
        await sleep(backoffMs(null, attempt));
        continue;
      }
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Apollo request failed');
}

// Build the identifying params Apollo matches on (email-only output).
function matchParams(row: MappedContact): URLSearchParams {
  const params = new URLSearchParams();
  if (row.first_name) params.set('first_name', row.first_name);
  const last = lastNameOf(row);
  if (last) params.set('last_name', last);
  if (row.name) params.set('name', row.name);
  if (row.company) params.set('organization_name', row.company);
  if (row.linkedin_url) params.set('linkedin_url', row.linkedin_url);
  if (row.email) params.set('email', row.email); // a partial email is a match hint
  return params;
}

function matchDetail(row: MappedContact): Record<string, string> {
  const d: Record<string, string> = {};
  if (row.first_name) d.first_name = row.first_name;
  const last = lastNameOf(row);
  if (last) d.last_name = last;
  if (row.name) d.name = row.name;
  if (row.company) d.organization_name = row.company;
  if (row.linkedin_url) d.linkedin_url = row.linkedin_url;
  if (row.email) d.email = row.email;
  return d;
}

async function apolloMatch(row: MappedContact, key: string): Promise<ApolloPerson | null> {
  const res = await apolloFetch(
    `${APOLLO_BASE}/people/match?${matchParams(row).toString()}`,
    { method: 'POST' },
    key
  );
  const json = (await res.json()) as { person?: ApolloPerson | null };
  return json?.person ?? null;
}

async function apolloBulkMatch(
  rows: MappedContact[],
  key: string
): Promise<(ApolloPerson | null)[]> {
  const res = await apolloFetch(
    `${APOLLO_BASE}/people/bulk_match`,
    { method: 'POST', body: JSON.stringify({ details: rows.map(matchDetail) }) },
    key
  );
  const json = (await res.json()) as { matches?: (ApolloPerson | null)[] };
  // Apollo returns `matches` aligned to input order (null where unmatched).
  const matches = Array.isArray(json?.matches) ? json.matches : [];
  return rows.map((_, i) => matches[i] ?? null);
}

// Single-row enrichment (the per-row primitive).
export async function enrichContact(row: MappedContact): Promise<EnrichedContact> {
  if (hasUsableEmail(row.email)) {
    return { ...row, enrichment_status: 'enriched', email_status: 'ok' };
  }
  const key = apolloKey();
  if (!key) {
    return { ...row, enrichment_status: 'pending', email_status: 'missing' };
  }
  try {
    const email = emailFromPerson(await apolloMatch(row, key));
    return {
      ...row,
      email: email ?? row.email,
      enrichment_status: 'enriched',
      email_status: email ? 'ok' : 'missing',
    };
  } catch (err) {
    console.error('[apollo] match failed for', row.name ?? row.email, err);
    return { ...row, enrichment_status: 'failed', email_status: 'missing' };
  }
}

// Batch enrichment. Rows that already have an email skip Apollo entirely; the
// rest are bulk-matched in chunks of 10. Each chunk is isolated — a chunk that
// errors marks only its own rows 'failed' and the batch continues.
export async function enrichContacts(rows: MappedContact[]): Promise<EnrichedContact[]> {
  const key = apolloKey();
  const out: EnrichedContact[] = new Array(rows.length);
  const toEnrich: { row: MappedContact; idx: number }[] = [];

  rows.forEach((row, idx) => {
    if (hasUsableEmail(row.email)) {
      out[idx] = { ...row, enrichment_status: 'enriched', email_status: 'ok' };
    } else if (!key) {
      // No key provisioned → no-op passthrough so uploads still work.
      out[idx] = { ...row, enrichment_status: 'pending', email_status: 'missing' };
    } else {
      toEnrich.push({ row, idx });
    }
  });

  if (key) {
    for (let i = 0; i < toEnrich.length; i += BULK_MAX) {
      const chunk = toEnrich.slice(i, i + BULK_MAX);
      try {
        const people = await apolloBulkMatch(
          chunk.map((c) => c.row),
          key
        );
        chunk.forEach((c, j) => {
          const email = emailFromPerson(people[j]);
          out[c.idx] = {
            ...c.row,
            email: email ?? c.row.email,
            enrichment_status: 'enriched',
            email_status: email ? 'ok' : 'missing',
          };
        });
      } catch (err) {
        console.error('[apollo] bulk_match chunk failed', err);
        chunk.forEach((c) => {
          out[c.idx] = { ...c.row, enrichment_status: 'failed', email_status: 'missing' };
        });
      }
    }
  }

  return out;
}
