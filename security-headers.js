const DEFAULT_HORIZON_URL = 'https://horizon-testnet.stellar.org';
const DEFAULT_SOROBAN_RPC_URL = 'https://soroban-testnet.stellar.org';

/**
 * Build the app's security headers.
 *
 * @param {string} [nonce] - Optional per-request CSP nonce. When provided,
 *   `script-src` is locked to `'self'` and `'nonce-<nonce>'` instead of
 *   `'unsafe-inline'`. The nonce should be a cryptographically secure,
 *   base64-url-safe value generated on every request.
 */
function getSecurityHeaders(nonce) {
  const connectSrcOrigins = Array.from(
    new Set(
      [
        "'self'",
        process.env.NEXT_PUBLIC_HORIZON_URL || DEFAULT_HORIZON_URL,
        process.env.NEXT_PUBLIC_SOROBAN_RPC_URL || DEFAULT_SOROBAN_RPC_URL,
      ].filter(Boolean)
    )
  );

  const scriptSrc = nonce
    ? `'self' 'nonce-${nonce}'`
    : "'self' 'unsafe-inline'";

  const contentSecurityPolicy = [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    `connect-src ${connectSrcOrigins.join(' ')}`,
    "frame-src 'none'",
    "frame-ancestors 'none'",
  ].join('; ');

  return [
    { key: 'Content-Security-Policy', value: contentSecurityPolicy },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  ];
}

module.exports = { getSecurityHeaders };
