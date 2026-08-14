import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeWorkflowPayload } from './wiki-submission-codec.mjs';
import { applyWikiSubmission } from './wiki-submission-lib.mjs';

function parseArguments(argv) {
  const outputFlag = argv.indexOf('--output');
  const outputPath = outputFlag >= 0 ? argv[outputFlag + 1] : null;
  if (!outputPath) throw new Error('--output is required.');
  return { outputPath };
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const { outputPath } = parseArguments(argv);
  if (!env.WIKI_SUBMISSION_PAYLOAD) throw new Error('WIKI_SUBMISSION_PAYLOAD is required.');
  const payload = await decodeWorkflowPayload(env.WIKI_SUBMISSION_PAYLOAD);
  const result = await applyWikiSubmission(payload);
  await writeFile(outputPath, `${JSON.stringify(result)}\n`, { encoding: 'utf8', flag: 'wx' });
  console.log(`Prepared a wiki page and contribution record for submission ${result.submissionId}.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    let message = 'The submitted wiki contribution could not be imported safely.';
    if (error instanceof Error && /stale SHA-256/u.test(error.message)) {
      message = 'The target wiki article changed after submission; no files were changed.';
    } else if (error instanceof Error && /already exists/u.test(error.message)) {
      message = 'The proposed wiki filename already exists; no files were changed.';
    }
    console.error(`Wiki submission import failed: ${message}`);
    process.exitCode = 1;
  }
}
