const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

export const WORKFLOW_PAYLOAD_PREFIX = 'WIKI_SUBMISSION_V1';
export const MAX_WORKFLOW_PAYLOAD_CHARACTERS = 60_000;
const MAX_DECODED_WORKFLOW_PAYLOAD_BYTES = 160 * 1024;

const toHex = bytes => [...bytes].map(value => value.toString(16).padStart(2, '0')).join('');

export async function sha256Hex(value) {
  const bytes = typeof value === 'string' ? encoder.encode(value) : value;
  return toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)));
}

function bytesToBase64Url(bytes) {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/gu, '');
}

function base64UrlToBytes(value) {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) throw new Error('Workflow payload contains malformed base64url data.');
  const padded = value.replace(/-/gu, '+').replace(/_/gu, '/') + '='.repeat((4 - value.length % 4) % 4);
  let binary;
  try {
    binary = atob(padded);
  } catch {
    throw new Error('Workflow payload contains malformed base64url data.');
  }
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

async function transformBytes(bytes, format, decompress = false) {
  const Stream = decompress ? DecompressionStream : CompressionStream;
  const stream = new Blob([bytes]).stream().pipeThrough(new Stream(format));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function encodeWorkflowPayload(payload) {
  const jsonBytes = encoder.encode(JSON.stringify(payload));
  const sha256 = await sha256Hex(jsonBytes);
  const compressed = await transformBytes(jsonBytes, 'gzip');
  const encoded = bytesToBase64Url(compressed);
  return `${WORKFLOW_PAYLOAD_PREFIX}.${sha256}.${encoded}`;
}

export async function decodeWorkflowPayload(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_WORKFLOW_PAYLOAD_CHARACTERS) {
    throw new Error('Workflow payload is missing or too large.');
  }
  const match = value.match(/^WIKI_SUBMISSION_V1\.([a-f0-9]{64})\.([A-Za-z0-9_-]+)$/u);
  if (!match) throw new Error('Workflow payload envelope is malformed.');
  const [, expectedSha256, encoded] = match;
  const compressed = base64UrlToBytes(encoded);
  let jsonBytes;
  try {
    jsonBytes = await transformBytes(compressed, 'gzip', true);
  } catch {
    throw new Error('Workflow payload compression data is corrupt.');
  }
  if (jsonBytes.byteLength > MAX_DECODED_WORKFLOW_PAYLOAD_BYTES) {
    throw new Error('Decoded workflow payload is too large.');
  }
  if (await sha256Hex(jsonBytes) !== expectedSha256) {
    throw new Error('Workflow payload digest verification failed.');
  }
  try {
    return JSON.parse(decoder.decode(jsonBytes));
  } catch {
    throw new Error('Workflow payload JSON is malformed.');
  }
}
