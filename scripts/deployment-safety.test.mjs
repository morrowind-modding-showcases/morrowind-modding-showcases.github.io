import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflow = await readFile(
  new URL('../.github/workflows/deploy-pages.yml', import.meta.url),
  'utf8',
);
const avatarWorkflow = await readFile(
  new URL('../.github/workflows/refresh-modder-avatars.yml', import.meta.url),
  'utf8',
);
const writerWorkflows = await Promise.all([
  'nexus-stats.yml',
  'refresh-modder-avatars.yml',
  'sync-modder-options.yml',
  'sync-modjam-event-options.yml',
  'sync-resource-tags.yml',
].map(fileName => readFile(new URL(`../.github/workflows/${fileName}`, import.meta.url), 'utf8')));

test('Pages deploys only the complete generated artifact after a successful build', () => {
  assert.match(workflow, /actions\/upload-pages-artifact@v3[\s\S]*?path: dist/u);
  assert.match(workflow, /\n  deploy:[\s\S]*?needs: build[\s\S]*?actions\/deploy-pages@v4/u);
  assert.doesNotMatch(workflow, /pages-build-deployment/u);
  assert.match(workflow, /concurrency:[\s\S]*?cancel-in-progress: false/u);
});

test('automated content writers serialize pushes and avatar refresh retries safely', () => {
  for (const writerWorkflow of writerWorkflows) {
    assert.match(
      writerWorkflow,
      /concurrency:\s*\n\s+group: automated-content-writers-\$\{\{ github\.ref \}\}\s*\n\s+cancel-in-progress: false/u,
    );
  }

  assert.match(avatarWorkflow, /for attempt in 1 2 3; do/u);
  assert.match(avatarWorkflow, /git fetch origin main/u);
  assert.match(avatarWorkflow, /git rebase origin\/main/u);
  assert.match(avatarWorkflow, /git push origin HEAD:main/u);
  assert.match(avatarWorkflow, /Failed to push the avatar-cache commit after 3 attempts/u);
  assert.doesNotMatch(avatarWorkflow, /git push[^\n]*(?:--force|-f(?:\s|$))/u);
});
