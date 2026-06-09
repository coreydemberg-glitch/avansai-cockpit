// Enrichment seam for the contacts pipeline (Outbound + Referral share it).
//
// ── PLACEHOLDER ──────────────────────────────────────────────────────────────
// TODO(apollo): This is a NO-OP passthrough. Live email/title/company enrichment
// is deferred. What's missing for the real thing and the intended end state:
//   • An APOLLO_API_KEY env var (does NOT exist in .env / Vercel today).
//   • A server-side fetch() to Apollo's REST API — NOT the Apollo MCP. The MCP
//     server is connected to the assistant session only; a deployed Next.js
//     route cannot call MCP tools at runtime. Live enrichment must POST to
//     https://api.apollo.io/api/v1/people/match (bulk: /people/bulk_match) with
//     an X-Api-Key header, then map the response (email, title, organization,
//     employment_history) back onto the contact + seed contact_work_history.
//   • Field mapping, credit/rate-limit handling, and dedupe.
// Why it's a rabbit hole: no API key is provisioned and the MCP can't be reached
// from the server, so wiring real Apollo now would block the whole build. Until
// then enrichment_status stays 'pending' and raw rows flow straight through; the
// only thing we derive locally is email_status, so the Outbound "contact info
// not provided" bucket already works. End state: replace the body of
// enrichContact() with the Apollo REST call and flip enrichment_status to
// 'enriched' / 'failed'. Nothing else in the pipeline changes.

import type { MappedContact } from './csv';

export type EnrichedContact = MappedContact & {
  enrichment_status: 'pending' | 'enriched' | 'failed';
  email_status: 'ok' | 'missing';
};

function hasUsableEmail(email: string | null): boolean {
  return !!email && /.+@.+\..+/.test(email);
}

// Placeholder: returns the row unchanged, derives email_status, leaves
// enrichment_status='pending'. Performs NO network call and never throws.
export async function enrichContact(row: MappedContact): Promise<EnrichedContact> {
  return {
    ...row,
    enrichment_status: 'pending',
    email_status: hasUsableEmail(row.email) ? 'ok' : 'missing',
  };
}

// Batch convenience. When live Apollo lands this becomes a single bulk_match
// call instead of a per-row loop.
export async function enrichContacts(
  rows: MappedContact[]
): Promise<EnrichedContact[]> {
  return Promise.all(rows.map((r) => enrichContact(r)));
}
