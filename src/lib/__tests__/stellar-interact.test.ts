import * as StellarSdk from '@stellar/stellar-sdk';
import { getReputation, HORIZON_URL } from '../stellar-interact';

jest.mock('@stellar/stellar-sdk', () => {
  const original = jest.requireActual('@stellar/stellar-sdk');
  const mockServerInstance = {
    loadAccount: jest.fn(),
  };

  const ServerMock = jest.fn(() => mockServerInstance);
  (ServerMock as unknown as { __mockServer: typeof mockServerInstance }).__mockServer = mockServerInstance;

  return {
    ...original,
    Horizon: { Server: ServerMock },
  };
});

const ServerMock = StellarSdk.Horizon.Server as unknown as jest.Mock & {
  __mockServer: { loadAccount: jest.Mock };
};
const mockServer = ServerMock.__mockServer;

describe('stellar-interact: getReputation', () => {
  const PUBLIC_KEY = 'GDZST3XVCDTUJ76ZAV2HA72KYXY5YOFZ3F5YMQABR6J32F2TQPWQNQ3X';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses default HORIZON_URL when horizonUrl is not specified', async () => {
    mockServer.loadAccount.mockResolvedValueOnce({
      data_attr: {},
    });

    const rep = await getReputation(PUBLIC_KEY);

    expect(rep).toBe(0);
    expect(ServerMock).toHaveBeenCalledWith(HORIZON_URL);
    expect(mockServer.loadAccount).toHaveBeenCalledWith(PUBLIC_KEY);
  });

  it('uses provided custom horizonUrl when passed', async () => {
    const customUrl = 'https://horizon-custom.example.org';
    const encoded = Buffer.from('42').toString('base64');
    mockServer.loadAccount.mockResolvedValueOnce({
      data_attr: {
        vero_reputation: encoded,
      },
    });

    const rep = await getReputation(PUBLIC_KEY, customUrl);

    expect(rep).toBe(42);
    expect(ServerMock).toHaveBeenCalledWith(customUrl);
    expect(mockServer.loadAccount).toHaveBeenCalledWith(PUBLIC_KEY);
  });

  it('returns 0 when vero_reputation data attribute is missing', async () => {
    mockServer.loadAccount.mockResolvedValueOnce({
      data_attr: {
        some_other_key: Buffer.from('test').toString('base64'),
      },
    });

    const rep = await getReputation(PUBLIC_KEY);
    expect(rep).toBe(0);
  });

  it('correctly decodes and returns valid reputation scores', async () => {
    const encoded = Buffer.from('100').toString('base64');
    mockServer.loadAccount.mockResolvedValueOnce({
      data_attr: {
        vero_reputation: encoded,
      },
    });

    const rep = await getReputation(PUBLIC_KEY);
    expect(rep).toBe(100);
  });

  it('throws an error if reputation data is negative', async () => {
    const encoded = Buffer.from('-5').toString('base64');
    mockServer.loadAccount.mockResolvedValueOnce({
      data_attr: {
        vero_reputation: encoded,
      },
    });

    await expect(getReputation(PUBLIC_KEY)).rejects.toThrow(
      'Stellar reputation data is invalid. Refresh the page or contact support if this continues.'
    );
  });

  it('throws an error if reputation data is not an integer', async () => {
    const encoded = Buffer.from('12.34').toString('base64');
    mockServer.loadAccount.mockResolvedValueOnce({
      data_attr: {
        vero_reputation: encoded,
      },
    });

    await expect(getReputation(PUBLIC_KEY)).rejects.toThrow(
      'Stellar reputation data is invalid. Refresh the page or contact support if this continues.'
    );
  });

  it('throws an error if reputation data is non-numeric', async () => {
    const encoded = Buffer.from('invalid-number').toString('base64');
    mockServer.loadAccount.mockResolvedValueOnce({
      data_attr: {
        vero_reputation: encoded,
      },
    });

    await expect(getReputation(PUBLIC_KEY)).rejects.toThrow(
      'Stellar reputation data is invalid. Refresh the page or contact support if this continues.'
    );
  });
});
