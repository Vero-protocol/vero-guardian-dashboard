import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AuditExport, { sanitizeCSVValue } from '../StateStateStateStateStateStateStateStateStateStateAuditExport';
import { readEncryptedAuditLogs, readAuditLogEvents } from '@/utils/logger';
import Papa from 'papaparse';

jest.mock('@/utils/logger', () => {
  const original = jest.requireActual('@/utils/logger');
  return {
    ...original,
    readEncryptedAuditLogs: jest.fn(),
    readAuditLogEvents: jest.fn(),
  };
});

describe('CSV Sanitization function', () => {
  test('does not modify safe inputs', () => {
    expect(sanitizeCSVValue('safe_string')).toBe('safe_string');
    expect(sanitizeCSVValue(12345)).toBe('12345');
    expect(sanitizeCSVValue(true)).toBe('true');
  });

  test('returns empty string for null or undefined', () => {
    expect(sanitizeCSVValue(null)).toBe('');
    expect(sanitizeCSVValue(undefined)).toBe('');
  });

  test('prepends a single quote to prevent CSV formula injection', () => {
    expect(sanitizeCSVValue('=1+2')).toBe("'=1+2");
    expect(sanitizeCSVValue('+someValue')).toBe("'+someValue");
    expect(sanitizeCSVValue('-negative')).toBe("'-negative");
    expect(sanitizeCSVValue('@domain')).toBe("'@domain");
    expect(sanitizeCSVValue('\tindented')).toBe("'\tindented");
    expect(sanitizeCSVValue('\rreturn')).toBe("'\rreturn");
  });

  test('handles objects by stringifying and sanitizing if necessary', () => {
    const safeObj = { key: 'value' };
    expect(sanitizeCSVValue(safeObj)).toBe(JSON.stringify(safeObj));

    const unsafeObj = { key: '=inject' };
    // Stringified: {"key":"=inject"} -> does not start with formula character
    expect(sanitizeCSVValue(unsafeObj)).toBe(JSON.stringify(unsafeObj));

    // If stringified representation starts with a formula character, it should be sanitized
    // (though rare for JSON objects unless custom stringified, but good to test)
    const customStringify = {
      toString() {
        return '=custom';
      },
    };
    expect(sanitizeCSVValue(customStringify)).toBe("'=custom");
  });
});

describe('AuditExport Component', () => {
  const mockEncryptedRecords = [
    { id: '1', timestamp: '2026-06-17T12:00:00Z', sequence: 1 },
    { id: '2', timestamp: '2026-06-17T12:05:00Z', sequence: 2 },
  ];

  const mockDecryptedEvents = [
    {
      id: '1',
      sequence: 1,
      timestamp: '2026-06-17T12:00:00Z',
      type: 'user.login',
      actor: 'admin',
      action: 'login',
      resource: 'dashboard',
      resourceId: null,
      status: 'success',
      metadata: { ip: '127.0.0.1' },
    },
    {
      id: '2',
      sequence: 2,
      timestamp: '2026-06-17T12:05:00Z',
      type: 'contract.halt',
      actor: 'guardian',
      action: 'halt',
      resource: 'stellar.contract',
      resourceId: 'C123',
      status: 'failure',
      metadata: { error: '=formula_injection_attempt' },
    },
  ];

  let createObjectURLMock: jest.Mock;
  let revokeObjectURLMock: jest.Mock;
  let clickMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    createObjectURLMock = jest.fn().mockReturnValue('blob:mock-url');
    revokeObjectURLMock = jest.fn();
    global.URL.createObjectURL = createObjectURLMock;
    global.URL.revokeObjectURL = revokeObjectURLMock;

    clickMock = jest.fn();
    jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(clickMock);
  });

  test('renders initial state with correct record count', () => {
    (readEncryptedAuditLogs as jest.Mock).mockReturnValue(mockEncryptedRecords);

    render(<AuditExport />);

    expect(screen.getByText('Audit Log Export')).toBeInTheDocument();
    expect(screen.getByText('2 historical events recorded')).toBeInTheDocument();
    expect(screen.getByText('Data sanitized against formula injection')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Export to CSV/i })).not.toBeDisabled();
  });

  test('disables export button if record count is 0', () => {
    (readEncryptedAuditLogs as jest.Mock).mockReturnValue([]);

    render(<AuditExport />);

    expect(screen.getByText('0 historical events recorded')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Export to CSV/i })).toBeDisabled();
  });

  test('handles successful CSV export and triggers download', async () => {
    (readEncryptedAuditLogs as jest.Mock).mockReturnValue(mockEncryptedRecords);
    (readAuditLogEvents as jest.Mock).mockResolvedValue(mockDecryptedEvents);
    const unparseSpy = jest.spyOn(Papa, 'unparse');

    render(<AuditExport />);

    const exportBtn = screen.getByRole('button', { name: /Export to CSV/i });
    fireEvent.click(exportBtn);

    // Export button should show loading state
    expect(screen.getByText('Decrypting and formatting records...')).toBeInTheDocument();

    await waitFor(() => {
      expect(readAuditLogEvents).toHaveBeenCalledWith(mockEncryptedRecords);
      expect(unparseSpy).toHaveBeenCalled();
    });

    // Check that CSV contains sanitized values
    const generatedRows = unparseSpy.mock.calls[0][0] as any[];
    expect(generatedRows).toHaveLength(2);
    // Verified IP address is unchanged
    expect(generatedRows[0].metadata).toBe(JSON.stringify({ ip: '127.0.0.1' }));
    // Verify that the nested metadata field error value is stringified (and not prepended with a quote because outer JSON starts with '{')
    expect(generatedRows[1].metadata).toBe(JSON.stringify({ error: '=formula_injection_attempt' }));

    expect(createObjectURLMock).toHaveBeenCalled();
    expect(clickMock).toHaveBeenCalled();
    expect(revokeObjectURLMock).toHaveBeenCalled();

    // Loading state is cleared
    await waitFor(() => {
      expect(screen.queryByText('Decrypting and formatting records...')).not.toBeInTheDocument();
    });
  });

  test('displays error message if decryption or export fails', async () => {
    (readEncryptedAuditLogs as jest.Mock).mockReturnValue(mockEncryptedRecords);
    (readAuditLogEvents as jest.Mock).mockRejectedValue(new Error('Decryption failed'));

    render(<AuditExport />);

    const exportBtn = screen.getByRole('button', { name: /Export to CSV/i });
    fireEvent.click(exportBtn);

    await waitFor(() => {
      expect(screen.getByText('Failed to decrypt audit logs: Decryption failed')).toBeInTheDocument();
    });
  });
});
