import { NextResponse } from 'next/server';
import { createRateLimiter } from '@/lib/rate-limit';
import { pushSubscriptionStore, type PushSubscriptionData } from '@/lib/push-store';

// 30 req/min per IP — lightweight push subscription store, matches the
// default limit used for the express relayer in index.js.
const rateLimiter = createRateLimiter({ limit: 30 });

export async function POST(request: Request) {
  const limited = rateLimiter(request);
  if (limited) return limited;

  try {
    const body = await request.json();
    const subscription: PushSubscriptionData | undefined = body?.subscription || body;

    if (!subscription || !subscription.endpoint || typeof subscription.endpoint !== 'string' || !subscription.endpoint.trim()) {
      return NextResponse.json(
        { error: 'Missing push subscription.' },
        { status: 400 },
      );
    }

    await pushSubscriptionStore.save(subscription);
    const count = await pushSubscriptionStore.count();

    return NextResponse.json({ ok: true, count });
  } catch (error) {
    return NextResponse.json(
      { error: 'Invalid request payload.' },
      { status: 400 },
    );
  }
}

export async function GET(request: Request) {
  const limited = rateLimiter(request);
  if (limited) return limited;

  try {
    const count = await pushSubscriptionStore.count();
    return NextResponse.json({ ok: true, count });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to retrieve subscriptions count.' },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  const limited = rateLimiter(request);
  if (limited) return limited;

  try {
    let endpoint: string | null = null;

    // Check URL search parameters first
    const { searchParams } = new URL(request.url);
    endpoint = searchParams.get('endpoint');

    // If not in query string, parse from request body
    if (!endpoint) {
      try {
        const body = await request.json();
        endpoint = body?.endpoint || body?.subscription?.endpoint || null;
      } catch {
        // Body might be empty; handled below if endpoint is still missing
      }
    }

    if (!endpoint || typeof endpoint !== 'string' || !endpoint.trim()) {
      return NextResponse.json(
        { error: 'Missing push subscription endpoint.' },
        { status: 400 },
      );
    }

    const removed = await pushSubscriptionStore.delete(endpoint.trim());
    const count = await pushSubscriptionStore.count();

    return NextResponse.json({ ok: true, removed, count });
  } catch (error) {
    return NextResponse.json(
      { error: 'Invalid request payload.' },
      { status: 400 },
    );
  }
}
