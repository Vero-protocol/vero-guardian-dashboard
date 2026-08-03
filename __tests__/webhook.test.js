/**
 * @jest-environment node
 */
const crypto = require('crypto');

const SECRET = 'test-webhook-secret';

const payload = {
  action: 'closed',
  pull_request: {
    number: 9999,
    merged: true,
    labels: [{ name: 'wave-contribution' }],
  },
};
const body = JSON.stringify(payload);

function sign(rawBody, secret = SECRET) {
  return `sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`;
}

describe('POST /github-webhook', () => {
  let app;
  let registerTaskOnChain;
  let request;

  beforeEach(() => {
    jest.resetModules();
    process.env.GITHUB_WEBHOOK_SECRET = SECRET;
    process.env.WEBHOOK_RATE_LIMIT_MAX = '3';
    process.env.WEBHOOK_RATE_LIMIT_WINDOW_MS = '60000';

    jest.doMock('../stellar', () => ({
      registerTaskOnChain: jest.fn().mockResolvedValue({ status: 'simulated' }),
    }));

    request = require('supertest');
    registerTaskOnChain = require('../stellar').registerTaskOnChain;
    app = require('../index');
  });

  afterEach(() => {
    delete process.env.GITHUB_WEBHOOK_SECRET;
    delete process.env.WEBHOOK_RATE_LIMIT_MAX;
    delete process.env.WEBHOOK_RATE_LIMIT_WINDOW_MS;
  });

  test('rejects a request with no signature header — AC-1', async () => {
    const res = await request(app)
      .post('/github-webhook')
      .set('Content-Type', 'application/json')
      .send(body);

    expect(res.status).toBe(401);
    expect(registerTaskOnChain).not.toHaveBeenCalled();
  });

  test('rejects a request with an invalid signature — AC-1', async () => {
    const res = await request(app)
      .post('/github-webhook')
      .set('Content-Type', 'application/json')
      .set('X-Hub-Signature-256', 'sha256=0000000000000000000000000000000000000000000000000000000000000000')
      .send(body);

    expect(res.status).toBe(401);
    expect(registerTaskOnChain).not.toHaveBeenCalled();
  });

  test('rejects a request signed with the wrong secret', async () => {
    const res = await request(app)
      .post('/github-webhook')
      .set('Content-Type', 'application/json')
      .set('X-Hub-Signature-256', sign(body, 'wrong-secret'))
      .send(body);

    expect(res.status).toBe(401);
    expect(registerTaskOnChain).not.toHaveBeenCalled();
  });

  test('accepts a request with a valid signature and registers the PR', async () => {
    const res = await request(app)
      .post('/github-webhook')
      .set('Content-Type', 'application/json')
      .set('X-Hub-Signature-256', sign(body))
      .send(body);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ registered: true, prNumber: 9999 });
    expect(registerTaskOnChain).toHaveBeenCalledWith(9999);
  });

  test('throttles excessive requests with 429 — AC-2', async () => {
    const validSignature = sign(body);

    for (let i = 0; i < 3; i++) {
      const res = await request(app)
        .post('/github-webhook')
        .set('Content-Type', 'application/json')
        .set('X-Hub-Signature-256', validSignature)
        .send(body);
      expect(res.status).toBe(200);
    }

    const throttled = await request(app)
      .post('/github-webhook')
      .set('Content-Type', 'application/json')
      .set('X-Hub-Signature-256', validSignature)
      .send(body);

    expect(throttled.status).toBe(429);
  });
});
