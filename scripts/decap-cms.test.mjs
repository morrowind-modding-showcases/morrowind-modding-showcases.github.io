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

  const source = (await readText('modathon/assets/data/nexus-stats.json')).replaceAll('\r\n', '\n');
  const parsed = formatter.fromFile(source);
  const reverseKeys = value => {
    if (Array.isArray(value)) return value.map(reverseKeys);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value).reverse().map(([key, item]) => [key, reverseKeys(item)]));
  };

  const reordered = reverseKeys(parsed);
  assert.equal(formatter.toFile(reordered), source, 'an unchanged document must not produce a noisy diff');

  reordered.mods['2015'].push({
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
  assert.equal((config.match(/^\s{4}delete: false$/gm) || []).length, 4);
  assert.doesNotMatch(config, /widget: relation/);

  const filePaths = [...config.matchAll(/^\s+file:\s+(.+?)\s*$/gm)]
    .map(match => match[1].replace(/^['"]|['"]$/g, ''));
  const expected = [
    'modathon/assets/data/nexus-stats.json',
    ...achievementYears.map(year => `modathon/assets/data/${year}-achievements.json`),
    'modathon/assets/data/modders.json',
    'modathon/assets/data/winners.json',
  ];
  assert.deepEqual(filePaths, expected);

  for (const relativePath of filePaths) {
    assert.doesNotMatch(relativePath, /(?:^|\/)\.github\/|\.js$/);
    await access(fromRoot(...relativePath.split('/')));
  }
  await access(fromRoot('assets', 'images', 'uploads'));

  for (const year of achievementYears) {
    assert.match(config, new RegExp(`name: "${year}"`));
    assert.match(config, new RegExp(`file: modathon/assets/data/${year}-achievements\\.json`));
  }
});

test('Modathon submissions match every configured stored type', async () => {
  const snapshot = await readJson('modathon/assets/data/nexus-stats.json');
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
      if ('status' in submission) {
        assert.equal(Number.isInteger(submission.status), true, `${context}.status must be an integer`);
      }
    }
  }
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

test('Modathon modders match nullable and optional historical fields', async () => {
  const data = await readJson('modathon/assets/data/modders.json');
  assert.deepEqual(Object.keys(data), ['modders']);
  assert.equal(Array.isArray(data.modders), true);

  const names = new Set();
  for (const [index, modder] of data.modders.entries()) {
    const context = `modder ${index + 1}`;
    assertExactKeys(modder, ['name', 'url', 'avatar', 'aliases'], context);
    assert.equal('id' in modder, false, `${context} unexpectedly has an internal ID`);
    assertNonEmptyString(modder.name, `${context}.name`);
    const normalizedName = modder.name.toLocaleLowerCase();
    assert.equal(names.has(normalizedName), false, `${context}.name is duplicated`);
    names.add(normalizedName);

    assert.equal('url' in modder, true, `${context}.url must preserve its historical null`);
    if (modder.url !== null) assertHttpUrl(modder.url, `${context}.url`);
    if ('avatar' in modder && modder.avatar !== null) {
      assertNonEmptyString(modder.avatar, `${context}.avatar`);
      if (!modder.avatar.startsWith('/')) assertHttpUrl(modder.avatar, `${context}.avatar`);
    }
    if ('aliases' in modder) {
      assert.equal(Array.isArray(modder.aliases), true, `${context}.aliases must be an array`);
      modder.aliases.forEach((alias, aliasIndex) => {
        assertNonEmptyString(alias, `${context}.aliases[${aliasIndex}]`);
      });
    }
  }
});

test('Winner history matches the safe site-content collection', async () => {
  const data = await readJson('modathon/assets/data/winners.json');
  assert.deepEqual(Object.keys(data), ['years']);
  assert.equal(Array.isArray(data.years), true);

  let previousYear = 0;
  for (const [yearIndex, yearRecord] of data.years.entries()) {
    const context = `winner year ${yearIndex + 1}`;
    assertExactKeys(yearRecord, ['year', 'note', 'individualModCards', 'awards'], context);
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
        assertNonEmptyString(mod.attribution, `${modContext}.attribution`);
        if ('archiveName' in mod) assertNonEmptyString(mod.archiveName, `${modContext}.archiveName`);
      }
    }
  }
});

test('CMS-managed JSON is canonical two-space UTF-8 data with value-stable round trips', async () => {
  const relativePaths = [
    'modathon/assets/data/nexus-stats.json',
    ...achievementYears.map(year => `modathon/assets/data/${year}-achievements.json`),
    'modathon/assets/data/modders.json',
    'modathon/assets/data/winners.json',
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

  assert.match(modathonPage, /fetch\('assets\/data\/modders\.json'\)/);
  assert.match(modathonPage, /fetch\('assets\/data\/nexus-stats\.json'\)/);
  assert.match(modathonPage, /fetch\('assets\/data\/winners\.json'\)/);
  assert.match(modathonPage, /fetch\('assets\/data\/' \+ y \+ '-achievements\.json'\)/);
  assert.match(readme, /publish from the `main` branch and `\/ \(root\)`/);
  assert.equal(cname.trim(), 'darkelfmodding.com');
  await access(fromRoot('.nojekyll'));
  await access(fromRoot('.github', 'workflows', 'validate-site.yml'));
});
