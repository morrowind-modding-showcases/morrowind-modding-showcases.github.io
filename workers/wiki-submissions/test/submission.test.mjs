import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import test from 'node:test';

import { decodeWorkflowPayload } from '../../../scripts/wiki-submission-codec.mjs';
import { handleRequest } from '../src/index.mjs';

const NOW = Date.parse('2026-08-04T12:00:10.000Z');
const ORIGIN = 'https://darkelfmodding.com';
const MOD_PATH = 'wiki/content/mods/example-mod.md';
const LOCATION_PATH = 'wiki/content/locations/example-cell.md';

const CURRENT_MOD_MARKDOWN = `---
title: "Example Mod"
description: "Old description."
categories:
  - Dungeon
---
Frontmatter context remains.
Distant unchanged line 1.
Distant unchanged line 2.
Distant unchanged line 3.
Distant unchanged line 4.
Distant unchanged line 5.
Distant unchanged line 6.
Distant unchanged line 7.
Body context before.
Old mod paragraph.
Body context after.
`;

const PROPOSED_MOD_MARKDOWN = `---
title: "Example Mod"
categories:
  - Dungeon
---
Frontmatter context remains.
Distant unchanged line 1.
Distant unchanged line 2.
Distant unchanged line 3.
Distant unchanged line 4.
Distant unchanged line 5.
Distant unchanged line 6.
Distant unchanged line 7.
Body context before.
Updated mod paragraph.
Body context after.
`;

const CURRENT_LOCATION_MARKDOWN = `---
cell: "Example Cell"
region: "Old Region"
x: -10
y: 20
---
Location context before.
Old location paragraph.
Location context after.
`;

const PROPOSED_LOCATION_MARKDOWN = `---
cell: "Example Cell"
region: "New Region"
x: -10
y: 20
---
Location context before.
Updated location paragraph.
Location context after.
`;

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

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
      authors: ['One Author'],
      url: 'https://www.nexusmods.com/morrowind/mods/60000',
      picture_url: '',
      showcase_url: '',
      categories: ['Dungeon'],
      events: [],
      map_enabled: false,
      map_locations: [],
      map_exterior_cells: [],
    },
    generatedMarkdown: generatedMarkdown(),
    ...overrides,
  };
}

function editModPayload() {
  const payload = newModPayload({
    kind: 'edit-mod',
    generatedMarkdown: PROPOSED_MOD_MARKDOWN,
  });
  delete payload.changes.slug;
  payload.target = {
    path: MOD_PATH,
    baseSha256: sha256(CURRENT_MOD_MARKDOWN),
  };
  return payload;
}

