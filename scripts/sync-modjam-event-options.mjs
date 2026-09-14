import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import yaml from 'js-yaml';

import { canonicalModjamEvent, validateModjamEventSource } from './content-lib.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EVENTS_ROOT = path.join(REPO_ROOT, 'content', 'modjam', 'events');
const MODS_ROOT = path.join(REPO_ROOT, 'content', 'modjam', 'mods');
const PAGES_CONFIG_PATH = path.join(REPO_ROOT, '.pages.yml');
const OPTIONS_START = '# MODJAM_EVENT_OPTIONS_START';
const OPTIONS_END = '# MODJAM_EVENT_OPTIONS_END';
const COLLECTIONS_START = '# MODJAM_MOD_COLLECTIONS_START';
const COLLECTIONS_END = '# MODJAM_MOD_COLLECTIONS_END';

function replaceMarkedBlock(source, start, end, body) {
  const lineEnding = source.includes('\r\n') ? '\r\n' : '\n';
  if (source.split(start).length !== 2 || source.split(end).length !== 2) {
    throw new Error(`Pages CMS must contain exactly one ${start} block.`);
  }
  const markerPattern = new RegExp(
    `^([ \\t]*)${start}${lineEnding}[\\s\\S]*?^\\1${end}`,
    'm',
  );
  const match = source.match(markerPattern);
  if (!match) throw new Error(`Pages CMS ${start} markers are malformed.`);
  const indent = match[1];
  return source.replace(markerPattern, [
    `${indent}${start}`,
    body(indent, lineEnding),
    `${indent}${end}`,
  ].filter(Boolean).join(lineEnding));
}

export function syncModjamEventOptionsSource(source, events) {
  const seen = new Set();
  const choices = events.map(event => {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(event.id)) {
      throw new Error(`Invalid Modjam event ID ${JSON.stringify(event.id)}.`);
    }
    if (seen.has(event.id)) throw new Error(`Duplicate Modjam event ID ${JSON.stringify(event.id)}.`);
    seen.add(event.id);
    return { id: event.id, label: `${event.season} ${event.year}`, year: event.year };
  }).sort((left, right) => right.year - left.year || left.label.localeCompare(right.label));

  const withOptions = replaceMarkedBlock(source, OPTIONS_START, OPTIONS_END, (indent, lineEnding) => [
    `${indent}values:`,
    ...choices.flatMap(choice => [
      `${indent}  - name: ${JSON.stringify(choice.id)}`,
      `${indent}    label: ${JSON.stringify(choice.label)}`,
    ]),
  ].join(lineEnding));

  const config = yaml.load(withOptions);
  const modjamGroup = config.content.find(entry => entry.name === 'modjam_group');
  const rootCollection = modjamGroup?.items.find(entry => entry.name === 'modjam_mods');
  if (!rootCollection) throw new Error('Pages CMS Modjam mods collection is missing.');
  const collections = choices.map(choice => ({
    name: `modjam_mods_${choice.id.replaceAll('-', '_')}`,
    label: choice.label,
    description: `Create and edit mods for ${choice.label}.`,
    type: 'collection',
    path: `content/modjam/mods/${choice.id}`,
    format: 'json',
    subfolders: false,
    exclude: ['.gitkeep'],
    filename: structuredClone(rootCollection.filename),
    operations: { create: true, rename: false, delete: false },
    view: structuredClone(rootCollection.view),
    fields: rootCollection.fields.map(field => field.name === 'eventId'
      ? {
          name: 'eventId',
          label: 'Event ID',
          type: 'string',
          required: true,
          hidden: true,
          default: choice.id,
        }
      : structuredClone(field)),
  }));
  return replaceMarkedBlock(withOptions, COLLECTIONS_START, COLLECTIONS_END, (indent, lineEnding) =>
    yaml.dump(collections, { indent: 2, lineWidth: -1, noRefs: true })
      .trimEnd()
      .split('\n')
      .map(line => `${indent}${line}`)
      .join(lineEnding));
}

export async function syncModjamModFolders(events, modsRoot = MODS_ROOT) {
  let created = 0;
  for (const event of events) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(event.id)) {
      throw new Error(`Invalid Modjam event ID ${JSON.stringify(event.id)}.`);
    }
    const eventDirectory = path.join(modsRoot, event.id);
    await mkdir(eventDirectory, { recursive: true });
    if ((await readdir(eventDirectory)).length > 0) continue;
    try {
      // Git needs a tracked file to retain a new event's empty mods directory.
      await writeFile(path.join(eventDirectory, '.gitkeep'), '', { flag: 'wx' });
      created += 1;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
  }
  return created;
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
  const foldersCreated = await syncModjamModFolders(events);
  if (updatedConfig !== configSource) await writeFile(PAGES_CONFIG_PATH, updatedConfig, 'utf8');
  return { changed: updatedConfig !== configSource, eventCount: events.length, foldersCreated };
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (invokedPath === import.meta.url) {
  syncModjamEventOptions()
    .then(({ changed, eventCount, foldersCreated }) => {
      console.log(`${changed ? 'Updated' : 'Checked'} Pages CMS with ${eventCount} Modjam events; created ${foldersCreated} mod folder(s).`);
    })
    .catch(error => {
      console.error(error.message || error);
      process.exitCode = 1;
    });
}
