import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';

import { handleRequest } from '../src/index.mjs';

const NOW = Date.parse('2026-08-04T12:00:10.000Z');
const ORIGIN = 'https://darkelfmodding.com';

function generatedMarkdown(body = 'A useful article body.') {
  return `---\ntitle: "Review preview"\n---\n${body}`;
}

function newModPayload(overrides = {}) {
  return {
    schemaVersion: 1,
    submissionId: '123e4567-e89b-42d3-a456-426614174100',
    kind: 'new-mod',
    contributorName: 'Anonymous Editor',
    notes: '',
    createdAt: '2026-08-04T12:00:09.000Z',
    changes: {
      slug: 'example-mod',
      title: 'Example Mod',
      description: 'Short description.',
      authors: ['One Author'],
      url: 'any nonempty mod value',
      picture_url: '',
      showcase_url: '',
      categories: ['Dungeon'],
      events: [],
      map_enabled: false,
      map_locations: [],
    },
    generatedMarkdown: generatedMarkdown(),
    ...overrides,
  };
}

function editModPayload() {
  const payload = newModPayload({ kind: 'edit-mod' });
  delete payload.changes.slug;
  payload.target = {
    path: 'wiki/content/mods/example-mod.md',
    baseSha256: 'a'.repeat(64),
  };
  return payload;
}

function newLocationPayload() {
  return {
    schemaVersion: 1,
    submissionId: '123e4567-e89b-42d3-a456-426614174101',
    kind: 'new-location',
    contributorName: 'Location Proposer',
    notes: '',
    createdAt: '2026-08-04T12:00:09.000Z',
    suggestedFilename: 'example-cell',
    changes: {
      cell: 'Example Cell', region: '', x: -10, y: 20, uesp_wiki: '', additional_entrances: [],
    },
    generatedMarkdown: generatedMarkdown('A location proposal.'),
  };
}

function editLocationPayload() {
  const payload = newLocationPayload();
  payload.kind = 'edit-location';
  delete payload.suggestedFilename;
  payload.target = {
    path: 'wiki/content/locations/example-cell.md',
    baseSha256: 'b'.repeat(64),
  };
  payload.changes.additional_entrances = [];
  return payload;
}

function envelope(payload = newModPayload(), overrides = {}) {
  return {
    turnstileToken: 'valid-turnstile-token',
    startedAt: new Date(NOW - 4_000).toISOString(),
    website: '',
    payload,
    ...overrides,
  };
}

