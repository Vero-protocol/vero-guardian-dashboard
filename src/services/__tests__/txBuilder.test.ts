import * as StellarSdk from '@stellar/stellar-sdk';
import {
  BatchTransactionBuilder,
  BatchTxBuilderError,
  type BuildBatchTransactionRequest,
  type BuildSorobanTransactionRequest,
  type SorobanRpcServer,
  type StellarOperation,
  type StellarTransactionServer,
  type SubmitTransactionResult,
  type TransactionSigner,
} from '../txBuilder';

const NETWORK_PASSPHRASE = StellarSdk.Networks.TESTNET;
const TX_HASH = 'a'.repeat(64);

type MockServer = StellarTransactionServer & {
  loadAccount: jest.Mock;
  submitTransaction: jest.Mock;
};

function makeOperation(name: string, value: string): StellarOperation {
  return StellarSdk.Operation.manageData({ name, value });
}

function makeServer(publicKey: string, sequence = '10'): MockServer {
  return {
    loadAccount: jest.fn(async () => new StellarSdk.Account(publicKey, sequence)),
    submitTransaction: jest.fn(async () => ({ hash: TX_HASH }) as SubmitTransactionResult),
  };
}

function makeSigner(): jest.MockedFunction<TransactionSigner> {
  return jest.fn<ReturnType<TransactionSigner>, Parameters<TransactionSigner>>(
    async (transactionXdr: string) => ({ signedTxXdr: transactionXdr }),
  );
}

function builtOperationName(operation: unknown): string | undefined {
  if (typeof operation === 'object' && operation !== null && 'name' in operation) {
    const name = (operation as { name?: unknown }).name;
    return typeof name === 'string' ? name : undefined;
  }

  return undefined;
}

function submittedSequences(server: MockServer): string[] {
  return server.submitTransaction.mock.calls.map(([transaction]) =>
    String((transaction as { sequence: string }).sequence),
  );
}

function expectBuilderError(error: unknown, code: string): void {
  expect(error).toBeInstanceOf(BatchTxBuilderError);
  expect(error).toMatchObject({ code });
}

