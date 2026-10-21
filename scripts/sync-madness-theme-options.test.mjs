import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import yaml from 'js-yaml';
import { collectPagesContent } from './pages-cms-lib.mjs';
import { normalizeMadnessEvents } from './normalize-madness-events.mjs';
import { syncMadnessThemeOptions, syncMadnessThemeOptionsSource } from './sync-madness-theme-options.mjs';

const configSource = await readFile(new URL('../.pages.yml', import.meta.url), 'utf8');
const event = { schemaVersion: 1, eventType: 'madness', year: 2027, season: 11, themes: [] };
const theme = { id: 'future-theme', name: 'Ash: "Snow" & $& 雪', weekStart: 1, weekEnd: 4 };
const options = source => collectPagesContent(yaml.load(source))
  .find(entry => entry.name === 'madness_mods').fields.find(field => field.name === 'themeId').options.values;

test('Madness choices follow additions, renames, removals, and empty event themes', () => {
  for (const themes of [[theme], [{ ...theme, name: 'Renamed' }], []]) {
    const events = [{ ...event, themes }];
    const output = syncMadnessThemeOptionsSource(configSource, events);
    assert.deepEqual(options(output), themes.map(t => ({ name: t.id, label: `2027 · ${t.name}` })));
    assert.equal(syncMadnessThemeOptionsSource(output, events), output);
    const before = yaml.load(configSource);
    const after = yaml.load(output);
    const field = config => collectPagesContent(config).find(e => e.name === 'madness_mods')
      .fields.find(f => f.name === 'themeId');
    field(before).options = field(after).options;
    assert.deepEqual(after, before, 'only the derived theme choices may change');
  }
});

test('Madness choice generation preserves line endings and rejects ambiguous or invalid inputs', () => {
  const source = configSource.replaceAll('\r\n', '\n').replaceAll('\n', '\r\n');
  const output = syncMadnessThemeOptionsSource(source, [{ ...event, themes: [theme] }]);
  assert.equal(output.replaceAll('\r\n', '').includes('\n'), false);
  assert.throws(() => syncMadnessThemeOptionsSource(source, [
    { ...event, themes: [theme] }, { ...event, year: 2028, themes: [theme] },
  ]), /Duplicate Madness theme ID/);
  assert.throws(() => syncMadnessThemeOptionsSource(source, [{ ...event, themes: [null] }]));
  assert.throws(() => syncMadnessThemeOptionsSource(source.replace('MADNESS_THEME_OPTIONS_END', 'MISSING'), []), /exactly one/);
});

test('a CMS event save prepares canonical sources and matching dropdowns before validation', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'madness-theme-sync-'));
  t.after(async () => {
    assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
    await rm(directory, { recursive: true, force: true });
  });
  const configPath = path.join(directory, '.pages.yml');
  const eventPath = path.join(directory, '2027.json');
  await writeFile(configPath, configSource);
  for (const themes of [[theme], []]) {
    const document = { ...event, themes };
    const cmsSave = { ...document };
    if (!themes.length) delete cmsSave.themes;
    await writeFile(eventPath, JSON.stringify(cmsSave));
    await normalizeMadnessEvents({ directory });
    await syncMadnessThemeOptions({ directory, configPath });
    assert.deepEqual(JSON.parse(await readFile(eventPath, 'utf8')), document);
    assert.deepEqual(options(await readFile(configPath, 'utf8')), themes.map(t => ({ name: t.id, label: `2027 · ${t.name}` })));
    assert.equal(await syncMadnessThemeOptions({ directory, configPath }), false);
  }
});

test('all content validation workflows prepare CMS data, and refresh validates before API calls', async () => {
  for (const file of ['deploy-pages.yml', 'validate-site.yml', 'import-wiki-submission.yml', 'nexus-stats.yml']) {
    const source = await readFile(new URL(`../.github/workflows/${file}`, import.meta.url), 'utf8');
    assert.match(source, /npm run content:prepare\s+npm run content:validate/, file);
    if (file === 'nexus-stats.yml') {
      assert.ok(source.indexOf('npm run content:validate') < source.indexOf('node scripts/fetch-nexus-stats.mjs'));
    }
  }
  const build = await readFile(new URL('./build-content.mjs', import.meta.url), 'utf8');
  assert.match(build, /await normalizeMadnessEvents\(\)[\s\S]*await syncMadnessThemeOptions\(\)[\s\S]*await buildContent\(\)/);
});
