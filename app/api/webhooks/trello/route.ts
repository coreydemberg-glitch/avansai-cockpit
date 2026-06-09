import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error(
    'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variable'
  );
}

// Service-role client: bypasses RLS, server-side only. Never expose this key.
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false },
});

// Pull the first LinkedIn URL out of free text (card description), if any.
// Matches both /in/ profiles and /talent/ recruiter links.
function extractLinkedin(text: unknown): string | null {
  if (typeof text !== 'string') return null;
  const m = text.match(/https?:\/\/(?:[a-z0-9-]+\.)?linkedin\.com\/[^\s)]+/i);
  return m ? m[0] : null;
}

export async function HEAD() {
  return new NextResponse(null, { status: 200 });
}

export async function GET() {
  return new NextResponse(null, { status: 200 });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const action = body?.action;

  // New card → create the candidate (and capture a LinkedIn URL if the
  // description was already set at creation time).
  if (action?.type === 'createCard') {
    const card = action.data.card;
    const linkedin = extractLinkedin(card.desc);

    const row: Record<string, unknown> = {
      name: card.name,
      trello_card_id: card.id,
    };
    if (linkedin) row.linkedin_url = linkedin;

    const { error } = await supabase
      .from('candidates')
      .upsert(row, { onConflict: 'trello_card_id' });

    if (error) {
      console.error('Failed to insert candidate:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }
    return NextResponse.json({ success: true });
  }

  // Card edited → if the description now contains a LinkedIn URL, sync it
  // onto the matching candidate.
  if (action?.type === 'updateCard') {
    const card = action.data.card;
    const linkedin = extractLinkedin(card?.desc);
    if (linkedin) {
      const { error } = await supabase
        .from('candidates')
        .update({ linkedin_url: linkedin })
        .eq('trello_card_id', card.id);
      if (error) {
        console.error('Failed to update linkedin_url:', error);
        return NextResponse.json(
          { success: false, error: error.message },
          { status: 500 }
        );
      }
    }
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ success: true });
}
