#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const [, , entriesSource, moddersSource, requestedOutputDir = 'modjam/data'] = process.argv;

if (!entriesSource || !moddersSource) {
  console.error('Usage: node scripts/convert-modjam-data.mjs <entries.html> <modders.html> [output-directory]');
  process.exit(1);
}

const outputDir = path.resolve(requestedOutputDir);

function decodeHtml(value) {
  const named = {
    amp: '&', apos: "'", gt: '>', lt: '<', nbsp: ' ', quot: '"',
    ndash: '–', mdash: '—', hellip: '…', rsquo: '’', lsquo: '‘',
    rdquo: '”', ldquo: '“'
  };

  return value.replace(/&(#(?:x[0-9a-f]+|\d+)|[a-z]+);/gi, (entity, key) => {
    if (key[0] === '#') {
      const hexadecimal = key[1].toLowerCase() === 'x';
      const number = Number.parseInt(key.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
      return Number.isFinite(number) ? String.fromCodePoint(number) : entity;
    }
    return named[key.toLowerCase()] ?? entity;
  });
}

function cleanText(fragment) {
  return decodeHtml(fragment
    .replace(/<br\s*\/?\s*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\s+/g, ' ')
    .trim();
}

function parseRows(html) {
  return [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((rowMatch) => {
    const cells = [...rowMatch[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cellMatch) => ({
      text: cleanText(cellMatch[1]),
      links: [...cellMatch[1].matchAll(/<a\b[^>]*href=(?:"([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/a>/gi)].map((linkMatch) => ({
        href: decodeHtml(linkMatch[1] || linkMatch[2] || ''),
        text: cleanText(linkMatch[3])
      }))
    }));

    // Google Sheets exports prepend a numbered row-header cell.
    return cells.slice(1);
  });
}

function slugify(value) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function comparisonKey(value) {
  return value.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function levenshtein(left, right) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1)
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length];
}

function normalizeEventLabel(value) {
  const match = value.match(/(Winter|Summer|Spring)(?:\s+Modjam)?\s+(\d{4})/i);
  if (!match) return value.trim();
  return `${match[1][0].toUpperCase()}${match[1].slice(1).toLowerCase()} ${match[2]}`;
}

function splitParticipations(value) {
  const match = value.match(/^\s*(\d+)\s*\((.*)\)\s*$/);
  if (!match) return [];
  return match[2].split(',').map(normalizeEventLabel).filter(Boolean);
}

function parseModders(html) {
  return parseRows(html)
    .slice(2)
    .filter((cells) => cells.length >= 6 && cells[0].text)
    .map((cells) => {
      const participations = splitParticipations(cells[5].text);
      return {
        id: slugify(cells[0].text),
        name: cells[0].text,
        profileSource: 'modder-export',
        nexusProfileUrl: cells[0].links[0]?.href || null,
        avatarUrl: /^no avatar/i.test(cells[1].text) ? null : (cells[1].links[0]?.href || null),
        modathonProfileUrl: cells[2].links[0]?.href || null,
        madnessProfileUrl: cells[3].links[0]?.href || null,
        firstModjam: normalizeEventLabel(cells[4].text),
        participations,
        listedModjamCount: Number.parseInt(cells[5].text, 10) || participations.length,
        entryIds: [],
        placementEntryIds: [],
        awardCount: 0
      };
    });
}

const EVENT_BANNERS = {
  'winter-2020': 'assets/banners/winter 2020.webp',
  'summer-2020': 'assets/banners/summer 2020.webp',
  'spring-2021': 'assets/banners/spring 2021.webp',
  'winter-2022': 'assets/banners/winter 2022.webp',
  'summer-2022': 'assets/banners/summer 2022.webp'
};

function eventFormat(id) {
  if (id === 'winter-2020' || id === 'summer-2020') {
    return {
      competitionType: 'just-for-fun',
      competitionLabel: 'Just for fun',
      competitionNote: 'No ranked winner; prizes were awarded by random drawing.',
      hasJudgeAwards: false
    };
  }
  if (id === 'spring-2021') {
    return {
      competitionType: 'popular-choice',
      competitionLabel: 'Popular Choice',
      competitionNote: 'The community selected a Popular Choice winner.',
      hasJudgeAwards: false
    };
  }
  return {
    competitionType: 'judged',
    competitionLabel: 'Judged competition',
    competitionNote: 'A judging panel selected the placed entries.',
    hasJudgeAwards: ['summer-2022', 'winter-2023', 'summer-2023', 'winter-2025'].includes(id)
  };
}

function splitResult(value) {
  if (!value || /^n\/?a$/i.test(value)) {
    return { placement: null, placementLabel: null, awards: [] };
  }

  let placement = null;
  let placementLabel = null;
  const awards = [];

  const pieces = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === '"') quoted = !quoted;
    else if (character === '“') quoted = true;
    else if (character === '”') quoted = false;

    const ampersandSeparator = character === '&'
      && /\s/.test(value[index - 1] || '')
      && /\s/.test(value[index + 1] || '');
    if (!quoted && (character === ',' || ampersandSeparator)) {
      if (current.trim()) pieces.push(current.trim());
      current = '';
    } else {
      current += character;
    }
  }
  if (current.trim()) pieces.push(current.trim());

  for (const piece of pieces) {
    if (/^first place$/i.test(piece)) {
      placement = 'first';
      placementLabel = 'First Place';
    } else if (/^runner[ -]?up$/i.test(piece)) {
      placement = 'runner-up';
      placementLabel = 'Runner-Up';
    } else if (/^third place$/i.test(piece)) {
      placement = 'third';
      placementLabel = 'Third Place';
    } else if (/^(?:the )?people['’]s choice winner$/i.test(piece)) {
      placement = 'popular-choice';
      placementLabel = "People's Choice Winner";
    } else {
      awards.push(piece);
    }
  }

  return { placement, placementLabel, awards };
}

