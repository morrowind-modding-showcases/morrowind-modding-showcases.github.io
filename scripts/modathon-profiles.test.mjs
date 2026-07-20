import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const { modders } = JSON.parse(await readFile(
  new URL('../modathon/assets/data/modders.json', import.meta.url),
  'utf8',
));

const identityKey = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');

test('EJ-12, HH-12, and HedgeHog12 resolve to one Nexus profile', () => {
  const expectedAliases = ['EJ12', 'EJ-12', 'HH-12', 'HedgeHog12'];
  const profile = modders.find(modder => modder.name === 'HedgeHog12');

  assert.ok(profile);
  assert.equal(profile.url, 'https://www.nexusmods.com/profile/HedgeHog12');
  assert.equal(profile.avatar, 'https://avatars.nexusmods.com/468930/100');

  const profileNames = [profile.name, ...(profile.aliases || [])].map(identityKey);
  for (const alias of expectedAliases) {
    assert.ok(profileNames.includes(identityKey(alias)), `${alias} should resolve to HedgeHog12`);
  }
});
