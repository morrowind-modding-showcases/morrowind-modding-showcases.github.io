import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fromRoot = (...parts) => path.join(repoRoot, ...parts);
const readText = relativePath => readFile(fromRoot(...relativePath.split('/')), 'utf8');
const readJson = async relativePath => JSON.parse(await readText(relativePath));

const achievementYearDirectories = (await readdir(
  fromRoot('content', 'modathon', 'achievements'),
  { withFileTypes: true },
))
  .filter(entry => entry.isDirectory() && /^\d{4}$/.test(entry.name))
  .map(entry => entry.name)
  .sort();
const achievementSourceFileNames = (await Promise.all(
  achievementYearDirectories.map(async year => (
    (await readdir(fromRoot('content', 'modathon', 'achievements', year)))
      .filter(fileName => path.extname(fileName) === '.json')
      .sort()
      .map(fileName => `${year}/${fileName}`)
  )),
)).flat();
const achievementSourcePaths = achievementSourceFileNames
  .map(fileName => `content/modathon/achievements/${fileName}`);
const modjamEventDirectories = (await readdir(
  fromRoot('content', 'modjam', 'mods'),
  { withFileTypes: true },
))
  .filter(entry => entry.isDirectory())
  .map(entry => entry.name)
  .sort();
const modjamSourceFileNames = (await Promise.all(
  modjamEventDirectories.map(async eventId => (
    (await readdir(fromRoot('content', 'modjam', 'mods', eventId)))
      .filter(fileName => path.extname(fileName) === '.json')
      .sort()
      .map(fileName => `${eventId}/${fileName}`)
  )),
)).flat();
const achievementYears = (await readJson('modathon/assets/data/modathon-event.json'))
  .events
  .map(event => event.year)
  .sort((left, right) => left - right);
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

