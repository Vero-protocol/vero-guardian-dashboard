/**
 * @jest-environment node
 */

import { POST, GET } from './route';

describe('/api/vault auth + error sanitization', () => {
  const originalSecret = process.env.VAULT_API_SECRET;

  beforeEach(() => {
    process.env.VAULT_API_SECRET = 'test-vault-secret';
  });

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.VAULT_API_SECRET;
    } else {
      process.env.VAULT_API_SECRET = originalSecret;
    }
  });

  test('rejects unauthenticated POST (no Authorization header)', async () => {
    const res = await POST(
      new Request('http://localhost/api/vault', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'encrypt', secret: 'S', keyId: 'k', keyMaterial: 'm' }),
      }),
    );

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

  test('rejects POST with invalid Bearer token', async () => {
    const res = await POST(
      new Request('http://localhost/api/vault', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer wrong-token',
        },
        body: JSON.stringify({ action: 'encrypt', secret: 'S', keyId: 'k', keyMaterial: 'm' }),
      }),
    );

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

  test('rejects unauthenticated GET', async () => {
    const res = await GET(new Request('http://localhost/api/vault'));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

  test('sanitized error response does not leak internal details', async () => {
    // Force a server error by sending invalid JSON after auth passes
    // (or mock vault to throw). Here we pass auth but broken body that
    // still hits the catch path via invalid structure after parse.
    const res = await POST(
      new Request('http://localhost/api/vault', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-vault-secret',
        },
        body: 'not-json',
      }),
    );

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('An internal error occurred');
    // Must not contain stack traces or raw exception messages
    expect(JSON.stringify(body)).not.toMatch(/SyntaxError|Unexpected token|stack/i);
  });
});
