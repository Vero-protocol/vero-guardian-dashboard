import * as StellarSdk from '@stellar/stellar-sdk';
import { getReputation, FALLBACK_HORIZON_URL } from '../stellar-interact';

jest.mock('@stellar/stellar-sdk', () => {
  const actual = jest.requireActual('@stellar/stellar-sdk');
  return {
    ...actual,
    Horizon: {
      ...actual.Horizon,
      Server: jest.fn(),
    },
  };
});

describe('stellar-interact getReputation', () => {
  const MockedServer = StellarSdk.Horizon.Server as unknown as jest.Mock;
  const mockPublicKey = 'GBTEST1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF1234';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should instantiate Horizon.Server with default horizonUrl when omitted', async () => {
    const mockLoadAccount = jest.fn().mockResolvedValue({
      data_attr: {
        vero_reputation: Buffer.from('42').toString('base64'),
      },
    });
    MockedServer.mockImplementation((url: string) => ({
      serverURL: url,
      loadAccount: mockLoadAccount,
    }));

    const score = await getReputation(mockPublicKey);
    expect(MockedServer).toHaveBeenCalledWith(FALLBACK_HORIZON_URL);
    expect(mockLoadAccount).toHaveBeenCalledWith(mockPublicKey);
    expect(score).toBe(42);
  });

  it('should instantiate Horizon.Server with user-configured horizonUrl', async () => {
    const customHorizon = 'https://horizon.custom-network.org';
    const mockLoadAccount = jest.fn().mockResolvedValue({
      data_attr: {
        vero_reputation: Buffer.from('85').toString('base64'),
      },
    });
    MockedServer.mockImplementation((url: string) => ({
      serverURL: url,
      loadAccount: mockLoadAccount,
    }));

    const score = await getReputation(mockPublicKey, customHorizon);
    expect(MockedServer).toHaveBeenCalledWith(customHorizon);
    expect(mockLoadAccount).toHaveBeenCalledWith(mockPublicKey);
    expect(score).toBe(85);
  });

  it('should return 0 when vero_reputation data entry is missing', async () => {
    const mockLoadAccount = jest.fn().mockResolvedValue({
      data_attr: {},
    });
    MockedServer.mockImplementation((url: string) => ({
      serverURL: url,
      loadAccount: mockLoadAccount,
    }));

    const score = await getReputation(mockPublicKey, 'https://horizon-testnet.stellar.org');
    expect(score).toBe(0);
  });

  it('should throw an error when reputation data is not an integer', async () => {
    const mockLoadAccount = jest.fn().mockResolvedValue({
      data_attr: {
        vero_reputation: Buffer.from('invalid-score').toString('base64'),
      },
    });
    MockedServer.mockImplementation((url: string) => ({
      serverURL: url,
      loadAccount: mockLoadAccount,
    }));

    await expect(getReputation(mockPublicKey)).rejects.toThrow(
      'Stellar reputation data is invalid. Refresh the page or contact support if this continues.'
    );
  });

  it('should throw an error when reputation data is negative', async () => {
    const mockLoadAccount = jest.fn().mockResolvedValue({
      data_attr: {
        vero_reputation: Buffer.from('-5').toString('base64'),
      },
    });
    MockedServer.mockImplementation((url: string) => ({
      serverURL: url,
      loadAccount: mockLoadAccount,
    }));

    await expect(getReputation(mockPublicKey)).rejects.toThrow(
      'Stellar reputation data is invalid. Refresh the page or contact support if this continues.'
    );
  });

  it('should propagate errors when loadAccount rejects', async () => {
    const mockLoadAccount = jest.fn().mockRejectedValue(new Error('Network request failed (404)'));
    MockedServer.mockImplementation((url: string) => ({
      serverURL: url,
      loadAccount: mockLoadAccount,
    }));

    await expect(getReputation(mockPublicKey, 'https://horizon.example.com')).rejects.toThrow(
      'Network request failed (404)'
    );
  });
});
