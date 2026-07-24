import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { dcComponentFrom } from './test-helpers.mjs';

const [stats, profiles] = await Promise.all([
  readFile(new URL('../modathon/assets/data/nexus-stats.json', import.meta.url), 'utf8').then(JSON.parse),
  readFile(new URL('../modathon/assets/data/modders.json', import.meta.url), 'utf8').then(JSON.parse),
]);

const profileByName = new Map(
  profiles.modders.map(profile => [profile.name.toLowerCase(), profile]),
);
const modsById = new Map(
  Object.values(stats.mods).flat().map(mod => [
    mod.url.match(/\/mods\/(\d+)/)?.[1],
    mod,
  ]),
);

test('Modathon author fields contain one canonical identity per value', () => {
  const compositeAuthor = /\s-{1,}\s|\bwith (?:assistance|help) from\b/i;
  const deprecatedAuthorValues = new Set([
    'Danae CutthroatMods Neoptolemus',
    'Gwyn Hart -SleepyMoonMoth-',
    'Rikkyrik-Grumbling Vomit-AbbadoN33',
    'Adul Helios Daduke Danae',
    'Aleanne Pekka Danae',
    'Alice93',
    'Crankgorilla Danae',
    'DetailDevil Hemaris GrumblingVomit',
    'DisQualia Petethegoat Hrnchamd',
    'Elderscrolliangamer aka Publick Gamer',
    'Enclavekiller1',
    'FrummYonda Safebox',
    'Greywander EvilEye johnnyhostile mym PseudonymousRex',
    'Heinrich Ruffin Vangarr',
    'Hrnchamd NullCascade Danae',
    'Ivan Maksymiv aka Izendel',
    'Johanrosen aka Trancemaster_1988',
    'JosephMcKean Pharis Uncle Boss',
    'Juidius Xentao',
    'Korana Danae',
    'LiamMelloFarley',
    'NobuRed (Vegetto)',
    'Pseunomix Danae',
    'Sandman Danae Cognatogen Denina',
    'Stuporstar Danae',
    'TealPanda Danae',
    'Team Target Dummies',
    'tewlolow',
    'Tyddyner (Tyddy)',
    'Vaernis DonnerGott Danae',
    'Vegetto88',
    'VvardenfellStormSage Safebox',
    'Walker Horton (bhhorton)',
    'Waspinator1998',
    'XeroFoxx Danae',
    'lhyacinth ownlyme moonless',
  ]);

  for (const mods of Object.values(stats.mods)) {
    for (const mod of mods) {
      for (const author of mod.authors) {
        assert.doesNotMatch(author, compositeAuthor, `${mod.name} has a composite author`);
        assert.equal(
          deprecatedAuthorValues.has(author),
          false,
          `${mod.name} has a deprecated author value`,
        );
      }
    }
  }
});

