import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { canonicalModjamEvent, validateModjamEventSource } from './content-lib.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EVENTS_ROOT = path.join(REPO_ROOT, 'content', 'modjam', 'events');
const PAGES_CONFIG_PATH = path.join(REPO_ROOT, '.pages.yml');
const OPTIONS_START = '# MODJAM_EVENT_OPTIONS_START';
const OPTIONS_END = '# MODJAM_EVENT_OPTIONS_END';

export function syncModjamEventOptionsSource(source, events) {
  const lineEnding = source.includes('\r\n') ? '\r\n' : '\n';
  const markerPattern = new RegExp(
    `^(\\s*)${OPTIONS_START}${lineEnding}[\\s\\S]*?^\\1${OPTIONS_END}`,
    'm',
  );
  if (source.split(OPTIONS_START).length !== 2 || source.split(OPTIONS_END).length !== 2) {
    throw new Error('Pages CMS must contain exactly one Modjam event option block.');
  }
  const match = source.match(markerPattern);
  if (!match) throw new Error('Pages CMS Modjam event option markers are malformed.');

  const seen = new Set();
  const choices = events.map(event => {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(event.id)) {
      throw new Error(`Invalid Modjam event ID ${JSON.stringify(event.id)}.`);
    }
    if (seen.has(event.id)) throw new Error(`Duplicate Modjam event ID ${JSON.stringify(event.id)}.`);
    seen.add(event.id);
    return { id: event.id, label: `${event.season} ${event.year}`, year: event.year };
  }).sort((left, right) => right.year - left.year || left.label.localeCompare(right.label));

  const indent = match[1];
  const optionIndent = `${indent}  `;
  const propertyIndent = `${optionIndent}  `;
  const replacement = [
    `${indent}${OPTIONS_START}`,
    `${indent}values:`,
    ...choices.flatMap(choice => [
      `${optionIndent}- name: ${JSON.stringify(choice.id)}`,
      `${propertyIndent}label: ${JSON.stringify(choice.label)}`,
    ]),
    `${indent}${OPTIONS_END}`,
  ].join(lineEnding);
  return source.replace(markerPattern, replacement);
}

export async function syncModjamEventOptions() {
  const fileNames = (await readdir(EVENTS_ROOT)).filter(name => name.endsWith('.json'));
  const events = await Promise.all(fileNames.map(async fileName => {
    const source = JSON.parse(await readFile(path.join(EVENTS_ROOT, fileName), 'utf8'));
    validateModjamEventSource(source, `content/modjam/events/${fileName}`);
    const event = canonicalModjamEvent(source);
    if (fileName !== `${event.id}.json`) {
      throw new Error(`${fileName} must match the generated event ID ${event.id}.json.`);
    }
    return event;
  }));
  const configSource = await readFile(PAGES_CONFIG_PATH, 'utf8');
  const updatedConfig = syncModjamEventOptionsSource(configSource, events);
  if (updatedConfig !== configSource) await writeFile(PAGES_CONFIG_PATH, updatedConfig, 'utf8');
  return { changed: updatedConfig !== configSource, eventCount: events.length };
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (invokedPath === import.meta.url) {
  syncModjamEventOptions()
    .then(({ changed, eventCount }) => {
      console.log(`${changed ? 'Updated' : 'Checked'} Pages CMS with ${eventCount} Modjam events.`);
    })
    .catch(error => {
      console.error(error.message || error);
      process.exitCode = 1;
    });
}
