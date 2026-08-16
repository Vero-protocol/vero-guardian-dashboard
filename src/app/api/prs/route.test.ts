/**
 * @jest-environment node
 */

import { GET } from './route';

const mockFetch = jest.fn();

beforeAll(() => {
  // Set a dummy GITHUB_TOKEN so fetchPRMetadata doesn't bail out early.
  process.env.GITHUB_TOKEN = 'gh_test_token';
  jest.spyOn(global, 'fetch').mockImplementation(mockFetch);
});

afterAll(() => {
  jest.restoreAllMocks();
});

afterEach(() => {
  mockFetch.mockReset();
});

function makeRequest(prHash: string | null): Request {
  const url = prHash !== null
    ? `http://localhost/api/prs?prHash=${prHash}`
    : 'http://localhost/api/prs';
  return new Request(url);
}

describe('/api/prs', () => {
  // ---------------------------------------------------------------------------
  // Success path
  // ---------------------------------------------------------------------------
  test('returns PR metadata for a valid prHash', async () => {
    // Mock the GraphQL response that fetchPRMetadata expects
    const validSha = 'ea1b2c3d4e5f67890123456789abcdef01234567';
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          repository: {
            object: {
              associatedPullRequests: {
                edges: [
                  {
                    node: {
                      oid: validSha,
                      title: 'Fix the thing',
                      url: 'https://github.com/owner/repo/pull/42',
                      author: { login: 'alice' },
                    },
                  },
                ],
              },
            },
          },
        },
      }),
    });

    const response = await GET(makeRequest(validSha), {
      params: Promise.resolve({}),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.pr).toEqual({
      hash: validSha,
      title: 'Fix the thing',
      author: 'alice',
      url: 'https://github.com/owner/repo/pull/42',
    });
  });

  // ---------------------------------------------------------------------------
  // Missing parameter
  // ---------------------------------------------------------------------------
  test('returns 400 when prHash is missing', async () => {
    const response = await GET(makeRequest(null), {
      params: Promise.resolve({}),
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/missing.*prHash/i);
  });

  // ---------------------------------------------------------------------------
  // Invalid parameter
  // ---------------------------------------------------------------------------
  test('returns 400 when prHash is not a valid SHA', async () => {
    const response = await GET(makeRequest('not-a-sha!!!'), {
      params: Promise.resolve({}),
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/invalid.*prHash/i);
  });

  // ---------------------------------------------------------------------------
  // Error paths — fetchPRMetadata throws
  // ---------------------------------------------------------------------------
  test('returns 500 when GitHub token is not set', async () => {
    mockFetch.mockRejectedValueOnce(
      new Error('GITHUB_TOKEN environment variable is not set'),
    );

    const response = await GET(makeRequest('abcdef1234567890abcdef1234567890abcdef12'), {
      params: Promise.resolve({}),
    });
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toMatch(/GITHUB_TOKEN/i);
  });

  test('returns 500 when no associated PR is found', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          repository: {
            object: {
              associatedPullRequests: { edges: [] },
            },
          },
        },
      }),
    });

    const response = await GET(makeRequest('0000000000000000000000000000000000000000'), {
      params: Promise.resolve({}),
    });
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toMatch(/no associated PR/i);
  });

  test('returns 500 on GitHub API rate limit', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      text: async () => 'rate limit exceeded',
    });

    const response = await GET(makeRequest('abcdef1234567890abcdef1234567890abcdef12'), {
      params: Promise.resolve({}),
    });
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toMatch(/rate limit/i);
  });
});