test('historical multi-author credits resolve to their canonical identities', () => {
  const expected = new Map([
    ['46733', ['Remiros', 'Vtastek', 'Hrnchamd']],
    ['47772', ['Resdayn Revival Team', 'Zobator']],
    ['47978', ['The Heart of the Velothi Team', 'Mothpot']],
    ['49644', ['Vegetto', 'RandomPal']],
    ['49738', ['Vegetto', 'RandomPal']],
    ['49751', ['Tel Shadow', 'AliceL93']],
    ['49832', ['Vegetto', 'RandomPal']],
    ['51126', ['Lucevar', 'Safebox', 'Remiros']],
    ['52763', ['Danae', 'CutthroatMods', 'Neoptolemus']],
    ['52872', ['Merlord', 'Greatness7', 'Melchior Dahrk']],
    ['52890', ['Juidius', 'Stripes', 'Dr No']],
    ['53010', ['Naufragous77', 'Greatness7', 'Melchior Dahrk', 'Ruffin Vangarr', 'Tewlwolow']],
    ['53022', ['Katya Karrel', 'Ruffin Vangarr']],
    ['54525', ['AFFA', 'Greatness7', 'Melchior Dahrk']],
    ['54535', ['NullCascade', 'ButchAmy', 'Maars']],
    ['54573', ['DimNussens', 'Lucevar']],
    ['54580', ['GrumblingVomit', 'MassiveJuice']],
    ['54643', ['Maars', 'Mikeandike']],
    ['54660', ['GrumblingVomit', 'Markond', 'DimNussens']],
    ['54730', ['AFFA', 'Greatness7', 'Melchior Dahrk', 'Seelof']],
    ['54768', ['Irisie', 'AliceL93']],
    ['54777', ['GrumblingVomit', 'Markond', 'DimNussens', 'Kildozery']],
    ['54780', ['Juidius', 'Melchior Dahrk', 'Seelof']],
    ['55705', ['Kildozery', 'GrumblingVomit', 'DimNussens']],
    ['56480', ['DetailDevil', 'Merlord', 'jarizleifr']],
    ['56559', ['Milo van Mesdag', 'SleepyMoonMoth']],
    ['56564', ['Danae', 'Vennin']],
    ['56785', ['Svergy', 'Greatness7', 'Melchior Dahrk']],
    ['56830', ['GlitterGear', 'Storm Atronach']],
    ['58618', ['Rikkyrik', 'GrumblingVomit', 'AbbadoN33']],
    ['58875', ['AFFA']],
    ['44343', ['ElderscrollianGamer']],
    ['44336', ['EnclaveKiller']],
    ['46835', ['Bhhorton']],
    ['46829', ['Bradford', 'Bhhorton']],
    ['48136', ['Vegetto']],
    ['49839', ['Hrnchamd', 'NullCascade', 'Danae']],
    ['46695', ['Trancemaster_1988']],
    ['49668', ['Sandman', 'Danae', 'Cognatogen', 'Denina']],
    ['49693', ['Vaernis', 'DonnerGott', 'Danae']],
    ['49732', ['Aleanne', 'Pekka', 'Danae']],
    ['49746', ['Adul', 'Helios', 'Daduke', 'Danae']],
    ['497580', ['Korana', 'Danae']],
    ['49790', ['TealPanda', 'Danae']],
    ['49807', ['Crankgorilla', 'Danae']],
    ['49808', ['Stuporstar', 'Danae']],
    ['49913', ['VvardenfellStormSage', 'Safebox', 'Rubberman']],
    ['49783', ['XeroFoxx', 'Danae']],
    ['49618', ['Lucevar', 'AliceL93']],
    ['51063', ['FrummYonda', 'Safebox']],
    ['51144', ['Heinrich', 'Ruffin Vangarr', 'Caeris']],
    ['51057', ['Juidius']],
    ['51203', ['Juidius']],
    ['51343', ['Juidius']],
    ['51425', ['Juidius']],
    ['52997', ['Waspinator1988']],
    ['52966', ['GrumblingVomit', 'Vegetto']],
    ['53020', ['Waspinator1988']],
    ['52967', ['DisQualia', 'Petethegoat', 'Hrnchamd']],
    ['52765', ['Tyddy']],
    ['52766', ['Tyddy']],
    ['52782', ['Tyddy', 'Ravanna']],
    ['52791', ['Tyddy']],
    ['52744', ['Tyddy']],
    ['53003', ['JosephMcKean', 'Pharis', 'Uncle Boss']],
    ['54547', ['IvanMaksymiv']],
    ['56547', ['Amazin', 'Gnimbvs']],
    ['56693', ['Amazin', 'Gnimbvs']],
    ['56813', ['Pseunomix', 'Danae']],
    ['56815', ['Tewlwolow', 'monsterzeichner alias insicht']],
    ['58813', ['DetailDevil', 'Hemaris', 'GrumblingVomit']],
    ['58839', ['LiamMello']],
    ['58957', ['Greywander', 'EvilEye', 'johnnyhostile', 'mym', 'PseudonymousRex']],
    ['59113', ['LiamMello', 'Wareya']],
    ['59115', ['LiamMello']],
    ['59118', ['LiamMello']],
    ['59119', ['LiamMello']],
    ['59173', ['lhyacinth', 'ownlyme', '6moonless']],
    ['59224', ['LiamMello']],
  ]);

  for (const [modId, authors] of expected) {
    assert.deepEqual(modsById.get(modId)?.authors, authors, `mod ${modId} has incorrect authors`);
  }
});

