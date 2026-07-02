const STORAGE_RECORDS_KEY = 'vero_audit_log_records_v1';
const STORAGE_MANIFEST_KEY = 'vero_audit_log_manifest_v1';
const KEY_DB_NAME = 'vero-audit-logger';
const KEY_STORE_NAME = 'keys';
const KEY_RECORD_ID = 'audit-log-aes-gcm-v1';
const AUDIT_LOG_VERSION = 1;
const GENESIS_HASH = '0'.repeat(64);
const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_FLUSH_INTERVAL_MS = 1500;
const DEFAULT_MAX_RETAINED_RECORDS = 500;
const MAX_METADATA_DEPTH = 4;
const MAX_METADATA_KEYS = 50;
const MAX_STRING_LENGTH = 512;
const MAX_SCALAR_LENGTH = 2048;
const EXPORT_MIME_TYPE = 'application/json';

const SENSITIVE_KEY_PARTS = [
  'privatekey',
  'secretkey',
  'seed',
  'seedphrase',
  'mnemonic',
  'password',
  'token',
  'accesstoken',
  'refreshtoken',
  'authorization',
  'apikey',
  'secret',
] as const;

export type AuditLogStatus = 'success' | 'failure' | 'pending' | 'warning' | 'info';

export type AuditLogJsonValue =
  | string
  | number
  | boolean
  | null
  | AuditLogJsonValue[]
  | { [key: string]: AuditLogJsonValue };

export type AuditLogMetadata = Record<string, AuditLogJsonValue>;

export interface AuditLogEvent {
  id: string;
  timestamp: string;
  type: string;
  actor?: string;
  action: string;
  resource?: string;
  resourceId?: string;
  status?: AuditLogStatus;
  metadata?: AuditLogMetadata;
  requestId?: string;
  sequence: number;
}

export interface AuditLogEventInput {
  id?: string;
  timestamp?: string;
  type: string;
  actor?: string | null;
  action: string;
  resource?: string | null;
  resourceId?: string | number | null;
  status?: AuditLogStatus;
  metadata?: unknown;
  requestId?: string | null;
}

export interface EncryptedAuditLogRecord {
  version: typeof AUDIT_LOG_VERSION;
  id: string;
  timestamp: string;
  sequence: number;
  algorithm: 'AES-GCM';
  iv: string;
  ciphertext: string;
  previousHash: string;
  hash: string;
}

export interface AuditLogManifest {
  version: typeof AUDIT_LOG_VERSION;
  updatedAt: string;
  recordCount: number;
  firstSequence: number | null;
  lastSequence: number | null;
  firstHash: string | null;
  lastHash: string;
  integrityDigest: string;
  encryption: {
    algorithm: 'AES-GCM';
    keyStorage: 'indexeddb-nonextractable' | 'session';
  };
}

export interface AuditLogIntegrityResult {
  valid: boolean;
  recordCount: number;
  firstSequence: number | null;
  lastSequence: number | null;
  firstHash: string | null;
  lastHash: string;
  integrityDigest: string;
  errors: string[];
}

export interface AuditLogExportFile {
  version: typeof AUDIT_LOG_VERSION;
  createdAt: string;
  recordCount: number;
  algorithm: 'AES-GCM';
  fileType: 'vero-audit-log-export';
  integrity: {
    algorithm: 'SHA-256';
    firstHash: string | null;
    lastHash: string;
    digest: string;
  };
  records: EncryptedAuditLogRecord[];
}

export interface AuditLogExportResult {
  fileName: string;
  blob: Blob;
  exportFile: AuditLogExportFile;
  saved: boolean;
  saveMethod: 'file-system-access' | 'download-blob' | 'none';
  error?: string;
}

export interface AuditLoggerStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface AuditLoggerOptions {
  storage?: AuditLoggerStorage;
  crypto?: Crypto;
  now?: () => Date;
  batchSize?: number;
  flushIntervalMs?: number;
  maxRetainedRecords?: number;
  autoFlushOnPageLifecycle?: boolean;
}

