import { NextResponse } from 'next/server';
import { fetchPRMetadata } from '@/services/githubClient';

const SHA_PATTERN = /^[0-9a-f]{7,40}$/i;

type RouteContext = {
  params: Promise<Record<string, string>>;
};

export async function GET(request: Request, _context: RouteContext) {
  const url = new URL(request.url);
  const prHash = url.searchParams.get('prHash');

  // Missing parameter → 400.
  if (!prHash) {
    return NextResponse.json(
      { error: 'Missing required query parameter: prHash' },
      { status: 400 },
    );
  }

  // Invalid param (not a git SHA-ish value) → 400.
  if (!SHA_PATTERN.test(prHash)) {
    return NextResponse.json(
      { error: 'Invalid prHash: expected a git commit SHA (7-40 hex characters)' },
      { status: 400 },
    );
  }

  try {
    const pr = await fetchPRMetadata(prHash);
    return NextResponse.json({ pr });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  }
}