function matchModder(candidate, modders) {
  const key = comparisonKey(candidate);
  const exact = modders.find((modder) => comparisonKey(modder.name) === key);
  if (exact) return exact;

  const near = modders.filter((modder) => levenshtein(comparisonKey(modder.name), key) <= 1);
  if (near.length === 1) return near[0];

  // A few entry credits append digits that the profile export omits.
  const prefix = modders.filter((modder) => {
    const modderKey = comparisonKey(modder.name);
    return Math.abs(modderKey.length - key.length) <= 3
      && (modderKey.startsWith(key) || key.startsWith(modderKey));
  });
  return prefix.length === 1 ? prefix[0] : null;
}

function parseEntryName(value, modders) {
  const byMatches = [...value.matchAll(/\s+by\s+/gi)];
  if (!byMatches.length) return { title: value, authors: [], unmatchedAuthors: [] };

  const separator = byMatches.at(-1);
  const title = value.slice(0, separator.index).trim();
  const authorText = value.slice(separator.index + separator[0].length).trim();
  const candidates = authorText.split(/\s+(?:and|&)\s+/i).map((name) => name.trim()).filter(Boolean);
  const authors = [];
  const unmatchedAuthors = [];

  for (const candidate of candidates) {
    const modder = matchModder(candidate, modders);
    if (modder) authors.push({ id: modder.id, name: modder.name });
    else {
      authors.push({ id: slugify(candidate), name: candidate });
      unmatchedAuthors.push(candidate);
    }
  }

  return { title, authors, unmatchedAuthors };
}

function parseArchive(html, modders) {
  const events = [];
  const unmatchedAuthors = new Set();
  let currentEvent = null;
  let eventEntryNumber = 0;

  for (const cells of parseRows(html).slice(1)) {
    if (cells.length < 4) continue;

    const eventMatch = cells[0].text.match(/^(Winter|Summer|Spring) Modjam (\d{4})\s+-\s+List of Entries/i);
    if (eventMatch) {
      const season = `${eventMatch[1][0].toUpperCase()}${eventMatch[1].slice(1).toLowerCase()}`;
      const year = Number(eventMatch[2]);
      const id = `${season.toLowerCase()}-${year}`;
      currentEvent = {
        id,
        label: `${season} ${year}`,
        season,
        year,
        banner: EVENT_BANNERS[id] || null,
        ...eventFormat(id),
        entries: []
      };
      events.push(currentEvent);
      eventEntryNumber = 0;
      continue;
    }

    if (!currentEvent || !cells[0].text) continue;
    eventEntryNumber += 1;
    const parsedName = parseEntryName(cells[0].text, modders);
    parsedName.unmatchedAuthors.forEach((author) => unmatchedAuthors.add(author));
    const result = splitResult(cells[3].text);
    const entry = {
      id: `${currentEvent.id}-${String(eventEntryNumber).padStart(2, '0')}`,
      title: parsedName.title,
      url: cells[0].links[0]?.href || null,
      authors: parsedName.authors,
      themes: cells[1].text.split(',').map((theme) => theme.trim()).filter(Boolean),
      category: cells[2].text || 'Uncategorized',
      placement: result.placement,
      placementLabel: result.placementLabel,
      awards: result.awards,
      awardPlacardUrl: cells[3].links[0]?.href || null
    };
    currentEvent.entries.push(entry);
  }

  return { events, unmatchedAuthors: [...unmatchedAuthors] };
}