export interface AuditLogger {
  appendAuditEvent(event: AuditLogEventInput): Promise<AuditLogEvent>;
  flushAuditLogs(): Promise<EncryptedAuditLogRecord[]>;
  exportAuditLogs(options?: ExportAuditLogsOptions): Promise<AuditLogExportResult>;
  readEncryptedAuditLogs(): EncryptedAuditLogRecord[];
  readAuditLogEvents(records?: EncryptedAuditLogRecord[]): Promise<AuditLogEvent[]>;
  verifyAuditLogIntegrity(records?: EncryptedAuditLogRecord[]): Promise<AuditLogIntegrityResult>;
  clearAuditLogs(): void;
  getBufferedAuditEventCount(): number;
}

export interface ExportAuditLogsOptions {
  download?: boolean;
  fileName?: string;
}

type SaveFilePickerWindow = Window &
  typeof globalThis & {
    showSaveFilePicker?: (options?: {
      suggestedName?: string;
      types?: Array<{
        description?: string;
        accept: Record<string, string[]>;
      }>;
    }) => Promise<{
      createWritable: () => Promise<{
        write: (data: Blob) => Promise<void>;
        close: () => Promise<void>;
      }>;
    }>;
  };

interface StoredKeyRecord {
  id: string;
  key: CryptoKey;
  createdAt: string;
  algorithm: 'AES-GCM';
}

