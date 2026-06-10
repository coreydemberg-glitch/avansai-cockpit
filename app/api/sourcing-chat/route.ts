import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getSupabaseAdmin } from '@/app/lib/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Chat turns can chain several Apollo calls — give the route headroom over
// the 10s default. (Vercel Hobby caps at 60s; see the PR notes.)
export const maxDuration = 60;

// Sourcing copilot chat (sourcing build). One POST = one full exchange:
// persist the user message, run Claude over the live thread with Apollo
// search + archive-recall tools, persist the reply, return it.
//
// Sonnet (not the Haiku tier clean-notes uses): Boolean construction +
// multi-step tool use is real reasoning work. One string to change.
const MODEL = 'claude-sonnet-4-6';
const MAX_TOOL_ROUNDS = 6;
// Long-running Brain Buzz threads could outgrow the context window — send
// only the most recent slice. Older turns live in the DB and in archives.
const HISTORY_LIMIT = 40;

const APOLLO_BASE = 'https://api.apollo.io/api/v1';
const APOLLO_TIMEOUT_MS = 20_000;

// Search needs broader scope than the enrichment-only "cockpit-enrichment"
// key — prefer a dedicated search key, fall back to the existing one so
// enrich-company keeps working either way.
const apolloKey = () =>
  process.env.APOLLO_SEARCH_API_KEY || process.env.APOLLO_API_KEY || '';

const SYSTEM_BASE = `You are the Sourcing copilot inside Avansai Cockpit, a recruiting command center. You help the recruiter explore companies, titles, and keywords for a client account, and you build LinkedIn Recruiter Boolean search strings.

FORMATTING RULES (the UI depends on these):
- Every Boolean search string you deliver MUST be inside its own fenced code block opened with \`\`\`boolean — exactly one Boolean per block, nothing else inside the block. The UI renders a capture arrow next to each block so the recruiter can save it.
- Keep prose tight and scannable. No long preambles.

TOOLS:
- Use the Apollo tools to ground company/people exploration in real data (similar companies, shared keywords, headcount, titles). Weave findings into your answer naturally — never dump raw JSON.
- If an Apollo tool returns an error, say so briefly and continue from your own knowledge.
- When the recruiter references a past session ("what did I explore last time…"), call search_archived_sessions and reference what you find.`;

// ── Tool definitions ─────────────────────────────────────────────────────────

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'apollo_search_companies',
    description:
      'Search companies in Apollo by keyword tags, name, location, and headcount. Use for "similar companies", market mapping, and keyword/commonality exploration.',
    input_schema: {
      type: 'object',
      properties: {
        keywords: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Industry/technology keyword tags, e.g. ["CMMS", "maintenance software"]',
        },
        name: { type: 'string', description: 'Company name to match' },
        locations: {
          type: 'array',
          items: { type: 'string' },
          description: 'e.g. ["Toronto, Canada", "New York, US"]',
        },
        employee_ranges: {
          type: 'array',
          items: { type: 'string' },
          description: 'Headcount ranges as "min,max" strings, e.g. ["51,200"]',
        },
      },
    },
  },
  {
    name: 'apollo_search_people',
    description:
      'Search people in Apollo by title, location, company domain, and seniority. Use to validate how common a title is or who holds it at target companies.',
    input_schema: {
      type: 'object',
      properties: {
        titles: { type: 'array', items: { type: 'string' } },
        locations: { type: 'array', items: { type: 'string' } },
        organization_domains: {
          type: 'array',
          items: { type: 'string' },
          description: 'Company domains, e.g. ["getmaintainx.com"]',
        },
        seniorities: {
          type: 'array',
          items: { type: 'string' },
          description: 'e.g. ["senior", "manager", "director", "vp"]',
        },
        keywords: { type: 'string' },
      },
    },
  },
  {
    name: 'apollo_enrich_company',
    description:
      'Enrich one company by domain: industry, headcount, keywords, description. Use to understand the client or a prospect before building Booleans.',
    input_schema: {
      type: 'object',
      properties: {
        domain: { type: 'string', description: 'e.g. "getmaintainx.com"' },
      },
      required: ['domain'],
    },
  },
  {
    name: 'search_archived_sessions',
    description:
      "Read this client's archived past chat sessions from the database. Use when the recruiter asks what was explored or decided in a previous session.",
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Optional keyword to filter past messages',
        },
        limit: {
          type: 'number',
          description: 'How many recent sessions to read (default 3, max 5)',
        },
      },
    },
  },
];

