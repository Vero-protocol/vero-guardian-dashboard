import { describe, expect, test } from '@jest/globals';
import { getStellarExplorerTxUrl } from '../stellar-expert';

const hash = 'abcdef0123456789'.repeat(4);
const explorerUrl = `https://stellar.expert/explorer/public/tx/${hash}`;

describe('getStellarExplorerTxUrl', () => {
  test.each([
    ['uppercase', hash.toUpperCase()],
    ['mixed-case', 'AbCdEf0123456789'.repeat(4)],
    ['padded uppercase', `  ${hash.toUpperCase()}  `],
    ['tabs and newlines', `\t${hash.toUpperCase()}\n`],
    ['already lowercase', hash],
    ['padded lowercase', `  ${hash}  `],
  ])('normalizes a %s transaction hash', (_name, input) => {
    expect(getStellarExplorerTxUrl(input)).toBe(explorerUrl);
  });

  test.each<[unknown]>([[''], [null], [undefined], [0], [42], [false], [{}], [[]]])(
    'preserves the empty result for invalid runtime input %p',
    (input) => {
      // Exercise the existing runtime guard when JavaScript callers violate
      // the TypeScript signature; this change does not add format validation.
      expect(getStellarExplorerTxUrl(input as string)).toBe('');
    },
  );
});
