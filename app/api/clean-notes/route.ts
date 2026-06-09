import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

export const dynamic = 'force-dynamic';

// Fast, cheap tier for note cleanup. Change this one string to upgrade
// (e.g. 'claude-sonnet-4-6' or 'claude-opus-4-8').
const MODEL = 'claude-haiku-4-5';

// Default structuring prompt for messy recruiter call notes. Edit freely —
// this is a placeholder until Corey provides the canonical prompt.
const SYSTEM_PROMPT = `You clean up a recruiter's raw, messy notes taken during or after a candidate phone call, and turn them into a structured candidate summary.

Use the following sections, in this order. OMIT any section that has no supporting information in the notes — do not write "N/A" and do not invent details:

- **Summary** — 1–2 sentence overview of the candidate.
- **Current Role & Company**
- **Experience & Skills**
- **Compensation** — current and/or expected.
- **Motivation** — why they're open to a move / what they want next.
- **Logistics** — location, work authorization, notice period, remote/onsite.
- **Next Steps**

Rules:
- Use ONLY information present in the raw notes. Never fabricate facts, numbers, or names.
- Fix grammar and spelling; expand obvious shorthand.
- Keep it concise and skimmable.
- Output in Markdown. Do not add any commentary before or after the summary.`;

export async function POST(req: NextRequest) {
  let notes: unknown;
  try {
    ({ notes } = await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (typeof notes !== 'string' || notes.trim().length === 0) {
    return NextResponse.json(
      { error: 'Provide non-empty "notes" text to clean.' },
      { status: 400 }
    );
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY is not configured on the server.' },
      { status: 500 }
    );
  }

  const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env

  try {
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: notes }],
    });

    const structured = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();

    return NextResponse.json({ structured });
  } catch (err) {
    const msg =
      err instanceof Anthropic.APIError
        ? `${err.status ?? ''} ${err.message}`.trim()
        : 'Failed to clean notes';
    console.error('clean-notes error:', err);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
