import assert from 'node:assert/strict';
import test from 'node:test';
import titleApi from '../modathon/title-system.js';

const config = {
  selection: { strategy: 'highest-priority' },
  focuses: {
    mods: { type: 'total-mods' },
  },
  qualifierAxes: [{
    id: 'output',
    label: 'Output',
    qualifiers: [{
      id: 'prolific',
      name: 'Prolific',
      requirements: [{ focus: 'mods', count: 1 }],
    }],
  }],
  titles: [
    {
      id: 'journeyman',
      name: 'Journeyman',
      priority: 10,
      requirements: [{ focus: 'mods', count: 1 }],
    },
    {
      id: 'master',
      name: 'Master',
      priority: 20,
      requirements: [{ focus: 'mods', count: 2 }],
    },
  ],
};

test('displays only the highest-priority eligible title', () => {
  const result = titleApi.evaluate(config, { mods: [{}, {}] });

  assert.equal(result.selected?.name, 'Master');
  assert.deepEqual(result.eligible.map(title => title.name), ['Master', 'Journeyman']);
  assert.deepEqual(result.qualifiers.map(qualifier => qualifier.name), ['Prolific']);
  assert.equal(result.displayName, 'Master');
});

test('falls back to a lower-priority title when its unlock criteria are the only match', () => {
  const result = titleApi.evaluate(config, { mods: [{}] });

  assert.equal(result.selected?.name, 'Journeyman');
  assert.equal(result.displayName, 'Journeyman');
});

test('displays no title when no unlock criteria match', () => {
  const result = titleApi.evaluate(config, { mods: [] });

  assert.equal(result.selected, null);
  assert.equal(result.displayName, '');
});

test('describes a title\'s criteria in human-readable text', () => {
  assert.equal(
    titleApi.criteriaDescription({ sourceFocuses: ['2+ Quest Mods', 'Dungeon Mods'] }),
    'Requires both: 2+ Quest Mods and Dungeon Mods.',
  );
  assert.equal(
    titleApi.criteriaDescription({ sourceFocuses: ['Any Championship Achievement'] }),
    'Requires: Any Championship Achievement.',
  );
  assert.equal(titleApi.criteriaDescription({}), '');
});
