const DEFAULT_HORIZON_URL = 'https://horizon-testnet.stellar.org';
const DEFAULT_SOROBAN_RPC_URL = 'https://soroban-testnet.stellar.org';

function getSecurityHeaders() {
  const connectSrcOrigins = Array.from(
    new Set(
      [
        "'self'",
        process.env.NEXT_PUBLIC_HORIZON_URL || DEFAULT_HORIZON_URL,
        process.env.NEXT_PUBLIC_SOROBAN_RPC_URL || DEFAULT_SOROBAN_RPC_URL,
      ].filter(Boolean)
    )
  );

  const contentSecurityPolicy = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    `connect-src ${connectSrcOrigins.join(' ')}`,
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
