import { NextResponse } from 'next/server';
import { checkRateLimit, getClientIp } from '@/app/api/rate-limiter';

const subscriptions = new Map<string, unknown>();

export async function POST(request: Request) {
  const rateLimit = checkRateLimit(getClientIp(request));
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: 'Too many requests.' }, { status: 429 });
  }

  try {
    const { subscription } = await request.json();

    if (!subscription || !subscription.endpoint) {
      return NextResponse.json(
        { error: 'Missing push subscription.' },
        { status: 400 },
      );
    }

    subscriptions.set(subscription.endpoint, subscription);

    return NextResponse.json({ ok: true, count: subscriptions.size });
  } catch (error) {
    return NextResponse.json(
      { error: 'Invalid request payload.' },
      { status: 400 },
    );
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, count: subscriptions.size });
}
