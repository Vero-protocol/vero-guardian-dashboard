import { fireEvent, render, screen } from '@testing-library/react';
import IPFSDocViewer from '../IPFSDocViewer';
import { buildGatewayUrl, IPFS_GATEWAY, isValidIpfsHash } from '../ipfsDocViewer';

// ---------------------------------------------------------------------------
// Pure logic — isValidIpfsHash
// ---------------------------------------------------------------------------

describe('isValidIpfsHash', () => {
  it('accepts a valid CIDv0 (Qm...)', () => {
    expect(isValidIpfsHash('QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG')).toBe(true);
  });

  it('accepts a valid CIDv1 (bafy...)', () => {
    expect(isValidIpfsHash('bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi')).toBe(true);
  });

  it('rejects an empty string', () => {
    expect(isValidIpfsHash('')).toBe(false);
  });

  it('rejects a hash that is too short', () => {
    expect(isValidIpfsHash('QmShort')).toBe(false);
  });

  it('rejects an arbitrary string', () => {
    expect(isValidIpfsHash('not-an-ipfs-hash')).toBe(false);
  });

  it('rejects a hash with invalid characters', () => {
    // CIDv0 must be base58 — '0' and 'O' are not valid base58 chars
    expect(isValidIpfsHash('Qm0000000000000000000000000000000000000000000000')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Pure logic — buildGatewayUrl
// ---------------------------------------------------------------------------

describe('buildGatewayUrl', () => {
  const hash = 'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG';

  it('uses the default gateway when none is provided', () => {
    expect(buildGatewayUrl(hash)).toBe(`${IPFS_GATEWAY}${hash}`);
  });

  it('uses a custom gateway when provided', () => {
    expect(buildGatewayUrl(hash, 'https://cloudflare-ipfs.com/ipfs/')).toBe(
      `https://cloudflare-ipfs.com/ipfs/${hash}`,
    );
  });
});

// ---------------------------------------------------------------------------
// Component — IPFSDocViewer
// ---------------------------------------------------------------------------

const VALID_CID = 'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG';
const VALID_CIDv1 = 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi';

describe('IPFSDocViewer', () => {
  it('renders the heading', () => {
    render(<IPFSDocViewer />);
    expect(screen.getByText('IPFS Documentation Viewer')).toBeTruthy();
  });

  it('shows the empty state when no hash is set', () => {
    render(<IPFSDocViewer />);
    expect(screen.getByText('Enter an IPFS CID above to load documentation.')).toBeTruthy();
  });

  it('shows no iframe on initial render without initialHash', () => {
    render(<IPFSDocViewer />);
    expect(screen.queryByTitle(/IPFS document/i)).toBeNull();
  });

  it('renders an iframe when a valid initialHash is provided', () => {
    render(<IPFSDocViewer initialHash={VALID_CID} />);
    const iframe = screen.getByTitle(`IPFS document ${VALID_CID}`);
    expect(iframe).toBeTruthy();
    expect((iframe as HTMLIFrameElement).src).toContain(VALID_CID);
  });

  it('disables the Load button when the input is empty', () => {
    render(<IPFSDocViewer />);
    const button = screen.getByRole('button', { name: /load/i });
    expect(button).toBeDisabled();
  });

  it('disables the Load button for an invalid hash', () => {
    render(<IPFSDocViewer />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'invalid-hash' } });
    expect(screen.getByRole('button', { name: /load/i })).toBeDisabled();
  });

  it('enables the Load button for a valid CIDv0', () => {
    render(<IPFSDocViewer />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: VALID_CID } });
    expect(screen.getByRole('button', { name: /load/i })).not.toBeDisabled();
  });

  it('enables the Load button for a valid CIDv1', () => {
    render(<IPFSDocViewer />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: VALID_CIDv1 } });
    expect(screen.getByRole('button', { name: /load/i })).not.toBeDisabled();
  });

  it('shows a validation error for an invalid hash after typing', () => {
    render(<IPFSDocViewer />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'bad-cid' } });
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText(/Invalid IPFS hash/i)).toBeTruthy();
  });

  it('does not show a validation error when input is empty', () => {
    render(<IPFSDocViewer />);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('loads the iframe after clicking Load with a valid hash', () => {
    render(<IPFSDocViewer />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: VALID_CID } });
    fireEvent.click(screen.getByRole('button', { name: /load/i }));
    const iframe = screen.getByTitle(`IPFS document ${VALID_CID}`);
    expect(iframe).toBeTruthy();
    expect((iframe as HTMLIFrameElement).src).toContain(VALID_CID);
  });

  it('uses a custom gateway when provided', () => {
    const customGateway = 'https://cloudflare-ipfs.com/ipfs/';
    render(<IPFSDocViewer initialHash={VALID_CID} gateway={customGateway} />);
    const iframe = screen.getByTitle(`IPFS document ${VALID_CID}`);
    expect((iframe as HTMLIFrameElement).src).toContain('cloudflare-ipfs.com');
  });

  it('trims whitespace from input before validating', () => {
    render(<IPFSDocViewer />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: `  ${VALID_CID}  ` } });
    expect(screen.getByRole('button', { name: /load/i })).not.toBeDisabled();
  });
});
