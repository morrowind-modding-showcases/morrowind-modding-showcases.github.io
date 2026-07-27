import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fromRoot = (...parts) => path.join(repoRoot, ...parts);
const readText = relativePath => readFile(fromRoot(...relativePath.split('/')), 'utf8');
const readJson = async relativePath => JSON.parse(await readText(relativePath));

const achievementYears = Array.from({ length: 12 }, (_, index) => 2015 + index);
const submissionCategories = new Set([
  'Character Customization',
  'Dungeon',
  'Gameplay, Patch, or UI',
  'Graphics, Animations, or Audio',
  'Immersion',
  'Items',
  'Landscape or Landmass',
  'NPCs and Creatures',
  'Player Home',
  'Quests',
  'Resource or Utility',
  'Towns and Cities',
  'Unknown',
]);
const achievementRarities = new Set([
  null,
  'Bronze',
  'Challenge',
  'Challenge/Super',
  'Category',
  'Copper',
  'Gold',
  'Hidden',
  'Hidden / Gold',
  'Hidden / Silver',
  'Hidden/Copper',
  'Hidden/Silver',
  'Hidden/Super',
  'Metrics',
  'Ruby',
  'Silver',
  'Updated Mod Badge',
]);
const achievementRarityKeys = new Set([
  'bronze',
  'challenge',
  'challenge-super',
  'category',
  'copper',
  'gold',
  'hidden',
  'hidden-copper',
  'hidden-gold',
  'hidden-silver',
  'hidden-super',
  'metrics',
  'ruby',
  'silver',
  'unspecified',
  'updated-mod-badge',
]);
const achievementGroups = new Set([
  'badge',
  'category',
  'challenge',
  'challenge-super',
  'hidden',
  'hidden-metal',
  'hidden-super',
  'metal',
  'metric',
  'standard',
]);

function assertExactKeys(value, allowed, context) {
  assert.equal(value && typeof value === 'object' && !Array.isArray(value), true, `${context} must be an object`);
  const unexpected = Object.keys(value).filter(key => !allowed.includes(key));
  assert.deepEqual(unexpected, [], `${context} has unconfigured fields`);
}

function assertNonEmptyString(value, context) {
  assert.equal(typeof value, 'string', `${context} must be a string`);
  assert.notEqual(value.trim(), '', `${context} must not be blank`);
}

function assertHttpUrl(value, context) {
  assertNonEmptyString(value, context);
  const parsed = new URL(value);
  assert.equal(['http:', 'https:'].includes(parsed.protocol), true, `${context} must use HTTP or HTTPS`);
}

function assertOptionalNumber(record, field, context) {
  if (!(field in record)) return;
  assert.equal(Number.isFinite(record[field]), true, `${context}.${field} must be a number`);
  assert.equal(record[field] >= 0, true, `${context}.${field} must not be negative`);
}

