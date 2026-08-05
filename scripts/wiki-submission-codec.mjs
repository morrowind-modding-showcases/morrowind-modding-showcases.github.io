const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const MANIFEST_PREFIX = 'WIKI_SUBMISSION_V1';
const CHUNK_PREFIX = 'WIKI_SUBMISSION_V1_CHUNK';

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
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) throw new Error('Machine payload contains malformed base64url data.');
  const padded = value.replace(/-/gu, '+').replace(/_/gu, '/') + '='.repeat((4 - value.length % 4) % 4);
  let binary;
  try {
    binary = atob(padded);
  } catch {
    throw new Error('Machine payload contains malformed base64url data.');
  }
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

async function transformBytes(bytes, format, decompress = false) {
  const Stream = decompress ? DecompressionStream : CompressionStream;
  const stream = new Blob([bytes]).stream().pipeThrough(new Stream(format));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function encodeMachinePayload(payload, { chunkSize = 18_000 } = {}) {
  if (!Number.isInteger(chunkSize) || chunkSize < 1_000 || chunkSize > 30_000) {
    throw new Error('Machine payload chunk size is outside the safe range.');
  }
  const jsonBytes = encoder.encode(JSON.stringify(payload));
  const sha256 = await sha256Hex(jsonBytes);
  const compressed = await transformBytes(jsonBytes, 'gzip');
  const encoded = bytesToBase64Url(compressed);
  const chunks = [];
  for (let offset = 0; offset < encoded.length; offset += chunkSize) {
    chunks.push(encoded.slice(offset, offset + chunkSize));
  }
  const manifest = {
    encoding: 'gzip+base64url',
    chunkCount: chunks.length,
    sha256,
  };
  return { manifest, chunks, jsonByteLength: jsonBytes.byteLength };
}

export function machineManifestComment(manifest) {
  return `<!-- ${MANIFEST_PREFIX} ${JSON.stringify(manifest)} -->`;
}

export function machineChunkComment(chunk, index, count) {
  return `<!-- ${CHUNK_PREFIX} ${index + 1}/${count}\n${chunk}\n-->`;
}

function parseManifest(issueBody) {
  const matches = [...String(issueBody ?? '').matchAll(/<!--\s*WIKI_SUBMISSION_V1\s+(\{[^\r\n]*\})\s*-->/gu)];
  if (matches.length !== 1) throw new Error('The issue must contain exactly one machine manifest.');
  let manifest;
  try {
    manifest = JSON.parse(matches[0][1]);
  } catch {
    throw new Error('The machine manifest is malformed.');
  }
  const keys = Object.keys(manifest ?? {}).sort();
  if (keys.join(',') !== 'chunkCount,encoding,sha256'
      || manifest.encoding !== 'gzip+base64url'
      || !Number.isInteger(manifest.chunkCount)
      || manifest.chunkCount < 1
      || manifest.chunkCount > 100
      || !/^[a-f0-9]{64}$/u.test(manifest.sha256)) {
    throw new Error('The machine manifest is invalid.');
  }
  return manifest;
}

export async function decodeMachinePayload(issueBody, comments) {
  const manifest = parseManifest(issueBody);
  const chunks = [];
  for (const comment of comments ?? []) {
    const matches = [...String(comment?.body ?? comment ?? '').matchAll(
      /<!--\s*WIKI_SUBMISSION_V1_CHUNK\s+(\d+)\/(\d+)\r?\n([A-Za-z0-9_-]+)\r?\n-->/gu,
    )];
    if (matches.length > 1) throw new Error('A machine payload comment contains duplicate chunks.');
    if (matches.length === 0) continue;
    const [, indexText, countText, data] = matches[0];
    const index = Number(indexText);
    const count = Number(countText);
    if (count !== manifest.chunkCount || index !== chunks.length + 1) {
      throw new Error('Machine payload chunks are missing, duplicated, or reordered.');
    }
    chunks.push(data);
  }
  if (chunks.length !== manifest.chunkCount) throw new Error('Machine payload chunks are missing.');
  const compressed = base64UrlToBytes(chunks.join(''));
  let jsonBytes;
  try {
    jsonBytes = await transformBytes(compressed, 'gzip', true);
  } catch {
    throw new Error('Machine payload compression data is corrupt.');
  }
  if (await sha256Hex(jsonBytes) !== manifest.sha256) throw new Error('Machine payload digest verification failed.');
  try {
    return JSON.parse(decoder.decode(jsonBytes));
  } catch {
    throw new Error('Machine payload JSON is malformed.');
  }
}