function editLocationPayload() {
  return {
    schemaVersion: 1,
    submissionId: '123e4567-e89b-42d3-a456-426614174101',
    kind: 'edit-location',
    contributorName: 'Location Editor',
    notes: '',
    createdAt: '2026-08-04T12:00:09.000Z',
    target: {
      path: LOCATION_PATH,
      baseSha256: sha256(CURRENT_LOCATION_MARKDOWN),
    },
    changes: {
      cell: 'Example Cell',
      region: 'New Region',
      x: -10,
      y: 20,
      uesp_wiki: '',
      additional_entrances: [],
    },
    generatedMarkdown: PROPOSED_LOCATION_MARKDOWN,
  };
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

function nexusRequest(url = 'https://www.nexusmods.com/morrowind/mods/60000', origin = ORIGIN) {
  const endpoint = new URL('https://worker.example/nexus-mod');
  endpoint.searchParams.set('url', url);
  return new Request(endpoint, {
    headers: {
      Origin: origin,
      'CF-Connecting-IP': '192.0.2.10',
      'User-Agent': 'test-agent',
    },
  });
}

function harness({
  turnstile = {
    success: true,
    hostname: 'darkelfmodding.com',
    action: 'wiki_contribution',
  },
  githubStatus = 204,
  rateSuccess = true,
  currentSources = {
    [MOD_PATH]: CURRENT_MOD_MARKDOWN,
    [LOCATION_PATH]: CURRENT_LOCATION_MARKDOWN,
  },
  sourceStatus = 200,
  nexusStatus = 200,
  nexusData = {
    name: 'Nexus Example',
    uploaded_by: 'Nexus Author',
    summary: 'A useful Nexus summary.',
    picture_url: 'http://staticdelivery.nexusmods.com/example.jpg',
  },
} = {}) {
  const calls = [];
  const githubBodies = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).includes('turnstile/v0/siteverify')) {
      return new Response(JSON.stringify(turnstile), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (String(url).startsWith('https://raw.githubusercontent.com/')) {
      const marker = '/main/';
      const path = decodeURIComponent(String(url).slice(String(url).indexOf(marker) + marker.length));
      return new Response(sourceStatus === 200 ? currentSources[path] : '', {
        status: sourceStatus,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }
    if (String(url).startsWith('https://api.nexusmods.com/')) {
      return new Response(JSON.stringify(nexusData), {
        status: nexusStatus,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    githubBodies.push(JSON.parse(options.body));
    if (githubStatus < 200 || githubStatus >= 300) {
      return new Response(JSON.stringify({ private: 'must not leak' }), {
        status: githubStatus,
      });
    }
    return new Response(githubStatus === 204 ? null : JSON.stringify({ ok: true }), {
      status: githubStatus,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  const env = {
    TURNSTILE_SECRET_KEY: 'test-only-secret',
    GITHUB_WORKFLOW_TOKEN: 'test-only-token',
    NEXUS_API_KEY: 'test-only-nexus-key',
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
  const response = await handleRequest(
    new Request('https://worker.example/submit', {
      method: 'OPTIONS',
      headers: { Origin: ORIGIN },
    }),
    {},
  );
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  assert.equal(response.headers.get('Access-Control-Allow-Methods'), 'POST, OPTIONS');
  assert.equal(response.headers.get('Access-Control-Allow-Headers'), 'Content-Type');
  assert.equal(response.headers.get('Vary'), 'Origin');
});

test('GET /nexus-mod validates origin and URL, then returns bounded Nexus metadata', async () => {
  const context = harness();
  const response = await handleRequest(nexusRequest(), context.env, {
    fetchImpl: context.fetchImpl,
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  assert.equal(response.headers.get('Cache-Control'), 'public, max-age=300');
  assert.deepEqual(await response.json(), {
    ok: true,
    mod: {
      name: 'Nexus Example',
      author: 'Nexus Author',
      description: 'A useful Nexus summary.',
      pictureUrl: 'https://staticdelivery.nexusmods.com/example.jpg',
    },
  });
  const nexusCall = context.calls.find(call => call.url.includes('api.nexusmods.com'));
  assert.match(nexusCall.url, /\/mods\/60000\.json$/u);
  assert.equal(nexusCall.options.headers.apikey, 'test-only-nexus-key');
  assert.equal(nexusCall.options.headers['application-name'], 'morrowind-modding-showcases');

  const invalid = await handleRequest(nexusRequest('https://example.com/mods/60000'), context.env, {
    fetchImpl: context.fetchImpl,
  });
  assert.equal(invalid.status, 400);
  const forbidden = await handleRequest(nexusRequest(undefined, 'https://evil.example'), context.env, {
    fetchImpl: context.fetchImpl,
  });
  assert.equal(forbidden.status, 403);
});

test('OPTIONS /nexus-mod allows only production-origin GET requests', async () => {
  const response = await handleRequest(
    new Request('https://worker.example/nexus-mod', {
      method: 'OPTIONS',
      headers: { Origin: ORIGIN },
    }),
    {},
  );
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('Access-Control-Allow-Methods'), 'GET, OPTIONS');
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), ORIGIN);
});

test('an unapproved origin is rejected without a wildcard CORS response', async () => {
  const context = harness();
  const response = await handleRequest(submitRequest(envelope(), { origin: 'https://evil.example' }), context.env, {
    fetchImpl: context.fetchImpl,
  });
  assert.equal(response.status, 403);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
});

test('non-JSON content and malformed JSON are rejected', async t => {
  await t.test('content type', async () => {
    const context = harness();
    const response = await handleRequest(submitRequest('{}', { contentType: 'text/plain' }), context.env, {
      fetchImpl: context.fetchImpl,
    });
    assert.equal(response.status, 415);
  });
  await t.test('body', async () => {
    const context = harness();
    const response = await handleRequest(submitRequest('{bad json'), context.env, { fetchImpl: context.fetchImpl });
    assert.equal(response.status, 400);
  });
});

test('honeypot and completion under three seconds are rejected before external requests', async t => {
  await t.test('honeypot', async () => {
    const result = await run(envelope(newModPayload(), { website: 'spam.example' }));
    assert.equal(result.response.status, 400);
    assert.equal(result.calls.length, 0);
  });
  await t.test('completion time', async () => {
    const result = await run(
      envelope(newModPayload(), {
        startedAt: new Date(NOW - 2_999).toISOString(),
      }),
    );
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
  const response = await handleRequest(submitRequest(envelope()), context.env, {
    fetchImpl: context.fetchImpl,
    now: () => NOW,
  });
  assert.equal(response.status, 503);
  assert.equal(context.calls.length, 0);
});

test('Turnstile failures, hostname mismatch, action mismatch, and duplicate expiry are rejected', async t => {
  const cases = [
    ['failure', { success: false }],
    [
      'hostname',
      {
        success: true,
        hostname: 'preview.example',
        action: 'wiki_contribution',
      },
    ],
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

test('invalid schema, unsafe path, and oversized generated Markdown are rejected', async t => {
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
  await t.test('removed new-location kind', async () => {
    const payload = editLocationPayload();
    payload.kind = 'new-location';
    assert.equal((await run(envelope(payload))).response.status, 400);
  });
  await t.test('oversized Markdown', async () => {
    const payload = newModPayload({
      generatedMarkdown: generatedMarkdown('x'.repeat(100 * 1024 + 1)),
    });
    assert.equal((await run(envelope(payload))).response.status, 400);
  });
});

test('valid new-mod submission dispatches the canonical PR workflow with a sanitized compressed payload', async () => {
  const payload = newModPayload({
    contributorName: 'Private Name',
    notes: 'Private notes',
  });
  const result = await run(envelope(payload));
  assert.equal(result.response.status, 202);
  assert.equal(result.githubBodies.length, 1);
  assert.match(result.calls.at(-1).url, /actions\/workflows\/import-wiki-submission\.yml\/dispatches$/u);
  assert.equal(result.githubBodies[0].ref, 'main');
  assert.equal(result.githubBodies[0].inputs.submission_id, payload.submissionId);
  const decoded = await decodeWorkflowPayload(result.githubBodies[0].inputs.encoded_submission);
  assert.equal(decoded.contributorName, 'Anonymous wiki contributor');
  assert.equal(decoded.notes, '');
  assert.deepEqual(decoded.changes, payload.changes);
  assert.equal(decoded.generatedMarkdown, payload.generatedMarkdown);
});

test('edit-mod and edit-location submissions verify the current source before workflow dispatch', async t => {
  for (const [name, payload] of [
    ['mod', editModPayload()],
    ['location', editLocationPayload()],
  ]) {
    await t.test(name, async () => {
      const result = await run(envelope(payload));
      assert.equal(result.response.status, 202);
      assert.equal(
        result.calls.filter(call => call.url.startsWith('https://raw.githubusercontent.com/')).length,
        1,
      );
      assert.equal(result.githubBodies.length, 1);
      assert.deepEqual(
        await decodeWorkflowPayload(result.githubBodies[0].inputs.encoded_submission),
        { ...payload, contributorName: 'Anonymous wiki contributor', notes: '' },
      );
    });
  }
});

test('stale edit source is rejected publicly before a workflow is dispatched', async () => {
  const payload = editModPayload();
  payload.target.baseSha256 = 'a'.repeat(64);
  const result = await run(envelope(payload));
  assert.equal(result.response.status, 409);
  assert.match(result.json.error, /page changed.*reload the page/iu);
  assert.equal(result.githubBodies.length, 0);
  assert.equal(
    result.calls.filter(call => String(call.url).startsWith('https://raw.githubusercontent.com/')).length,
    1,
  );
});

test('GitHub API failures return a generic error without private response content', async () => {
  const result = await run(envelope(), { githubStatus: 500 });
  assert.equal(result.response.status, 502);
  assert.doesNotMatch(JSON.stringify(result.json), /private|github|token/u);
});

test('successful response exposes only the public submission UUID', async () => {
  const payload = newModPayload();
  const result = await run(envelope(payload));
  assert.deepEqual(result.json, { ok: true, submissionId: payload.submissionId });
  assert.doesNotMatch(JSON.stringify(result.json), /github|https|url/u);
});

test('a compressed payload that exceeds the conservative workflow-input limit is rejected', async () => {
  const randomArticle = randomBytes(70_000).toString('base64');
  const payload = newModPayload({
    generatedMarkdown: generatedMarkdown(randomArticle),
  });
  const result = await run(envelope(payload));
  assert.equal(result.response.status, 413);
  assert.match(result.json.error, /too large.*GitHub/iu);
  assert.equal(result.githubBodies.length, 0);
});
