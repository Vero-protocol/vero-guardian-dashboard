import * as StellarSdk from '@stellar/stellar-sdk';
import { getWalletProvider } from '@/lib/wallets';
import { haltContract } from '@/services/contractClient';

jest.mock('@stellar/stellar-sdk', () => {
  const sdk = jest.requireActual<typeof import('@stellar/stellar-sdk')>('@stellar/stellar-sdk');
  return {
    ...sdk,
    SorobanRpc: { ...sdk.SorobanRpc, Server: jest.fn(), assembleTransaction: jest.fn() },
  };
});
jest.mock('@/lib/wallets', () => ({ getWalletProvider: jest.fn() }));
jest.mock('@/services/rpc', () => ({
  defaultNetworkConfig: {
    horizonUrl: 'https://horizon.example.invalid',
    sorobanRpcUrl: 'https://rpc.example.invalid',
    networkPassphrase: 'Test SDF Network ; September 2015',
  },
  DEFAULT_HORIZON_URL: 'https://horizon.example.invalid',
  CONSENSUS_THRESHOLD_KEY: 'consensus_threshold',
}));

const publicKey = StellarSdk.StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 1));
const contractId = StellarSdk.StrKey.encodeContract(Buffer.alloc(32, 2));
const networkPassphrase = StellarSdk.Networks.TESTNET;
const rpcUrl = 'https://rpc.example.invalid';
const server = { getAccount: jest.fn(), simulateTransaction: jest.fn(), sendTransaction: jest.fn() };
// This mock only echoes a synthetic unsigned envelope: it does not sign or
// broadcast anything. All RPC operations and wallet access are mocked.
const signTransaction = jest.fn(async (envelope: string) => envelope);
const assemble = jest.mocked(StellarSdk.SorobanRpc.assembleTransaction);
let prepared: StellarSdk.TransactionBuilder;
let build: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  server.getAccount.mockResolvedValue(new StellarSdk.Account(publicKey, '7'));
  server.simulateTransaction.mockResolvedValue({ fixture: 'simulation' });
  server.sendTransaction.mockResolvedValue({ status: 'PENDING', hash: 'fixture-hash' });
  jest.mocked(StellarSdk.SorobanRpc.Server).mockReturnValue(server as unknown as StellarSdk.SorobanRpc.Server);
  prepared = new StellarSdk.TransactionBuilder(new StellarSdk.Account(publicKey, '7'), {
    fee: '1000', networkPassphrase,
  }).addOperation(new StellarSdk.Contract(contractId).call('halt')).setTimeout(30);
  build = jest.spyOn(prepared, 'build');
  assemble.mockReset().mockReturnValue(prepared);
  signTransaction.mockReset().mockImplementation(async (envelope: string) => envelope);
  jest.mocked(getWalletProvider).mockReturnValue({
    id: 'freighter', name: 'Fixture', isAvailable: () => true,
    connect: async () => publicKey, signTransaction,
  });
});
afterEach(() => jest.restoreAllMocks());

describe('haltContract prepared-transaction serialization', () => {
  test('uses the actual SDK builder interface, which has no toXDR method', () => {
    expect(prepared).toBeInstanceOf(StellarSdk.TransactionBuilder);
    expect('toXDR' in prepared).toBe(false);
  });

  test.each(['freighter', 'rabet'] as const)('builds the prepared transaction before passing XDR to %s', async (providerId) => {
    await expect(haltContract(publicKey, contractId, rpcUrl, networkPassphrase, providerId)).resolves.toBe('fixture-hash');
    expect(build).toHaveBeenCalledTimes(1);
    expect(getWalletProvider).toHaveBeenCalledWith(providerId);
    expect(signTransaction).toHaveBeenCalledWith(expect.any(String), { networkPassphrase });
    const envelope = signTransaction.mock.calls[0][0];
    const transaction = StellarSdk.TransactionBuilder.fromXDR(envelope, networkPassphrase);
    expect(transaction).toBeInstanceOf(StellarSdk.Transaction);
    expect(transaction.fee).toBe('1000');
    expect(server.sendTransaction).toHaveBeenCalledTimes(1);
    expect(server.sendTransaction.mock.calls[0][0].toXDR()).toBe(envelope);
    expect(build.mock.invocationCallOrder[0]).toBeLessThan(signTransaction.mock.invocationCallOrder[0]);
  });

  test('stops before assembly or wallet calls when simulation returns an error', async () => {
    server.simulateTransaction.mockResolvedValueOnce({ error: 'fixture simulation failure' });
    await expect(haltContract(publicKey, contractId)).rejects.toThrow('fixture simulation failure');
    expect(assemble).not.toHaveBeenCalled();
    expect(signTransaction).not.toHaveBeenCalled();
    expect(server.sendTransaction).not.toHaveBeenCalled();
  });

  test('propagates an assembly failure without requesting a signature', async () => {
    assemble.mockImplementationOnce(() => { throw new Error('fixture assembly failure'); });
    await expect(haltContract(publicKey, contractId)).rejects.toThrow('fixture assembly failure');
    expect(signTransaction).not.toHaveBeenCalled();
    expect(server.sendTransaction).not.toHaveBeenCalled();
  });

  test('retains the unsupported-provider error', async () => {
    jest.mocked(getWalletProvider).mockReturnValueOnce({
      id: 'rabet', name: 'Fixture', isAvailable: () => true, connect: async () => publicKey,
    });
    await expect(haltContract(publicKey, contractId, rpcUrl, networkPassphrase, 'rabet')).rejects.toThrow('does not support signing');
    expect(server.sendTransaction).not.toHaveBeenCalled();
  });

  test('does not send when the mocked signer rejects', async () => {
    signTransaction.mockRejectedValueOnce(new Error('fixture rejection'));
    await expect(haltContract(publicKey, contractId)).rejects.toThrow('fixture rejection');
    expect(server.sendTransaction).not.toHaveBeenCalled();
  });

  test('retains the error for an unsuccessful mocked send result', async () => {
    server.sendTransaction.mockResolvedValueOnce({ status: 'ERROR', hash: 'fixture-hash' });
    await expect(haltContract(publicKey, contractId)).rejects.toThrow('Transaction submission failed with status ERROR');
  });
});