describe('BatchTransactionBuilder', () => {
  let publicKey: string;
  let server: MockServer;
  let signer: jest.MockedFunction<TransactionSigner>;
  let builder: BatchTransactionBuilder;

  beforeEach(() => {
    publicKey = StellarSdk.Keypair.random().publicKey();
    server = makeServer(publicKey);
    signer = makeSigner();
    builder = new BatchTransactionBuilder({
      server,
      signer,
      networkPassphrase: NETWORK_PASSPHRASE,
    });
  });

  function buildRequest(
    operations: readonly StellarOperation[] = [makeOperation('vote_1', 'approve')],
  ): BuildBatchTransactionRequest {
    return {
      sourceAccount: publicKey,
      operations,
      networkPassphrase: NETWORK_PASSPHRASE,
    };
  }

  it('builds one transaction containing multiple supplied operations', async () => {
    const operations = [makeOperation('vote_1', 'approve'), makeOperation('vote_2', 'approve')];

    const prepared = await builder.buildBatchTransaction(buildRequest(operations));

    expect(prepared.operationCount).toBe(2);
    expect(prepared.transaction.operations).toHaveLength(2);
    expect(prepared.unsignedEnvelopeXdr).toEqual(expect.any(String));
  });

  it('rejects an empty operation list', async () => {
    await expect(builder.buildBatchTransaction(buildRequest([]))).rejects.toMatchObject({
      code: 'EMPTY_OPERATIONS',
    });
  });

  it('preserves operation order and does not mutate the input array', async () => {
    const first = makeOperation('vote_1', 'approve');
    const second = makeOperation('vote_2', 'reject');
    const operations = [first, second];
    const originalOrder = [...operations];

    const prepared = await builder.buildBatchTransaction(buildRequest(operations));

    expect(operations).toEqual(originalOrder);
    expect(prepared.transaction.operations.map(builtOperationName)).toEqual(['vote_1', 'vote_2']);
  });

  it('uses the supplied network passphrase for wallet signing', async () => {
    const networkPassphrase = 'Standalone Network ; June 2026';
    const prepared = await builder.buildBatchTransaction({
      ...buildRequest(),
      networkPassphrase,
    });

    await builder.signBatchTransaction({ preparedTransaction: prepared });

    expect(signer).toHaveBeenCalledWith(
      prepared.unsignedEnvelopeXdr,
      expect.objectContaining({
        address: publicKey,
        networkPassphrase,
      }),
    );
  });

  it('uses the correct next sequence number from loaded account state', async () => {
    server.loadAccount.mockResolvedValueOnce(new StellarSdk.Account(publicKey, '41'));

    const prepared = await builder.buildBatchTransaction(buildRequest());

    expect(prepared.sourceSequence).toBe('41');
    expect(prepared.sequenceNumber).toBe('42');
    expect(String(prepared.transaction.sequence)).toBe('42');
  });

  it('does not increment local sequence cache when broadcast fails', async () => {
    server.submitTransaction.mockRejectedValueOnce(new Error('temporary Horizon failure'));

    try {
      await builder.signAndBroadcastBatchTransaction(buildRequest());
      throw new Error('Expected broadcast failure');
    } catch (error) {
      expectBuilderError(error, 'BROADCAST_FAILED');
    }
    expect(builder.getCachedSequence(publicKey, NETWORK_PASSPHRASE)).toBeUndefined();

    server.submitTransaction.mockResolvedValueOnce({ hash: TX_HASH } as SubmitTransactionResult);
    await builder.signAndBroadcastBatchTransaction(buildRequest());

    expect(server.loadAccount).toHaveBeenCalledTimes(2);
  });

  it('returns broadcast result data after a successful signing flow', async () => {
    const result = await builder.signAndBroadcastBatchTransaction(
      buildRequest([makeOperation('vote_1', 'approve'), makeOperation('vote_2', 'approve')]),
    );

    expect(result.hash).toBe(TX_HASH);
    expect(result.operationCount).toBe(2);
    expect(result.signedEnvelopeXdr).toEqual(expect.any(String));
    expect(result.unsignedEnvelopeXdr).toEqual(expect.any(String));
    expect(signer).toHaveBeenCalledTimes(1);
    expect(server.submitTransaction).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid operation payloads without dropping them', async () => {
    const invalidOperation = undefined as unknown as StellarOperation;

    await expect(builder.buildBatchTransaction(buildRequest([invalidOperation]))).rejects.toMatchObject({
      code: 'INVALID_OPERATION',
    });
  });

  it('updates local sequence only after successful broadcast and reuses it for the next transaction', async () => {
    const first = await builder.signAndBroadcastBatchTransaction(buildRequest());
    const second = await builder.signAndBroadcastBatchTransaction(buildRequest());

    expect(first.sequenceNumber).toBe('11');
    expect(second.sequenceNumber).toBe('12');
    expect(server.loadAccount).toHaveBeenCalledTimes(1);
    expect(submittedSequences(server)).toEqual(['11', '12']);
    expect(builder.getCachedSequence(publicKey, NETWORK_PASSPHRASE)).toBe('12');
  });

  it('invalidates local sequence cache and reports stale sequence on tx_bad_seq', async () => {
    server.submitTransaction
      .mockRejectedValueOnce({
        response: {
          data: {
            extras: {
              result_codes: {
                transaction: 'tx_bad_seq',
              },
            },
          },
        },
      })
      .mockResolvedValueOnce({ hash: TX_HASH } as SubmitTransactionResult);

    try {
      await builder.signAndBroadcastBatchTransaction(buildRequest());
      throw new Error('Expected stale sequence rejection');
    } catch (error) {
      expectBuilderError(error, 'STALE_SEQUENCE');
    }

    expect(builder.getCachedSequence(publicKey, NETWORK_PASSPHRASE)).toBeUndefined();

    await builder.signAndBroadcastBatchTransaction(buildRequest());
    expect(server.loadAccount).toHaveBeenCalledTimes(2);
  });

  it('requires a source account and network passphrase', async () => {
    await expect(
      builder.buildBatchTransaction({
        ...buildRequest(),
        sourceAccount: '',
      }),
    ).rejects.toMatchObject({ code: 'MISSING_SOURCE_ACCOUNT' });

    const noNetworkBuilder = new BatchTransactionBuilder({
      server,
      signer,
      networkPassphrase: '',
    });
    await expect(
      noNetworkBuilder.buildBatchTransaction({
        sourceAccount: publicKey,
        operations: [makeOperation('vote_1', 'approve')],
      }),
    ).rejects.toMatchObject({ code: 'MISSING_NETWORK_PASSPHRASE' });
  });

  it('surfaces wallet signing failures before broadcasting', async () => {
    signer.mockResolvedValueOnce({ error: { message: 'User rejected' } });

    await expect(builder.signAndBroadcastBatchTransaction(buildRequest())).rejects.toMatchObject({
      code: 'SIGNING_FAILED',
      message: 'User rejected',
    });
    expect(server.submitTransaction).not.toHaveBeenCalled();
  });

  it('wraps account load failures clearly', async () => {
    server.loadAccount.mockRejectedValueOnce(new Error('account not found'));

    await expect(builder.buildBatchTransaction(buildRequest())).rejects.toMatchObject({
      code: 'ACCOUNT_LOAD_FAILED',
    });
  });
});

