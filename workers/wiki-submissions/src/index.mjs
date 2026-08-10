import {
  MAX_TURNSTILE_TOKEN_LENGTH,
  SubmissionValidationError,
  validateSubmissionEnvelope,
} from '../../../scripts/wiki-submission-schema.mjs';
import { sha256Hex } from '../../../scripts/wiki-submission-codec.mjs';
import {
  dispatchWikiSubmission,
  WorkflowPayloadTooLargeError,
} from './submission.mjs';

const PRODUCTION_ORIGIN = 'https://darkelfmodding.com';
const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const NEXUS_API_ROOT = 'https://api.nexusmods.com/v1/games/morrowind/mods';
const MAX_RAW_REQUEST_BYTES = 160 * 1024;
const MINIMUM_COMPLETION_MS = 3_000;
const MAXIMUM_COMPLETION_MS = 24 * 60 * 60 * 1_000;
const PUBLIC_MAIN_SOURCE_ROOT = 'https://raw.githubusercontent.com/morrowind-modding-showcases/morrowind-modding-showcases.github.io/main/';
const STALE_EDIT_MESSAGE = 'This page changed after you opened the edit form. Reload the page and submit your edit again.';

class HttpError extends Error {
  constructor(status, publicMessage) {
    super(publicMessage);
    this.status = status;
    this.publicMessage = publicMessage;
  }
}

function responseHeaders(origin, extra = {}) {
  const headers = {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    Vary: 'Origin',
    ...extra,
  };
  if (origin === PRODUCTION_ORIGIN) headers['Access-Control-Allow-Origin'] = PRODUCTION_ORIGIN;
  return headers;
}

function jsonResponse(value, status, origin, extra) {
  return new Response(JSON.stringify(value), {
    status,
    headers: responseHeaders(origin, extra),
  });
}

function approvedOrigin(request) {
  return request.headers.get('Origin') === PRODUCTION_ORIGIN;
}

function validateCompletionTime(startedAt, now) {
  const started = Date.parse(startedAt);
  if (!Number.isFinite(started)) throw new HttpError(400, 'The form start time is invalid.');
  const elapsed = now - started;
  if (elapsed < MINIMUM_COMPLETION_MS) throw new HttpError(400, 'Please take a little more time to complete the form.');
  if (elapsed > MAXIMUM_COMPLETION_MS) throw new HttpError(400, 'This form session has expired. Please reload and try again.');
}

async function enforceRateLimit(request, env) {
  if (!env.SUBMISSION_RATE_LIMITER || typeof env.SUBMISSION_RATE_LIMITER.limit !== 'function') {
    throw new HttpError(503, 'Submission service is temporarily unavailable.');
  }
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  const userAgent = request.headers.get('User-Agent') ?? 'unknown';
  const key = await sha256Hex(`${ip}\0${userAgent}`);
  const result = await env.SUBMISSION_RATE_LIMITER.limit({ key });
  if (!result?.success) throw new HttpError(429, 'Too many submission attempts. Please try again later.');
}

function nexusModIdForUrl(value) {
  if (typeof value !== 'string' || value.length > 2_000) return '';
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
    if (!/(?:^|\.)nexusmods\.com$/iu.test(url.hostname)) return '';
    return url.pathname.match(/^\/morrowind\/mods\/(\d+)(?:\/|$)/iu)?.[1] ?? '';
  } catch {
    return '';
  }
}

function boundedNexusText(value, max) {
  return typeof value === 'string'
    ? value
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/gu, '')
        .trim()
        .slice(0, max)
    : '';
}

