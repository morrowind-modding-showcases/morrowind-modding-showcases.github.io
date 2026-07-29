import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [indexSource, styleSource, modjamBadge, madnessBadge] = await Promise.all([
  readFile(new URL('../modathon/index.html', import.meta.url), 'utf8'),
  readFile(new URL('../modathon/style.css', import.meta.url), 'utf8'),
  readFile(new URL(
    '../modathon/assets/images/participation/participant-modjam.png',
    import.meta.url,
  )),
  readFile(new URL(
    '../modathon/assets/images/participation/participant-madness.png',
    import.meta.url,
  )),
]);

test('Modathon participation badge assets are compact 256px PNG masks', () => {
  for (const [name, badge] of [
    ['participant-modjam.png', modjamBadge],
    ['participant-madness.png', madnessBadge],
  ]) {
    assert.equal(badge.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(badge.readUInt32BE(16), 256, `${name} width`);
    assert.equal(badge.readUInt32BE(20), 256, `${name} height`);
    assert.ok(badge.length < 20_000, `${name} is ${badge.length} bytes`);
  }
});

test('Modathon profiles show icon-only badges for matching cross-event profiles', () => {
  assert.match(indexSource, /hasParticipationBadges: !!\(rec\.modjamProfileUrl \|\| rec\.madnessProfileUrl\)/);
  assert.match(
    indexSource,
    /class="participation-badge participation-badge--modjam" role="img" aria-label="ModJam participant" title="ModJam participant"><\/span>/,
  );
  assert.match(
    indexSource,
    /class="participation-badge participation-badge--madness" role="img" aria-label="Madness participant" title="Madness participant"><\/span>/,
  );
  assert.match(
    styleSource,
    /mask-image: url\("assets\/images\/participation\/participant-modjam\.png"\)/,
  );
  assert.match(
    styleSource,
    /mask-image: url\("assets\/images\/participation\/participant-madness\.png"\)/,
  );
  assert.match(
    styleSource,
    /linear-gradient\(\s*90deg,\s*var\(--participation-modjam-start\) 0 50%,\s*var\(--participation-modjam-end\) 50% 100%/,
  );
  assert.match(styleSource, /body\.night[\s\S]*?--participation-modjam-start: #91c8e6/);
  assert.match(styleSource, /body\.night[\s\S]*?--participation-madness: #e8b23a/);
});

test('downloaded Modder Cards tint and place the same participation masks', () => {
  assert.match(
    indexSource,
    /src: 'assets\/images\/participation\/participant-modjam\.png'/,
  );
  assert.match(
    indexSource,
    /src: 'assets\/images\/participation\/participant-madness\.png'/,
  );
  assert.match(indexSource, /const participationBadgeSize = 50 \* S/);
  assert.match(indexSource, /const participationBadgeRight = 478 \* S/);
  assert.match(indexSource, /drawTintedMask\([\s\S]*?49 \* S/);
  assert.match(indexSource, /createLinearGradient\(0, 0, w, 0\)/);
  assert.equal(
    [...indexSource.matchAll(/fill\.addColorStop\(0\.5, colors\[[01]\]\)/g)].length,
    2,
  );
});
