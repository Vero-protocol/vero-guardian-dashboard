/**
 * @jest-environment node
 */
const { getSecurityHeaders } = require('../security-headers');

describe('security headers', () => {
  const originalHorizon = process.env.NEXT_PUBLIC_HORIZON_URL;
  const originalSoroban = process.env.NEXT_PUBLIC_SOROBAN_RPC_URL;

  afterEach(() => {
    process.env.NEXT_PUBLIC_HORIZON_URL = originalHorizon;
    process.env.NEXT_PUBLIC_SOROBAN_RPC_URL = originalSoroban;
  });

  it('applies CSP and hardening headers to every route by default', () => {
    delete process.env.NEXT_PUBLIC_HORIZON_URL;
    delete process.env.NEXT_PUBLIC_SOROBAN_RPC_URL;

    const byKey = Object.fromEntries(getSecurityHeaders().map((h) => [h.key, h.value]));

    expect(byKey['Content-Security-Policy']).toContain("default-src 'self'");
    expect(byKey['Content-Security-Policy']).toContain('connect-src');
    expect(byKey['Content-Security-Policy']).toContain('https://horizon-testnet.stellar.org');
    expect(byKey['Content-Security-Policy']).toContain('https://soroban-testnet.stellar.org');
    expect(byKey['Content-Security-Policy']).toContain("frame-src 'none'");
    expect(byKey['Content-Security-Policy']).toContain("frame-ancestors 'none'");
    expect(byKey['X-Content-Type-Options']).toBe('nosniff');
    expect(byKey['X-Frame-Options']).toBe('DENY');
    expect(byKey['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
  });

  it('derives connect-src from NEXT_PUBLIC_HORIZON_URL / NEXT_PUBLIC_SOROBAN_RPC_URL for self-hosted deployments', () => {
    process.env.NEXT_PUBLIC_HORIZON_URL = 'https://horizon.example.com';
    process.env.NEXT_PUBLIC_SOROBAN_RPC_URL = 'https://soroban.example.com';

    const csp = getSecurityHeaders().find((h) => h.key === 'Content-Security-Policy').value;

    expect(csp).toContain('https://horizon.example.com');
    expect(csp).toContain('https://soroban.example.com');
  });

  it('uses a nonce in script-src and drops unsafe-inline when a nonce is supplied', () => {
    const csp = getSecurityHeaders('abc123').find((h) => h.key === 'Content-Security-Policy').value;

    expect(csp).toContain("script-src 'self' 'nonce-abc123'");
    expect(csp).not.toContain("'unsafe-inline'");
  });

  it('falls back to unsafe-inline in script-src when no nonce is supplied', () => {
    const csp = getSecurityHeaders().find((h) => h.key === 'Content-Security-Policy').value;

    expect(csp).toContain("script-src 'self' 'unsafe-inline'");
  });
});
