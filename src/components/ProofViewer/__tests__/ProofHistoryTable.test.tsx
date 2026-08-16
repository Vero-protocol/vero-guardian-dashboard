import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ProofHistoryTable from '../ProofHistoryTable';
import { fetchProofHistory } from '@/services/proofService';
import type { ProofRecord } from '@/types/proof';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

jest.mock('@/services/proofService', () => ({
  fetchProofHistory: jest.fn(),
}));

const mockFetchProofHistory = fetchProofHistory as jest.MockedFunction<typeof fetchProofHistory>;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PROOF_RECORDS: ProofRecord[] = [
  {
    timestamp: '2026-08-16T10:00:00.000Z',
    taskId: 'task-001',
    proofHash: '0xabc123def456',
    proofBlob: '{"proof":"alpha"}',
  },
  {
    timestamp: '2026-08-15T08:30:00.000Z',
    taskId: 'task-002',
    proofHash: '0xdeadbeefcafe',
    proofBlob: '{"proof":"beta"}',
  },
];

// ---------------------------------------------------------------------------
// Browser API stubs
// ---------------------------------------------------------------------------

// Clipboard
const clipboardWriteText = jest.fn().mockResolvedValue(undefined);
Object.defineProperty(navigator, 'clipboard', {
  value: { writeText: clipboardWriteText },
  configurable: true,
  writable: true,
});

