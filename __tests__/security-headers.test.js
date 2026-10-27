/**
 * @jest-environment node
 */
const { getSecurityHeaders } = require('../security-headers');

describe('security headers', () => {
  const originalHorizon = process.env.NEXT_PUBLIC_HORIZON_URL;
  const originalSoroban = process.env.NEXT_PUBLIC_SOROBAN_RPC_URL;
  const originalIpfsGateway = process.env.NEXT_PUBLIC_IPFS_GATEWAY;

  afterEach(() => {
    process.env.NEXT_PUBLIC_HORIZON_URL = originalHorizon;
    process.env.NEXT_PUBLIC_SOROBAN_RPC_URL = originalSoroban;
    process.env.NEXT_PUBLIC_IPFS_GATEWAY = originalIpfsGateway;
  });

  it('applies CSP and hardening headers to every route by default', () => {
    delete process.env.NEXT_PUBLIC_HORIZON_URL;
    delete process.env.NEXT_PUBLIC_SOROBAN_RPC_URL;
    delete process.env.NEXT_PUBLIC_IPFS_GATEWAY;

    const byKey = Object.fromEntries(getSecurityHeaders().map((h) => [h.key, h.value]));

    expect(byKey['Content-Security-Policy']).toContain("default-src 'self'");
    expect(byKey['Content-Security-Policy']).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+'/);
    expect(byKey['Content-Security-Policy']).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(byKey['Content-Security-Policy']).toContain('connect-src');
    expect(byKey['Content-Security-Policy']).toContain('https://horizon-testnet.stellar.org');
    expect(byKey['Content-Security-Policy']).toContain('https://soroban-testnet.stellar.org');
    expect(byKey['Content-Security-Policy']).toContain("frame-src 'self' https://ipfs.io");
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

  it('includes frame-src with configured IPFS gateway origin and omits unsafe-inline from script-src', () => {
    process.env.NEXT_PUBLIC_IPFS_GATEWAY = 'https://cloudflare-ipfs.com/ipfs/';

    const csp = getSecurityHeaders('test-nonce-123').find(
      (h) => h.key === 'Content-Security-Policy'
    ).value;

    expect(csp).toContain("frame-src 'self' https://cloudflare-ipfs.com");
    expect(csp).toContain("script-src 'self' 'nonce-test-nonce-123'");
    const scriptSrcDirective = csp
      .split('; ')
      .find((directive) => directive.startsWith('script-src'));
    expect(scriptSrcDirective).toBeDefined();
    expect(scriptSrcDirective).not.toContain("'unsafe-inline'");
  });
});
