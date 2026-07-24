import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const rootIndex = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const modathonIndex = await readFile(new URL('../modathon/index.html', import.meta.url), 'utf8');
const modathonProfiles = JSON.parse(await readFile(
  new URL('../modathon/assets/data/modders.json', import.meta.url),
  'utf8',
)).modders;
const nexusSnapshot = JSON.parse(await readFile(
  new URL('../modathon/assets/data/nexus-stats.json', import.meta.url),
  'utf8',
));
const modjamProfiles = JSON.parse(await readFile(
  new URL('../modjam/data/modders.json', import.meta.url),
  'utf8',
)).modders;
const modjamJudges = JSON.parse(await readFile(
  new URL('../modjam/data/judges.json', import.meta.url),
  'utf8',
)).judges;
const madnessProfiles = JSON.parse(await readFile(
  new URL('../madness/data/modders.json', import.meta.url),
  'utf8',
));

const achievementsByYear = new Map();
for (const year of [2020, 2021, 2022, 2023, 2025, 2026]) {
  achievementsByYear.set(year, JSON.parse(await readFile(
    new URL(`../modathon/assets/data/${year}-achievements.json`, import.meta.url),
    'utf8',
  )).achievements);
}

async function componentClass() {
  const script = modathonIndex.match(/<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script, 'Modathon component script is missing');
  const context = { DCLogic: class {}, console, Date, Map, Set, URL };
  vm.runInNewContext(`${script}\nthis.ModathonComponent = Component;`, context);
  return context.ModathonComponent;
}

const profileByName = new Map(modathonProfiles.map(profile => [profile.name.toLowerCase(), profile]));
const allMods = Object.values(nexusSnapshot.mods).flat();
const modById = new Map(allMods.map(mod => [
  mod.url.match(/\/mods\/(\d+)/)?.[1],
  mod,
]));

test('landing page uses the working favicon and the correct channel launch year', async () => {
  assert.match(rootIndex, /<link rel="icon" href="\/assets\/images\/icon\.png">/);
  assert.match(rootIndex, /showcased since 2014/);
  assert.doesNotMatch(rootIndex, /showcased since 2015/);

  const favicon = await readFile(new URL('../assets/images/icon.png', import.meta.url));
  assert.ok(favicon.length > 0);
});

test('all reported missing Modathon profiles include their Nexus link and avatar', () => {
  const expected = [
    ['Testman', 'testman4242', '37765300'],
    ['Diomes2', 'diomes2', '4905081'],
    ['HedgeHog12', 'hedgehog12', '468930'],
    ['OEA', 'opiter09', '78471733'],
    ['Cybernyde', 'cybernyde', '46403467'],
    ['Drackolus', 'drackolus', '467291'],
    ['ThatGuar', 'thatguar', '90826678'],
    ['Thinuviel', 'cpassuel', '22502184'],
    ['Brujoloco', 'brujoloco', '975436'],
    ['Tenner', 'tennermech', '91215733'],
    ['APSS SPECTRUM', 'shackledessence', '5259483'],
    ['Mothpot', 'mothpot', '81877958'],
    ['Dmettler', 'dmettler182', '33972235'],
    ['millerMill', 'millermill', '84643313'],
    ['Ezze', 'zdswulyx2', '66357466'],
    ['Rookie from Rendor', 'sierra102', '1295472'],
    ['PurplePrankster101', 'purpleprankster101', '36829300'],
    ['A Raven of Many Hats', 'aravenofmanyhats', '7521165'],
    ['Friendofscribs', 'kingofcramers', '99191353'],
    ['Griefexe', 'griefexe', '68204447'],
    ['Bahamut', 'saintbahamut', '16999994'],
    ['CaptainArbiter', 'captainarbiter', '39093965'],
    ['Skyline777123123123', 'skyline777123123123', '79966283'],
    ['Messenian', 'messenian', '49963866'],
    ['Varil', 'micros24', '47793888'],
    ['Kappabird', 'kappabird', '755174'],
  ];

  for (const [name, nexusUser, avatarId] of expected) {
    const profile = profileByName.get(name.toLowerCase());
    assert.ok(profile, `${name} is missing`);
    assert.equal(new URL(profile.url).pathname.toLowerCase(), `/profile/${nexusUser}`);
    assert.equal(profile.avatar, `https://avatars.nexusmods.com/${avatarId}/100`);
  }
});

