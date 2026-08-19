// Set environment variable for tests
process.env.NEXT_PUBLIC_CONTRACT_ID = '0x1234567890abcdef';

import '@testing-library/jest-dom';
import './src/i18n/config';
import { installIndexedDBMock } from './test-utils/indexeddb-mock';

// Polyfill crypto.subtle and TextEncoder/TextDecoder for jsdom
if (typeof globalThis.crypto !== 'undefined' && !globalThis.crypto.subtle) {
  const { webcrypto } = require('crypto');
  Object.defineProperty(globalThis, 'crypto', {
    value: webcrypto,
    writable: false,
    configurable: true,
  });
}
const { TextEncoder, TextDecoder } = require('util');
if (typeof globalThis.TextEncoder === 'undefined') {
  globalThis.TextEncoder = TextEncoder;
}
if (typeof globalThis.TextDecoder === 'undefined') {
  globalThis.TextDecoder = TextDecoder;
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