describe('BatchTransactionBuilder (Soroban)', () => {
  let publicKey: string;
  let server: MockServer;
  let signer: jest.MockedFunction<TransactionSigner>;
  let sorobanServer: jest.Mocked<SorobanRpcServer>;
  let builder: BatchTransactionBuilder;

  beforeEach(() => {
    publicKey = StellarSdk.Keypair.random().publicKey();
    server = makeServer(publicKey);
    signer = makeSigner();
    sorobanServer = {
      getAccount: jest.fn(
        async (_sourceAccount: string) => new StellarSdk.Account(publicKey, '10'),
      ),
      simulateTransaction: jest.fn(
        async (_tx: StellarSdk.Transaction | StellarSdk.FeeBumpTransaction) => ({
          id: '1',
          latestLedger: 100,
          transactionData: new StellarSdk.SorobanDataBuilder().build().toXDR('base64'),
          minResourceFee: '100',
          cost: { cpuInsns: '0', memBytes: '0' },
          results: [{
            auth: [] as string[],
            xdr: StellarSdk.xdr.ScVal.scvVoid().toXDR('base64'),
          }],
        } as unknown as StellarSdk.SorobanRpc.Api.SimulateTransactionResponse),
      ),
      sendTransaction: jest.fn(
        async (_tx: StellarSdk.Transaction | StellarSdk.FeeBumpTransaction) => ({
          hash: 'f'.repeat(64),
          status: 'PENDING',
        } as unknown as StellarSdk.SorobanRpc.Api.SendTransactionResponse),
      ),
    };
    builder = new BatchTransactionBuilder({
      server,
      signer,
      sorobanServer,
      networkPassphrase: StellarSdk.Networks.TESTNET,
    });
  });

  const validInvocation = {
    contractId: 'CA3D5KRYM6CB7OWQ6TWYRR3Z4T7GNZLKERYNZGGA5SOAOPIFY6YQGAXE',
    method: 'halt' as const,
    args: [] as readonly StellarSdk.xdr.ScVal[],
  };

  function sorobanRequest(overrides: Partial<BuildSorobanTransactionRequest> = {}): BuildSorobanTransactionRequest {
    return {
      sourceAccount: publicKey,
      invocations: [validInvocation],
      networkPassphrase: StellarSdk.Networks.TESTNET,
      ...overrides,
    };
  }

  it('builds a Soroban transaction with simulation and assembly', async () => {
    const prepared = await builder.buildSorobanTransaction(sorobanRequest());

    expect(prepared.operationCount).toBe(1);
    expect(prepared.sorobanOperations).toBe(1);
    expect(prepared.sourceAccount).toBe(publicKey);
    expect(prepared.unsignedEnvelopeXdr).toEqual(expect.any(String));
    expect(sorobanServer.simulateTransaction).toHaveBeenCalledTimes(1);
  });

  it('rejects Soroban transactions with no invocations', async () => {
    await expect(
      builder.buildSorobanTransaction(sorobanRequest({ invocations: [] })),
    ).rejects.toMatchObject({ code: 'EMPTY_OPERATIONS' });
  });

  it('fails when simulation returns an error', async () => {
    sorobanServer.simulateTransaction.mockResolvedValueOnce({
      id: '1',
      latestLedger: 100,
      error: 'Simulation failed: contract error',
    } as unknown as StellarSdk.SorobanRpc.Api.SimulateTransactionResponse);

    await expect(
      builder.buildSorobanTransaction(sorobanRequest()),
    ).rejects.toMatchObject({ code: 'SOROBAN_SIMULATION_FAILED' });
  });

  it('sends a signed Soroban transaction and returns the hash', async () => {
    const prepared = await builder.buildSorobanTransaction(sorobanRequest());
    const signed = await builder.signBatchTransaction({ preparedTransaction: prepared });
    const result = await builder.sendSorobanTransaction({ signedTransaction: signed });

    expect(result.hash).toBe('f'.repeat(64));
    expect(sorobanServer.sendTransaction).toHaveBeenCalledTimes(1);
  });

  it('builds, signs, and sends in a single call (buildSorobanAndSend)', async () => {
    const result = await builder.buildSorobanAndSend(sorobanRequest());

    expect(result.hash).toBe('f'.repeat(64));
    expect(sorobanServer.simulateTransaction).toHaveBeenCalledTimes(1);
    expect(signer).toHaveBeenCalledTimes(1);
    expect(sorobanServer.sendTransaction).toHaveBeenCalledTimes(1);
  });
});
