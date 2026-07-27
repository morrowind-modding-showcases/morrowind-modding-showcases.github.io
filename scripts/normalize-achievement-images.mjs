import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(repoRoot, 'content', 'modathon', 'achievements');
const imageRoot = path.join(repoRoot, 'modathon', 'assets', 'images', 'achievements');

const aliases = new Map([
  ['2018:betterbringatorch', 'better-take-a-torch'],
  ['2019:theimnportanceofwhere', 'the-importance-of-where'],
  ['2020:thechoiceisyours', 'the-choice-is-yours'],
  ['2021:ofcourseimanexpert', 'of-course-i-m-an-expert'],
  ['2022:ofcourseimanexpert', 'of-course-i-m-an-expert'],
  ['2024:adventruesawait', 'adventures-await'],
  ['2024:dreamsandvisons', 'dreams-and-visions'],
  ['2025:partiesbetrayal', 'parties-betrayals'],
  ['2026:intheeyesofthedivines', 'in-the-eyes-of-the-divine'],
]);

const normalize = value => String(value || '')
  .normalize('NFKD')
  .toLowerCase()
  .replace(/[^a-z0-9]/g, '');

const stripDecorators = value => value.replace(
  /^(?:challenge-super|hidden-super|challengesuper|hiddensuper|category|challenge|mastery|hidden|bronze|silver|metric|gold|com)[_-]/i,
  '',
);

const allAchievementFiles = fs.readdirSync(dataDir, { withFileTypes: true })
  .filter(entry => entry.isFile() && path.extname(entry.name) === '.json')
  .map((entry) => {
    const filePath = path.join(dataDir, entry.name);
    const achievement = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (entry.name !== `${achievement.year}-${achievement.id}.json`) {
      throw new Error(
        `${entry.name} must match achievement year and ID `
        + `"${achievement.year}-${achievement.id}.json"`,
      );
    }
    return { filePath, achievement };
  });
const achievementsByYear = new Map();
for (const record of allAchievementFiles) {
  const year = String(record.achievement.year);
  const records = achievementsByYear.get(year) || [];
  records.push(record);
  achievementsByYear.set(year, records);
}
const years = [...achievementsByYear.keys()].sort();

let renamedCount = 0;
let linkedCount = 0;

for (const year of years) {
  const achievementFiles = achievementsByYear.get(year)
    .sort((left, right) => left.filePath.localeCompare(right.filePath));
  if (!achievementFiles.length) continue;
  const achievements = achievementFiles.map(record => record.achievement);
  const sourceById = new Map(achievementFiles.map(record => [record.achievement.id, record]));
  const byId = new Map(achievements.map(achievement => [achievement.id, achievement]));
  const byKey = new Map();

  for (const achievement of achievements) {
    for (const key of new Set([normalize(achievement.id), normalize(achievement.name)])) {
      const matches = byKey.get(key) || [];
      matches.push(achievement);
      byKey.set(key, matches);
    }
  }

  const yearDir = path.join(imageRoot, year);
  const images = fs.readdirSync(yearDir).filter(name => /\.(?:png|webp)$/i.test(name));
  const planned = [];
  const localAchievementFiles = new Map();
  const unresolved = [];

  for (const image of images) {
    const extension = path.extname(image).toLowerCase();
    const rawStem = path.parse(image).name;
    const variantMatch = rawStem.match(/[-_](blur|full)$/i);
    const variant = variantMatch?.[1].toLowerCase() || '';
    const stem = variantMatch ? rawStem.slice(0, -variantMatch[0].length) : rawStem;
    const keys = [...new Set([normalize(stem), normalize(stripDecorators(stem))])];
    const aliasId = keys.map(key => aliases.get(`${year}:${key}`)).find(Boolean);
    const matches = aliasId
      ? [byId.get(aliasId)].filter(Boolean)
      : (keys.map(key => byKey.get(key) || []).find(items => items.length) || []);

    let targetId = aliasId;
    if (matches.length === 1) targetId = matches[0].id;
    if (!targetId || matches.length > 1) {
      unresolved.push(image);
      continue;
    }

    const target = `${targetId}${variant ? `-${variant}` : ''}${extension}`;
    planned.push({ source: image, target });
    if (!variant && byId.has(targetId)) localAchievementFiles.set(targetId, target);
  }

  if (unresolved.length) {
    throw new Error(`Unresolved ${year} achievement images: ${unresolved.join(', ')}`);
  }

  const targets = new Set();
  for (const item of planned) {
    const key = item.target.toLowerCase();
    if (targets.has(key)) throw new Error(`Duplicate normalized filename in ${year}: ${item.target}`);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*\.(?:png|webp)$/.test(item.target)) {
      throw new Error(`Invalid normalized filename in ${year}: ${item.target}`);
    }
    targets.add(key);
  }

  const renames = planned.filter(item => item.source !== item.target);
  const temporaryRenames = renames.map((item, index) => ({
    ...item,
    temporary: `.achievement-rename-${process.pid}-${index}.tmp`,
  }));

  for (const item of temporaryRenames) {
    fs.renameSync(path.join(yearDir, item.source), path.join(yearDir, item.temporary));
  }
  for (const item of temporaryRenames) {
    fs.renameSync(path.join(yearDir, item.temporary), path.join(yearDir, item.target));
  }
  renamedCount += renames.length;

  for (const [id, imageFile] of localAchievementFiles) {
    const localUrl = `assets/images/achievements/${year}/${imageFile}`;
    const record = sourceById.get(id);
    if (!record) throw new Error(`Could not update imageUrl for ${year}/${id}`);
    if (record.achievement.imageUrl === localUrl) continue;
    record.achievement.imageUrl = localUrl;
    fs.writeFileSync(record.filePath, `${JSON.stringify(record.achievement, null, 2)}\n`, 'utf8');
    linkedCount += 1;
  }
}

console.log(`Normalized ${renamedCount} filenames and updated ${linkedCount} achievement image links.`);
