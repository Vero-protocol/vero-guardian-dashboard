import { NextResponse } from 'next/server';
import { checkRateLimit, getClientIp } from '@/app/api/rate-limiter';

const MAX_NAME_LENGTH = 80;
const MAX_EMAIL_LENGTH = 120;
const MAX_MESSAGE_LENGTH = 1200;
const TAG_PATTERN = /<[^>]*>/g;

function stripTags(value: string): string {
  // Re-apply until the string stops changing so nested/overlapping tags
  // (e.g. "<<script>script>") can't survive a single pass.
  let previous: string;
  let stripped = value;
  do {
    previous = stripped;
    stripped = stripped.replace(TAG_PATTERN, '');
  } while (stripped !== previous);
  return stripped;
}

function sanitizeText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') {
    return '';
  }

  // Cap input length before running the regex so pathologically long,
  // attacker-controlled strings can't be used to run up CPU time.
  return stripTags(value.slice(0, maxLength * 4)).trim().slice(0, maxLength);
}

function isValidEmail(email: string): boolean {
  if (!email) {
    return true;
  }

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(request: Request) {
  const rateLimit = checkRateLimit(getClientIp(request));
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: 'Too many requests.' }, { status: 429 });
  }

  try {
    const payload = await request.json();
    const feedback = {
      name: sanitizeText(payload.name, MAX_NAME_LENGTH),
      email: sanitizeText(payload.email, MAX_EMAIL_LENGTH),
      rating: sanitizeText(payload.rating, 24),
      message: sanitizeText(payload.message, MAX_MESSAGE_LENGTH),
      page: sanitizeText(payload.page, 240),
      submittedAt: new Date().toISOString(),
    };

    if (!feedback.message) {
      return NextResponse.json({ error: 'Feedback message is required.' }, { status: 400 });
    }

    if (!isValidEmail(feedback.email)) {
      return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
    }

    const endpoint = process.env.FEEDBACK_WEBHOOK_URL;

    if (endpoint) {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(feedback),
      });

      if (!response.ok) {
        return NextResponse.json({ error: 'Feedback submission failed.' }, { status: 502 });
      }
    }

    return NextResponse.json({ ok: true, feedback });
  } catch (error) {
    return NextResponse.json({ error: 'Invalid feedback payload.' }, { status: 400 });
  }
}
