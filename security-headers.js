const crypto = require('crypto');

const DEFAULT_HORIZON_URL = 'https://horizon-testnet.stellar.org';
const DEFAULT_SOROBAN_RPC_URL = 'https://soroban-testnet.stellar.org';
const DEFAULT_IPFS_GATEWAY = 'https://ipfs.io/ipfs/';

function extractOrigin(urlOrOrigin, fallback) {
  try {
    return new URL(urlOrOrigin).origin;
  } catch {
    return fallback;
  }
}

function generateCspNonce() {
  return crypto.randomBytes(16).toString('base64');
}

function getSecurityHeaders(nonce = generateCspNonce()) {
  const connectSrcOrigins = Array.from(
    new Set(
      [
        "'self'",
        process.env.NEXT_PUBLIC_HORIZON_URL || DEFAULT_HORIZON_URL,
        process.env.NEXT_PUBLIC_SOROBAN_RPC_URL || DEFAULT_SOROBAN_RPC_URL,
      ].filter(Boolean)
    )
  );

  const ipfsGatewayOrigin = extractOrigin(
    process.env.NEXT_PUBLIC_IPFS_GATEWAY || DEFAULT_IPFS_GATEWAY,
    'https://ipfs.io'
  );
  const frameSrcOrigins = Array.from(new Set(["'self'", ipfsGatewayOrigin]));

  const contentSecurityPolicy = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    `connect-src ${connectSrcOrigins.join(' ')}`,
    `frame-src ${frameSrcOrigins.join(' ')}`,
    "frame-ancestors 'none'",
  ].join('; ');

  return [
    { key: 'Content-Security-Policy', value: contentSecurityPolicy },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  ];
}

module.exports = { getSecurityHeaders, generateCspNonce };