test('reported alternate names resolve to one canonical Modathon profile', () => {
  const expectedAliases = new Map([
    ['HedgeHog12', ['EJ12', 'EJ-12', 'HH-12']],
    ['TaiyakaJade', ['Taiyaka']],
    ['PikachunoTM', ['Pika']],
    ['Revacholiere', ['Revacholierex2']],
    ['AliceL93', ['Gavirlo93']],
    ['Come', ['Come Besnier']],
    ['Istreddify', ['Cyprinus']],
    ['DaisyHasACat', ['Wiz1']],
    ['AnDE aka Odeyalov', ['AnDe']],
    ['Axelgustavlevi', ['axelgustavlevi123']],
    ['Krobotnik', ['krobotkin']],
  ]);

  for (const [canonicalName, aliases] of expectedAliases) {
    const profile = profileByName.get(canonicalName.toLowerCase());
    assert.ok(profile, `${canonicalName} is missing`);
    for (const alias of aliases) {
      assert.ok(profile.aliases?.some(value => value.toLowerCase() === alias.toLowerCase()), `${alias} is not an alias of ${canonicalName}`);
      assert.equal(profileByName.has(alias.toLowerCase()), false, `${alias} should not be a separate profile`);
    }
  }
});

test('reported Modathon submissions attach to the correct profiles without attaching Mark_K_Marcell to Mark', async () => {
  const Component = await componentClass();
  const component = new Component();
  const profileAliases = profile => {
    const profileUser = String(profile.url || '').match(/\/profile\/([^?/#]+)/i)?.[1] || '';
    return [...new Set([profile.name, profileUser, ...(profile.aliases || [])]
      .map(value => component.normalizeAuthor(value))
      .filter(Boolean))];
  };
  const associations = [
    ['48220', 'Testman'],
    ['53008', 'Diomes2'],
    ['45741', 'HedgeHog12'],
    ['48120', 'OEA'],
    ['48140', 'Cybernyde'],
    ['48195', 'Drackolus'],
    ['48242', 'ThatGuar'],
    ['48215', 'ThatGuar'],
    ['48283', 'ThatGuar'],
    ['48254', 'Thinuviel'],
    ['48241', 'Brujoloco'],
    ['48204', 'Tenner'],
    ['48194', 'APSS SPECTRUM'],
    ['47978', 'Mothpot'],
    ['48191', 'Dmettler'],
    ['49760', 'millerMill'],
    ['49880', 'Ezze'],
    ['49903', 'Rookie from Rendor'],
    ['49785', 'PurplePrankster101'],
    ['49919', 'A Raven of Many Hats'],
    ['49867', 'A Raven of Many Hats'],
    ['49907', 'A Raven of Many Hats'],
    ['49891', 'A Raven of Many Hats'],
    ['49877', 'Friendofscribs'],
    ['49843', 'Griefexe'],
    ['49866', 'Bahamut'],
    ['49902', 'CaptainArbiter'],
    ['49814', 'CaptainArbiter'],
    ['49842', 'CaptainArbiter'],
    ['49679', 'Skyline777123123123'],
    ['56674', 'Messenian'],
    ['51369', 'Varil'],
    ['51428', 'Kappabird'],
    ['52916', 'Pavel'],
    ['51074', 'Instanity'],
    ['45615', 'RestGivenFreely'],
    ['46802', 'Bhhorton'],
    ['46857', 'Bhhorton'],
    ['54001', 'ReachHeavenByViolence'],
    ['49700', 'Stripes'],
    ['51154', 'SleepyMoonMoth'],
    ['51187', 'K1ngCraft'],
    ['48097', 'Krobotnik'],
  ];

  for (const [modId, profileName] of associations) {
    const mod = modById.get(modId);
    const profile = profileByName.get(profileName.toLowerCase());
    assert.ok(mod, `mod ${modId} is missing`);
    assert.ok(profile, `${profileName} is missing`);
    assert.ok(
      mod.authors.some(author => component.matchesAuthor(author, profileAliases(profile))),
      `${mod.name} is not attached to ${profileName}`,
    );
  }

  const mark = profileByName.get('mark');
  const balursFarmhouse = modById.get('56466');
  assert.ok(mark && balursFarmhouse);
  assert.ok(
    balursFarmhouse.authors.every(author => !component.matchesAuthor(author, profileAliases(mark))),
    'Mark should not receive Mark_K_Marcell submissions',
  );

  const danae = profileByName.get('danae');
  assert.ok(
    component.matchesAuthor('Aurel Danae', profileAliases(danae)),
    'short established names should still match unambiguous multi-author credits',
  );
});

test('reported achievement artwork is linked to valid WebP files', async () => {
  const expected = new Map([
    [2020, [
      'cluttermonkey',
      'meow',
      'fetcher',
      'chance-s-folly',
      'the-people-s-choice',
      'numbers-matter',
      'army-of-one',
      'master-of-madness',
      'panel-pleaser',
      'emperor-king-and-justice',
      'a-show-of-power',
      'lesh-make-a-deal',
    ]],
    [2021, ['oneness', 'cloudcleaver', 'cluttermonkey', 'a-warrior-s-legacy']],
    [2022, ['exterminator', 'meow', 'cluttermonkey']],
    [2023, ['cluttermonkey']],
  ]);

  for (const [year, ids] of expected) {
    const byId = new Map(achievementsByYear.get(year).map(achievement => [achievement.id, achievement]));
    for (const id of ids) {
      const achievement = byId.get(id);
      assert.ok(achievement?.imageUrl, `${year}/${id} has no image`);
      const image = await readFile(new URL(`../modathon/${achievement.imageUrl}`, import.meta.url));
      assert.equal(image.subarray(0, 4).toString('ascii'), 'RIFF');
      assert.equal(image.subarray(8, 12).toString('ascii'), 'WEBP');
    }
  }
});

test('achievement unlockers stay scoped to their source year', () => {
  const breathingWater2020 = achievementsByYear.get(2020)
    .find(achievement => achievement.id === 'breathing-water');
  const breathingWater2021 = achievementsByYear.get(2021)
    .find(achievement => achievement.id === 'breathing-water');

  assert.deepEqual(breathingWater2020.unlockedBy, []);
  assert.equal(breathingWater2020.unlockedCount, 0);
  assert.deepEqual(breathingWater2021.unlockedBy, ['Danae', 'XeroFoxx']);
  assert.equal(breathingWater2021.unlockedCount, 2);
});

test('locked hidden achievements do not reveal their names, descriptions, images, or search terms', async () => {
  const Component = await componentClass();
  const component = new Component();
  const pathfinder = achievementsByYear.get(2025).find(achievement => achievement.id === 'pathfinder');
  component.db = {
    years: [2025],
    yearData: { 2025: { achievements: [pathfinder] } },
    byKey: new Map(),
    unlockerIdByName: new Map(),
    participantsByYear: { 2025: 1 },
  };

  let values = component.achievementVals();
  assert.equal(values.achRows.length, 1);
  assert.equal(values.achRows[0].name, 'Hidden Achievement');
  assert.equal(values.achRows[0].req, '');
  assert.equal(values.achRows[0].img, '');
  assert.equal(values.achRows[0].hasImage, false);

  component.state.aq = 'Pathfinder';
  values = component.achievementVals();
  assert.equal(values.achRows.length, 0);
});

test('Modjam and Madness profiles include the reported cross-site links and avatars', () => {
  const jaceys = modjamProfiles.find(profile => profile.id === 'jaceys');
  const urm = modjamProfiles.find(profile => profile.id === 'urm');
  assert.equal(jaceys.nexusProfileUrl, 'https://www.nexusmods.com/profile/JaceyS');
  assert.equal(jaceys.avatarUrl, 'https://avatars.nexusmods.com/44686767/100');
  assert.equal(jaceys.modathonProfileUrl, 'https://darkelfmodding.com/modathon/modder/jaceys');
  assert.equal(jaceys.madnessProfileUrl, 'https://darkelfmodding.com/madness/modder?name=JaceyS');
  assert.equal(urm.nexusProfileUrl, 'https://www.nexusmods.com/profile/uramer');
  assert.equal(urm.avatarUrl, 'https://avatars.nexusmods.com/4513134/100');
  assert.equal(urm.modathonProfileUrl, 'https://darkelfmodding.com/modathon/modder/urm');

  const narangren = modjamJudges.find(judge => judge.modderId === 'narangren-tirthallion');
  const ej12 = modjamJudges.find(judge => judge.modderId === 'hj-12');
  assert.equal(narangren.avatarUrl, 'https://avatars.nexusmods.com/174854925/100');
  assert.equal(ej12.nexusProfileUrl, 'https://www.nexusmods.com/profile/HedgeHog12?gameId=100');
  assert.equal(ej12.avatarUrl, 'https://avatars.nexusmods.com/468930/100');

  const lordZarcon = madnessProfiles.find(profile => profile.name === 'Lord Zarcon');
  assert.equal(lordZarcon.modathonProfile, 'https://darkelfmodding.com/modathon/modder/lord-zarcon');
});