// ── Tool executors ───────────────────────────────────────────────────────────

async function apolloFetch(
  path: string,
  init: RequestInit
): Promise<Record<string, unknown>> {
  const key = apolloKey();
  if (!key) {
    return {
      error:
        'No Apollo API key configured. Set APOLLO_SEARCH_API_KEY (or APOLLO_API_KEY) in the environment.',
    };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), APOLLO_TIMEOUT_MS);
  try {
    const res = await fetch(`${APOLLO_BASE}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'X-Api-Key': key,
        ...init.headers,
      },
      signal: controller.signal,
    });
    if (res.status === 401 || res.status === 403) {
      return {
        error:
          'The configured Apollo key is not authorized for this endpoint (the existing "cockpit-enrichment" key only covers people enrichment). Create a search-enabled key in Apollo → Settings → API and set it as APOLLO_SEARCH_API_KEY.',
      };
    }
    if (!res.ok) {
      return { error: `Apollo responded ${res.status}: ${await res.text()}` };
    }
    return (await res.json()) as Record<string, unknown>;
  } catch (err) {
    return {
      error: `Apollo request failed: ${
        err instanceof Error ? err.message : 'unknown error'
      }`,
    };
  } finally {
    clearTimeout(timer);
  }
}

type AnyRec = Record<string, any>;

const condenseOrg = (o: AnyRec) => ({
  name: o.name,
  domain: o.primary_domain ?? o.domain ?? null,
  industry: o.industry ?? null,
  employees: o.estimated_num_employees ?? null,
  location:
    [o.city, o.state, o.country].filter(Boolean).join(', ') || null,
  keywords: Array.isArray(o.keywords) ? o.keywords.slice(0, 12) : [],
  linkedin_url: o.linkedin_url ?? null,
});

const condensePerson = (p: AnyRec) => ({
  name: p.name,
  title: p.title ?? null,
  company: p.organization?.name ?? p.organization_name ?? null,
  location: [p.city, p.state, p.country].filter(Boolean).join(', ') || null,
  linkedin_url: p.linkedin_url ?? null,
});

async function searchCompanies(input: AnyRec) {
  const body: AnyRec = { page: 1, per_page: 8 };
  if (input.name) body.q_organization_name = input.name;
  if (Array.isArray(input.keywords) && input.keywords.length)
    body.q_organization_keyword_tags = input.keywords;
  if (Array.isArray(input.locations) && input.locations.length)
    body.organization_locations = input.locations;
  if (Array.isArray(input.employee_ranges) && input.employee_ranges.length)
    body.organization_num_employees_ranges = input.employee_ranges;

  const data = await apolloFetch('/mixed_companies/search', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (data.error) return data;
  const orgs = [
    ...((data.organizations as AnyRec[]) ?? []),
    ...((data.accounts as AnyRec[]) ?? []),
  ];
  return { companies: orgs.map(condenseOrg) };
}

async function searchPeople(input: AnyRec) {
  const body: AnyRec = { page: 1, per_page: 8 };
  if (Array.isArray(input.titles) && input.titles.length)
    body.person_titles = input.titles;
  if (Array.isArray(input.locations) && input.locations.length)
    body.person_locations = input.locations;
  if (Array.isArray(input.organization_domains) && input.organization_domains.length)
    body.q_organization_domains_list = input.organization_domains;
  if (Array.isArray(input.seniorities) && input.seniorities.length)
    body.person_seniorities = input.seniorities;
  if (input.keywords) body.q_keywords = input.keywords;

  const data = await apolloFetch('/mixed_people/search', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (data.error) return data;
  const people = [
    ...((data.people as AnyRec[]) ?? []),
    ...((data.contacts as AnyRec[]) ?? []),
  ];
  return { people: people.map(condensePerson) };
}

async function enrichCompany(input: AnyRec) {
  if (!input.domain || typeof input.domain !== 'string') {
    return { error: 'Provide a domain.' };
  }
  const data = await apolloFetch(
    `/organizations/enrich?domain=${encodeURIComponent(input.domain)}`,
    { method: 'GET' }
  );
  if (data.error) return data;
  const o = (data.organization as AnyRec) ?? null;
  if (!o) return { error: `No Apollo match for domain "${input.domain}".` };
  return {
    company: {
      ...condenseOrg(o),
      keywords: Array.isArray(o.keywords) ? o.keywords.slice(0, 20) : [],
      description: (o.short_description ?? '').slice(0, 600) || null,
    },
  };
}

async function searchArchives(clientId: string, input: AnyRec) {
  const limit = Math.min(Math.max(Number(input.limit) || 3, 1), 5);
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('sourcing_archives')
    .select('transcript, message_count, archived_at')
    .eq('client_id', clientId)
    .order('archived_at', { ascending: false })
    .limit(limit);
  if (error) return { error: 'Failed to read archived sessions.' };
  if (!data || data.length === 0) {
    return { sessions: [], note: 'No archived sessions for this client yet.' };
  }

  const q =
    typeof input.query === 'string' && input.query.trim()
      ? input.query.trim().toLowerCase()
      : null;

  const sessions = data.map((row) => {
    const all = (row.transcript as AnyRec[]) ?? [];
    // With a query: only matching messages. Without: a condensed transcript.
    const picked = q
      ? all.filter((m) => String(m.content).toLowerCase().includes(q))
      : all;
    return {
      archived_at: row.archived_at,
      message_count: row.message_count,
      // Keep the most-recent slice — session conclusions/final Booleans live at
      // the end, which is exactly what "what did I explore last time" wants.
      messages: picked.slice(-40).map((m) => ({
        role: m.role,
        content: String(m.content).slice(0, 400),
      })),
    };
  });
  return { sessions };
}

async function runTool(
  name: string,
  input: AnyRec,
  clientId: string
): Promise<unknown> {
  try {
    switch (name) {
      case 'apollo_search_companies':
        return await searchCompanies(input);
      case 'apollo_search_people':
        return await searchPeople(input);
      case 'apollo_enrich_company':
        return await enrichCompany(input);
      case 'search_archived_sessions':
        return await searchArchives(clientId, input);
      default:
        return { error: `Unknown tool: ${name}` };
    }
  } catch (err) {
    console.error(`[sourcing] tool ${name} failed:`, err);
    return {
      error: `Tool failed: ${err instanceof Error ? err.message : 'unknown'}`,
    };
  }
}

// ── Route ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let client_id: unknown, message: unknown;
  try {
    ({ client_id, message } = await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (typeof client_id !== 'string' || !client_id) {
    return NextResponse.json({ error: 'Provide a client_id.' }, { status: 400 });
  }
  if (typeof message !== 'string' || message.trim().length === 0) {
    return NextResponse.json(
      { error: 'Provide a non-empty message.' },
      { status: 400 }
    );
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY is not configured on the server.' },
      { status: 500 }
    );
  }

  const supabase = getSupabaseAdmin();

  const { data: client, error: clientErr } = await supabase
    .from('sourcing_clients')
    .select('id, name, memory_instructions')
    .eq('id', client_id)
    .single();
  if (clientErr || !client) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 });
  }

  // Persist the user's message first — the thread is the source of truth, so
  // even if the model call fails the recruiter's side survives a reload.
  const { error: userInsErr } = await supabase
    .from('sourcing_messages')
    .insert({ client_id, role: 'user', content: message.trim() });
  if (userInsErr) {
    console.error('[sourcing] save user message error:', userInsErr);
    return NextResponse.json(
      { error: 'Failed to save message' },
      { status: 502 }
    );
  }

  const { data: thread, error: threadErr } = await supabase
    .from('sourcing_messages')
    .select('role, content, created_at')
    .eq('client_id', client_id)
    .order('created_at', { ascending: false })
    .limit(HISTORY_LIMIT);
  if (threadErr || !thread) {
    return NextResponse.json(
      { error: 'Failed to load thread' },
      { status: 502 }
    );
  }

  const system = [
    SYSTEM_BASE,
    `\nACCOUNT: ${client.name}`,
    client.memory_instructions?.trim()
      ? `\nPER-CLIENT INSTRUCTIONS FROM THE RECRUITER (follow these exactly — they override the defaults for Boolean format, strategy, and Apollo usage):\n${client.memory_instructions.trim()}`
      : '',
  ].join('\n');

  const messages: Anthropic.MessageParam[] = thread
    .reverse()
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

  // Anthropic requires messages[0] to be a 'user' turn. An even-sized HISTORY_LIMIT
  // window over a strictly-alternating thread (or an assistant row that survived an
  // archive race) can start on 'assistant' — trim leading non-user rows. The
  // just-inserted user message is always the newest row, so this never empties.
  while (messages.length > 0 && messages[0].role !== 'user') messages.shift();

  const anthropic = new Anthropic(); // reads ANTHROPIC_API_KEY from env

  try {
    let response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 3000,
      system,
      tools: TOOLS,
      messages,
    });

    // Agentic loop: execute tool calls and feed results back until Claude
    // produces a plain text turn (or we hit the round cap).
    for (
      let round = 0;
      response.stop_reason === 'tool_use' && round < MAX_TOOL_ROUNDS;
      round++
    ) {
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type !== 'tool_use') continue;
        const result = await runTool(
          block.name,
          (block.input ?? {}) as AnyRec,
          client_id
        );
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify(result),
        });
      }
      messages.push({ role: 'assistant', content: response.content });
      messages.push({ role: 'user', content: toolResults });
      response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 3000,
        system,
        tools: TOOLS,
        messages,
      });
    }

    // Round cap hit mid-chain: force one text wrap-up so we don't discard the
    // turn (a tool_use-stopped response is usually all tool_use blocks, no text).
    if (response.stop_reason === 'tool_use') {
      response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 3000,
        system,
        tool_choice: { type: 'none' },
        tools: TOOLS,
        messages,
      });
    }

    let reply = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();

    if (!reply) {
      return NextResponse.json(
        { error: 'Claude returned an empty reply — try again.' },
        { status: 502 }
      );
    }

    // Truncated mid-reply: close a dangling ```fence so the capture parser still
    // works, and tell the recruiter the last Boolean may be incomplete.
    if (response.stop_reason === 'max_tokens') {
      if ((reply.match(/```/g) ?? []).length % 2 === 1) reply += '\n```';
      reply +=
        '\n\n_[Reply hit the length limit and was cut off — the last Boolean above may be incomplete. Ask me to continue.]_';
    }

    const { data: saved, error: replyErr } = await supabase
      .from('sourcing_messages')
      .insert({ client_id, role: 'assistant', content: reply })
      .select('id, role, content, created_at')
      .single();
    if (replyErr) throw replyErr;

    return NextResponse.json({ ok: true, reply: saved });
  } catch (err) {
    const msg =
      err instanceof Anthropic.APIError
        ? `${err.status ?? ''} ${err.message}`.trim()
        : 'Chat request failed';
    console.error('[sourcing] chat error:', err);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
