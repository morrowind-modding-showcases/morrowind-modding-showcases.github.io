import {
  encodeMachinePayload,
  machineChunkComment,
  machineManifestComment,
} from '../../../scripts/wiki-submission-codec.mjs';

export const QUEUE_OWNER = 'morrowind-modding-showcases';
export const QUEUE_REPOSITORY = 'wiki-submissions';

const SUBMISSION_LABELS = Object.freeze({
  'new-mod': ['wiki-submission', 'pending', 'new-page'],
  'edit-mod': ['wiki-submission', 'pending', 'edit'],
  'edit-location': ['wiki-submission', 'pending', 'edit'],
  'new-location': ['wiki-submission', 'pending', 'location-proposal'],
});

export const SUBMISSION_TYPE_LABELS = Object.freeze({
  'new-mod': 'Add a new mod page',
  'edit-mod': 'Edit an existing mod page',
  'edit-location': 'Edit an existing map location',
  'new-location': 'Add a new map location',
});

const escapeMarkdown = value => String(value ?? '')
  .replace(/\\/gu, '\\\\')
  .replace(/([`*_{}\[\]()<>#+.!|~-])/gu, '\\$1')
  .replace(/[\r\n]+/gu, ' ');

function safeFence(source) {
  const backticks = Math.max(0, ...[...source.matchAll(/`+/gu)].map(match => match[0].length));
  const tildes = Math.max(0, ...[...source.matchAll(/~+/gu)].map(match => match[0].length));
  const character = backticks <= tildes ? '`' : '~';
  return character.repeat(Math.max(3, Math.min(backticks, tildes) + 1));
}

function issueTitle(payload) {
  switch (payload.kind) {
    case 'new-mod': return `[New mod] ${payload.changes.title}`;
    case 'edit-mod': return `[Edit mod] ${payload.changes.title}`;
    case 'edit-location': return `[Edit location] ${payload.changes.cell}`;
    case 'new-location': return `[New location] ${payload.changes.cell}`;
    default: throw new Error('Unsupported submission kind.');
  }
}

function humanReadableIssueBody(payload, manifest) {
  const previewLimit = 14_000;
  const truncated = payload.generatedMarkdown.length > previewLimit;
  const preview = truncated ? payload.generatedMarkdown.slice(0, previewLimit) : payload.generatedMarkdown;
  const fence = safeFence(preview);
  const details = [
    '# Wiki submission',
    '',
    `- **Contributor name:** ${escapeMarkdown(payload.contributorName)}`,
    `- **Submission type:** ${escapeMarkdown(SUBMISSION_TYPE_LABELS[payload.kind])}`,
  ];
  if (payload.target) details.push(`- **Target path:** ${escapeMarkdown(payload.target.path)}`);
  if (payload.suggestedFilename) {
    details.push(`- **Suggested filename:** ${escapeMarkdown(payload.suggestedFilename)}.md`);
  }
  details.push(
    '',
    '## Notes for maintainers',
    '',
    payload.notes ? escapeMarkdown(payload.notes) : '_None provided._',
    '',
    '## Generated Markdown preview',
    '',
  );
  if (truncated) details.push('_The human-readable preview is truncated; the hidden machine payload is complete._', '');
  details.push(
    `${fence}markdown`,
    preview,
    fence,
    '',
    machineManifestComment(manifest),
  );
  return details.join('\n');
}

function githubHeaders(token) {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'darkelfmodding-wiki-submissions-worker',
  };
}

async function githubRequest(path, body, token, fetchImpl) {
  const response = await fetchImpl(
    `https://api.github.com/repos/${QUEUE_OWNER}/${QUEUE_REPOSITORY}${path}`,
    {
      method: 'POST',
      headers: githubHeaders(token),
      body: JSON.stringify(body),
    },
  );
  if (!response.ok) throw new Error(`GitHub queue request failed with HTTP ${response.status}.`);
  return response.json();
}

export async function createQueueIssue(payload, token, fetchImpl) {
  if (!token) throw new Error('The private queue token is not configured.');
  const encoded = await encodeMachinePayload(payload);
  const issue = await githubRequest('/issues', {
    title: issueTitle(payload),
    body: humanReadableIssueBody(payload, encoded.manifest),
    labels: SUBMISSION_LABELS[payload.kind],
  }, token, fetchImpl);
  if (!Number.isInteger(issue.number) || issue.number <= 0) throw new Error('GitHub returned an invalid issue number.');
  for (const [index, chunk] of encoded.chunks.entries()) {
    await githubRequest(`/issues/${issue.number}/comments`, {
      body: machineChunkComment(chunk, index, encoded.chunks.length),
    }, token, fetchImpl);
  }
  return issue.number;
}

export function issueDocumentForTest(payload, manifest) {
  return {
    title: issueTitle(payload),
    labels: SUBMISSION_LABELS[payload.kind],
    body: humanReadableIssueBody(payload, manifest),
  };
}
