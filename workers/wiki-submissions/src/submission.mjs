import {
  encodeWorkflowPayload,
  MAX_WORKFLOW_PAYLOAD_CHARACTERS,
} from '../../../scripts/wiki-submission-codec.mjs';

const REPOSITORY_OWNER = 'morrowind-modding-showcases';
const REPOSITORY_NAME = 'morrowind-modding-showcases.github.io';
const WORKFLOW_FILE = 'import-wiki-submission.yml';
const WORKFLOW_REF = 'main';

export class WorkflowPayloadTooLargeError extends Error {
  constructor() {
    super('The compressed wiki submission exceeds the GitHub Actions input limit.');
    this.name = 'WorkflowPayloadTooLargeError';
  }
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

function publicWorkflowPayload(payload) {
  return {
    ...payload,
    // Private maintainer notes are not part of the public contribution record.
    notes: '',
  };
}

export async function dispatchWikiSubmission(payload, token, fetchImpl) {
  if (!token) throw new Error('The GitHub workflow token is not configured.');

  const encodedSubmission = await encodeWorkflowPayload(publicWorkflowPayload(payload));
  if (encodedSubmission.length > MAX_WORKFLOW_PAYLOAD_CHARACTERS) {
    throw new WorkflowPayloadTooLargeError();
  }

  const response = await fetchImpl(
    `https://api.github.com/repos/${REPOSITORY_OWNER}/${REPOSITORY_NAME}/actions/workflows/${WORKFLOW_FILE}/dispatches`,
    {
      method: 'POST',
      headers: githubHeaders(token),
      body: JSON.stringify({
        ref: WORKFLOW_REF,
        inputs: {
          encoded_submission: encodedSubmission,
          submission_id: payload.submissionId,
        },
      }),
    },
  );
  if (!response.ok) throw new Error(`GitHub workflow dispatch failed with HTTP ${response.status}.`);
  return payload.submissionId;
}
