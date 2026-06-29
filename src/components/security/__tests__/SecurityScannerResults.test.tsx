import { fireEvent, render, screen } from '@testing-library/react';
import SecurityScannerResults, { getSecurityScannerSnapshot } from '../StateStateStateStateStateStateStateStateStateStateSecurityScannerResults';

describe('SecurityScannerResults', () => {
  const scannerResults = {
    findings: [
      {
        id: 'CVE-2026-1000',
        severity: 'critical',
        title: 'Remote code execution',
        message: 'Upgrade immediately.',
        package: 'danger-lib',
        recommendation: 'Install danger-lib@2.0.0',
      },
      {
        id: 'RULE-LOW',
        severity: 'low',
        title: 'Informational file warning',
        file: 'src/app/page.tsx',
      },
    ],
  };

  it('renders scanner warnings that match the parsed output', () => {
    render(<SecurityScannerResults results={scannerResults} allowInput={false} />);

    expect(screen.getByText('Remote code execution')).toBeInTheDocument();
    expect(screen.getByText('CVE-2026-1000')).toBeInTheDocument();
    expect(screen.getByText('danger-lib')).toBeInTheDocument();
    expect(screen.getByText('Install danger-lib@2.0.0')).toBeInTheDocument();
    expect(screen.getByText('Informational file warning')).toBeInTheDocument();
    expect(screen.getByText('src/app/page.tsx')).toBeInTheDocument();
  });

  it('visibly highlights critical findings', () => {
    render(<SecurityScannerResults results={scannerResults} allowInput={false} />);

    expect(screen.getByText('1 critical')).toBeInTheDocument();
    expect(screen.getByTestId('vulnerability-warning-critical').className).toContain('border-red');
    expect(
      screen.getByText('Critical scanner findings require immediate review before approval or deployment.'),
    ).toBeInTheDocument();
  });

  it('renders a parser error for malformed JSON without crashing', () => {
    render(<SecurityScannerResults results="{bad json" allowInput={false} />);

    expect(screen.getByRole('alert')).toHaveTextContent('Scanner JSON is invalid');
  });

  it('renders an empty state when no findings exist', () => {
    render(<SecurityScannerResults results={{ findings: [] }} allowInput={false} />);

    expect(screen.getByText('0 total')).toBeInTheDocument();
    expect(screen.getByText('No vulnerability findings loaded.')).toBeInTheDocument();
  });

  it('sanitizes malicious scanner text and does not render it as HTML', () => {
    const { container } = render(
      <SecurityScannerResults
        allowInput={false}
        results={{
          findings: [
            {
              id: '<img src=x onerror=alert(1)>CVE-2026-2000',
              severity: 'critical',
              title: '<strong>Critical package issue</strong><script>alert(1)</script>',
              message: 'Leaked SECRET_KEY=super-secret',
              url: 'javascript:alert(1)',
            },
          ],
        }}
      />,
    );

    expect(screen.getByText('Critical package issue')).toBeInTheDocument();
    expect(screen.getByText('Leaked SECRET_KEY=[redacted]')).toBeInTheDocument();
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('strong')).toBeNull();
    expect(screen.queryByRole('link', { name: /reference/i })).not.toBeInTheDocument();
  });

  it('parses local textarea input only from the current JSON value', () => {
    render(<SecurityScannerResults />);

    fireEvent.change(screen.getByLabelText('Scanner JSON'), {
      target: {
        value: JSON.stringify({
          findings: [{ id: 'CVE-LOCAL', severity: 'high', title: 'Local pasted finding' }],
        }),
      },
    });

    expect(screen.getByText('Local pasted finding')).toBeInTheDocument();
    expect(screen.getByText('1 total')).toBeInTheDocument();
  });

  it('exposes parsed findings, counts, and parse errors through the snapshot helper', () => {
    expect(getSecurityScannerSnapshot(scannerResults)).toMatchObject({
      totalCount: 2,
      criticalCount: 1,
      parseError: null,
      findings: expect.arrayContaining([
        expect.objectContaining({ id: 'CVE-2026-1000', severity: 'critical' }),
      ]),
    });
  });
});

