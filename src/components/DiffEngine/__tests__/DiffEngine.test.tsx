import { render, screen } from '@testing-library/react';
import { describe, expect, it } from '@jest/globals';
import DiffEngine from '../DiffEngine';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const matchingProps = {
  onChainAbi: '{"name":"transfer","inputs":[]}',
  repoAbi: '{"name":"transfer","inputs":[]}',
  onChainBytecode: '0x6080...',
  repoBytecode: '0x6080...',
};

// ---------------------------------------------------------------------------
// Component — DiffEngine
// ---------------------------------------------------------------------------

describe('DiffEngine', () => {
  // ── Rendering ────────────────────────────────────────────────────────────

  it('renders the heading', async () => {
    render(<DiffEngine {...matchingProps} />);
    expect(await screen.findByText('State Diff Engine')).toBeTruthy();
  });

  it('renders the ABI and Bytecode comparison sections', async () => {
    render(<DiffEngine {...matchingProps} />);
    expect(await screen.findByText('ABI Comparison')).toBeTruthy();
    expect(screen.getByText('Bytecode Comparison')).toBeTruthy();
  });

  // ── Key props / states ──────────────────────────────────────────────────

  it('reports no drift when ABI and bytecode both match', async () => {
    render(<DiffEngine {...matchingProps} />);
    expect(
      await screen.findByText('On-chain state matches repository version perfectly.'),
    ).toBeTruthy();
    expect(screen.getAllByText('Match')).toHaveLength(2);
    expect(screen.queryByText('Mismatch')).toBeNull();
  });

  it('flags drift when the ABI definitions differ', async () => {
    render(<DiffEngine {...matchingProps} repoAbi='{"name":"different"}' />);
    expect(
      await screen.findByText('State drift identified. Auditor-ready report generated.'),
    ).toBeTruthy();
    expect(screen.getByText('Drift detected in ABI definition.')).toBeTruthy();
    expect(screen.getAllByText('Mismatch')).toHaveLength(1);
    expect(screen.getAllByText('Match')).toHaveLength(1);
  });

  it('flags drift when the bytecode differs', async () => {
    render(<DiffEngine {...matchingProps} repoBytecode='0x9999' />);
    expect(
      await screen.findByText('State drift identified. Auditor-ready report generated.'),
    ).toBeTruthy();
    expect(screen.getByText('Drift detected in compiled bytecode.')).toBeTruthy();
  });

  it('treats empty inputs as matching (no drift)', async () => {
    render(<DiffEngine onChainAbi='' repoAbi='' onChainBytecode='' repoBytecode='' />);
    expect(
      await screen.findByText('On-chain state matches repository version perfectly.'),
    ).toBeTruthy();
    expect(screen.getAllByText('Match')).toHaveLength(2);
  });

  // ── Diff-result handling ────────────────────────────────────────────────

  it('ignores HTML formatting around the ABI when comparing', async () => {
    render(
      <DiffEngine
        {...matchingProps}
        onChainAbi='<pre>{"name":"transfer","inputs":[]}</pre>'
      />,
    );
    expect(
      await screen.findByText('On-chain state matches repository version perfectly.'),
    ).toBeTruthy();
    expect(screen.getAllByText('Match')).toHaveLength(2);
  });

  it('strips script tags so a wrapped ABI still compares against the repo ABI', async () => {
    render(
      <DiffEngine
        {...matchingProps}
        onChainAbi='<script>{"name":"transfer","inputs":[]}</script>'
      />,
    );
    expect(
      await screen.findByText('On-chain state matches repository version perfectly.'),
    ).toBeTruthy();
  });

  it('survives overlapping HTML tags by reapplying the strip pattern', async () => {
    // "<<script>script>alert(1)</script>" cannot be cleaned in a single pass;
    // the sanitizer loops until the string stops changing.
    render(
      <DiffEngine
        {...matchingProps}
        onChainAbi='<<script>script>alert(1)</script>'
        repoAbi='script>alert(1)'
      />,
    );
    expect(
      await screen.findByText('On-chain state matches repository version perfectly.'),
    ).toBeTruthy();
  });

  it('trims surrounding whitespace from bytecode before comparing', async () => {
    render(<DiffEngine {...matchingProps} onChainBytecode='  0x6080...  ' />);
    expect(
      await screen.findByText('On-chain state matches repository version perfectly.'),
    ).toBeTruthy();
    expect(screen.getAllByText('Match')).toHaveLength(2);
  });

  it('recomputes the diff when the inputs change', async () => {
    const { rerender } = render(<DiffEngine {...matchingProps} />);
    expect(
      await screen.findByText('On-chain state matches repository version perfectly.'),
    ).toBeTruthy();

    rerender(<DiffEngine {...matchingProps} repoAbi='{"name":"changed"}' />);
    expect(
      await screen.findByText('State drift identified. Auditor-ready report generated.'),
    ).toBeTruthy();
    expect(screen.getByText('Drift detected in ABI definition.')).toBeTruthy();
  });
});
