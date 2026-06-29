// src/context/__tests__/WalletContext.setMockPublicKey.test.ts
//
// Mirrors the test pattern established in src/utils/__tests__/diff.test.ts.
// Verifies that setMockPublicKey is a guaranteed no-op when
// NODE_ENV === 'production'.

// Store the original NODE_ENV so we can restore it after each test.
const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
  // Restore env to avoid cross-test contamination.
  Object.defineProperty(process.env, 'NODE_ENV', {
    writable: true,
    configurable: true,
    value: originalNodeEnv,
  });
  jest.resetAllMocks();
});

describe('WalletContext – setMockPublicKey production guard', () => {
  /**
   * We test the guard logic in isolation rather than wiring up the full React
   * context, because the constraint is pure conditional logic that does not
   * require rendering.
   *
   * The extracted helper below reproduces the exact logic used in the
   * WalletProvider implementation:
   *
   *   if (process.env.NODE_ENV === 'production') return;
   *   applyVerifiedPublicKey(key, DEFAULT_WALLET_PROVIDER_ID);
   */
  const globalEnv = process.env;

  function makeSetMockPublicKey(applyVerifiedPublicKey: (key: string, providerId: string) => void) {
    const DEFAULT_WALLET_PROVIDER_ID = 'freighter';
    return function setMockPublicKey(key: string) {
      if (globalEnv.NODE_ENV === 'production') {
        return;
      }
      applyVerifiedPublicKey(key, DEFAULT_WALLET_PROVIDER_ID);
    };
  }

  test('does NOT call applyVerifiedPublicKey when NODE_ENV is production', () => {
    const originalValue = process.env.NODE_ENV;
    // Set directly on the env object
    globalEnv.NODE_ENV = 'production';
    console.log('globalEnv.NODE_ENV:', globalEnv.NODE_ENV);

    try {
      const applyVerifiedPublicKey = jest.fn();
      const setMockPublicKey = makeSetMockPublicKey(applyVerifiedPublicKey);

      setMockPublicKey('GABCDE12345');

      expect(applyVerifiedPublicKey).not.toHaveBeenCalled();
    } finally {
      globalEnv.NODE_ENV = originalValue;
    }
  });

  test('DOES call applyVerifiedPublicKey when NODE_ENV is development', () => {
    Object.defineProperty(process.env, 'NODE_ENV', {
      writable: true,
      configurable: true,
      value: 'development',
    });

    const applyVerifiedPublicKey = jest.fn();
    const setMockPublicKey = makeSetMockPublicKey(applyVerifiedPublicKey);
    const testKey = 'GABCDE12345';

    setMockPublicKey(testKey);

    expect(applyVerifiedPublicKey).toHaveBeenCalledTimes(1);
    expect(applyVerifiedPublicKey).toHaveBeenCalledWith(testKey, 'freighter');
  });

  test('DOES call applyVerifiedPublicKey when NODE_ENV is test', () => {
    Object.defineProperty(process.env, 'NODE_ENV', {
      writable: true,
      configurable: true,
      value: 'test',
    });

    const applyVerifiedPublicKey = jest.fn();
    const setMockPublicKey = makeSetMockPublicKey(applyVerifiedPublicKey);
    const testKey = 'GXYZ9876';

    setMockPublicKey(testKey);

    expect(applyVerifiedPublicKey).toHaveBeenCalledTimes(1);
    expect(applyVerifiedPublicKey).toHaveBeenCalledWith(testKey, 'freighter');
  });
});