function reconcileModders(events, modders) {
  const eventOrder = new Map(events.map((event, index) => [event.id, index]));

  for (const event of events) {
    for (const entry of event.entries) {
      for (const author of entry.authors) {
        if (modders.some((modder) => modder.id === author.id)) continue;
        modders.push({
          id: author.id,
          name: author.name,
          profileSource: 'entry-credit',
          nexusProfileUrl: null,
          avatarUrl: null,
          modathonProfileUrl: null,
          madnessProfileUrl: null,
          firstModjam: event.label,
          participations: [],
          listedModjamCount: 0,
          entryIds: [],
          placementEntryIds: [],
          awardCount: 0
        });
      }
    }
  }

  for (const modder of modders) {
    modder.entryIds = [];
    modder.placementEntryIds = [];
    modder.awardCount = 0;
  }

  for (const event of events) {
    for (const entry of event.entries) {
      for (const author of entry.authors) {
        const modder = modders.find((candidate) => candidate.id === author.id);
        if (!modder) continue;
        modder.entryIds.push(entry.id);
        if (entry.placement) modder.placementEntryIds.push(entry.id);
        modder.awardCount += entry.awards.length;
        if (!modder.participations.includes(event.label)) modder.participations.push(event.label);
      }
    }
  }

  for (const modder of modders) {
    modder.participations.sort((left, right) => {
      const leftId = left.toLowerCase().replace(' ', '-');
      const rightId = right.toLowerCase().replace(' ', '-');
      return (eventOrder.get(leftId) ?? 999) - (eventOrder.get(rightId) ?? 999);
    });
    modder.firstModjam = modder.participations[0] || modder.firstModjam;
  }

  modders.sort((left, right) => left.name.localeCompare(right.name));
}

function makeSummary(events, modders) {
  const entries = events.flatMap((event) => event.entries);
  const categories = [...new Set(entries.map((entry) => entry.category))].sort((left, right) => left.localeCompare(right));
  return {
    eventCount: events.length,
    entryCount: entries.length,
    modderCount: modders.length,
    listedModderCount: modders.filter((modder) => modder.profileSource === 'modder-export').length,
    placementCount: entries.filter((entry) => entry.placement).length,
    judgeAwardCount: entries.reduce((total, entry) => total + entry.awards.length, 0),
    placardCount: entries.filter((entry) => entry.awardPlacardUrl).length,
    categories
  };
}

const [entriesHtml, moddersHtml] = await Promise.all([
  readFile(path.resolve(entriesSource), 'utf8'),
  readFile(path.resolve(moddersSource), 'utf8')
]);

const modders = parseModders(moddersHtml);
const { events, unmatchedAuthors } = parseArchive(entriesHtml, modders);
reconcileModders(events, modders);
const generatedAt = new Date().toISOString();
const summary = makeSummary(events, modders);

await mkdir(outputDir, { recursive: true });
await Promise.all([
  writeFile(path.join(outputDir, 'modjams.json'), `${JSON.stringify({ generatedAt, summary, events }, null, 2)}\n`),
  writeFile(path.join(outputDir, 'modders.json'), `${JSON.stringify({ generatedAt, modders }, null, 2)}\n`)
]);

console.log(`Converted ${summary.entryCount} entries across ${summary.eventCount} Modjams.`);
console.log(`Converted ${summary.modderCount} modder profiles and ${summary.judgeAwardCount} recorded judge awards.`);
if (unmatchedAuthors.length) {
  console.warn(`Authors not matched to the modder export: ${unmatchedAuthors.join(', ')}`);
}
