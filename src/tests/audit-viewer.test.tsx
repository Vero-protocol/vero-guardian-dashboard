import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AuditViewer } from '../components/AuditViewer/AuditViewer';
import { fetchPRMetadata } from '@/services/githubClient';
import { generateAuditPDF } from '@/utils/report';

// 1. Mock the Dependencies
jest.mock('@/services/githubClient', () => ({
  fetchPRMetadata: jest.fn(),
}));

jest.mock('@/utils/report', () => ({
  generateAuditPDF: jest.fn(),
}));

// Mock react-i18next to return a predictable string for translations
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: any) => {
      if (options?.message) return `${key}: ${options.message}`;
      if (options?.author) return `${key}: ${options.author}`;
      if (options?.hash) return `${key}: ${options.hash}`;
      return key;
    },
  }),
}));

// 2. Define Mock Data
const mockPrHash = 'abc123def456';
const mockPrData = {
  hash: 'abc123def456',
  title: 'Feature: Add new audit logs',
  author: 'dev-johndoe',
  url: 'https://github.com/org/repo/pull/1',
};

describe('AuditViewer Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the loading state initially', () => {
    // Make the promise unresolved to test the loading state
    (fetchPRMetadata as jest.Mock).mockImplementation(() => new Promise(() => {}));

    render(<AuditViewer prHash={mockPrHash} />);

    expect(screen.getByText('audit.loading')).toBeInTheDocument();
  });

  it('renders the error state when the API call fails', async () => {
    const errorMessage = 'Network Error';
    (fetchPRMetadata as jest.Mock).mockRejectedValue(new Error(errorMessage));

    render(<AuditViewer prHash={mockPrHash} />);

    // Wait for the error message to appear
    await waitFor(() => {
      expect(screen.getByText(`audit.error: ${errorMessage}`)).toBeInTheDocument();
    });
  });

  it('renders the fallback error message if no message is provided on failure', async () => {
    (fetchPRMetadata as jest.Mock).mockRejectedValue({});

    render(<AuditViewer prHash={mockPrHash} />);

    await waitFor(() => {
      expect(screen.getByText('audit.error: audit.failedLoad')).toBeInTheDocument();
    });
  });

  it('renders the unavailable state when API returns null', async () => {
    (fetchPRMetadata as jest.Mock).mockResolvedValue(null);

    render(<AuditViewer prHash={mockPrHash} />);

    await waitFor(() => {
      expect(screen.getByText('audit.unavailable')).toBeInTheDocument();
    });
  });

  it('renders PR data correctly with a Match badge when hashes are identical', async () => {
    (fetchPRMetadata as jest.Mock).mockResolvedValue(mockPrData);

    render(<AuditViewer prHash={mockPrHash} />);

    // Wait for the loading to finish
    await waitFor(() => {
      expect(screen.queryByText('audit.loading')).not.toBeInTheDocument();
    });

    // Check if the data is rendered
    expect(screen.getByText('audit.heading')).toBeInTheDocument();
    expect(screen.getByText(mockPrData.title)).toHaveAttribute('href', mockPrData.url);
    expect(screen.getByText(`audit.author: ${mockPrData.author}`)).toBeInTheDocument();
    expect(screen.getByText(`audit.hash: ${mockPrData.hash}`)).toBeInTheDocument();

    // Check for match badge
    const badge = screen.getByText('audit.match');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('bg-green-100');
  });

  it('renders PR data with a Mismatch badge when hashes differ', async () => {
    const mismatchedData = { ...mockPrData, hash: 'xyz987mismatch' };
    (fetchPRMetadata as jest.Mock).mockResolvedValue(mismatchedData);

    render(<AuditViewer prHash={mockPrHash} />);

    await waitFor(() => {
      expect(screen.queryByText('audit.loading')).not.toBeInTheDocument();
    });

    // Check for mismatch badge
    const badge = screen.getByText('audit.mismatch');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('bg-red-100');
  });

  it('calls generateAuditPDF with correct data when download button is clicked', async () => {
    (fetchPRMetadata as jest.Mock).mockResolvedValue(mockPrData);

    render(<AuditViewer prHash={mockPrHash} />);

    await waitFor(() => {
      expect(screen.queryByText('audit.loading')).not.toBeInTheDocument();
    });

    const downloadButton = screen.getByText('audit.downloadReport');
    fireEvent.click(downloadButton);

    expect(generateAuditPDF).toHaveBeenCalledTimes(1);

    expect(generateAuditPDF).toHaveBeenCalledWith({
      hash: mockPrData.hash,
      title: mockPrData.title,
      author: mockPrData.author,
      url: mockPrData.url,
      isMatch: true,
      generatedAt: expect.any(Date),
    });
  });
});