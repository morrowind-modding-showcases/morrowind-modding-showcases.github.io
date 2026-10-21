import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { MADNESS_EVENTS_ROOT, REPO_ROOT, validateMadnessEventSource } from './content-lib.mjs';

const START = '# MADNESS_THEME_OPTIONS_START';
const END = '# MADNESS_THEME_OPTIONS_END';

export function syncMadnessThemeOptionsSource(source, events) {
  const seen = new Set();
  const choices = [];
  for (const event of [...events].sort((a, b) => a.year - b.year)) {
    validateMadnessEventSource(event, `Madness event ${event.year}`);
    for (const theme of event.themes ?? []) {
      if (seen.has(theme.id)) throw new Error(`Duplicate Madness theme ID ${JSON.stringify(theme.id)}.`);
      seen.add(theme.id);
      choices.push({ name: theme.id, label: `${event.year} · ${theme.name}` });
    }
  }
  if (source.split(START).length !== 2 || source.split(END).length !== 2) {
    throw new Error('Pages CMS must contain exactly one Madness theme options block.');
  }
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  const pattern = new RegExp(`^([ \\t]*)${START}\\r?\\n[\\s\\S]*?^\\1${END}`, 'm');
  const match = source.match(pattern);
  if (!match) throw new Error('Pages CMS Madness theme options markers are malformed.');
  const indent = match[1];
  return source.replace(pattern, () => [
    `${indent}${START}`,
    `${indent}values:${choices.length ? '' : ' []'}`,
    ...choices.map(choice => `${indent}  - { name: ${JSON.stringify(choice.name)}, label: ${JSON.stringify(choice.label)} }`),
    `${indent}${END}`,
  ].join(newline));
}

export async function syncMadnessThemeOptions({
  directory = MADNESS_EVENTS_ROOT,
  configPath = path.join(REPO_ROOT, '.pages.yml'),
} = {}) {
  const files = (await readdir(directory)).filter(name => name.endsWith('.json')).sort();
  const events = await Promise.all(files.map(async file => {
    const event = JSON.parse(await readFile(path.join(directory, file), 'utf8'));
    validateMadnessEventSource(event, file);
    if (file !== `${event.year}.json`) throw new Error(`${file} must match its Madness event year.`);
    return event;
  }));
  const source = await readFile(configPath, 'utf8');
  const output = syncMadnessThemeOptionsSource(source, events);
  if (output !== source) await writeFile(configPath, output, 'utf8');
  return output !== source;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  syncMadnessThemeOptions().then(changed => {
    console.log(`${changed ? 'Updated' : 'Checked'} Pages CMS Madness theme options.`);
  }).catch(error => {
    console.error(error.message || error);
    process.exitCode = 1;
  });
}