function submitRequest(body, { origin = ORIGIN, contentType = 'application/json' } = {}) {
  return new Request('https://worker.example/submit', {
    method: 'POST',
    headers: {
      Origin: origin,
      'Content-Type': contentType,
      'CF-Connecting-IP': '192.0.2.10',
      'User-Agent': 'test-agent',
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function harness({
  turnstile = { success: true, hostname: 'darkelfmodding.com', action: 'wiki_contribution' },
  githubStatus = 201,
  rateSuccess = true,
  issueNumber = 123,
} = {}) {
  const calls = [];
  const githubBodies = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).includes('turnstile/v0/siteverify')) {
      return new Response(JSON.stringify(turnstile), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    githubBodies.push(JSON.parse(options.body));
    if (githubStatus !== 201) {
      return new Response(JSON.stringify({ private: 'must not leak' }), { status: githubStatus });
    }
    const isComment = /\/comments$/u.test(String(url));
    return new Response(JSON.stringify(isComment
      ? { id: githubBodies.length }
      : { number: issueNumber, html_url: 'https://github.com/private/issue' }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  const env = {
    TURNSTILE_SECRET_KEY: 'test-only-secret',
    GITHUB_QUEUE_TOKEN: 'test-only-token',
    SUBMISSION_RATE_LIMITER: { limit: async () => ({ success: rateSuccess }) },
  };
  return { calls, githubBodies, fetchImpl, env };
}

async function run(body = envelope(), options = {}) {
  const context = harness(options);
  const response = await handleRequest(submitRequest(body), context.env, {
    fetchImpl: context.fetchImpl,
    now: () => NOW,
  });
  return { ...context, response, json: await response.json() };
}

test('GET /health returns uncomplicated no-store JSON', async () => {
  const response = await handleRequest(new Request('https://worker.example/health'), {}, { now: () => NOW });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(await response.json(), { ok: true });
});

test('OPTIONS /submit allows only the production origin, POST, and Content-Type', async () => {
  const response = await handleRequest(new Request('https://worker.example/submit', {
    method: 'OPTIONS',
    headers: { Origin: ORIGIN },
  }), {});
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  assert.equal(response.headers.get('Access-Control-Allow-Methods'), 'POST, OPTIONS');
  assert.equal(response.headers.get('Access-Control-Allow-Headers'), 'Content-Type');
  assert.equal(response.headers.get('Vary'), 'Origin');
});

test('an unapproved origin is rejected without a wildcard CORS response', async () => {
  const context = harness();
  const response = await handleRequest(submitRequest(envelope(), { origin: 'https://evil.example' }), context.env, { fetchImpl: context.fetchImpl });
  assert.equal(response.status, 403);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
});

test('non-JSON content and malformed JSON are rejected', async (t) => {
  await t.test('content type', async () => {
    const context = harness();
    const response = await handleRequest(submitRequest('{}', { contentType: 'text/plain' }), context.env, { fetchImpl: context.fetchImpl });
    assert.equal(response.status, 415);
  });
  await t.test('body', async () => {
    const context = harness();
    const response = await handleRequest(submitRequest('{bad json'), context.env, { fetchImpl: context.fetchImpl });
    assert.equal(response.status, 400);
  });
});

test('honeypot and completion under three seconds are rejected before external requests', async (t) => {
  await t.test('honeypot', async () => {
    const result = await run(envelope(newModPayload(), { website: 'spam.example' }));
    assert.equal(result.response.status, 400);
    assert.equal(result.calls.length, 0);
  });
  await t.test('completion time', async () => {
    const result = await run(envelope(newModPayload(), { startedAt: new Date(NOW - 2_999).toISOString() }));
    assert.equal(result.response.status, 400);
    assert.equal(result.calls.length, 0);
  });
});

test('rate-limit rejection returns 429 before Turnstile or GitHub', async () => {
  const result = await run(envelope(), { rateSuccess: false });
  assert.equal(result.response.status, 429);
  assert.equal(result.calls.length, 0);
});

test('a missing production rate-limit binding fails closed', async () => {
  const context = harness();
  delete context.env.SUBMISSION_RATE_LIMITER;
  const response = await handleRequest(submitRequest(envelope()), context.env, { fetchImpl: context.fetchImpl, now: () => NOW });
  assert.equal(response.status, 503);
  assert.equal(context.calls.length, 0);
});

test('Turnstile failures, hostname mismatch, action mismatch, and duplicate expiry are rejected', async (t) => {
  const cases = [
    ['failure', { success: false }],
    ['hostname', { success: true, hostname: 'preview.example', action: 'wiki_contribution' }],
    ['action', { success: true, hostname: 'darkelfmodding.com', action: 'wrong_action' }],
    ['expired duplicate', { success: false, 'error-codes': ['timeout-or-duplicate'] }],
  ];
  for (const [name, turnstile] of cases) {
    await t.test(name, async () => {
      const result = await run(envelope(), { turnstile });
      assert.equal(result.response.status, 400);
      assert.equal(result.githubBodies.length, 0);
    });
  }
});

test('invalid schema, unsafe path, and oversized generated Markdown are rejected', async (t) => {
  await t.test('unexpected schema field', async () => {
    const payload = newModPayload();
    payload.contact = 'forbidden';
    assert.equal((await run(envelope(payload))).response.status, 400);
  });
  await t.test('unsafe path', async () => {
    const payload = editModPayload();
    payload.target.path = 'wiki/content/mods/../escape.md';
    assert.equal((await run(envelope(payload))).response.status, 400);
  });
  await t.test('oversized Markdown', async () => {
    const payload = newModPayload({ generatedMarkdown: generatedMarkdown('x'.repeat(100 * 1024 + 1)) });
    assert.equal((await run(envelope(payload))).response.status, 400);
  });
});

test('valid new-mod issue uses the expected title and labels', async () => {
  const result = await run();
  assert.equal(result.response.status, 201);
  assert.equal(result.githubBodies[0].title, '[New mod] Example Mod');
  assert.deepEqual(result.githubBodies[0].labels, ['wiki-submission', 'pending', 'new-page']);
  assert.match(result.githubBodies[0].body, /Add a new mod page/u);
});

test('valid edit issue uses edit title and labels', async () => {
  const result = await run(envelope(editModPayload()));
  assert.equal(result.response.status, 201);
  assert.equal(result.githubBodies[0].title, '[Edit mod] Example Mod');
  assert.deepEqual(result.githubBodies[0].labels, ['wiki-submission', 'pending', 'edit']);
});

test('valid location edit uses the location edit title and labels', async () => {
  const result = await run(envelope(editLocationPayload()));
  assert.equal(result.response.status, 201);
  assert.equal(result.githubBodies[0].title, '[Edit location] Example Cell');
  assert.deepEqual(result.githubBodies[0].labels, ['wiki-submission', 'pending', 'edit']);
});

test('valid new location is labeled as a private location proposal', async () => {
  const result = await run(envelope(newLocationPayload()));
  assert.equal(result.response.status, 201);
  assert.equal(result.githubBodies[0].title, '[New location] Example Cell');
  assert.deepEqual(result.githubBodies[0].labels, ['wiki-submission', 'pending', 'location-proposal']);
});

test('GitHub API failures return a generic error without private response content', async () => {
  const result = await run(envelope(), { githubStatus: 500 });
  assert.equal(result.response.status, 502);
  assert.doesNotMatch(JSON.stringify(result.json), /private|github|token/u);
});

test('successful response exposes the issue number but never its private URL', async () => {
  const result = await run(envelope(), { issueNumber: 456 });
  assert.deepEqual(result.json, { ok: true, submissionNumber: 456 });
  assert.doesNotMatch(JSON.stringify(result.json), /github|https|url/u);
});

test('large machine payloads are divided into hidden numbered issue-comment chunks', async () => {
  const randomArticle = randomBytes(70_000).toString('base64');
  const payload = newModPayload({ generatedMarkdown: generatedMarkdown(randomArticle) });
  const result = await run(envelope(payload));
  assert.equal(result.response.status, 201);
  assert.ok(result.githubBodies.length > 2, 'expected the issue plus multiple chunk comments');
  assert.match(result.githubBodies[0].body, /WIKI_SUBMISSION_V1/u);
  for (const comment of result.githubBodies.slice(1)) {
    assert.match(comment.body, /WIKI_SUBMISSION_V1_CHUNK \d+\/\d+/u);
    assert.ok(comment.body.length < 30_000);
  }
});