test('Decap entry point is pinned, admin-only, and contains no credentials', async () => {
  const [adminHtml, adminScript, publicHtml, config] = await Promise.all([
    readText('admin/index.html'),
    readText('admin/cms.js'),
    readText('index.html'),
    readText('admin/config.yml'),
  ]);

  assert.match(adminHtml, /<meta charset="utf-8">/);
  assert.match(adminHtml, /name="viewport"/);
  assert.match(adminHtml, /<title>Morrowind Modding Showcases Content Manager<\/title>/);
  assert.match(adminHtml, /decap-cms@3\.12\.2\/dist\/decap-cms\.js/);
  assert.doesNotMatch(adminHtml, /decap-cms@\^|decap-cms@~|decap-cms@latest/);
  assert.match(adminHtml, /identity\.netlify\.com\/v1\/netlify-identity-widget\.js/);
  assert.match(adminHtml, /window\.CMS_MANUAL_INIT = true/);
  assert.match(adminHtml, /src="\.\/cms\.js"/);
  assert.match(adminScript, /registerCustomFormat\("json", "json"/);
  assert.match(adminScript, /window\.initCMS\(\)/);
  assert.doesNotMatch(publicHtml, /netlify-identity|decap-cms/i);
  assert.match(publicHtml, /#\(\?:confirmation\|email_change\|invite\|recovery\)_token=/);
  assert.match(publicHtml, /window\.location\.replace\(`\/admin\//);

  assert.doesNotMatch(
    `${adminHtml}\n${adminScript}\n${config}`,
    /^\s*(?:token|secret|password|api[_-]?key|client[_-]?secret)\s*:/im,
  );
});

test('custom JSON serializer preserves existing property order and canonicalizes additions', async () => {
  const adminScript = await readText('admin/cms.js');
  let formatter;
  let initialized = false;
  const window = {
    CMS: {
      registerCustomFormat(name, extension, candidate) {
        assert.equal(name, 'json');
        assert.equal(extension, 'json');
        formatter = candidate;
      },
    },
    initCMS() {
      initialized = true;
    },
  };

  vm.runInNewContext(adminScript, { window });
  assert.equal(initialized, true);
  assert.equal(typeof formatter?.fromFile, 'function');
  assert.equal(typeof formatter?.toFile, 'function');

  const source = (await readText('modathon/assets/data/modathon-mods.json')).replaceAll('\r\n', '\n');
  const parsed = formatter.fromFile(source);
  const reverseKeys = value => {
    if (Array.isArray(value)) return value.map(reverseKeys);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value).reverse().map(([key, item]) => [key, reverseKeys(item)]));
  };

  const reordered = reverseKeys(parsed);
  assert.equal(formatter.toFile(reordered), source, 'an unchanged document must not produce a noisy diff');

  reordered.mods.push({
    year: 2015,
    url: 'https://example.com/cms-serializer-test',
    category: 'Unknown',
    authors: ['Serializer Test'],
    name: 'Serializer Test',
  });
  const withAddition = JSON.parse(formatter.toFile(reordered));
  const added = withAddition.mods['2015'].at(-1);
  assert.deepEqual(Object.keys(added), ['name', 'authors', 'category', 'url']);
  assert.deepEqual(added, {
    name: 'Serializer Test',
    authors: ['Serializer Test'],
    category: 'Unknown',
    url: 'https://example.com/cms-serializer-test',
  });

  for (const year of [2018, 2019]) {
    const achievementSource = (await readText(`modathon/assets/data/${year}-achievements.json`))
      .replaceAll('\r\n', '\n');
    const achievementData = formatter.fromFile(achievementSource);
    assert.equal(
      formatter.toFile(reverseKeys(achievementData)),
      achievementSource,
      `${year} must use its own original property order`,
    );
  }

  const modjamSource = (await readText('modjam/data/modjam-mods.json')).replaceAll('\r\n', '\n');
  const modjamData = formatter.fromFile(modjamSource);
  modjamData.events[0].mods.pop();
  const serializedModjam = JSON.parse(formatter.toFile(modjamData));
  const serializedMods = serializedModjam.events.flatMap(event => event.mods);
  assert.equal(serializedModjam.summary.eventCount, serializedModjam.events.length);
  assert.equal(serializedModjam.summary.entryCount, serializedMods.length);
  assert.equal(
    serializedModjam.summary.judgeAwardCount,
    serializedMods.reduce((count, mod) => count + mod.awards.length, 0),
  );
});

test('Decap config targets only approved existing content files', async () => {
  const config = await readText('admin/config.yml');

  assert.match(config, /^backend:\r?\n  name: git-gateway\r?\n  branch: main$/m);
  assert.match(config, /^publish_mode: simple$/m);
  assert.doesNotMatch(config, /editorial_workflow/);
  assert.match(config, /^local_backend: true$/m);
  assert.match(config, /^site_url: https:\/\/darkelfmodding\.com$/m);
  assert.match(config, /^display_url: https:\/\/darkelfmodding\.com$/m);
  assert.match(config, /^media_folder: assets\/images\/uploads$/m);
  assert.match(config, /^public_folder: \/assets\/images\/uploads$/m);
  assert.equal((config.match(/^\s{4}delete: false$/gm) || []).length, 11);
  assert.match(config, /widget: registry_modder/);
  assert.match(config, /widget: archive_mod/);
  assert.doesNotMatch(config, /widget: relation/);
  assert.match(config, /widget: image_path/);
  assert.match(
    config,
    /label: Avatar URL or path\r?\n\s+name: avatarUrl\r?\n\s+widget: string/,
  );
  assert.doesNotMatch(
    config,
    /label: Avatar URL or path\r?\n\s+name: avatarUrl\r?\n\s+widget: image_path/,
  );
  assert.match(config, /name: unlockedCount\r?\n\s+widget: hidden/);

  const filePaths = [...config.matchAll(/^\s+file:\s+(.+?)\s*$/gm)]
    .map(match => match[1].replace(/^['"]|['"]$/g, ''))
    .filter(relativePath => relativePath.endsWith('.json'));
  const expected = [
    'modathon/assets/data/modathon-event.json',
    'madness/data/madness-event.json',
    'madness/data/madness-mods.json',
    'madness/data/madness-teams.json',
    ...achievementYears.map(year => `modathon/assets/data/${year}-achievements.json`),
    'modathon/assets/data/modathon-mods.json',
    'assets/data/modders.json',
    'modjam/data/judges.json',
    'modjam/data/modjam-mods.json',
    'modjam/data/postcards.json',
    'modjam/data/modjam-event.json',
  ];
  assert.deepEqual(filePaths, expected);

  for (const relativePath of filePaths) {
    assert.doesNotMatch(relativePath, /(?:^|\/)\.github\/|\.js$/);
    await access(fromRoot(...relativePath.split('/')));
  }
  await access(fromRoot('assets', 'images', 'uploads'));

  for (const year of achievementYears) {
    assert.match(config, new RegExp(`file: modathon/assets/data/${year}-achievements\\.json`));
  }
  assert.match(config, /options: \[2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026\]/);
  assert.deepEqual(
    [...config.matchAll(/^\s{4}label: (.+)$/gm)].map(match => match[1]),
    [
      'Modathon Events',
      'Madness Events',
      'Madness Mods',
      'Madness Teams',
      'Modathon Achievements',
      'Modathon Mods',
      'Modders',
      'Modjam Judges',
      'Modjam Mods',
      'Modjam Postcards',
      'Modjam Events',
    ],
  );
});

test('Modathon submissions match every configured stored type', async () => {
  const snapshot = await readJson('modathon/assets/data/modathon-mods.json');
  assert.deepEqual(Object.keys(snapshot), ['generated', 'game', 'mods']);
  assertNonEmptyString(snapshot.generated, 'snapshot.generated');
  assert.equal(Number.isNaN(Date.parse(snapshot.generated)), false);
  assert.equal(snapshot.game, 'morrowind');
  assert.deepEqual(Object.keys(snapshot.mods), achievementYears.map(String));

  const allowedFields = [
    'name',
    'authors',
    'category',
    'url',
    'downloads',
    'uniqueDownloads',
    'endorsements',
    'available',
    'nexusCategory',
    'pictureUrl',
    'showcaseUrl',
    'status',
  ];

  for (const [year, submissions] of Object.entries(snapshot.mods)) {
    assert.equal(Array.isArray(submissions), true, `${year} submissions must be an array`);
    for (const [index, submission] of submissions.entries()) {
      const context = `${year} submission ${index + 1}`;
      assertExactKeys(submission, allowedFields, context);
      assertNonEmptyString(submission.name, `${context}.name`);
      assert.equal(Array.isArray(submission.authors), true, `${context}.authors must be an array`);
      assert.equal(submission.authors.length > 0, true, `${context}.authors must not be empty`);
      submission.authors.forEach((author, authorIndex) => {
        assertNonEmptyString(author, `${context}.authors[${authorIndex}]`);
      });
      assert.equal(submissionCategories.has(submission.category), true, `${context}.category is not configured`);
      assertHttpUrl(submission.url, `${context}.url`);
      assertOptionalNumber(submission, 'downloads', context);
      assertOptionalNumber(submission, 'uniqueDownloads', context);
      assertOptionalNumber(submission, 'endorsements', context);
      if ('available' in submission) assert.equal(typeof submission.available, 'boolean', `${context}.available must be boolean`);
      if ('nexusCategory' in submission) assertNonEmptyString(submission.nexusCategory, `${context}.nexusCategory`);
      if ('pictureUrl' in submission) assertHttpUrl(submission.pictureUrl, `${context}.pictureUrl`);
      if ('showcaseUrl' in submission) {
        const showcaseUrl = new URL(submission.showcaseUrl);
        assert.equal(showcaseUrl.protocol, 'https:', `${context}.showcaseUrl must use HTTPS`);
        assert.equal(showcaseUrl.hostname, 'www.youtube.com', `${context}.showcaseUrl must use YouTube`);
        assert.equal(showcaseUrl.pathname, '/watch', `${context}.showcaseUrl must be a watch URL`);
      }
      if ('status' in submission) {
        assert.equal(Number.isInteger(submission.status), true, `${context}.status must be an integer`);
      }
    }
  }
});

test('Modjam event metadata and mods are stored in separate CMS collections', async () => {
  const [archive, modArchive] = await Promise.all([
    readJson('modjam/data/modjam-event.json'),
    readJson('modjam/data/modjam-mods.json'),
  ]);

  assert.deepEqual(Object.keys(archive), ['schemaVersion', 'eventType', 'events']);
  assert.equal(archive.eventType, 'modjam');
  assert.deepEqual(Object.keys(modArchive), ['generatedAt', 'summary', 'events']);
  assert.equal(Array.isArray(archive.events), true);
  assert.equal(Array.isArray(modArchive.events), true);
  assert.ok(archive.events.every(event => !Object.hasOwn(event, 'entries') && !Object.hasOwn(event, 'mods')));
  assert.ok(modArchive.events.every(group => (
    Object.keys(group).join(',') === 'id,mods' && Array.isArray(group.mods)
  )));
  assert.deepEqual(
    modArchive.events.map(group => group.id),
    archive.events.map(event => event.id),
  );
});

test('Modathon achievement files match the CMS schema and derived counts', async () => {
  const allowedFields = [
    'id',
    'name',
    'requirement',
    'masteryName',
    'rarity',
    'rarityKey',
    'group',
    'imageUrl',
    'unlockedBy',
    'unlockedCount',
  ];

  for (const year of achievementYears) {
    const relativePath = `modathon/assets/data/${year}-achievements.json`;
    const data = await readJson(relativePath);
    assert.deepEqual(Object.keys(data), ['schemaVersion', 'event', 'achievements']);
    assert.equal(data.schemaVersion, 1);
    assert.deepEqual(data.event, { name: 'Morrowind Modathon', year });
    assert.equal(Array.isArray(data.achievements), true);

    const ids = new Set();
    for (const [index, achievement] of data.achievements.entries()) {
      const context = `${year} achievement ${index + 1}`;
      assertExactKeys(achievement, allowedFields, context);
      assertNonEmptyString(achievement.id, `${context}.id`);
      assert.match(achievement.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      assert.equal(ids.has(achievement.id), false, `${context}.id is duplicated within its year`);
      ids.add(achievement.id);
      assertNonEmptyString(achievement.name, `${context}.name`);
      assertNonEmptyString(achievement.requirement, `${context}.requirement`);
      if ('masteryName' in achievement) assertNonEmptyString(achievement.masteryName, `${context}.masteryName`);
      assert.equal(achievementRarities.has(achievement.rarity), true, `${context}.rarity is not configured`);
      assert.equal(achievementRarityKeys.has(achievement.rarityKey), true, `${context}.rarityKey is not configured`);
      assert.equal(achievementGroups.has(achievement.group), true, `${context}.group is not configured`);
      if ('imageUrl' in achievement) assertNonEmptyString(achievement.imageUrl, `${context}.imageUrl`);
      assert.equal(Array.isArray(achievement.unlockedBy), true, `${context}.unlockedBy must be an array`);
      achievement.unlockedBy.forEach((name, nameIndex) => {
        assertNonEmptyString(name, `${context}.unlockedBy[${nameIndex}]`);
      });
      assert.equal(Number.isInteger(achievement.unlockedCount), true, `${context}.unlockedCount must be an integer`);
      assert.equal(
        achievement.unlockedCount,
        achievement.unlockedBy.length,
        `${context}.unlockedCount must equal unlockedBy.length`,
      );
    }
  }
});

test('central modders own base fields and event participation is inferred from mods and teams', async () => {
  const data = await readJson('assets/data/modders.json');
  assert.deepEqual(Object.keys(data), ['modders']);
  assert.equal(Array.isArray(data.modders), true);

  const ids = new Set();
  const names = new Set();
  for (const [index, modder] of data.modders.entries()) {
    const context = `modder ${index + 1}`;
    assertExactKeys(modder, ['id', 'name', 'nexusProfileUrl', 'avatarUrl', 'aliases'], context);
    assertNonEmptyString(modder.id, `${context}.id`);
    assert.match(modder.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.equal(ids.has(modder.id), false, `${context}.id is duplicated`);
    ids.add(modder.id);
    assertNonEmptyString(modder.name, `${context}.name`);
    const normalizedName = modder.name.toLocaleLowerCase();
    assert.equal(names.has(normalizedName), false, `${context}.name is duplicated`);
    names.add(normalizedName);

    assert.equal('nexusProfileUrl' in modder, true, `${context}.nexusProfileUrl must preserve null`);
    if (modder.nexusProfileUrl) assertHttpUrl(modder.nexusProfileUrl, `${context}.nexusProfileUrl`);
    assert.equal('avatarUrl' in modder, true, `${context}.avatarUrl must preserve null`);
    if (modder.avatarUrl) {
      assertNonEmptyString(modder.avatarUrl, `${context}.avatarUrl`);
      if (!modder.avatarUrl.startsWith('/')) assertHttpUrl(modder.avatarUrl, `${context}.avatarUrl`);
    }
    if ('aliases' in modder) {
      assert.equal(Array.isArray(modder.aliases), true, `${context}.aliases must be an array`);
      modder.aliases.forEach((alias, aliasIndex) => {
        assertNonEmptyString(alias, `${context}.aliases[${aliasIndex}]`);
      });
    }
  }

  const registryHelper = (await import('../assets/modder-registry.js')).default;
  const [modathonMods, modjamMods, madnessTeams] = await Promise.all([
    readJson('modathon/assets/data/modathon-mods.json'),
    readJson('modjam/data/modjam-mods.json'),
    readJson('madness/data/madness-teams.json'),
  ]);
  for (const references of [
    registryHelper.inferModathonReferences(modathonMods, data),
    registryHelper.inferModjamReferences(modjamMods),
    registryHelper.inferMadnessReferences(madnessTeams),
  ]) {
    assert.equal(new Set(references.modders).size, references.modders.length);
    references.modders.forEach(id => assert.equal(ids.has(id), true, `unknown inferred ID ${id}`));
  }
});

test('Modathon events include the complete winner history', async () => {
  const [data, registry] = await Promise.all([
    readJson('modathon/assets/data/modathon-event.json'),
    readJson('assets/data/modders.json'),
  ]);
  const registryNames = new Set(registry.modders.map(modder => modder.name.toLocaleLowerCase()));
  assert.deepEqual(Object.keys(data), ['schemaVersion', 'eventType', 'events']);
  assert.equal(data.eventType, 'modathon');
  assert.equal(Array.isArray(data.events), true);

  let previousYear = 0;
  for (const [yearIndex, yearRecord] of data.events.entries()) {
    const context = `winner year ${yearIndex + 1}`;
    assertExactKeys(
      yearRecord,
      ['name', 'year', 'timezoneLabel', 'countdown', 'note', 'individualModCards', 'awards'],
      context,
    );
    assertNonEmptyString(yearRecord.name, `${context}.name`);
    assert.equal(Number.isInteger(yearRecord.year), true, `${context}.year must be an integer`);
    assert.equal(yearRecord.year >= 2015 && yearRecord.year <= 2100, true, `${context}.year is out of range`);
    assert.equal(yearRecord.year > previousYear, true, 'winner years must remain in ascending order');
    previousYear = yearRecord.year;
    if ('note' in yearRecord) assertNonEmptyString(yearRecord.note, `${context}.note`);
    if ('individualModCards' in yearRecord) {
      assert.equal(typeof yearRecord.individualModCards, 'boolean', `${context}.individualModCards must be boolean`);
    }
    assert.equal(Array.isArray(yearRecord.awards), true, `${context}.awards must be an array`);
    for (const [awardIndex, award] of yearRecord.awards.entries()) {
      const awardContext = `${context} award ${awardIndex + 1}`;
      assertExactKeys(award, ['award', 'mods'], awardContext);
      assertNonEmptyString(award.award, `${awardContext}.award`);
      assert.equal(Array.isArray(award.mods), true, `${awardContext}.mods must be an array`);
      for (const [modIndex, mod] of award.mods.entries()) {
        const modContext = `${awardContext} mod ${modIndex + 1}`;
        assertExactKeys(mod, ['name', 'attribution', 'archiveName'], modContext);
        assertNonEmptyString(mod.name, `${modContext}.name`);
        assert.equal(Array.isArray(mod.attribution), true, `${modContext}.attribution must be an array`);
        assert.equal(mod.attribution.length > 0, true, `${modContext}.attribution must not be empty`);
        mod.attribution.forEach((name, index) => {
          assertNonEmptyString(name, `${modContext}.attribution[${index}]`);
          assert.equal(registryNames.has(name.toLocaleLowerCase()), true, `${name} is not a central modder name`);
        });
        if ('archiveName' in mod) assertNonEmptyString(mod.archiveName, `${modContext}.archiveName`);
      }
    }
  }
});

test('CMS-managed JSON is canonical two-space UTF-8 data with value-stable round trips', async () => {
  const relativePaths = [
    'modathon/assets/data/modathon-event.json',
    'madness/data/madness-event.json',
    'modjam/data/modjam-event.json',
    'modathon/assets/data/modathon-mods.json',
    ...achievementYears.map(year => `modathon/assets/data/${year}-achievements.json`),
    'assets/data/modders.json',
    'madness/data/madness-teams.json',
    'madness/data/madness-mods.json',
    'modjam/data/judges.json',
    'modjam/data/modjam-mods.json',
    'modjam/data/postcards.json',
  ];

  for (const relativePath of relativePaths) {
    const source = await readText(relativePath);
    assert.equal(source.charCodeAt(0) === 0xFEFF, false, `${relativePath} must not have a UTF-8 BOM`);
    const parsed = JSON.parse(source);
    const serialized = `${JSON.stringify(parsed, null, 2)}\n`;
    assert.equal(
      source.replaceAll('\r\n', '\n'),
      serialized,
      `${relativePath} is not canonical two-space JSON with a final newline`,
    );
    assert.deepEqual(JSON.parse(serialized), parsed, `${relativePath} changed values during a JSON round trip`);
  }
});

test('existing loaders and GitHub Pages branch publishing remain intact', async () => {
  const [modathonPage, readme, cname] = await Promise.all([
    readText('modathon/index.html'),
    readText('README.md'),
    readText('CNAME'),
  ]);

  assert.match(modathonPage, /fetch\('\.\.\/assets\/data\/modders\.json'\)/);
  assert.doesNotMatch(modathonPage, /fetch\('assets\/data\/modders\.json'\)/);
  assert.match(modathonPage, /fetch\('assets\/data\/modathon-mods\.json'\)/);
  assert.match(modathonPage, /fetch\('assets\/data\/modathon-event\.json'\)/);
  assert.match(modathonPage, /fetch\('assets\/data\/' \+ y \+ '-achievements\.json'\)/);
  assert.match(readme, /publish from the `main` branch and `\/ \(root\)`/);
  assert.equal(cname.trim(), 'darkelfmodding.com');
  await access(fromRoot('.nojekyll'));
  await access(fromRoot('.github', 'workflows', 'validate-site.yml'));
});
