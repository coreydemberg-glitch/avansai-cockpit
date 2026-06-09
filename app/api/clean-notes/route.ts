import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

export const dynamic = 'force-dynamic';

// Fast, cheap tier for note cleanup. Change this one string to upgrade
// (e.g. 'claude-sonnet-4-6' or 'claude-opus-4-8').
const MODEL = 'claude-haiku-4-5';

// Client-submittal-email prompt (provided verbatim by Corey).
const SYSTEM_PROMPT = `You format recruiter call notes + resume into a client submittal email. Output ONLY this template, filling the brackets. Each section is 1-2 sentences MAXIMUM. Do not write long paragraphs. Do not embellish.

Subject: [Candidate's Name] for [Position]

Hi [Client's Name],

Please find attached the profile of [Candidate's Name] for the [Position] position.

[1-2 sentences: years of experience, current role, recent focus areas and technologies.]

[1-2 sentences: key projects or achievements at named companies, relevant skills.]

What's most important to [Candidate's Name] is [key preferences].

They are located in [Location], and their base salary expectations are [Amount].

Additional Notes:
- [every remaining detail as bullets]

RULES:
- The top section is a SHORT EMAIL. 1-2 sentences per paragraph, never more. Condense ruthlessly.
- Pull facts from BOTH the call notes and the resume.
- Comp/salary numbers come from the recruiter's call notes EXACTLY as written — never alter them.
- Additional Notes: do NOT delete, omit, condense, or reword anything. Spelling and grammar fixes ONLY. No changing sentence structure.
- If a field is unknown, leave the [bracket].`;

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
      max_tokens: 4000,
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
