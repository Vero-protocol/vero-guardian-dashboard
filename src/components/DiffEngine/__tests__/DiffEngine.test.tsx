import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from '@jest/globals';
import DiffEngine, { sanitizeForComparison } from '../DiffEngine';

// ---------------------------------------------------------------------------
// Pure function — sanitizeForComparison
// ---------------------------------------------------------------------------

describe('sanitizeForComparison', () => {
  it('returns an empty string for null/undefined input', () => {
    // @ts-expect-error — testing null edge case
    expect(sanitizeForComparison(null)).toBe('');
    // @ts-expect-error — testing undefined edge case
    expect(sanitizeForComparison(undefined)).toBe('');
  });

  it('returns an empty string for empty input', () => {
    expect(sanitizeForComparison('')).toBe('');
  });

  it('trims whitespace', () => {
    expect(sanitizeForComparison('  hello  ')).toBe('hello');
  });

  it('passes through plain text unchanged', () => {
    const text = 'function foo() { return 1; }';
    expect(sanitizeForComparison(text)).toBe(text);
  });

  it('strips simple HTML tags', () => {
    expect(sanitizeForComparison('<script>alert("xss")</script>')).toBe('alert("xss")');
  });

  it('strips nested HTML tags', () => {
    const input = '<div><span>nested</span></div>';
    expect(sanitizeForComparison(input)).toBe('nested');
  });

  it('strips overlapping tag variants', () => {
    const input = '<<script>script>alert(1)</<script>script>';
    // The loop-based regex strips `<script>` blocks but leaves residual
    // `script>` text since the outer <<script> is not a valid tag.
    expect(sanitizeForComparison(input)).toBe('script>alert(1)script>');
  });

  it('strips deeply nested tag variants', () => {
    const input = '<<scr<<script>ipt>alert(1)</<scr<<script>ipt>>';
    expect(sanitizeForComparison(input)).toBe('ipt>alert(1)ipt>>');
  });

  it('handles tags with attributes', () => {
    const input = '<img src=x onerror=alert(1)>';
    expect(sanitizeForComparison(input)).toBe('');
  });

  it('handles self-closing tags', () => {
    const input = 'hello<br/>world';
    expect(sanitizeForComparison(input)).toBe('helloworld');
  });

  it('preserves JSON-like content', () => {
    const input = '{"name": "test", "value": 42}';
    expect(sanitizeForComparison(input)).toBe(input);
  });

  it('preserves Solidity-like ABI content', () => {
    const input = `function transfer(address to, uint256 amount) returns (bool)`;
    expect(sanitizeForComparison(input)).toBe(input);
  });
});

// ---------------------------------------------------------------------------
// Component rendering
// ---------------------------------------------------------------------------

const mockAbi = `function balanceOf(address) view returns (uint256)`;
const mockBytecode = '0x608060405234801561001057600080fd5b50';

const mockAbiDifferent = `function transfer(address, uint256) returns (bool)`;
const mockBytecodeDifferent = '0xdeadbeef';

describe('DiffEngine', () => {
  it('renders the component title', async () => {
    render(
      <DiffEngine
        onChainAbi={mockAbi}
        repoAbi={mockAbi}
        onChainBytecode={mockBytecode}
        repoBytecode={mockBytecode}
      />
    );
    expect(await screen.findByText('State Diff Engine')).toBeInTheDocument();
  });

  it('displays match status when all fields match', async () => {
    render(
      <DiffEngine
        onChainAbi={mockAbi}
        repoAbi={mockAbi}
        onChainBytecode={mockBytecode}
        repoBytecode={mockBytecode}
      />
    );
    const matchMsg = await screen.findByText('On-chain state matches repository version perfectly.');
    expect(matchMsg).toBeInTheDocument();
    // Both ABI and Bytecode report Match
    const matches = screen.getAllByText('Match');
    expect(matches).toHaveLength(2);
  });

  it('displays drift status when ABI differs', async () => {
    render(
      <DiffEngine
        onChainAbi={mockAbi}
        repoAbi={mockAbiDifferent}
        onChainBytecode={mockBytecode}
        repoBytecode={mockBytecode}
      />
    );
    const driftMsg = await screen.findByText('State drift identified. Auditor-ready report generated.');
    expect(driftMsg).toBeInTheDocument();
    expect(screen.getByText('Mismatch')).toBeInTheDocument();
  });

  it('displays drift status when bytecode differs', async () => {
    render(
      <DiffEngine
        onChainAbi={mockAbi}
        repoAbi={mockAbi}
        onChainBytecode={mockBytecode}
        repoBytecode={mockBytecodeDifferent}
      />
    );
    const driftMsg = await screen.findByText('State drift identified. Auditor-ready report generated.');
    expect(driftMsg).toBeInTheDocument();
  });

  it('displays mismatch in both ABI and bytecode when both differ', async () => {
    render(
      <DiffEngine
        onChainAbi={mockAbi}
        repoAbi={mockAbiDifferent}
        onChainBytecode={mockBytecode}
        repoBytecode={mockBytecodeDifferent}
      />
    );
    const mismatchLabels = await screen.findAllByText('Mismatch');
    expect(mismatchLabels).toHaveLength(2);
  });

  it('sanitizes HTML from on-chain ABI before comparison', async () => {
    // The component strips <script> tags from onChainAbi, then compares
    // the sanitized result against repoAbi.
    const htmlInjectedAbi = '<script>alert("xss")</script>function foo()';
    // After sanitization, on-chain becomes 'alert("xss")function foo()'
    const repoAbiAfterSanitize = 'alert("xss")function foo()';
    render(
      <DiffEngine
        onChainAbi={htmlInjectedAbi}
        repoAbi={repoAbiAfterSanitize}
        onChainBytecode={mockBytecode}
        repoBytecode={mockBytecode}
      />
    );
    // After sanitization, both should match (sanitized on-chain === clean repo)
    const matchMsg = await screen.findByText('On-chain state matches repository version perfectly.');
    expect(matchMsg).toBeInTheDocument();
  });

  it('shows ABI and Bytecode section labels', async () => {
    render(
      <DiffEngine
        onChainAbi={mockAbi}
        repoAbi={mockAbi}
        onChainBytecode={mockBytecode}
        repoBytecode={mockBytecode}
      />
    );
    expect(await screen.findByText('ABI Comparison')).toBeInTheDocument();
    expect(await screen.findByText('Bytecode Comparison')).toBeInTheDocument();
  });

  it('renders the GitCompare icon', async () => {
    render(
      <DiffEngine
        onChainAbi={mockAbi}
        repoAbi={mockAbi}
        onChainBytecode={mockBytecode}
        repoBytecode={mockBytecode}
      />
    );
    // lucide-react renders icons with aria-hidden="true"
    const svg = document.querySelector('.lucide-git-compare');
    expect(svg).toBeInTheDocument();
  });
});