function nexusPictureUrl(value) {
  if (typeof value !== 'string') return '';
  try {
    const url = new URL(value.replace(/^http:/iu, 'https:'));
    return url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}

async function fetchNexusMod(url, env, fetchImpl) {
  const modId = nexusModIdForUrl(url);
  if (!modId) throw new HttpError(400, 'Enter a Morrowind Nexus Mods URL.');
  if (!env.NEXUS_API_KEY) {
    throw new HttpError(503, 'Nexus Mods metadata is temporarily unavailable.');
  }
  let response;
  try {
    response = await fetchImpl(`${NEXUS_API_ROOT}/${modId}.json`, {
      headers: {
        apikey: env.NEXUS_API_KEY,
        'application-name': 'morrowind-modding-showcases',
        'application-version': '1.2',
      },
    });
  } catch {
    throw new HttpError(502, 'Nexus Mods metadata could not be loaded.');
  }
  if (response.status === 404) throw new HttpError(404, 'That Nexus Mods page was not found.');
  if (response.status === 429) {
    throw new HttpError(429, 'Nexus Mods is rate limiting metadata requests. Please try again later.');
  }
  if (!response.ok) throw new HttpError(502, 'Nexus Mods metadata could not be loaded.');
  let data;
  try {
    data = await response.json();
  } catch {
    throw new HttpError(502, 'Nexus Mods returned invalid metadata.');
  }
  if (!data || typeof data !== 'object') {
    throw new HttpError(502, 'Nexus Mods returned invalid metadata.');
  }
  return {
    name: boundedNexusText(data.name, 200),
    author: boundedNexusText(data.uploaded_by, 200),
    description: boundedNexusText(data.summary || data.description, 10_000),
    pictureUrl: nexusPictureUrl(data.picture_url),
  };
}

async function validateTurnstile(token, request, env, fetchImpl) {
  if (!env.TURNSTILE_SECRET_KEY) throw new HttpError(503, 'Submission service is temporarily unavailable.');
  if (!token || token.length > MAX_TURNSTILE_TOKEN_LENGTH) {
    throw new HttpError(400, 'Human verification is missing or invalid.');
  }
  const form = new FormData();
  form.set('secret', env.TURNSTILE_SECRET_KEY);
  form.set('response', token);
  const remoteIp = request.headers.get('CF-Connecting-IP');
  if (remoteIp) form.set('remoteip', remoteIp);
  form.set('idempotency_key', crypto.randomUUID());
  let response;
  try {
    response = await fetchImpl(TURNSTILE_VERIFY_URL, { method: 'POST', body: form });
  } catch {
    throw new HttpError(502, 'Human verification could not be completed. Please try again.');
  }
  if (!response.ok) throw new HttpError(502, 'Human verification could not be completed. Please try again.');
  let result;
  try {
    result = await response.json();
  } catch {
    throw new HttpError(502, 'Human verification could not be completed. Please try again.');
  }
  if (result.success !== true
      || result.hostname !== 'darkelfmodding.com'
      || result.action !== 'wiki_contribution') {
    throw new HttpError(400, 'Human verification failed or expired. Please try again.');
  }
}

async function parseJsonRequest(request) {
  const contentType = request.headers.get('Content-Type') ?? '';
  if (contentType.split(';', 1)[0].trim().toLocaleLowerCase('en-US') !== 'application/json') {
    throw new HttpError(415, 'Content-Type must be application/json.');
  }
  const declaredLength = Number(request.headers.get('Content-Length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RAW_REQUEST_BYTES) {
    throw new HttpError(413, 'Submission request is too large.');
  }
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_RAW_REQUEST_BYTES) {
    throw new HttpError(413, 'Submission request is too large.');
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError(400, 'Submission request contains malformed JSON.');
  }
}

async function fetchCurrentEditMarkdown(payload, fetchImpl) {
  if (payload.kind !== 'edit-mod' && payload.kind !== 'edit-location') return undefined;
  let response;
  try {
    response = await fetchImpl(`${PUBLIC_MAIN_SOURCE_ROOT}${payload.target.path}`, {
      headers: { Accept: 'text/plain' },
      cache: 'no-store',
    });
  } catch {
    throw new HttpError(502, 'The current page could not be checked. Please try again.');
  }
  if (response.status === 404) throw new HttpError(409, STALE_EDIT_MESSAGE);
  if (!response.ok) throw new HttpError(502, 'The current page could not be checked. Please try again.');
  let bytes;
  try {
    bytes = new Uint8Array(await response.arrayBuffer());
  } catch {
    throw new HttpError(502, 'The current page could not be checked. Please try again.');
  }
  if (await sha256Hex(bytes) !== payload.target.baseSha256) {
    throw new HttpError(409, STALE_EDIT_MESSAGE);
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new HttpError(502, 'The current page could not be checked. Please try again.');
  }
}

export async function handleRequest(request, env, {
  fetchImpl = fetch,
  now = () => Date.now(),
} = {}) {
  const url = new URL(request.url);
  const origin = request.headers.get('Origin');
  if (request.method === 'GET' && url.pathname === '/health') {
    return jsonResponse({ ok: true }, 200, origin);
  }
  if (url.pathname === '/nexus-mod') {
    if (!approvedOrigin(request)) return jsonResponse({ ok: false, error: 'Origin is not allowed.' }, 403, origin);
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: responseHeaders(origin, {
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Max-Age': '86400',
        }),
      });
    }
    if (request.method !== 'GET') return jsonResponse({ ok: false, error: 'Method not allowed.' }, 405, origin);
    try {
      await enforceRateLimit(request, env);
      const mod = await fetchNexusMod(url.searchParams.get('url') ?? '', env, fetchImpl);
      return jsonResponse({ ok: true, mod }, 200, origin, {
        'Cache-Control': 'public, max-age=300',
      });
    } catch (error) {
      if (error instanceof HttpError) {
        return jsonResponse({ ok: false, error: error.publicMessage }, error.status, origin);
      }
      return jsonResponse({ ok: false, error: 'Nexus Mods metadata could not be loaded.' }, 500, origin);
    }
  }
  if (url.pathname !== '/submit') return jsonResponse({ ok: false, error: 'Not found.' }, 404, origin);
  if (!approvedOrigin(request)) return jsonResponse({ ok: false, error: 'Origin is not allowed.' }, 403, origin);
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: responseHeaders(origin, {
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Max-Age': '86400',
      }),
    });
  }
  if (request.method !== 'POST') return jsonResponse({ ok: false, error: 'Method not allowed.' }, 405, origin);

  try {
    const raw = await parseJsonRequest(request);
    if (raw && typeof raw === 'object' && raw.website !== '') {
      throw new HttpError(400, 'Submission could not be accepted.');
    }
    let envelope;
    try {
      envelope = validateSubmissionEnvelope(raw);
    } catch (error) {
      if (error instanceof SubmissionValidationError) throw new HttpError(400, 'Submission fields are invalid.');
      throw error;
    }
    validateCompletionTime(envelope.startedAt, now());
    await enforceRateLimit(request, env);
    await validateTurnstile(envelope.turnstileToken, request, env, fetchImpl);
    await fetchCurrentEditMarkdown(envelope.payload, fetchImpl);
    let submissionId;
    try {
      submissionId = await dispatchWikiSubmission(
        envelope.payload,
        env.GITHUB_WORKFLOW_TOKEN,
        fetchImpl,
      );
    } catch (error) {
      if (error instanceof WorkflowPayloadTooLargeError) {
        throw new HttpError(413, 'This submission is too large to send to GitHub. Download the Markdown file and contact a maintainer.');
      }
      if (error instanceof Error && /token is not configured/u.test(error.message)) {
        throw new HttpError(503, 'Submission service is temporarily unavailable.');
      }
      throw new HttpError(502, 'The review workflow could not accept this submission. Please try again.');
    }
    return jsonResponse({ ok: true, submissionId }, 202, origin);
  } catch (error) {
    if (error instanceof HttpError) {
      return jsonResponse({ ok: false, error: error.publicMessage }, error.status, origin);
    }
    return jsonResponse({ ok: false, error: 'Submission could not be accepted.' }, 500, origin);
  }
}

export default {
  fetch(request, env) {
    return handleRequest(request, env);
  },
};
