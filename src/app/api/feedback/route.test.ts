/**
 * @jest-environment node
 */

import { POST } from './route';

describe('/api/feedback', () => {
  test('sanitizes and accepts valid feedback', async () => {
    const response = await POST(
      new Request('http://localhost/api/feedback', {
        method: 'POST',
        body: JSON.stringify({
          name: '<b>Ada</b>',
          email: 'ada@example.com',
          rating: 'Good',
          message: '<script>alert(1)</script>Improve navigation.',
          page: '/dashboard',
        }),
      }),
    );

    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.feedback).toEqual(
      expect.objectContaining({
        name: 'Ada',
        email: 'ada@example.com',
        message: 'alert(1)Improve navigation.',
        page: '/dashboard',
      }),
    );
  });

  test('rejects empty feedback messages', async () => {
    const response = await POST(
      new Request('http://localhost/api/feedback', {
        method: 'POST',
        body: JSON.stringify({ message: '   ' }),
      }),
    );

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.error).toContain('Feedback message is required');
  });

  test('rejects payloads missing the message field', async () => {
    const response = await POST(
      new Request('http://localhost/api/feedback', {
        method: 'POST',
        body: JSON.stringify({ name: 'Ada' }),
      }),
    );

    expect(response.status).toBe(400);
  });

  test('rejects invalid email addresses with a clear message', async () => {
    const response = await POST(
      new Request('http://localhost/api/feedback', {
        method: 'POST',
        body: JSON.stringify({
          email: 'not-an-email',
          message: 'hello',
        }),
      }),
    );

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.error).toContain('email');
  });

  test('accepts an empty email address', async () => {
    const response = await POST(
      new Request('http://localhost/api/feedback', {
        method: 'POST',
        body: JSON.stringify({
          email: '',
          message: 'No contact info provided.',
        }),
      }),
    );

    expect(response.status).toBe(200);
  });

  test('rejects messages exceeding the 1200 character limit', async () => {
    const response = await POST(
      new Request('http://localhost/api/feedback', {
        method: 'POST',
        body: JSON.stringify({
          message: 'x'.repeat(1500),
        }),
      }),
    );

    expect(response.status).toBe(400);
  });

  test('rejects malformed JSON payloads', async () => {
    const response = await POST(
      new Request('http://localhost/api/feedback', {
        method: 'POST',
        body: '{not valid json',
      }),
    );

    expect(response.status).toBe(400);
  });

  test('rejects messages that are not strings', async () => {
    const response = await POST(
      new Request('http://localhost/api/feedback', {
        method: 'POST',
        body: JSON.stringify({ message: 42 }),
      }),
    );

    expect(response.status).toBe(400);
  });

  test('trims whitespace-only sanitized names to empty string', async () => {
    const response = await POST(
      new Request('http://localhost/api/feedback', {
        method: 'POST',
        body: JSON.stringify({
          name: '   ',
          email: 'ada@example.com',
          message: 'Valid message here.',
        }),
      }),
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.feedback.name).toBe('');
  });
});