import { randomBytes } from 'crypto';

const NONCE_BYTES = 16;

/**
 * Generate a CSP-safe, base64-url-encoded nonce.
 *
 * The returned string is suitable for use in both a `<script nonce="...">`
 * attribute and a `script-src 'nonce-...'` CSP directive.
 */
export function generateCspNonce(): string {
  return randomBytes(NONCE_BYTES)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
