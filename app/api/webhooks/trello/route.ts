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

export async function HEAD() {
  return new NextResponse(null, { status: 200 });
}

export async function GET() {
  return new NextResponse(null, { status: 200 });
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  if (body.action && body.action.type === 'createCard') {
    const card = body.action.data.card;

    const { error } = await supabase.from('candidates').upsert(
      {
        name: card.name,
        trello_card_id: card.id,
      },
      { onConflict: 'trello_card_id' }
    );

    if (error) {
      console.error('Failed to insert candidate:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ success: true });
}