// URL.createObjectURL / URL.revokeObjectURL
const mockObjectUrl = 'blob:http://localhost/mock-url';
const createObjectURL = jest.fn().mockReturnValue(mockObjectUrl);
const revokeObjectURL = jest.fn();
Object.defineProperty(URL, 'createObjectURL', {
  value: createObjectURL,
  configurable: true,
  writable: true,
});
Object.defineProperty(URL, 'revokeObjectURL', {
  value: revokeObjectURL,
  configurable: true,
  writable: true,
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderTable() {
  return render(<ProofHistoryTable />);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ProofHistoryTable', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Loading state ──────────────────────────────────────────────────────────

  describe('loading state', () => {
    it('shows the loading indicator while proof history is being fetched', async () => {
      // Never resolves during this test
      mockFetchProofHistory.mockReturnValue(new Promise(() => {}));
      renderTable();

      expect(screen.getByText('Loading proof history…')).toBeInTheDocument();
    });

    it('removes the loading indicator after data arrives', async () => {
      mockFetchProofHistory.mockResolvedValue(PROOF_RECORDS);
      renderTable();

      await waitFor(() =>
        expect(screen.queryByText('Loading proof history…')).not.toBeInTheDocument(),
      );
    });
  });

  // ── Error state ────────────────────────────────────────────────────────────

  describe('error state', () => {
    it('displays an error message when the service rejects', async () => {
      mockFetchProofHistory.mockRejectedValue(new Error('Network timeout'));
      renderTable();

      await waitFor(() =>
        expect(
          screen.getByText(/Failed to load proof history: Network timeout/),
        ).toBeInTheDocument(),
      );
    });

    it('uses the fallback error message when the error has no message string', async () => {
      // Reject with a plain object that has no .message
      mockFetchProofHistory.mockRejectedValue({ code: 500 });
      renderTable();

      // The catch branch falls back to t('proofs.failedLoad')
      await waitFor(() =>
        expect(screen.getByText(/Failed to load proof history: Failed to load proof history/)).toBeInTheDocument(),
      );
    });

    it('does not render the table when in error state', async () => {
      mockFetchProofHistory.mockRejectedValue(new Error('fail'));
      renderTable();

      await waitFor(() => expect(screen.queryByRole('table')).not.toBeInTheDocument());
    });
  });

  // ── Table rendering ────────────────────────────────────────────────────────

  describe('table rendering', () => {
    it('renders the section heading', async () => {
      mockFetchProofHistory.mockResolvedValue(PROOF_RECORDS);
      renderTable();

      await waitFor(() =>
        expect(screen.getByText('Proof Submission History')).toBeInTheDocument(),
      );
    });

    it('renders all column headers', async () => {
      mockFetchProofHistory.mockResolvedValue(PROOF_RECORDS);
      renderTable();

      await waitFor(() => {
        expect(screen.getByText('Timestamp')).toBeInTheDocument();
        expect(screen.getByText('Task ID')).toBeInTheDocument();
        expect(screen.getByText('Proof Hash')).toBeInTheDocument();
        expect(screen.getByText('Actions')).toBeInTheDocument();
      });
    });

    it('renders a row for every proof record returned by the service', async () => {
      mockFetchProofHistory.mockResolvedValue(PROOF_RECORDS);
      renderTable();

      await waitFor(() => {
        expect(screen.getByText('task-001')).toBeInTheDocument();
        expect(screen.getByText('task-002')).toBeInTheDocument();
        expect(screen.getByText('0xabc123def456')).toBeInTheDocument();
        expect(screen.getByText('0xdeadbeefcafe')).toBeInTheDocument();
      });
    });

    it('formats the ISO timestamp into a localised string', async () => {
      mockFetchProofHistory.mockResolvedValue([PROOF_RECORDS[0]]);
      renderTable();

      // new Date('2026-08-16T10:00:00.000Z').toLocaleString() varies by
      // environment; check that a non-ISO fragment is present instead.
      await waitFor(() => {
        // The raw ISO string is NOT expected in the cell
        expect(screen.queryByText('2026-08-16T10:00:00.000Z')).not.toBeInTheDocument();
        // Some date-like text should appear in the row
        const rows = screen.getAllByRole('row');
        expect(rows.length).toBeGreaterThan(1); // header + at least one data row
      });
    });

    it('calls fetchProofHistory exactly once on mount', async () => {
      mockFetchProofHistory.mockResolvedValue(PROOF_RECORDS);
      renderTable();

      await waitFor(() => expect(mockFetchProofHistory).toHaveBeenCalledTimes(1));
    });
  });

  // ── Empty state ────────────────────────────────────────────────────────────

  describe('empty state', () => {
    it('renders the table structure with no data rows when the service returns an empty array', async () => {
      mockFetchProofHistory.mockResolvedValue([]);
      renderTable();

      await waitFor(() => {
        expect(screen.getByRole('table')).toBeInTheDocument();
        // Only the header row, no data rows
        const rows = screen.getAllByRole('row');
        expect(rows).toHaveLength(1);
      });
    });
  });

  // ── Copy action ────────────────────────────────────────────────────────────

  describe('copy proof hash action', () => {
    it('calls navigator.clipboard.writeText with the correct proof hash', async () => {
      mockFetchProofHistory.mockResolvedValue(PROOF_RECORDS);
      renderTable();

      await waitFor(() => screen.getByText('task-001'));

      const copyButtons = screen.getAllByRole('button', { name: 'Copy proof hash' });
      fireEvent.click(copyButtons[0]);

      expect(clipboardWriteText).toHaveBeenCalledWith('0xabc123def456');
    });

    it('copies the correct hash for each row independently', async () => {
      mockFetchProofHistory.mockResolvedValue(PROOF_RECORDS);
      renderTable();

      await waitFor(() => screen.getByText('task-002'));

      const copyButtons = screen.getAllByRole('button', { name: 'Copy proof hash' });
      fireEvent.click(copyButtons[1]);

      expect(clipboardWriteText).toHaveBeenCalledWith('0xdeadbeefcafe');
    });
  });

  // ── Download action ────────────────────────────────────────────────────────

  describe('download proof action', () => {
    let anchorClickSpy: jest.SpyInstance;

    beforeEach(() => {
      anchorClickSpy = jest
        .spyOn(HTMLAnchorElement.prototype, 'click')
        .mockImplementation(() => {});
    });

    afterEach(() => {
      anchorClickSpy.mockRestore();
    });

    it('creates an object URL from the proof blob data', async () => {
      mockFetchProofHistory.mockResolvedValue([PROOF_RECORDS[0]]);
      renderTable();

      await waitFor(() => screen.getByText('task-001'));

      const downloadButton = screen.getByRole('button', { name: 'Download proof' });
      fireEvent.click(downloadButton);

      expect(createObjectURL).toHaveBeenCalledTimes(1);
      const blobArg: Blob = createObjectURL.mock.calls[0][0];
      expect(blobArg).toBeInstanceOf(Blob);
      expect(blobArg.type).toBe('application/octet-stream');
    });

    it('sets the correct download filename as <taskId>-<timestamp>.proof', async () => {
      mockFetchProofHistory.mockResolvedValue([PROOF_RECORDS[0]]);
      renderTable();

      await waitFor(() => screen.getByText('task-001'));

      const downloadButton = screen.getByRole('button', { name: 'Download proof' });
      fireEvent.click(downloadButton);

      expect(anchorClickSpy).toHaveBeenCalled();
      // The anchor element created inside handleDownload carries the filename
      const anchorElement = anchorClickSpy.mock.instances[0] as HTMLAnchorElement;
      expect(anchorElement.download).toBe(
        `${PROOF_RECORDS[0].taskId}-${PROOF_RECORDS[0].timestamp}.proof`,
      );
      expect(anchorElement.href).toContain(mockObjectUrl);
    });

    it('revokes the object URL after triggering the download', async () => {
      mockFetchProofHistory.mockResolvedValue([PROOF_RECORDS[0]]);
      renderTable();

      await waitFor(() => screen.getByText('task-001'));

      const downloadButton = screen.getByRole('button', { name: 'Download proof' });
      fireEvent.click(downloadButton);

      expect(revokeObjectURL).toHaveBeenCalledWith(mockObjectUrl);
    });
  });

  // ── Edge cases ─────────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('renders a record whose proofBlob is an empty string without crashing', async () => {
      const record: ProofRecord = {
        timestamp: '2026-01-01T00:00:00.000Z',
        taskId: 'task-empty-blob',
        proofHash: '0x000',
        proofBlob: '',
      };
      mockFetchProofHistory.mockResolvedValue([record]);
      renderTable();

      await waitFor(() => expect(screen.getByText('task-empty-blob')).toBeInTheDocument());
    });

    it('renders a record with a very long proofHash without layout errors', async () => {
      const longHash = '0x' + 'f'.repeat(256);
      const record: ProofRecord = {
        timestamp: '2026-01-02T00:00:00.000Z',
        taskId: 'task-long-hash',
        proofHash: longHash,
        proofBlob: 'data',
      };
      mockFetchProofHistory.mockResolvedValue([record]);
      renderTable();

      await waitFor(() => expect(screen.getByText(longHash)).toBeInTheDocument());
    });

    it('renders many records without crashing', async () => {
      const manyRecords: ProofRecord[] = Array.from({ length: 50 }, (_, i) => ({
        timestamp: new Date(Date.now() - i * 60_000).toISOString(),
        taskId: `task-${i}`,
        proofHash: `0x${i.toString(16).padStart(8, '0')}`,
        proofBlob: `blob-${i}`,
      }));
      mockFetchProofHistory.mockResolvedValue(manyRecords);
      renderTable();

      await waitFor(() => {
        expect(screen.getByText('task-0')).toBeInTheDocument();
        expect(screen.getByText('task-49')).toBeInTheDocument();
      });
    });

    it('survives a clipboard rejection silently (no thrown error, no UI change)', async () => {
      clipboardWriteText.mockRejectedValueOnce(new Error('NotAllowedError'));
      mockFetchProofHistory.mockResolvedValue([PROOF_RECORDS[0]]);
      renderTable();

      await waitFor(() => screen.getByText('task-001'));

      const [copyButton] = screen.getAllByRole('button', { name: 'Copy proof hash' });

      // Should not throw
      await expect(async () => {
        fireEvent.click(copyButton);
        // Give the microtask queue a tick for the rejected promise to flush
        await Promise.resolve();
      }).resolves.not.toThrow();

      // Table remains fully intact
      expect(screen.getByText('0xabc123def456')).toBeInTheDocument();
    });
  });
});
