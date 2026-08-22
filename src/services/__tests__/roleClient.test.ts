/**
 * roleClient unit tests.
 *
 * roleClient reads Horizon account data through the global fetch API. These
 * tests mock fetch directly so URL/account selection and role parsing stay
 * covered without depending on Stellar SDK internals.
 */

import { fetchUserRole } from '@/services/roleClient';

const PUBLIC_KEY = 'GROLEUSER1234';
const REGISTRY_ACCOUNT = 'GROLEREGISTRY1234';
const HORIZON_ACCOUNT_URL = 'https://horizon-testnet.stellar.org/accounts';

const ACTIVE_VALUE = btoa('active');
const YES_VALUE = btoa('yes');
const ADMIN_VALUE = btoa('admin');
const GUARDIAN_VALUE = btoa('guardian');
const FALSE_VALUE = btoa('false');
const ZERO_VALUE = btoa('0');
const NO_VALUE = btoa('no');
const INACTIVE_VALUE = btoa('inactive');
const UNAUTHORIZED_VALUE = btoa('unauthorized');

const originalFetch = global.fetch;
const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;

function mockHorizonAccount(dataAttr: Record<string, string>): void {
  mockFetch.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ data_attr: dataAttr }),
  } as Response);
}

function mockRegistryRoleData(dataAttr: Record<string, string>): void {
  process.env.NEXT_PUBLIC_ROLE_REGISTRY_ACCOUNT = REGISTRY_ACCOUNT;
  mockHorizonAccount(dataAttr);
}

function expectHorizonAccountFetch(accountId: string): void {
  expect(mockFetch).toHaveBeenCalledWith(`${HORIZON_ACCOUNT_URL}/${encodeURIComponent(accountId)}`);
}

describe('fetchUserRole', () => {
  beforeAll(() => {
    global.fetch = mockFetch;
  });

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_ROLE_REGISTRY_ACCOUNT;
    mockFetch.mockReset();
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_ROLE_REGISTRY_ACCOUNT;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('returns admin for an exact admin marker on the connected account', async () => {
    mockHorizonAccount({ admin: ACTIVE_VALUE });

    await expect(fetchUserRole(PUBLIC_KEY)).resolves.toBe('admin');
    expectHorizonAccountFetch(PUBLIC_KEY);
  });

  it('returns guardian for an exact guardian marker on the connected account', async () => {
    mockHorizonAccount({ guardian: YES_VALUE });

    await expect(fetchUserRole(PUBLIC_KEY)).resolves.toBe('guardian');
  });

  it('returns admin when exact admin and guardian role signals both exist', async () => {
    mockHorizonAccount({
      admin: ACTIVE_VALUE,
      guardian: ACTIVE_VALUE,
      role: GUARDIAN_VALUE,
    });

    await expect(fetchUserRole(PUBLIC_KEY)).resolves.toBe('admin');
  });

  it('uses an exact role data value from the connected account', async () => {
    mockHorizonAccount({ role: ADMIN_VALUE });

    await expect(fetchUserRole(PUBLIC_KEY)).resolves.toBe('admin');
  });

  it('returns admin for a registry admin marker scoped to the public key', async () => {
    mockRegistryRoleData({ [`admin:${PUBLIC_KEY}`]: ACTIVE_VALUE });

    await expect(fetchUserRole(PUBLIC_KEY)).resolves.toBe('admin');
    expectHorizonAccountFetch(REGISTRY_ACCOUNT);
  });

  it('returns guardian for a registry guardian marker scoped to the public key', async () => {
    mockRegistryRoleData({ [`guardians_${PUBLIC_KEY}`]: YES_VALUE });

    await expect(fetchUserRole(PUBLIC_KEY)).resolves.toBe('guardian');
    expectHorizonAccountFetch(REGISTRY_ACCOUNT);
  });

  it('uses a registry role data value scoped to the public key', async () => {
    mockRegistryRoleData({ [`role:${PUBLIC_KEY}`]: GUARDIAN_VALUE });

    await expect(fetchUserRole(PUBLIC_KEY)).resolves.toBe('guardian');
    expectHorizonAccountFetch(REGISTRY_ACCOUNT);
  });

  it('returns admin when registry admin and guardian role signals both exist', async () => {
    mockRegistryRoleData({
      [`guardian:${PUBLIC_KEY}`]: ACTIVE_VALUE,
      [`admin_${PUBLIC_KEY}`]: ACTIVE_VALUE,
      [`role:${PUBLIC_KEY}`]: GUARDIAN_VALUE,
    });

    await expect(fetchUserRole(PUBLIC_KEY)).resolves.toBe('admin');
  });

  it('ignores false and inactive role markers', async () => {
    mockHorizonAccount({
      admin: FALSE_VALUE,
      [`admin_${PUBLIC_KEY}`]: ZERO_VALUE,
      [`admins:${PUBLIC_KEY}`]: NO_VALUE,
      guardian: INACTIVE_VALUE,
      role: UNAUTHORIZED_VALUE,
    });

    await expect(fetchUserRole(PUBLIC_KEY)).resolves.toBe('unauthorized');
  });

  it('explicitly protects the self-account admin fallback', async () => {
    mockHorizonAccount({ admin: ACTIVE_VALUE });

    await expect(fetchUserRole(PUBLIC_KEY)).resolves.toBe('admin');
    expectHorizonAccountFetch(PUBLIC_KEY);
  });

  it('explicitly protects the self-account guardian fallback', async () => {
    mockHorizonAccount({ guardian: ACTIVE_VALUE });

    await expect(fetchUserRole(PUBLIC_KEY)).resolves.toBe('guardian');
    expectHorizonAccountFetch(PUBLIC_KEY);
  });

  it('returns admin for an admin underscore marker scoped to the public key', async () => {
    mockRegistryRoleData({
      [`admin_${PUBLIC_KEY}`]: ACTIVE_VALUE,
    });

    await expect(fetchUserRole(PUBLIC_KEY)).resolves.toBe('admin');
    expectHorizonAccountFetch(REGISTRY_ACCOUNT);
  });

  it('ignores malformed account data values', async () => {
    mockHorizonAccount({
      admin: '%%%not-valid-base64%%%',
      [`admin:${PUBLIC_KEY}`]: '%%%also-invalid%%%',
    });

    await expect(fetchUserRole(PUBLIC_KEY)).resolves.toBe('unauthorized');
  });

  it('returns unauthorized when data_attr is absent', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    } as Response);

    await expect(fetchUserRole(PUBLIC_KEY)).resolves.toBe('unauthorized');
    expectHorizonAccountFetch(PUBLIC_KEY);
  });

  it('returns unauthorized when no role data exists', async () => {
    mockHorizonAccount({});

    await expect(fetchUserRole(PUBLIC_KEY)).resolves.toBe('unauthorized');
  });
});
