/**
 * @jest-environment node
 */

import { checkRateLimit, getClientIp, resetRateLimitStore } from './rate-limiter';

describe('rate-limiter', () => {
  beforeEach(() => {
    resetRateLimitStore();
  });

  test('allows requests within the default limit', () => {
    const result = checkRateLimit('192.168.1.1');
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(29);
    expect(typeof result.resetAt).toBe('number');
  });

  test('tracks remaining count correctly', () => {
    for (let i = 0; i < 5; i++) {
      checkRateLimit('192.168.1.2');
    }
    const result = checkRateLimit('192.168.1.2');
    expect(result.remaining).toBe(24);
  });

  test('blocks requests after exceeding the limit', () => {
    for (let i = 0; i < 30; i++) {
      checkRateLimit('192.168.1.3');
    }
    const result = checkRateLimit('192.168.1.3');
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  test('resets the window for a new period', () => {
    const result = checkRateLimit('192.168.1.4', { windowMs: 0 });
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(29);
  });

  test('tracks different IPs independently', () => {
    for (let i = 0; i < 30; i++) {
      checkRateLimit('10.0.0.1');
    }
    expect(checkRateLimit('10.0.0.1').allowed).toBe(false);
    expect(checkRateLimit('10.0.0.2').allowed).toBe(true);
  });

  test('getClientIp extracts IP from x-forwarded-for header', () => {
    const request = new Request('http://localhost', {
      headers: { 'x-forwarded-for': '203.0.113.5, 10.0.0.1' },
    });
    expect(getClientIp(request)).toBe('203.0.113.5');
  });

  test('getClientIp falls back to x-real-ip', () => {
    const request = new Request('http://localhost', {
      headers: { 'x-real-ip': '10.0.0.99' },
    });
    expect(getClientIp(request)).toBe('10.0.0.99');
  });

  test('getClientIp returns 127.0.0.1 when no headers present', () => {
    const request = new Request('http://localhost');
    expect(getClientIp(request)).toBe('127.0.0.1');
  });
});