import * as StellarSdk from '@stellar/stellar-sdk';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, jest } from '@jest/globals';
import { MultiSigPreviewer } from '../MultiSigPreviewer';
import {
  computeThreshold,
  parseProposalXdr,
  simulateProposal,
  type SorobanServer,
} from '../multiSigPreviewerState';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NETWORK = StellarSdk.Networks.TESTNET;
const SOURCE = 'GANWPBAADSWGE2S4V2O7X6AAXBDW6GQSXWRQZ77N4VBVMXQ4HJ74MELL';

function buildTestXdr(): string {
  const account = new StellarSdk.Account(SOURCE, '100');
  return new StellarSdk.TransactionBuilder(account, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase: NETWORK,
  })
    .addOperation(StellarSdk.Operation.manageData({ name: 'test', value: 'value' }))
    .setTimeout(30)
    .build()
    .toXDR();
}

const VALID_XDR = buildTestXdr();

function makeServer(result: Record<string, unknown>): (url: string) => SorobanServer {
  return () => ({ simulateTransaction: jest.fn<() => Promise<Record<string, unknown>>>().mockResolvedValue(result) });
}

function makeErrorServer(error: Error): (url: string) => SorobanServer {
  return () => ({ simulateTransaction: jest.fn<() => Promise<never>>().mockRejectedValue(error) });
}

// ---------------------------------------------------------------------------
// parseProposalXdr
// ---------------------------------------------------------------------------

describe('parseProposalXdr', () => {
  it('decodes a valid XDR', () => {
    const parsed = parseProposalXdr(VALID_XDR, NETWORK);
    expect(parsed.sourceAccount).toBe(SOURCE);
    expect(parsed.operationCount).toBe(1);
    expect(parsed.fee).toBe(StellarSdk.BASE_FEE);
    expect(parsed.operations).toEqual(['manageData']);
  });

  it('throws on invalid XDR', () => {
    expect(() => parseProposalXdr('not-valid-xdr', NETWORK)).toThrow(/Invalid XDR/);
  });

  it('includes sequence number', () => {
    expect(parseProposalXdr(VALID_XDR, NETWORK).sequenceNumber).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// computeThreshold
// ---------------------------------------------------------------------------

describe('computeThreshold', () => {
  it('met=false when no signers have signed', () => {
    const r = computeThreshold([{ publicKey: 'A', weight: 2, signed: false }], 2);
    expect(r.met).toBe(false);
    expect(r.current).toBe(0);
  });

  it('met=true when cumulative weight meets threshold', () => {
    const r = computeThreshold(
      [{ publicKey: 'A', weight: 1, signed: true }, { publicKey: 'B', weight: 1, signed: true }],
      2,
    );
    expect(r.met).toBe(true);
    expect(r.current).toBe(2);
  });

  it('only counts signed entries', () => {
    const r = computeThreshold(
      [{ publicKey: 'A', weight: 3, signed: false }, { publicKey: 'B', weight: 1, signed: true }],
      2,
    );
    expect(r.current).toBe(1);
    expect(r.met).toBe(false);
  });

  it('met=true when weight exceeds threshold', () => {
    expect(computeThreshold([{ publicKey: 'A', weight: 5, signed: true }], 2).met).toBe(true);
  });

  it('current=0 for empty signers', () => {
    const r = computeThreshold([], 1);
    expect(r.current).toBe(0);
    expect(r.met).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// simulateProposal — using serverFactory injection
// ---------------------------------------------------------------------------

describe('simulateProposal', () => {
  it('returns success=true on a successful simulation', async () => {
    const result = await simulateProposal(VALID_XDR, NETWORK, '', makeServer({ minResourceFee: '500' }));
    expect(result.success).toBe(true);
    expect(result.fee).toBe('500');
  });

  it('returns success=false for invalid XDR', async () => {
    const result = await simulateProposal('bad-xdr', NETWORK, '', makeServer({}));
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('returns success=false when simulateTransaction rejects', async () => {
    const result = await simulateProposal(VALID_XDR, NETWORK, '', makeErrorServer(new Error('RPC down')));
    expect(result.success).toBe(false);
    expect(result.error).toBe('RPC down');
  });

  it('returns success=false when response contains error field', async () => {
    const result = await simulateProposal(VALID_XDR, NETWORK, '', makeServer({ error: 'Contract trap' }));
    expect(result.success).toBe(false);
    expect(result.error).toBe('Contract trap');
  });

  it('falls back to tx fee when minResourceFee is missing', async () => {
    const result = await simulateProposal(VALID_XDR, NETWORK, '', makeServer({}));
    expect(result.success).toBe(true);
    expect(result.fee).toBe(StellarSdk.BASE_FEE);
  });
});

// ---------------------------------------------------------------------------
// Component — MultiSigPreviewer
// ---------------------------------------------------------------------------

describe('MultiSigPreviewer', () => {
  it('renders the heading', () => {
    render(<MultiSigPreviewer />);
    expect(screen.getByText('Multi-Sig Proposal Previewer')).toBeTruthy();
  });

  it('disables the Preview button when XDR is empty', () => {
    render(<MultiSigPreviewer />);
    expect(screen.getByRole('button', { name: /Preview/i })).toBeDisabled();
  });

  it('enables Preview button when XDR is entered', () => {
    render(<MultiSigPreviewer />);
    fireEvent.change(screen.getByRole('textbox', { name: /Transaction XDR/i }), {
      target: { value: VALID_XDR },
    });
    expect(screen.getByRole('button', { name: /Preview/i })).not.toBeDisabled();
  });

  it('shows a parse error for invalid XDR', async () => {
    render(<MultiSigPreviewer />);
    fireEvent.change(screen.getByRole('textbox', { name: /Transaction XDR/i }), {
      target: { value: 'invalid-xdr' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Preview/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
  });

  it('shows proposal details after parsing a valid XDR', async () => {
    render(<MultiSigPreviewer networkPassphrase={NETWORK} />);
    fireEvent.change(screen.getByRole('textbox', { name: /Transaction XDR/i }), {
      target: { value: VALID_XDR },
    });
    fireEvent.click(screen.getByRole('button', { name: /Preview/i }));
    await waitFor(() => expect(screen.getByText(SOURCE)).toBeTruthy());
  });

  it('shows signer weight section after preview', async () => {
    render(<MultiSigPreviewer networkPassphrase={NETWORK} />);
    fireEvent.change(screen.getByRole('textbox', { name: /Transaction XDR/i }), {
      target: { value: VALID_XDR },
    });
    fireEvent.click(screen.getByRole('button', { name: /Preview/i }));
    await waitFor(() => expect(screen.getByText(/Signer weight/i)).toBeTruthy());
  });

  it('adds a signer row when Add signer is clicked', () => {
    render(<MultiSigPreviewer />);
    const before = screen.getAllByRole('checkbox').length;
    fireEvent.click(screen.getByText(/Add signer/i));
    expect(screen.getAllByRole('checkbox').length).toBe(before + 1);
  });
});
