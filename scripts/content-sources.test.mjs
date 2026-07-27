import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  GENERATED_MODDERS_PATH,
  GENERATED_MODS_PATH,
  assertLosslessBuild,
  buildContentDocuments,
  canonicalJson,
  loadContentSources,
  validateGeneratedDocuments,
} from './content-lib.mjs';

test('per-record content rebuilds the checked-in compatibility data losslessly', async () => {
  const sources = await loadContentSources();
  const documents = buildContentDocuments(sources);
  validateGeneratedDocuments(documents.modsDocument, documents.moddersDocument);
  assertLosslessBuild(sources, documents);

  assert.equal(sources.modFiles.length, 1941);
  assert.equal(sources.modderFiles.length, 616);
  assert.deepEqual(
    Object.fromEntries([...sources.modsByYear].map(([year, mods]) => [year, mods.length])),
    {
      2015: 15,
      2016: 29,
      2017: 29,
      2018: 89,
      2019: 240,
      2020: 226,
      2021: 236,
      2022: 300,
      2023: 186,
      2024: 173,
      2025: 179,
      2026: 239,
    },
  );

  const [generatedMods, generatedModders] = await Promise.all([
    readFile(GENERATED_MODS_PATH, 'utf8'),
    readFile(GENERATED_MODDERS_PATH, 'utf8'),
  ]);
  assert.equal(generatedMods.replaceAll('\r\n', '\n'), canonicalJson(documents.modsDocument));
  assert.equal(generatedModders.replaceAll('\r\n', '\n'), canonicalJson(documents.moddersDocument));
});

test('content validation rejects duplicate IDs and broken author references', () => {
  const validMod = {
    name: 'Example',
    authors: ['Known Author'],
    category: 'Unknown',
    url: 'https://example.com/mod',
  };
  const validModder = {
    id: 'known-author',
    name: 'Known Author',
  };
  const modsDocument = {
    generated: '2026-07-27T00:00:00.000Z',
    game: 'morrowind',
    mods: { 2026: [validMod] },
  };

  assert.throws(
    () => validateGeneratedDocuments(
      modsDocument,
      { modders: [validModder, structuredClone(validModder)] },
      'fixture',
    ),
    /duplicates stable ID "known-author"/,
  );
  assert.throws(
    () => validateGeneratedDocuments(
      {
        ...modsDocument,
        mods: { 2026: [{ ...validMod, authors: ['Missing Author'] }] },
      },
      { modders: [validModder] },
      'fixture',
    ),
    /does not resolve to a central modder name or alias/,
  );
});

