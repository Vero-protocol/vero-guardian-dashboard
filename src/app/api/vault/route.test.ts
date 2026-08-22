/**
 * @jest-environment node
 */
import { GET, POST } from './route';

const ORIGINAL_SECRET = process.env.VAULT_API_SECRET;

beforeEach(() => {
  process.env.VAULT_API_SECRET = 'test-vault-secret';
});

afterEach(() => {
  if (ORIGINAL_SECRET === undefined) {
    delete process.env.VAULT_API_SECRET;
  } else {
    process.env.VAULT_API_SECRET = ORIGINAL_SECRET;
  }
  jest.restoreAllMocks();
});

function authHeaders(token = 'test-vault-secret'): HeadersInit {
  return { Authorization: `Bearer ${token}` };
}

describe('GET /api/vault', () => {
  test('rejects unauthenticated requests with 401', async () => {
    const res = await GET(new Request('http://localhost/api/vault'));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

  test('rejects invalid bearer token with 401', async () => {
    const res = await GET(
      new Request('http://localhost/api/vault', { headers: authHeaders('wrong') }),
    );
    expect(res.status).toBe(401);
  });

  test('returns generic 500 when VAULT_API_SECRET is missing', async () => {
    delete process.env.VAULT_API_SECRET;
    const res = await GET(
      new Request('http://localhost/api/vault', { headers: authHeaders() }),
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('An internal error occurred');
  });
});

describe('POST /api/vault', () => {
  test('rejects unauthenticated requests with 401', async () => {
    const res = await POST(
      new Request('http://localhost/api/vault', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'encrypt' }),
      }),
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

  test('does not leak internal error details on failure', async () => {
    const res = await POST(
      new Request('http://localhost/api/vault', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders(),
        },
        // Invalid body forces a failure path after auth
        body: 'not-json',
      }),
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('An internal error occurred');
    expect(JSON.stringify(body)).not.toMatch(/SyntaxError|Unexpected|stack/i);
  });

  test('returns 400 for invalid action when authenticated', async () => {
    const res = await POST(
      new Request('http://localhost/api/vault', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders(),
        },
        body: JSON.stringify({ action: 'unknown' }),
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid action');
  });
});
