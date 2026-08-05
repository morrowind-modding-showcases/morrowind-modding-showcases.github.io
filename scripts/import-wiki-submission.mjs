import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { NewLocationManualImportError, importApprovedSubmission } from './wiki-submission-lib.mjs';

function parseArguments(argv) {
  const issueNumber = Number(argv[0]);
  const outputFlag = argv.indexOf('--output');
  const outputPath = outputFlag >= 0 ? argv[outputFlag + 1] : null;
  if (!Number.isInteger(issueNumber) || issueNumber <= 0) throw new Error('issue_number must be a positive integer.');
  if (!outputPath) throw new Error('--output is required.');
  return { issueNumber, outputPath };
}

export async function main(argv = process.argv.slice(2)) {
  const { issueNumber, outputPath } = parseArguments(argv);
  const result = await importApprovedSubmission(issueNumber);
  await writeFile(outputPath, `${JSON.stringify(result)}\n`, { encoding: 'utf8', flag: 'wx' });
  console.log(`Prepared one reviewed wiki file for submission #${issueNumber}.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    let message = 'The reviewed submission could not be imported safely.';
    if (error instanceof NewLocationManualImportError) message = error.message;
    else if (error instanceof Error && /stale SHA-256/u.test(error.message)) {
      message = 'The target wiki article changed after submission; no files were changed.';
    } else if (error instanceof Error && /already exists/u.test(error.message)) {
      message = 'The proposed wiki filename already exists; no files were changed.';
    } else if (error instanceof Error && /missing the required|already marked/u.test(error.message)) {
      message = error.message;
    }
    console.error(`Wiki submission import failed: ${message}`);
    process.exitCode = 1;
  }
}