function getDefaultStorage(): AuditLoggerStorage | undefined {
  try {
    if (typeof globalThis.localStorage !== 'undefined') {
      return globalThis.localStorage;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function getDefaultCrypto(): Crypto {
  const cryptoProvider = globalThis.crypto;
  if (!cryptoProvider?.subtle || typeof cryptoProvider.getRandomValues !== 'function') {
    throw new Error('Audit logging requires the Web Crypto API for encryption and hashing.');
  }

  return cryptoProvider;
}

function getIsoTimestamp(now: () => Date): string {
  return now().toISOString();
}

function toSafeString(value: string | number | null | undefined): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  return String(value).trim().slice(0, MAX_SCALAR_LENGTH) || undefined;
}

function isValidIsoTimestamp(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function normalizeSensitiveKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isSensitiveKey(key: string): boolean {
  const normalizedKey = normalizeSensitiveKey(key);
  return SENSITIVE_KEY_PARTS.some((part) => normalizedKey.includes(part));
}

function truncateString(value: string, maxLength = MAX_STRING_LENGTH): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...[truncated]` : value;
}

function safeObjectTag(value: object): string {
  return Object.prototype.toString.call(value).replace(/^\[object\s|\]$/g, '');
}

function sanitizeMetadataValue(
  value: unknown,
  depth: number,
  seen: WeakSet<object>,
): AuditLogJsonValue {
  if (depth > MAX_METADATA_DEPTH) {
    return '[MaxDepth]';
  }

  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'string') {
    return truncateString(value);
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : String(value);
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'bigint' || typeof value === 'symbol') {
    return truncateString(String(value));
  }

  if (typeof value === 'function') {
    return '[Function]';
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Error) {
    return {
      name: truncateString(value.name),
      message: truncateString(value.message),
    };
  }

  if (typeof value !== 'object') {
    return truncateString(String(value));
  }

  if (seen.has(value)) {
    return '[Circular]';
  }

  seen.add(value);

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_METADATA_KEYS)
      .map((entry) => sanitizeMetadataValue(entry, depth + 1, seen));
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    return `[${safeObjectTag(value)}]`;
  }

  const record: AuditLogMetadata = {};
  for (const [key, nestedValue] of Object.entries(value).slice(0, MAX_METADATA_KEYS)) {
    const safeKey = truncateString(key, 128);
    record[safeKey] = isSensitiveKey(key)
      ? '[REDACTED]'
      : sanitizeMetadataValue(nestedValue, depth + 1, seen);
  }

  return record;
}

function sanitizeMetadata(metadata: unknown): AuditLogMetadata | undefined {
  if (metadata === undefined) {
    return undefined;
  }

  const sanitized = sanitizeMetadataValue(metadata, 0, new WeakSet<object>());
  if (sanitized && typeof sanitized === 'object' && !Array.isArray(sanitized)) {
    return sanitized as AuditLogMetadata;
  }

  return { value: sanitized };
}

function stableJsonValue(value: AuditLogJsonValue): AuditLogJsonValue {
  if (Array.isArray(value)) {
    return value.map(stableJsonValue);
  }

  if (value !== null && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce<Record<string, AuditLogJsonValue>>((accumulator, key) => {
        accumulator[key] = stableJsonValue(value[key]);
        return accumulator;
      }, {});
  }

  return value;
}

function stableStringify(value: AuditLogJsonValue): string {
  return JSON.stringify(stableJsonValue(value));
}

function recordHashInput(record: Omit<EncryptedAuditLogRecord, 'hash'>): AuditLogJsonValue {
  return {
    algorithm: record.algorithm,
    ciphertext: record.ciphertext,
    id: record.id,
    iv: record.iv,
    previousHash: record.previousHash,
    sequence: record.sequence,
    timestamp: record.timestamp,
    version: record.version,
  };
}

function recordsDigestInput(records: EncryptedAuditLogRecord[]): AuditLogJsonValue {
  return {
    hashes: records.map((record) => record.hash),
    recordCount: records.length,
  };
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }

  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(value, 'base64'));
  }

  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function makeRandomId(cryptoProvider: Crypto): string {
  if (typeof cryptoProvider.randomUUID === 'function') {
    return `audit_${cryptoProvider.randomUUID()}`;
  }

  const bytes = new Uint8Array(16);
  cryptoProvider.getRandomValues(bytes);
  return `audit_${bufferToHex(bytes.buffer)}`;
}

async function sha256Hex(cryptoProvider: Crypto, input: string): Promise<string> {
  const encoded = new TextEncoder().encode(input);
  return bufferToHex(await cryptoProvider.subtle.digest('SHA-256', encoded));
}

async function encryptEvent(
  cryptoProvider: Crypto,
  key: CryptoKey,
  event: AuditLogEvent,
  previousHash: string,
): Promise<EncryptedAuditLogRecord> {
  const iv = new Uint8Array(12);
  cryptoProvider.getRandomValues(iv);

  const plaintext = new TextEncoder().encode(JSON.stringify(event));
  const ciphertext = await cryptoProvider.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
  const recordWithoutHash: Omit<EncryptedAuditLogRecord, 'hash'> = {
    version: AUDIT_LOG_VERSION,
    id: event.id,
    timestamp: event.timestamp,
    sequence: event.sequence,
    algorithm: 'AES-GCM',
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    previousHash,
  };

  return {
    ...recordWithoutHash,
    hash: await sha256Hex(cryptoProvider, stableStringify(recordHashInput(recordWithoutHash))),
  };
}

async function decryptRecord(
  cryptoProvider: Crypto,
  key: CryptoKey,
  record: EncryptedAuditLogRecord,
): Promise<AuditLogEvent> {
  const iv = base64ToBytes(record.iv);
  const ciphertext = base64ToBytes(record.ciphertext);
  const decrypted = await cryptoProvider.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext,
  );
  const parsed = JSON.parse(new TextDecoder().decode(decrypted)) as unknown;

  if (!isAuditLogEvent(parsed)) {
    throw new Error(`Audit log record ${record.id} decrypted to an invalid event.`);
  }

  if (
    parsed.id !== record.id ||
    parsed.sequence !== record.sequence ||
    parsed.timestamp !== record.timestamp
  ) {
    throw new Error(`Audit log record ${record.id} metadata does not match its payload.`);
  }

  return parsed;
}

function isAuditLogEvent(value: unknown): value is AuditLogEvent {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Partial<AuditLogEvent>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.timestamp === 'string' &&
    typeof candidate.type === 'string' &&
    typeof candidate.action === 'string' &&
    typeof candidate.sequence === 'number'
  );
}

function parseRecords(raw: string | null): EncryptedAuditLogRecord[] {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isEncryptedAuditLogRecord);
  } catch {
    return [];
  }
}

function parseManifest(raw: string | null): AuditLogManifest | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<AuditLogManifest>;
    if (
      parsed.version !== AUDIT_LOG_VERSION ||
      typeof parsed.recordCount !== 'number' ||
      typeof parsed.lastHash !== 'string' ||
      typeof parsed.integrityDigest !== 'string'
    ) {
      return null;
    }

    return parsed as AuditLogManifest;
  } catch {
    return null;
  }
}

function isEncryptedAuditLogRecord(value: unknown): value is EncryptedAuditLogRecord {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Partial<EncryptedAuditLogRecord>;
  return (
    candidate.version === AUDIT_LOG_VERSION &&
    candidate.algorithm === 'AES-GCM' &&
    typeof candidate.id === 'string' &&
    typeof candidate.timestamp === 'string' &&
    typeof candidate.sequence === 'number' &&
    typeof candidate.iv === 'string' &&
    typeof candidate.ciphertext === 'string' &&
    typeof candidate.previousHash === 'string' &&
    typeof candidate.hash === 'string'
  );
}

function normalizeEvent(
  input: AuditLogEventInput,
  sequence: number,
  cryptoProvider: Crypto,
  now: () => Date,
): AuditLogEvent {
  const timestamp =
    input.timestamp && isValidIsoTimestamp(input.timestamp) ? input.timestamp : getIsoTimestamp(now);
  const id = toSafeString(input.id) ?? makeRandomId(cryptoProvider);
  const type = toSafeString(input.type);
  const action = toSafeString(input.action);
  const actor = toSafeString(input.actor);
  const resource = toSafeString(input.resource);
  const resourceId = toSafeString(input.resourceId);
  const requestId = toSafeString(input.requestId);
  const metadata = sanitizeMetadata(input.metadata);

  if (!type || !action) {
    throw new Error('Audit events require non-empty type and action fields.');
  }

  return {
    id,
    timestamp,
    type,
    ...(actor ? { actor } : {}),
    action,
    ...(resource ? { resource } : {}),
    ...(resourceId ? { resourceId } : {}),
    ...(input.status ? { status: input.status } : {}),
    ...(metadata ? { metadata } : {}),
    ...(requestId ? { requestId } : {}),
    sequence,
  };
}

async function computeIntegrity(
  cryptoProvider: Crypto,
  records: EncryptedAuditLogRecord[],
): Promise<AuditLogIntegrityResult> {
  const errors: string[] = [];
  let previousHash = records[0]?.previousHash ?? GENESIS_HASH;
  let previousSequence: number | null = null;

  for (const record of records) {
    if (!isEncryptedAuditLogRecord(record)) {
      errors.push('Record has an invalid encrypted audit log shape.');
      continue;
    }

    if (record.previousHash !== previousHash) {
      errors.push(`Record ${record.id} does not link to the previous hash.`);
    }

    if (previousSequence !== null && record.sequence <= previousSequence) {
      errors.push(`Record ${record.id} sequence is not monotonic.`);
    }

    const { hash: _hash, ...recordWithoutHash } = record;
    const expectedHash = await sha256Hex(
      cryptoProvider,
      stableStringify(recordHashInput(recordWithoutHash)),
    );
    if (record.hash !== expectedHash) {
      errors.push(`Record ${record.id} hash does not match its encrypted payload.`);
    }

    previousHash = record.hash;
    previousSequence = record.sequence;
  }

  const integrityDigest = await sha256Hex(
    cryptoProvider,
    stableStringify(recordsDigestInput(records)),
  );

  return {
    valid: errors.length === 0,
    recordCount: records.length,
    firstSequence: records[0]?.sequence ?? null,
    lastSequence: records.at(-1)?.sequence ?? null,
    firstHash: records[0]?.hash ?? null,
    lastHash: records.at(-1)?.hash ?? GENESIS_HASH,
    integrityDigest,
    errors,
  };
}

function openKeyDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable.'));
      return;
    }

    const request = indexedDB.open(KEY_DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(KEY_STORE_NAME, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Unable to open audit key store.'));
  });
}

function readStoredKey(database: IDBDatabase): Promise<CryptoKey | null> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(KEY_STORE_NAME, 'readonly');
    const request = transaction.objectStore(KEY_STORE_NAME).get(KEY_RECORD_ID);

    request.onsuccess = () => {
      const record = request.result as StoredKeyRecord | undefined;
      resolve(record?.key ?? null);
    };
    request.onerror = () => reject(request.error ?? new Error('Unable to read audit key.'));
  });
}

function storeKey(database: IDBDatabase, key: CryptoKey, createdAt: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(KEY_STORE_NAME, 'readwrite');
    transaction.objectStore(KEY_STORE_NAME).put({
      id: KEY_RECORD_ID,
      key,
      createdAt,
      algorithm: 'AES-GCM',
    } satisfies StoredKeyRecord);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Unable to store audit key.'));
  });
}

async function getIndexedDbKey(
  cryptoProvider: Crypto,
  now: () => Date,
): Promise<{ key: CryptoKey; keyStorage: AuditLogManifest['encryption']['keyStorage'] }> {
  try {
    const database = await openKeyDatabase();
    const storedKey = await readStoredKey(database);
    if (storedKey) {
      database.close();
      return { key: storedKey, keyStorage: 'indexeddb-nonextractable' };
    }

    const generatedKey = await cryptoProvider.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    );
    await storeKey(database, generatedKey, getIsoTimestamp(now));
    database.close();
    return { key: generatedKey, keyStorage: 'indexeddb-nonextractable' };
  } catch {
    const sessionKey = await cryptoProvider.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    );
    return { key: sessionKey, keyStorage: 'session' };
  }
}

function getStorageQuotaError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  return new Error('Unable to persist encrypted audit logs.');
}

function getDownloadFileName(now: () => Date): string {
  return `audit-log-${getIsoTimestamp(now).slice(0, 10)}.json.enc`;
}

async function saveBlobWithBrowserApis(blob: Blob, fileName: string): Promise<{
  saved: boolean;
  saveMethod: AuditLogExportResult['saveMethod'];
  error?: string;
}> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return { saved: false, saveMethod: 'none' };
  }

  const pickerWindow = window as SaveFilePickerWindow;
  if (typeof pickerWindow.showSaveFilePicker === 'function') {
    try {
      const handle = await pickerWindow.showSaveFilePicker({
        suggestedName: fileName,
        types: [
          {
            description: 'Encrypted audit log',
            accept: { [EXPORT_MIME_TYPE]: ['.enc', '.json'] },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return { saved: true, saveMethod: 'file-system-access' };
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return { saved: false, saveMethod: 'none', error: 'Audit log export was cancelled.' };
      }
    }
  }

  try {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.rel = 'noopener';
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    return { saved: true, saveMethod: 'download-blob' };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to export audit log file.';
    return { saved: false, saveMethod: 'none', error: message };
  }
}

class BrowserAuditLogger implements AuditLogger {
  private readonly storage?: AuditLoggerStorage;

  private readonly cryptoProvider: Crypto;

  private readonly now: () => Date;

  private readonly batchSize: number;

  private readonly flushIntervalMs: number;

  private readonly maxRetainedRecords: number;

  private buffer: AuditLogEvent[] = [];

  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  private flushPromise: Promise<EncryptedAuditLogRecord[]> | null = null;

  private encryptionKey: CryptoKey | null = null;

  private keyStorage: AuditLogManifest['encryption']['keyStorage'] = 'session';

  private nextSequence: number;

  constructor(options: AuditLoggerOptions = {}) {
    this.storage = options.storage ?? getDefaultStorage();
    this.cryptoProvider = options.crypto ?? getDefaultCrypto();
    this.now = options.now ?? (() => new Date());
    this.batchSize = Math.max(1, options.batchSize ?? DEFAULT_BATCH_SIZE);
    this.flushIntervalMs = Math.max(100, options.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS);
    this.maxRetainedRecords = Math.max(1, options.maxRetainedRecords ?? DEFAULT_MAX_RETAINED_RECORDS);
    this.nextSequence = this.getInitialSequence();

    if (options.autoFlushOnPageLifecycle !== false) {
      this.attachLifecycleFlush();
    }
  }

  async appendAuditEvent(input: AuditLogEventInput): Promise<AuditLogEvent> {
    const event = normalizeEvent(input, this.nextSequence, this.cryptoProvider, this.now);
    this.nextSequence += 1;
    this.buffer.push(event);

    if (this.buffer.length >= this.batchSize) {
      void this.flushAuditLogs().catch((error) => {
        console.error('Unable to flush audit logs:', error);
      });
    } else {
      this.scheduleFlush();
    }

    return event;
  }

  async flushAuditLogs(): Promise<EncryptedAuditLogRecord[]> {
    if (this.flushPromise) {
      await this.flushPromise;
    }

    if (this.buffer.length === 0) {
      return this.readEncryptedAuditLogs();
    }

    this.clearFlushTimer();
    const batch = this.buffer.splice(0, this.buffer.length);
    this.flushPromise = this.persistBatch(batch)
      .catch((error) => {
        this.buffer = [...batch, ...this.buffer];
        this.scheduleFlush();
        throw error;
      })
      .finally(() => {
        this.flushPromise = null;
      });

    const records = await this.flushPromise;
    if (this.buffer.length > 0) {
      return this.flushAuditLogs();
    }

    return records;
  }

  async exportAuditLogs(options: ExportAuditLogsOptions = {}): Promise<AuditLogExportResult> {
    const records = await this.flushAuditLogs();
    const integrity = await this.verifyAuditLogIntegrity(records);
    const exportFile: AuditLogExportFile = {
      version: AUDIT_LOG_VERSION,
      createdAt: getIsoTimestamp(this.now),
      recordCount: records.length,
      algorithm: 'AES-GCM',
      fileType: 'vero-audit-log-export',
      integrity: {
        algorithm: 'SHA-256',
        firstHash: integrity.firstHash,
        lastHash: integrity.lastHash,
        digest: integrity.integrityDigest,
      },
      records,
    };
    const blob = new Blob([JSON.stringify(exportFile, null, 2)], { type: EXPORT_MIME_TYPE });
    const fileName = options.fileName ?? getDownloadFileName(this.now);

    if (options.download === false) {
      return {
        fileName,
        blob,
        exportFile,
        saved: false,
        saveMethod: 'none',
      };
    }

    return {
      fileName,
      blob,
      exportFile,
      ...(await saveBlobWithBrowserApis(blob, fileName)),
    };
  }

  readEncryptedAuditLogs(): EncryptedAuditLogRecord[] {
    return parseRecords(this.storage?.getItem(STORAGE_RECORDS_KEY) ?? null);
  }

  async readAuditLogEvents(records = this.readEncryptedAuditLogs()): Promise<AuditLogEvent[]> {
    const key = await this.getEncryptionKey();
    return Promise.all(records.map((record) => decryptRecord(this.cryptoProvider, key, record)));
  }

  async verifyAuditLogIntegrity(records?: EncryptedAuditLogRecord[]): Promise<AuditLogIntegrityResult> {
    const shouldCompareStoredManifest = records === undefined;
    const recordsToVerify = records ?? this.readEncryptedAuditLogs();
    const integrity = await computeIntegrity(this.cryptoProvider, recordsToVerify);
    const manifest = shouldCompareStoredManifest
      ? parseManifest(this.storage?.getItem(STORAGE_MANIFEST_KEY) ?? null)
      : null;

    if (manifest) {
      if (integrity.recordCount !== manifest.recordCount) {
        integrity.errors.push('Stored manifest record count does not match retained records.');
      }

      if (integrity.firstHash !== manifest.firstHash) {
        integrity.errors.push('Stored manifest first hash does not match retained records.');
      }

      if (integrity.lastHash !== manifest.lastHash) {
        integrity.errors.push('Stored manifest last hash does not match retained records.');
      }

      if (integrity.integrityDigest !== manifest.integrityDigest) {
        integrity.errors.push('Stored manifest digest does not match retained records.');
      }
    }

    return {
      ...integrity,
      valid: integrity.errors.length === 0,
    };
  }

  clearAuditLogs(): void {
    this.clearFlushTimer();
    this.buffer = [];
    this.storage?.removeItem(STORAGE_RECORDS_KEY);
    this.storage?.removeItem(STORAGE_MANIFEST_KEY);
    this.nextSequence = 1;
  }

  getBufferedAuditEventCount(): number {
    return this.buffer.length;
  }

  private async persistBatch(batch: AuditLogEvent[]): Promise<EncryptedAuditLogRecord[]> {
    if (!this.storage) {
      return [];
    }

    const key = await this.getEncryptionKey();
    const existingRecords = this.readEncryptedAuditLogs();
    const encryptedBatch: EncryptedAuditLogRecord[] = [];
    let previousHash = existingRecords.at(-1)?.hash ?? GENESIS_HASH;

    for (const event of batch) {
      const encrypted = await encryptEvent(this.cryptoProvider, key, event, previousHash);
      encryptedBatch.push(encrypted);
      previousHash = encrypted.hash;
    }

    const retainedRecords = [...existingRecords, ...encryptedBatch].slice(-this.maxRetainedRecords);
    const integrity = await computeIntegrity(this.cryptoProvider, retainedRecords);
    const manifest: AuditLogManifest = {
      version: AUDIT_LOG_VERSION,
      updatedAt: getIsoTimestamp(this.now),
      recordCount: retainedRecords.length,
      firstSequence: integrity.firstSequence,
      lastSequence: integrity.lastSequence,
      firstHash: integrity.firstHash,
      lastHash: integrity.lastHash,
      integrityDigest: integrity.integrityDigest,
      encryption: {
        algorithm: 'AES-GCM',
        keyStorage: this.keyStorage,
      },
    };

    try {
      this.storage.setItem(STORAGE_RECORDS_KEY, JSON.stringify(retainedRecords));
      this.storage.setItem(STORAGE_MANIFEST_KEY, JSON.stringify(manifest));
    } catch (error) {
      throw getStorageQuotaError(error);
    }

    return retainedRecords;
  }

  private async getEncryptionKey(): Promise<CryptoKey> {
    if (this.encryptionKey) {
      return this.encryptionKey;
    }

    const keyResult = await getIndexedDbKey(this.cryptoProvider, this.now);
    this.encryptionKey = keyResult.key;
    this.keyStorage = keyResult.keyStorage;
    return keyResult.key;
  }

  private getInitialSequence(): number {
    const manifest = parseManifest(this.storage?.getItem(STORAGE_MANIFEST_KEY) ?? null);
    if (typeof manifest?.lastSequence === 'number') {
      return manifest.lastSequence + 1;
    }

    const records = this.readEncryptedAuditLogs();
    return (records.at(-1)?.sequence ?? 0) + 1;
  }

  private scheduleFlush(): void {
    if (this.flushTimer) {
      return;
    }

    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flushAuditLogs().catch((error) => {
        console.error('Unable to flush audit logs:', error);
      });
    }, this.flushIntervalMs);
  }

  private clearFlushTimer(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
  }

  private attachLifecycleFlush(): void {
    if (typeof window === 'undefined') {
      return;
    }

    const flush = () => {
      void this.flushAuditLogs().catch((error) => {
        console.error('Unable to flush audit logs during page lifecycle event:', error);
      });
    };

    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
    document?.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        flush();
      }
    });
  }
}

let defaultLogger: AuditLogger | null = null;

function getDefaultLogger(): AuditLogger {
  if (!defaultLogger) {
    defaultLogger = createAuditLogger();
  }

  return defaultLogger;
}

export function createAuditLogger(options: AuditLoggerOptions = {}): AuditLogger {
  return new BrowserAuditLogger(options);
}

export function appendAuditEvent(event: AuditLogEventInput): Promise<AuditLogEvent> {
  return getDefaultLogger().appendAuditEvent(event);
}

export function flushAuditLogs(): Promise<EncryptedAuditLogRecord[]> {
  return getDefaultLogger().flushAuditLogs();
}

export function exportAuditLogs(options?: ExportAuditLogsOptions): Promise<AuditLogExportResult> {
  return getDefaultLogger().exportAuditLogs(options);
}

export function verifyAuditLogIntegrity(
  records?: EncryptedAuditLogRecord[],
): Promise<AuditLogIntegrityResult> {
  return getDefaultLogger().verifyAuditLogIntegrity(records);
}

export function clearAuditLogs(): void {
  getDefaultLogger().clearAuditLogs();
}

export function readEncryptedAuditLogs(): EncryptedAuditLogRecord[] {
  return getDefaultLogger().readEncryptedAuditLogs();
}

export function readAuditLogEvents(records?: EncryptedAuditLogRecord[]): Promise<AuditLogEvent[]> {
  return getDefaultLogger().readAuditLogEvents(records);
}

export function parseEncryptedAuditExport(source: string): AuditLogExportFile {
  const parsed = JSON.parse(source) as Partial<AuditLogExportFile>;
  if (
    parsed.version !== AUDIT_LOG_VERSION ||
    parsed.fileType !== 'vero-audit-log-export' ||
    parsed.algorithm !== 'AES-GCM' ||
    !Array.isArray(parsed.records)
  ) {
    throw new Error('Invalid encrypted audit log export.');
  }

  return {
    version: AUDIT_LOG_VERSION,
    createdAt: typeof parsed.createdAt === 'string' ? parsed.createdAt : new Date(0).toISOString(),
    recordCount: typeof parsed.recordCount === 'number' ? parsed.recordCount : parsed.records.length,
    algorithm: 'AES-GCM',
    fileType: 'vero-audit-log-export',
    integrity: {
      algorithm: 'SHA-256',
      firstHash: parsed.integrity?.firstHash ?? null,
      lastHash: parsed.integrity?.lastHash ?? GENESIS_HASH,
      digest: parsed.integrity?.digest ?? '',
    },
    records: parsed.records.filter(isEncryptedAuditLogRecord),
  };
}
