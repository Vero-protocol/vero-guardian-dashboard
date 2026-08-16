import { NextResponse } from 'next/server';
import { z } from 'zod';
import { PushSubscriptionSchema } from '@/app/api/schemas';

const PushBodySchema = z.object({
  subscription: PushSubscriptionSchema,
});

const subscriptions = new Map<string, unknown>();

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request payload.' }, { status: 400 });
  }

  const parsed = PushBodySchema.safeParse(payload);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return NextResponse.json(
      { error: firstIssue?.message ?? 'Missing push subscription.' },
      { status: 400 },
    );
  }

  subscriptions.set(parsed.data.subscription.endpoint, parsed.data.subscription);
  return NextResponse.json({ ok: true, count: subscriptions.size });
}

export async function GET() {
  return NextResponse.json({ ok: true, count: subscriptions.size });
}