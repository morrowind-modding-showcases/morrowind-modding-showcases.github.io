import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflow = await readFile(
  new URL('../.github/workflows/deploy-pages.yml', import.meta.url),
  'utf8',
);

test('Pages deploys only the complete generated artifact after a successful build', () => {
  assert.match(workflow, /actions\/upload-pages-artifact@v3[\s\S]*?path: dist/u);
  assert.match(workflow, /\n  deploy:[\s\S]*?needs: build[\s\S]*?actions\/deploy-pages@v4/u);
  assert.doesNotMatch(workflow, /pages-build-deployment/u);
  assert.match(workflow, /concurrency:[\s\S]*?cancel-in-progress: false/u);
});
