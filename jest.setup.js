import { webcrypto } from 'crypto';
import { TextDecoder, TextEncoder } from 'util';
import '@testing-library/jest-dom';
import './src/i18n/config';
import { installIndexedDBMock } from './test-utils/indexeddb-mock';

// jsdom does not provide TextEncoder/TextDecoder globally; back them with Node's.
if (typeof globalThis.TextEncoder === 'undefined') {
  globalThis.TextEncoder = TextEncoder;
}
if (typeof globalThis.TextDecoder === 'undefined') {
  globalThis.TextDecoder = TextDecoder;
}

// jsdom does not implement the Web Crypto SubtleCrypto API; back it with Node's
// webcrypto so code paths that encrypt/decrypt (e.g. session storage) work.
if (typeof globalThis.crypto === 'undefined') {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
} else if (!globalThis.crypto.subtle) {
  try {
    Object.defineProperty(globalThis.crypto, 'subtle', { value: webcrypto.subtle, configurable: true });
  } catch {
    Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
  }
}

// Mock File System Access API (showSaveFilePicker)
if (typeof globalThis.window === 'undefined') {
  // running in node - provide a minimal window and document
  globalThis.window = globalThis;
}

if (!('showSaveFilePicker' in globalThis)) {
  globalThis.showSaveFilePicker = async (options = {}) => {
    const chunks = [];
    return {
      createWritable: async () => ({
        write: async (data) => {
          // accept Blob or write request
          if (data instanceof Blob) {
            const array = new Uint8Array(await data.arrayBuffer());
            chunks.push(array);
          } else if (data && data.data instanceof Blob) {
            const array = new Uint8Array(await data.data.arrayBuffer());
            chunks.push(array);
          }
        },
        close: async () => {},
      }),
    };
  };
}

// Install enhanced IndexedDB mock for tests
try {
  installIndexedDBMock();
} catch (e) {
  // ignore if already installed or environment prevents it
}
