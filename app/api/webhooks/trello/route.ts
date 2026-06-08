import { NextRequest, NextResponse } from 'next/server';

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
    console.log('New Trello card:', card.name);

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ success: true });
}
