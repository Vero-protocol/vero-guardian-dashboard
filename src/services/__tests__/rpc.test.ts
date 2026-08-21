/**
 * RPC URL validation — scheme restrictions for Horizon/Soroban endpoints.
 */

import { getUrlValidationError, validateUrl } from '@/services/rpc';

const originalNodeEnv = process.env.NODE_ENV;

function setNodeEnv(value: string): void {
  Object.defineProperty(process.env, 'NODE_ENV', {
    value,
    configurable: true,
    writable: true,
  });
}

afterEach(() => {
  setNodeEnv(originalNodeEnv ?? 'test');
});

describe('getUrlValidationError / validateUrl', () => {
  describe('in non-production builds', () => {
    beforeEach(() => {
      setNodeEnv('development');
    });

    it('accepts https URLs', () => {
      expect(validateUrl('https://horizon-testnet.stellar.org')).toBe(true);
      expect(getUrlValidationError('https://soroban-testnet.stellar.org')).toBeNull();
    });

    it('accepts http localhost and 127.0.0.1', () => {
      expect(validateUrl('http://localhost:8000')).toBe(true);
      expect(validateUrl('http://127.0.0.1:8000/rpc')).toBe(true);
      expect(getUrlValidationError('http://localhost')).toBeNull();
    });

    it('rejects non-localhost http URLs with a clear error', () => {
      const error = getUrlValidationError('http://evil.example/rpc');
      expect(validateUrl('http://evil.example/rpc')).toBe(false);
      expect(error).toMatch(/HTTP is only allowed for localhost/i);
    });

    it('rejects http lookalike hosts that are not exact localhost', () => {
      expect(validateUrl('http://localhost.evil.com')).toBe(false);
      expect(validateUrl('http://127.0.0.1.nip.io')).toBe(false);
    });
  });

  describe('in production builds', () => {
    beforeEach(() => {
      setNodeEnv('production');
    });

    it('rejects all http URLs including localhost', () => {
      expect(validateUrl('http://localhost:8000')).toBe(false);
      expect(getUrlValidationError('http://127.0.0.1')).toMatch(/Only HTTPS URLs are allowed/i);
    });

    it('still accepts https URLs', () => {
      expect(validateUrl('https://horizon-testnet.stellar.org')).toBe(true);
    });
  });

  it('rejects non-http(s) schemes and malformed URLs', () => {
    setNodeEnv('development');
    expect(validateUrl('ftp://files.example')).toBe(false);
    expect(getUrlValidationError('ftp://files.example')).toMatch(/Only HTTPS URLs are allowed/i);
    expect(validateUrl('not-a-url')).toBe(false);
    expect(getUrlValidationError('not-a-url')).toMatch(/Invalid URL/i);
  });
});
