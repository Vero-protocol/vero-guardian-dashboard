import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/i18n/config';
import { AuditViewer } from '../AuditViewer';
import { fetchPRMetadata } from '@/services/githubClient';
import { generateAuditPDF } from '@/utils/report';

jest.mock('@/services/githubClient', () => ({
  fetchPRMetadata: jest.fn(),
}));

jest.mock('@/utils/report', () => ({
  generateAuditPDF: jest.fn(),
}));

const mockFetchPRMetadata = fetchPRMetadata as jest.MockedFunction<typeof fetchPRMetadata>;
const mockGenerateAuditPDF = generateAuditPDF as jest.MockedFunction<typeof generateAuditPDF>;

function renderAuditViewer(prHash = 'abc123') {
  return render(
    <I18nextProvider i18n={i18n}>
      <AuditViewer prHash={prHash} />
    </I18nextProvider>,
  );
}

describe('AuditViewer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders a loading state while PR metadata is being fetched', () => {
    mockFetchPRMetadata.mockReturnValue(new Promise(() => {}));
    renderAuditViewer();

    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('renders an error message when metadata fetching fails', async () => {
    mockFetchPRMetadata.mockRejectedValue(new Error('Network failure'));
    renderAuditViewer();

    await waitFor(() =>
      expect(screen.getByText(/network failure/i)).toBeInTheDocument(),
    );
  });

  it('renders the unavailable state when no PR data is returned', async () => {
    mockFetchPRMetadata.mockResolvedValue(null as unknown as Awaited<ReturnType<typeof fetchPRMetadata>>);
    renderAuditViewer();

    await waitFor(() =>
      expect(screen.getByText(/unavailable/i)).toBeInTheDocument(),
    );
  });

  it('renders PR details and a match badge when the hash matches', async () => {
    mockFetchPRMetadata.mockResolvedValue({
      hash: 'ABC123',
      title: 'Fix authentication flow',
      author: 'alice',
      url: 'https://github.com/example/repo/pull/42',
    });
    renderAuditViewer('abc123');

    await waitFor(() =>
      expect(screen.getByText('Fix authentication flow')).toBeInTheDocument(),
    );

    expect(screen.getByText(/alice/i)).toBeInTheDocument();
    expect(screen.getByText(/abc123/i)).toBeInTheDocument();
    expect(screen.getByText(/match/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /fix authentication flow/i })).toHaveAttribute(
      'href',
      'https://github.com/example/repo/pull/42',
    );
  });

  it('renders a mismatch badge when the fetched hash differs from the prop', async () => {
    mockFetchPRMetadata.mockResolvedValue({
      hash: 'DIFFERENT',
      title: 'Other PR',
      author: 'bob',
      url: 'https://github.com/example/repo/pull/99',
    });
    renderAuditViewer('expectedhash');

    await waitFor(() =>
      expect(screen.getByText(/mismatch/i)).toBeInTheDocument(),
    );
  });

  it('calls generateAuditPDF when the download button is clicked', async () => {
    mockFetchPRMetadata.mockResolvedValue({
      hash: 'ABC123',
      title: 'Fix authentication flow',
      author: 'alice',
      url: 'https://github.com/example/repo/pull/42',
    });
    renderAuditViewer('abc123');

    const button = await screen.findByRole('button', { name: /download report/i });
    fireEvent.click(button);

    await waitFor(() => expect(mockGenerateAuditPDF).toHaveBeenCalledTimes(1));
    expect(mockGenerateAuditPDF).toHaveBeenCalledWith(
      expect.objectContaining({
        hash: 'ABC123',
        title: 'Fix authentication flow',
        author: 'alice',
        url: 'https://github.com/example/repo/pull/42',
        isMatch: true,
      }),
    );
  });
});
