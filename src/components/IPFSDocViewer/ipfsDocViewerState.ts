export const IPFS_GATEWAY = 'https://ipfs.io/ipfs/';

const CIDv0_RE = /^Qm[1-9A-HJ-NP-Za-km-z]{44}$/;
const CIDv1_RE = /^bafy[a-zA-Z0-9]{52,}$/;

export function isValidIpfsHash(hash: string): boolean {
  return CIDv0_RE.test(hash) || CIDv1_RE.test(hash);
}

export function buildGatewayUrl(hash: string, gateway = IPFS_GATEWAY): string {
  return `${gateway}${hash}`;
}
