import { NextResponse, type NextRequest } from 'next/server';
import { generateCspNonce } from './src/lib/nonce.js';
import { getSecurityHeaders } from './security-headers.js';

export function middleware(request: NextRequest) {
  const nonce = generateCspNonce();
  const headers = getSecurityHeaders(nonce);

  const response = NextResponse.next({
    request: {
      headers: new Headers(request.headers),
    },
  });

  // Expose the nonce to the app router so layout.tsx can bind it to the
  // anti-flicker theme script.
  response.headers.set('x-nonce', nonce);

  // Override the static CSP with the per-request nonce variant.
  for (const { key, value } of headers) {
    if (key === 'Content-Security-Policy') {
      response.headers.set(key, value);
    }
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt (metadata files)
     */
    '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)',
  ],
};
