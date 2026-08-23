import { NextResponse } from 'next/server';
import { createRateLimiter } from '@/lib/rate-limit';

// 30 req/min per IP — lightweight in-memory subscription store, matches the
// default limit used for the express relayer in index.js.
const rateLimiter = createRateLimiter({ limit: 30 });

const subscriptions = new Map<string, unknown>();

export async function POST(request: Request) {
  const limited = rateLimiter(request);
  if (limited) return limited;

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
