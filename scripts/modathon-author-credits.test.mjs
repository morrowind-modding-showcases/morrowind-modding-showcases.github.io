import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [stats, profiles] = await Promise.all([
  readFile(new URL('../modathon/assets/data/nexus-stats.json', import.meta.url), 'utf8').then(JSON.parse),
  readFile(new URL('../modathon/assets/data/modders.json', import.meta.url), 'utf8').then(JSON.parse),
]);

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