test('newly separated authors and historical aliases have canonical profiles', () => {
  const byName = new Map(profiles.modders.map(profile => [profile.name, profile]));
  for (const name of [
    'CutthroatMods',
    'Neoptolemus',
    'jarizleifr',
    'Dr No',
    'Mikeandike',
    'AbbadoN33',
    'Resdayn Revival Team',
    'The Heart of the Velothi Team',
    'Adul',
    'Helios',
    'Daduke',
    'Aleanne',
    'Pekka',
    'Crankgorilla',
    'FishermanZeddy',
    'GayXenomorph',
    'Greywander',
    'mym',
    'Heinrich',
    'IvanMaksymiv',
    'Pharis',
    'Korana',
    'Sandman',
    'Cognatogen',
    'TealPanda',
    'Amazin',
    'Gnimbvs',
    'The Bean Team',
    'Vaernis',
    'DonnerGott',
    'YourNearestNeighbor',
  ]) {
    assert.ok(byName.has(name), `${name} is missing a profile`);
  }

  assert.ok(byName.get('AFFA').aliases.includes('Douglas Goodall'));
  assert.ok(byName.get('GrumblingVomit').aliases.includes('Grumbling Vomit'));
  assert.ok(byName.get('SleepyMoonMoth').aliases.includes('Gwyn Hart'));
  const aliases = new Map([
    ['AliceL93', 'Alice93'],
    ['Chim el-Abadal', 'Chim el-Adabal'],
    ['ElderscrollianGamer', 'Elderscrolliangamer aka Publick Gamer'],
    ['EnclaveKiller', 'Enclavekiller1'],
    ['FishermanZeddy', 'FishermanZeddy (Submission Deleted)'],
    ['GayXenomorph', 'GayXenoMorph (Submission Deleted)'],
    ['IvanMaksymiv', 'Ivan Maksymiv aka Izendel'],
    ['Trancemaster_1988', 'Johanrosen aka Trancemaster_1988'],
    ['Juidius', 'Juidius Xentao'],
    ['LiamMello', 'LiamMelloFarley'],
    ['Vegetto', 'NobuRed (Vegetto)'],
    ['Tewlwolow', 'tewlolow'],
    ['The Bean Team', 'The Bean Team (possibly DaBean?)'],
    ['Tyddy', 'Tyddyner (Tyddy)'],
    ['Bhhorton', 'Walker Horton (bhhorton)'],
    ['Waspinator1988', 'Waspinator1998'],
    ['Xero Foxx', 'XeroFoxx'],
    ['6moonless', 'moonless'],
    ['YourNearestNeighbor', 'YourNearestNeighbor (Submission Deleted)'],
  ]);
  for (const [name, alias] of aliases) {
    assert.ok(byName.get(name)?.aliases?.includes(alias), `${name} is missing alias ${alias}`);
  }

  assert.equal(byName.get('FishermanZeddy').url, 'https://www.nexusmods.com/profile/FishermanZeddy');
  assert.equal(byName.get('GayXenomorph').url, 'https://www.nexusmods.com/profile/heterophobe');
  assert.equal(byName.get('IvanMaksymiv').url, 'https://www.nexusmods.com/profile/IvanMaksymiv');
  assert.equal(byName.get('6moonless').url, 'https://www.nexusmods.com/profile/6moonless');
  assert.equal(byName.get('Waspinator1988').url, 'https://www.nexusmods.com/profile/Waspinator1998');
});

test('canonical Modathon profiles include the reported Nexus links and avatars', () => {
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

test('alternate names resolve to one canonical Modathon profile', () => {
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
      assert.ok(
        profile.aliases?.some(value => value.toLowerCase() === alias.toLowerCase()),
        `${alias} is not an alias of ${canonicalName}`,
      );
      assert.equal(
        profileByName.has(alias.toLowerCase()),
        false,
        `${alias} should not be a separate profile`,
      );
    }
  }
});

test('Modathon submissions attach to the correct canonical profiles', async () => {
  const { Component } = await dcComponentFrom('../modathon/index.html');
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
    const mod = modsById.get(modId);
    const profile = profileByName.get(profileName.toLowerCase());
    assert.ok(mod, `mod ${modId} is missing`);
    assert.ok(profile, `${profileName} is missing`);
    assert.ok(
      mod.authors.some(author => component.matchesAuthor(author, profileAliases(profile))),
      `${mod.name} is not attached to ${profileName}`,
    );
  }

  const mark = profileByName.get('mark');
  const balursFarmhouse = modsById.get('56466');
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