test('Pages CMS owns the editing workflow and repository media uploads', async () => {
  const [config, readme, guide, publicHtml] = await Promise.all([
    readText('.pages.yml'),
    readText('README.md'),
    readText('docs/pages-cms.md'),
    readText('index.html'),
  ]);

  assert.match(config, /^media:\r?\n  input: assets\/images\/uploads$/m);
  assert.match(config, /^\s{2}output: \/assets\/images\/uploads$/m);
  assert.match(config, /^\s{2}categories:\r?\n\s{4}- image$/m);
  assert.match(config, /^\s{2}rename: safe$/m);
  assert.match(config, /^settings:\r?\n  content:\r?\n    merge: true$/m);
  assert.match(readme, /https:\/\/app\.pagescms\.org\//);
  assert.match(readme, /docs\/pages-cms\.md/);
  assert.match(guide, /^# Pages CMS editor guide$/m);
  assert.match(guide, /assets\/images\/uploads\//);
  assert.doesNotMatch(publicHtml, /confirmation_token|email_change_token|recovery_token/);
  await access(fromRoot('assets', 'images', 'uploads'));
});

test('Pages CMS exposes structured Modathon authors as modder selections and booleans', async () => {
  const config = await readText('.pages.yml');
  const collection = config.match(
    /      - name: modathon_mods[\s\S]*?(?=\r?\n      - name: modathon_achievements)/,
  )?.[0];
  const authors = collection?.match(
    /          - name: authors[\s\S]*?(?=\r?\n          - name: category)/,
  )?.[0];

  assert.ok(collection, 'Pages CMS Modathon Mods collection must exist');
  assert.ok(authors, 'Pages CMS Modathon authors field must exist');
  assert.match(collection, /search:[\s\S]*?- authors\.name/);
  assert.match(authors, /type: object/);
  assert.match(authors, /summary: "\{name\}"/);
  assert.match(
    authors,
    /name: name[\s\S]*?type: reference[\s\S]*?collection: modders[\s\S]*?value: "\{fields\.name\}"[\s\S]*?label: "\{fields\.name\}"/,
  );
  assert.match(
    authors,
    /name: contributed[\s\S]*?label: Directly contributed[\s\S]*?type: boolean[\s\S]*?required: true[\s\S]*?default: true/,
  );
  assert.doesNotMatch(authors, /type: string\r?\n\s+list: true/);
});

test('Pages CMS uses constrained selectors, generated event metadata, datetimes, and nested sources', async () => {
  const config = await readText('.pages.yml');
  const block = (name, nextName) => config.match(
    new RegExp(`      - name: ${name}[\\s\\S]*?(?=\\r?\\n      - name: ${nextName})`),
  )?.[0];
  const modathonMods = block('modathon_mods', 'modathon_achievements');
  const achievements = block('modathon_achievements', 'modathon_events');
  const modathonEvents = config.match(
    /      - name: modathon_events[\s\S]*?(?=\r?\n  - name: madness_group)/,
  )?.[0];
  const madnessEvents = block('madness_events', 'madness_mods');
  const madnessMods = block('madness_mods', 'madness_teams');
  const modjamMods = block('modjam_mods', 'modjam_events');
  const modjamEvents = block('modjam_events', 'modjam_postcards');

  for (const [label, collection] of Object.entries({
    modathonMods,
    achievements,
    modathonEvents,
    madnessEvents,
    madnessMods,
    modjamMods,
    modjamEvents,
  })) {
    assert.ok(collection, `${label} Pages CMS block must exist`);
  }

  assert.match(modathonMods, /name: category\r?\n\s+label: Category\r?\n\s+type: select/);
  assert.match(achievements, /subfolders: true/);
  for (const field of ['rarity', 'rarityKey', 'group']) {
    assert.match(
      achievements,
      new RegExp(`name: ${field}\\r?\\n\\s+label:[^\\r\\n]+\\r?\\n\\s+type: select`),
    );
  }
  assert.match(
    achievements,
    /name: unlockedBy[\s\S]*?type: reference[\s\S]*?collection: modders[\s\S]*?multiple: true/,
  );

  assert.match(modathonEvents, /type: collection/);
  assert.match(modathonEvents, /path: content\/modathon\/events/);
  assert.doesNotMatch(modathonEvents, /^\s{10}- name: name$/m);
  assert.equal((modathonEvents.match(/type: date/g) || []).length, 4);
  assert.equal((modathonEvents.match(/time: true/g) || []).length, 4);

  assert.doesNotMatch(madnessEvents, /^\s{10}- name: name$/m);
  assert.equal((madnessEvents.match(/type: date/g) || []).length, 4);
  assert.match(madnessMods, /subfolders: true/);
  assert.match(
    madnessMods,
    /name: team[\s\S]*?type: reference[\s\S]*?collection: madness_teams/,
  );
  assert.match(madnessMods, /name: category\r?\n\s+label: Category\r?\n\s+type: select/);
  assert.match(madnessMods, /name: themeId[\s\S]*?type: select/);
  assert.match(modjamEvents, /type: collection/);
  assert.match(modjamEvents, /path: content\/modjam\/events/);
  for (const field of ['id', 'label', 'name']) {
    assert.doesNotMatch(modjamEvents, new RegExp(`^\\s{10}- name: ${field}$`, 'm'));
  }
  assert.equal((modjamEvents.match(/type: date/g) || []).length, 3);
  assert.match(modjamMods, /subfolders: true/);
  assert.match(
    modjamMods,
    /name: eventId[\s\S]*?type: reference[\s\S]*?collection: modjam_events/,
  );
  assert.doesNotMatch(modjamMods, /^\s{10}- name: id$/m);
  assert.match(modjamMods, /name: category\r?\n\s+label: Category\r?\n\s+type: select/);
  for (const [label, collection] of Object.entries({
    modathonMods,
    madnessMods,
    modjamMods,
  })) {
    const showcaseField = collection.match(
      /          - name: showcaseUrl[\s\S]*?(?=\r?\n {6}(?: {4})?- name:|$)/,
    )?.[0];
    assert.ok(showcaseField, `${label} must expose a showcase URL field`);
    assert.match(showcaseField, /type: string\r?\n\s+required: false/);
    assert.match(showcaseField, /pattern:\r?\n\s+regex: "\^https:\/\//);
    assert.match(showcaseField, /youtube\\\\\.com/);
    assert.match(showcaseField, /youtu\\\\\.be/);
    assert.match(showcaseField, /message: "Paste a valid HTTPS YouTube/);
  }
});

test('main pushes build and validate only in the deployment workflow', async () => {
  const [validationWorkflow, deploymentWorkflow] = await Promise.all([
    readText('.github/workflows/validate-site.yml'),
    readText('.github/workflows/deploy-pages.yml'),
  ]);

  assert.match(
    validationWorkflow,
    /push:\r?\n\s+branches-ignore:\r?\n\s+- main/,
  );
  assert.match(deploymentWorkflow, /push:\r?\n\s+branches:\r?\n\s+- main/);
  assert.match(deploymentWorkflow, /npm run content:build[\s\S]*npm run content:check[\s\S]*npm test/);
});

test('Modathon achievements use the Pages CMS year-folder filename template', async () => {
  const config = await readText('.pages.yml');
  const collection = config.match(
    /      - name: modathon_achievements[\s\S]*?(?=\r?\n      - name: modathon_events)/,
  )?.[0];

  assert.ok(collection, 'Modathon Achievements config block must exist');
  assert.match(collection, /^\s{8}path: content\/modathon\/achievements$/m);
  assert.match(collection, /^\s{8}subfolders: true$/m);
  assert.match(collection, /^\s{8}filename: "\{fields\.year\}-\{fields\.id\}\.json"$/m);
  assert.equal(achievementSourceFileNames.length > 0, true, 'achievement collection must not be empty');

  for (const fileName of achievementSourceFileNames) {
    const source = await readJson(`content/modathon/achievements/${fileName}`);
    assert.equal(fileName, `${source.year}/${source.year}-${source.id}.json`);
  }
});

test('Madness theme lists are expanded and every event source owns an editable array', async () => {
  const config = await readText('.pages.yml');
  const madnessConfig = config.match(
    /      - name: madness_events[\s\S]*?(?=\r?\n      - name: madness_mods)/,
  )?.[0];
  const themesField = madnessConfig?.match(
    /          - name: themes[\s\S]*?(?=\r?\n          - name: countdown)/,
  )?.[0];

  assert.ok(themesField, 'Madness themes field must exist');
  assert.match(themesField, /^\s{12}type: object$/m);
  assert.match(themesField, /^\s{12}list:\r?\n\s{14}collapsible: false$/m);
  for (const field of ['id', 'name', 'weekStart', 'weekEnd']) {
    assert.match(themesField, new RegExp(`^\\s{14}- name: ${field}$`, 'm'));
  }

  const eventFileNames = (await readdir(fromRoot('content', 'madness', 'events')))
    .filter(fileName => path.extname(fileName) === '.json')
    .sort();
  for (const fileName of eventFileNames) {
    const event = await readJson(`content/madness/events/${fileName}`);
    assert.equal(Object.hasOwn(event, 'themes'), true, `${fileName} must store themes`);
    assert.equal(Array.isArray(event.themes), true, `${fileName}.themes must be an array`);
  }
  assert.deepEqual((await readJson('content/madness/events/2026.json')).themes, []);
});

test('ModJam collection labels resolve to title without event ID prefixes', async () => {
  const config = await readText('.pages.yml');
  const collection = config.match(
    /      - name: modjam_mods[\s\S]*?(?=\r?\n      - name: modjam_events)/,
  )?.[0];
  assert.ok(collection, 'ModJam Mods config block must exist');
  assert.match(
    collection,
    /^\s{8}view:\r?\n\s{10}fields:\r?\n\s{12}- title\r?\n\s{10}primary: title$/m,
  );

  for (const fileName of modjamSourceFileNames) {
    const record = await readJson(`content/modjam/mods/${fileName}`);
    assertNonEmptyString(record.title, `${fileName}.title`);
  }
});

test('Modathon submissions match every configured stored type', async () => {
  const snapshot = await readJson('modathon/assets/data/modathon-mods.json');
  assert.deepEqual(Object.keys(snapshot), ['generated', 'game', 'mods']);
  assertNonEmptyString(snapshot.generated, 'snapshot.generated');
  assert.equal(Number.isNaN(Date.parse(snapshot.generated)), false);
  assert.equal(snapshot.game, 'morrowind');
  assert.deepEqual(
    Object.keys(snapshot.mods),
    Object.keys(snapshot.mods).slice().sort((left, right) => Number(left) - Number(right)),
  );

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
    'error',
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
        const authorContext = `${context}.authors[${authorIndex}]`;
        assertExactKeys(author, ['name', 'contributed'], authorContext);
        assertNonEmptyString(author.name, `${authorContext}.name`);
        assert.equal(typeof author.contributed, 'boolean', `${authorContext}.contributed must be boolean`);
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
        assertHttpUrl(submission.showcaseUrl, `${context}.showcaseUrl`);
      }
      if ('status' in submission) {
        assert.equal(Number.isInteger(submission.status), true, `${context}.status must be an integer`);
      }
    }
  }
});

test('Modjam event metadata and mods are stored in separate Pages CMS collections', async () => {
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
  assert.ok(archive.events.every(event => Array.isArray(event.themes)));
  assert.ok(modArchive.events.every(group => (
    Object.keys(group).join(',') === 'id,mods' && Array.isArray(group.mods)
  )));
  assert.ok(modArchive.events.every(group => (
    group.mods.every(mod => !Object.hasOwn(mod, 'themes'))
  )));
  assert.deepEqual(
    modArchive.events.map(group => group.id),
    archive.events.map(event => event.id),
  );
});

test('Modathon achievement files match the Pages CMS schema and derived counts', async () => {
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

  const sourcesByYear = new Map(achievementYears.map(year => [year, []]));
  for (const fileName of achievementSourceFileNames) {
    const source = await readJson(`content/modathon/achievements/${fileName}`);
    assertExactKeys(source, ['schemaVersion', 'year', ...allowedFields], fileName);
    assert.equal(source.schemaVersion, 1);
    assert.equal(fileName, `${source.year}/${source.year}-${source.id}.json`);
    const { schemaVersion: _schemaVersion, year: _year, ...achievement } = source;
    const sourceAchievements = sourcesByYear.get(source.year);
    assert.ok(sourceAchievements, `${fileName} must belong to a configured Modathon year`);
    sourceAchievements.push(achievement);
  }

  for (const year of achievementYears) {
    const sourceAchievements = sourcesByYear.get(year);
    const relativePath = `modathon/assets/data/${year}-achievements.json`;
    const data = await readJson(relativePath);
    assert.deepEqual(Object.keys(data), ['schemaVersion', 'event', 'achievements']);
    assert.equal(data.schemaVersion, 1);
    assert.deepEqual(data.event, { name: 'Morrowind Modathon', year });
    assert.deepEqual(data.achievements, sourceAchievements);
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

test('Pages CMS-managed JSON is canonical two-space UTF-8 data with value-stable round trips', async () => {
  const madnessEventSourcePaths = (await readdir(fromRoot('content', 'madness', 'events')))
    .filter(fileName => path.extname(fileName) === '.json')
    .map(fileName => `content/madness/events/${fileName}`);
  const relativePaths = [
    'modathon/assets/data/modathon-event.json',
    'madness/data/madness-event.json',
    'modjam/data/modjam-event.json',
    'modathon/assets/data/modathon-mods.json',
    ...madnessEventSourcePaths,
    ...achievementSourcePaths,
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

test('existing loaders remain intact and GitHub Pages builds compatibility JSON', async () => {
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
  assert.match(readme, /choose \*\*GitHub Actions\*\* as the source/);
  assert.equal(cname.trim(), 'darkelfmodding.com');
  await access(fromRoot('.nojekyll'));
  await access(fromRoot('.github', 'workflows', 'validate-site.yml'));
  await access(fromRoot('.github', 'workflows', 'deploy-pages.yml'));
  await access(fromRoot('scripts', 'build-content.mjs'));
  await access(fromRoot('scripts', 'validate-content.mjs'));
});
