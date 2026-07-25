#!/usr/bin/env node

import { access, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import {
  PublishingValidationError,
  buildModathonUpdate,
  loadPublishingDirectory,
  nexusIdFor,
  siteRelativePath,
  splitIdList,
  splitList,
} from './import-modathon-publishing.mjs';

const require = createRequire(import.meta.url);
const REQUIRED_SHEETS = ['Events', 'Modders', 'Entries', 'Achievements', 'Teams', 'Media'];
const EVENT_TYPES = ['modathon', 'modjam', 'madness'];
const MODJAM_SEASON_ORDER = new Map([
  ['winter', 0],
  ['spring', 1],
  ['summer', 2],
  ['autumn', 3],
  ['fall', 3],
]);

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function sameValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function normalizedUrl(value) {
  try {
    const url = new URL(value);
    url.hash = '';
    url.search = '';
    return url.href.replace(/\/+$/, '').toLocaleLowerCase('en-US');
  } catch {
    return '';
  }
}

function identityKey(value) {
  return String(value || '')
    .normalize('NFKD')
    .toLocaleLowerCase('en-US')
    .replace(/[^a-z0-9]+/g, '');
}

function slugify(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('en-US')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function titleCase(value) {
  const text = String(value || '').trim();
  return text ? text[0].toUpperCase() + text.slice(1).toLowerCase() : '';
}

function includeContentRow(row, mode, excludedStatuses) {
  if (mode === 'publish') return row.status === 'published';
  return !excludedStatuses.includes(row.status);
}

function includeMediaRow(row, mode) {
  if (mode === 'publish') return row.status === 'published';
  return !['retired', 'unreleased'].includes(row.status);
}

export function eventsForSync(events, mode) {
  return events.filter(event => (
    mode === 'draft' || event.status === 'published' || event.status === 'archived'
  ));
}

function rowsForEvent(rows, eventId, mode, excludedStatuses) {
  return rows
    .filter(row => row.event_id === eventId)
    .filter(row => includeContentRow(row, mode, excludedStatuses));
}

function sourcePeopleById(publishing) {
  return new Map(publishing.sheets.Modders.map(person => [person.person_id, person]));
}

function addPersonAlias(index, ambiguous, key, person, displayName) {
  if (!key || ambiguous.has(key)) return;
  const existing = index.get(key);
  if (existing && existing.person.person_id !== person.person_id) {
    index.delete(key);
    ambiguous.add(key);
    return;
  }
  index.set(key, { person, displayName });
}

function personAliasIndex(people) {
  const index = new Map();
  const ambiguous = new Set();
  for (const person of people) {
    addPersonAlias(
      index,
      ambiguous,
      slugify(person.display_name),
      person,
      person.display_name,
    );
    for (const alias of splitList(person.aliases)) {
      addPersonAlias(index, ambiguous, slugify(alias), person, alias);
    }
  }
  return { index, ambiguous };
}

function displayNameFromId(personId) {
  return String(personId || '')
    .split('-')
    .filter(Boolean)
    .map(word => word[0].toUpperCase() + word.slice(1))
    .join(' ');
}

function replacePersonReferences(row, field, peopleById, aliases, errors) {
  const normalizedIds = [];
  const displayNames = {};
  for (const personId of splitIdList(row[field])) {
    if (peopleById.has(personId)) {
      if (!normalizedIds.includes(personId)) normalizedIds.push(personId);
      continue;
    }
    if (aliases.ambiguous.has(personId)) {
      errors.push(`${personId}: person alias ID matches more than one Modders row`);
      if (!normalizedIds.includes(personId)) normalizedIds.push(personId);
      continue;
    }
    const match = aliases.index.get(personId);
    if (!match) {
      if (!normalizedIds.includes(personId)) normalizedIds.push(personId);
      continue;
    }
    const canonicalId = match.person.person_id;
    if (!normalizedIds.includes(canonicalId)) normalizedIds.push(canonicalId);
    displayNames[canonicalId] = match.displayName;
  }
  row[field] = normalizedIds.join(', ');
  if (Object.keys(displayNames).length) {
    row._personDisplayNames = {
      ...(row._personDisplayNames || {}),
      ...displayNames,
    };
  }
}

export function normalizePersonReferences(publishing) {
  const normalized = clone(publishing);
  const peopleById = sourcePeopleById(normalized);
  const aliases = personAliasIndex(normalized.sheets.Modders);
  const errors = [];

  for (const entry of normalized.sheets.Entries) {
    replacePersonReferences(entry, 'author_ids', peopleById, aliases, errors);
  }
  for (const team of normalized.sheets.Teams) {
    replacePersonReferences(team, 'member_ids', peopleById, aliases, errors);
  }

  const strictPersonIds = new Set([
    ...normalized.sheets.Entries.flatMap(entry => splitIdList(entry.author_ids)),
    ...normalized.sheets.Teams.flatMap(team => splitIdList(team.member_ids)),
  ]);
  for (const achievement of normalized.sheets.Achievements) {
    replacePersonReferences(
      achievement,
      'unlocker_ids',
      peopleById,
      aliases,
      errors,
    );
    for (const personId of splitIdList(achievement.unlocker_ids)) {
      if (peopleById.has(personId) || strictPersonIds.has(personId)) continue;
      const synthetic = {
        person_id: personId,
        display_name: displayNameFromId(personId),
        aliases: '',
        nexus_profile_url: '',
        avatar_url: '',
        status: 'inactive',
        notes: 'Achievement-only group credit',
        _synthetic: true,
      };
      normalized.sheets.Modders.push(synthetic);
      peopleById.set(personId, synthetic);
    }
  }

  if (errors.length) throw new PublishingValidationError(errors);
  return normalized;
}

function personDisplayName(row, personId, peopleById) {
  return row._personDisplayNames?.[personId] || peopleById.get(personId).display_name;
}

function personIdsBySite(publishing) {
  const result = new Map(EVENT_TYPES.map(type => [type, new Set()]));
  const eventsById = new Map(
    publishing.sheets.Events.map(event => [event.event_id, event]),
  );

  for (const entry of publishing.sheets.Entries) {
    const type = eventsById.get(entry.event_id)?.event_type;
    if (!result.has(type)) continue;
    splitIdList(entry.author_ids).forEach(personId => result.get(type).add(personId));
  }
  for (const achievement of publishing.sheets.Achievements) {
    const type = eventsById.get(achievement.event_id)?.event_type;
    if (!result.has(type)) continue;
    splitIdList(achievement.unlocker_ids).forEach(personId => result.get(type).add(personId));
  }
  for (const team of publishing.sheets.Teams) {
    const type = eventsById.get(team.event_id)?.event_type;
    if (!result.has(type)) continue;
    splitIdList(team.member_ids).forEach(personId => result.get(type).add(personId));
  }
  return result;
}

function validateWorkbookRelationships(publishing) {
  const errors = [];
  const eventsById = new Map(
    publishing.sheets.Events.map(event => [event.event_id, event]),
  );
  const peopleById = sourcePeopleById(publishing);
  const entriesById = new Map(
    publishing.sheets.Entries.map(entry => [
      `${entry.event_id}\u0000${entry.entry_id}`,
      entry,
    ]),
  );

  for (const [sheetName, rows] of Object.entries(publishing.sheets)) {
    if (sheetName === 'Events' || sheetName === 'Modders') continue;
    for (const row of rows) {
      if (!eventsById.has(row.event_id)) {
        errors.push(`${sheetName}: ${row.event_id} is not defined in Events`);
      }
    }
  }

  for (const entry of publishing.sheets.Entries) {
    for (const personId of splitIdList(entry.author_ids)) {
      if (!peopleById.has(personId)) {
        errors.push(`${entry.entry_id}: unknown author ID ${personId}`);
      }
    }
  }
  for (const achievement of publishing.sheets.Achievements) {
    for (const personId of splitIdList(achievement.unlocker_ids)) {
      if (!peopleById.has(personId)) {
        errors.push(`${achievement.achievement_id}: unknown unlocker ID ${personId}`);
      }
    }
    const event = eventsById.get(achievement.event_id);
    if (event && event.event_type !== 'modathon') {
      errors.push(`${achievement.achievement_id}: achievements are supported only for Modathon`);
    }
  }
  for (const team of publishing.sheets.Teams) {
    const event = eventsById.get(team.event_id);
    if (event && event.event_type !== 'madness') {
      errors.push(`${team.team_id}: teams are supported only for Madness`);
    }
    for (const personId of splitIdList(team.member_ids)) {
      if (!peopleById.has(personId)) {
        errors.push(`${team.team_id}: unknown member ID ${personId}`);
      }
    }
    for (const entryId of splitIdList(team.submission_entry_ids)) {
      if (!entriesById.has(`${team.event_id}\u0000${entryId}`)) {
        errors.push(`${team.team_id}: unknown submission entry ID ${entryId}`);
      }
    }
  }

  if (errors.length) throw new PublishingValidationError(errors);
}

function validateDatesInYear(
  event,
  fields,
  errors,
  { required = true } = {},
) {
  const year = Number(event.year);
  const dates = fields.map(field => ({
    field,
    value: Date.parse(event[field]),
  }));
  for (const date of dates) {
    if (!Number.isFinite(date.value)) {
      if (required) errors.push(`${event.event_id}: ${date.field} is required`);
    } else if (new Date(date.value).getUTCFullYear() !== year) {
      errors.push(`${event.event_id}: ${date.field} must occur in ${year}`);
    }
  }
  if (
    dates.every(date => Number.isFinite(date.value))
    && dates.some((date, index) => index > 0 && date.value <= dates[index - 1].value)
  ) {
    errors.push(
      `${event.event_id}: ${fields.join(', ')} must be in chronological order`,
    );
  }
}

function validateEvents(events) {
  const errors = [];
  const modathonYears = new Set();
  const modjamKeys = new Set();
  const madnessYears = new Set();

  for (const event of events) {
    const requireOperationalFields = event.status !== 'archived';
    if (event.event_type === 'modathon') {
      validateDatesInYear(
        event,
        ['start_at', 'end_at', 'grace_end_at'],
        errors,
        { required: requireOperationalFields },
      );
      const year = String(event.year);
      if (modathonYears.has(year)) {
        errors.push(`${event.event_id}: another Modathon event already uses ${year}`);
      }
      modathonYears.add(year);
    } else if (event.event_type === 'modjam') {
      if (!event.season) errors.push(`${event.event_id}: season is required for Modjam`);
      validateDatesInYear(
        event,
        ['kickoff_at', 'start_at', 'end_at'],
        errors,
        { required: requireOperationalFields },
      );
      const key = `${identityKey(event.season)}\u0000${event.year}`;
      if (modjamKeys.has(key)) {
        errors.push(`${event.event_id}: another Modjam event already uses ${event.season} ${event.year}`);
      }
      modjamKeys.add(key);
    } else if (event.event_type === 'madness') {
      if (!event.season_number) {
        errors.push(`${event.event_id}: season_number is required for Madness`);
      }
      if (requireOperationalFields && !event.registration_form_id) {
        errors.push(`${event.event_id}: registration_form_id is required for Madness`);
      }
      validateDatesInYear(
        event,
        ['registration_at', 'start_at', 'submissions_at', 'bugfix_end_at'],
        errors,
        { required: requireOperationalFields },
      );
      const year = String(event.year);
      if (madnessYears.has(year)) {
        errors.push(`${event.event_id}: another Madness event already uses ${year}`);
      }
      madnessYears.add(year);
    }
  }

  if (errors.length) throw new PublishingValidationError(errors);
}

function countRemovalError(eventId, label, nextCount, currentCount) {
  return (
    `${eventId}: workbook has ${nextCount} ${label} but the current site has `
    + `${currentCount}; use --allow-removals only after reviewing the deletion`
  );
}

function buildAllModathonUpdates(
  publishing,
  current,
  {
    events,
    mode,
    allowRemovals,
    generatedAt,
  },
) {
  const errors = [];
  const warnings = [];
  const summaries = [];
  const mediaPaths = [];
  const achievementsByYear = new Map();
  let working = {
    nexusStats: clone(current.nexusStats),
    modders: clone(current.modders),
    achievements: null,
  };

  for (const event of events) {
    const year = Number(event.year);
    const currentAchievements = current.achievementsByYear.get(year);
    const nextAchievementCount = rowsForEvent(
      publishing.sheets.Achievements,
      event.event_id,
      mode,
      ['retired'],
    ).length;
    const currentAchievementCount = currentAchievements?.achievements?.length || 0;
    if (
      currentAchievementCount
      && nextAchievementCount < currentAchievementCount
      && !allowRemovals
    ) {
      errors.push(countRemovalError(
        event.event_id,
        'achievements',
        nextAchievementCount,
        currentAchievementCount,
      ));
      continue;
    }

    try {
      const result = buildModathonUpdate(publishing, working, {
        eventId: event.event_id,
        mode,
        allowRemovals,
        generatedAt: current.nexusStats.generated || generatedAt,
      });
      working = {
        nexusStats: result.nexusStats,
        modders: result.modders,
        achievements: result.achievements,
      };
      achievementsByYear.set(year, result.achievements);
      warnings.push(...result.warnings);
      summaries.push(result.summary);
      for (const achievement of result.achievements.achievements) {
        if (!achievement.imageUrl) continue;
        mediaPaths.push({
          eventType: 'modathon',
          id: achievement.id,
          relativePath: achievement.imageUrl,
        });
      }
    } catch (error) {
      if (error instanceof PublishingValidationError) errors.push(...error.messages);
      else throw error;
    }
  }

  if (errors.length) throw new PublishingValidationError(errors);

  const oldNexusContent = {
    ...current.nexusStats,
    generated: undefined,
  };
  const nextNexusContent = {
    ...working.nexusStats,
    generated: undefined,
  };
  working.nexusStats.generated = sameValue(oldNexusContent, nextNexusContent)
    ? current.nexusStats.generated
    : generatedAt;

  return {
    nexusStats: working.nexusStats,
    modders: working.modders,
    achievementsByYear,
    summaries,
    warnings,
    mediaPaths,
  };
}

export function modjamArchiveId(event) {
  const conventional = `${String(event.season || '').toLowerCase()}-${event.year}`;
  return /^(?:winter|spring|summer|autumn|fall)-\d{4}$/.test(event.event_id)
    ? event.event_id
    : conventional;
}

function splitModjamResults(value) {
  const text = String(value || '').trim();
  if (!text || /^n\/?a$/i.test(text)) return [];
  if (text.includes(';')) return splitList(text);

  const pieces = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') quoted = !quoted;
    const ampersandSeparator = character === '&'
      && /\s/.test(text[index - 1] || '')
      && /\s/.test(text[index + 1] || '');
    if (!quoted && (character === ',' || ampersandSeparator)) {
      if (current.trim()) pieces.push(current.trim());
      current = '';
    } else {
      current += character;
    }
  }
  if (current.trim()) pieces.push(current.trim());
  return pieces;
}

export function parseModjamResult(value) {
  let placement = null;
  let placementLabel = null;
  const awards = [];

  for (const piece of splitModjamResults(value)) {
    if (/^(?:first|1st) place$/i.test(piece)) {
      placement = 'first';
      placementLabel = 'First Place';
    } else if (/^runner[ -]?up$|^(?:second|2nd) place$/i.test(piece)) {
      placement = 'runner-up';
      placementLabel = 'Runner-Up';
    } else if (/^(?:third|3rd) place$/i.test(piece)) {
      placement = 'third';
      placementLabel = 'Third Place';
    } else if (/^(?:the )?people['’]?s choice winner$/i.test(piece)) {
      placement = 'popular-choice';
      placementLabel = "People's Choice Winner";
    } else {
      awards.push(piece);
    }
  }
  return { placement, placementLabel, awards };
}

function modjamEventFormat(id, existing) {
  if (existing) {
    return {
      competitionType: existing.competitionType,
      competitionLabel: existing.competitionLabel,
      competitionNote: existing.competitionNote,
      hasJudgeAwards: existing.hasJudgeAwards,
    };
  }
  if (id === 'winter-2020' || id === 'summer-2020') {
    return {
      competitionType: 'just-for-fun',
      competitionLabel: 'Just for fun',
      competitionNote: 'No ranked winner; prizes were awarded by random drawing.',
      hasJudgeAwards: false,
    };
  }
  if (id === 'spring-2021') {
    return {
      competitionType: 'popular-choice',
      competitionLabel: 'Popular Choice',
      competitionNote: 'The community selected a Popular Choice winner.',
      hasJudgeAwards: false,
    };
  }
  return {
    competitionType: 'judged',
    competitionLabel: 'Judged competition',
    competitionNote: 'A judging panel selected the placed entries.',
    hasJudgeAwards: false,
  };
}

function findExistingModjamEntry(existingEvent, entry) {
  const byId = existingEvent?.entries?.find(candidate => candidate.id === entry.entry_id);
  if (byId) return byId;
  const nexusId = nexusIdFor(entry.nexus_url);
  return nexusId
    ? existingEvent?.entries?.find(candidate => nexusIdFor(candidate.url) === nexusId)
    : null;
}

function selectedEventMedia(publishing, event, mode) {
  return publishing.sheets.Media
    .filter(media => media.event_id === event.event_id)
    .filter(media => includeMediaRow(media, mode));
}

function modjamMediaForEvent(publishing, event, existing, mode) {
  const media = selectedEventMedia(publishing, event, mode);
  const banners = media.filter(item => item.media_type === 'banner');
  const headers = media.filter(item => item.media_type === 'header');
  return {
    banner: banners[0]
      ? siteRelativePath('modjam', banners[0].published_path)
      : (existing?.banner || null),
    headers: headers.length
      ? headers.map(item => siteRelativePath('modjam', item.published_path))
      : clone(existing?.headers || []),
    mediaPaths: [...banners, ...headers].map(item => ({
      eventType: 'modjam',
      id: item.media_id,
      relativePath: siteRelativePath('modjam', item.published_path),
    })),
  };
}

function compareModjamEvents(left, right) {
  const yearDifference = Number(left.year) - Number(right.year);
  if (yearDifference) return yearDifference;
  const leftSeason = MODJAM_SEASON_ORDER.get(String(left.season).toLowerCase()) ?? 99;
  const rightSeason = MODJAM_SEASON_ORDER.get(String(right.season).toLowerCase()) ?? 99;
  return leftSeason - rightSeason || left.id.localeCompare(right.id);
}

function findModjamProfileIndex(profiles, person) {
  const byId = profiles.findIndex(profile => profile.id === person.person_id);
  if (byId >= 0) return byId;
  const profileUrl = normalizedUrl(person.nexus_profile_url);
  if (profileUrl) {
    const byUrl = profiles.findIndex(
      profile => normalizedUrl(profile.nexusProfileUrl) === profileUrl,
    );
    if (byUrl >= 0) return byUrl;
  }
  const names = new Set(
    [person.display_name, ...splitList(person.aliases)].map(identityKey).filter(Boolean),
  );
  return profiles.findIndex(profile => names.has(identityKey(profile.name)));
}

function reconcileModjamProfiles(
  events,
  currentProfiles,
  publishing,
  sitePersonIds,
) {
  const profiles = clone(currentProfiles.modders || []);
  const peopleById = sourcePeopleById(publishing);
  const referencedIds = new Set(
    events.flatMap(event => event.entries.flatMap(entry => entry.authors.map(author => author.id))),
  );
  const renamedIds = new Map();

  for (const personId of referencedIds) {
    const person = peopleById.get(personId);
    if (!person) continue;
    const existingIndex = findModjamProfileIndex(profiles, person);
    const modathonProfileUrl = sitePersonIds.get('modathon').has(personId)
      ? `https://darkelfmodding.com/modathon/modder/${slugify(person.display_name)}`
      : null;
    const madnessProfileUrl = sitePersonIds.get('madness').has(personId)
      ? `https://darkelfmodding.com/madness/modder?name=${encodeURIComponent(person.display_name)}`
      : null;

    if (existingIndex < 0) {
      profiles.push({
        id: personId,
        name: person.display_name,
        profileSource: 'publishing-workbook',
        nexusProfileUrl: person.nexus_profile_url || null,
        avatarUrl: person.avatar_url || null,
        modathonProfileUrl,
        madnessProfileUrl,
        firstModjam: null,
        participations: [],
        listedModjamCount: 0,
        entryIds: [],
        placementEntryIds: [],
        awardCount: 0,
      });
      continue;
    }

    const existing = profiles[existingIndex];
    if (existing.id !== personId) renamedIds.set(existing.id, personId);
    profiles[existingIndex] = {
      ...existing,
      id: personId,
      name: person.display_name,
      nexusProfileUrl: person.nexus_profile_url || existing.nexusProfileUrl || null,
      avatarUrl: person.avatar_url || existing.avatarUrl || null,
      modathonProfileUrl: modathonProfileUrl || existing.modathonProfileUrl || null,
      madnessProfileUrl: madnessProfileUrl || existing.madnessProfileUrl || null,
    };
  }

  for (const event of events) {
    for (const entry of event.entries) {
      entry.authors = entry.authors.map(author => ({
        ...author,
        id: renamedIds.get(author.id) || author.id,
      }));
      for (const author of entry.authors) {
        if (profiles.some(profile => profile.id === author.id)) continue;
        profiles.push({
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
          awardCount: 0,
        });
      }
    }
  }

  const eventOrder = new Map(events.map((event, index) => [event.id, index]));
  for (const profile of profiles) {
    profile.participations = [];
    profile.entryIds = [];
    profile.placementEntryIds = [];
    profile.awardCount = 0;
  }
  for (const event of events) {
    for (const entry of event.entries) {
      for (const author of entry.authors) {
        const profile = profiles.find(candidate => candidate.id === author.id);
        if (!profile) continue;
        profile.entryIds.push(entry.id);
        if (entry.placement) profile.placementEntryIds.push(entry.id);
        profile.awardCount += entry.awards.length;
        if (!profile.participations.includes(event.label)) {
          profile.participations.push(event.label);
        }
      }
    }
  }
  for (const profile of profiles) {
    profile.participations.sort((left, right) => {
      const leftId = left.toLowerCase().replace(' ', '-');
      const rightId = right.toLowerCase().replace(' ', '-');
      return (eventOrder.get(leftId) ?? 999) - (eventOrder.get(rightId) ?? 999);
    });
    profile.firstModjam = profile.participations[0] || profile.firstModjam || null;
    profile.listedModjamCount = profile.profileSource === 'entry-credit'
      ? 0
      : profile.participations.length;
  }
  profiles.sort((left, right) => left.name.localeCompare(right.name));
  return profiles;
}

function modjamSummary(events, profiles) {
  const entries = events.flatMap(event => event.entries);
  return {
    eventCount: events.length,
    entryCount: entries.length,
    modderCount: profiles.length,
    listedModderCount: profiles.filter(profile => profile.profileSource !== 'entry-credit').length,
    placementCount: entries.filter(entry => entry.placement).length,
    judgeAwardCount: entries.reduce((total, entry) => total + entry.awards.length, 0),
    placardCount: entries.filter(entry => entry.awardPlacardUrl).length,
    categories: [...new Set(entries.map(entry => entry.category))]
      .sort((left, right) => left.localeCompare(right)),
  };
}

export function buildModjamUpdate(
  publishing,
  current,
  {
    events,
    mode,
    allowRemovals,
    generatedAt,
    sitePersonIds = personIdsBySite(publishing),
  },
) {
  if (!events.length) {
    return {
      archive: clone(current.archive),
      profiles: clone(current.profiles),
      summaries: [],
      mediaPaths: [],
    };
  }

  const errors = [];
  const summaries = [];
  const mediaPaths = [];
  const nextEvents = clone(current.archive.events || []);

  for (const event of events) {
    const archiveId = modjamArchiveId(event);
    const existingIndex = nextEvents.findIndex(candidate => (
      candidate.id === event.event_id || candidate.id === archiveId
    ));
    const existing = existingIndex >= 0 ? nextEvents[existingIndex] : null;
    const sourceEntries = publishing.sheets.Entries
      .filter(row => row.event_id === event.event_id)
      .filter(row => (
        includeContentRow(row, mode, ['withdrawn'])
        || (event.status === 'archived' && row.status === 'withdrawn')
      ));
    if (
      existing?.entries?.length
      && sourceEntries.length < existing.entries.length
      && !allowRemovals
    ) {
      errors.push(countRemovalError(
        event.event_id,
        'entries',
        sourceEntries.length,
        existing.entries.length,
      ));
      continue;
    }

    const peopleById = sourcePeopleById(publishing);
    const entries = sourceEntries.map(entry => {
      const previous = findExistingModjamEntry(existing, entry);
      const result = parseModjamResult(entry.placement);
      return {
        id: entry.entry_id,
        title: entry.title,
        url: entry.nexus_url || null,
        authors: splitIdList(entry.author_ids).map(personId => ({
          id: personId,
          name: personDisplayName(entry, personId, peopleById),
        })),
        themes: splitList(entry.themes),
        category: entry.category,
        placement: result.placement,
        placementLabel: result.placementLabel,
        awards: result.awards,
        awardPlacardUrl: previous?.awardPlacardUrl || null,
        ...(previous?.pictureUrl ? { pictureUrl: previous.pictureUrl } : {}),
      };
    });
    const media = modjamMediaForEvent(publishing, event, existing, mode);
    mediaPaths.push(...media.mediaPaths);
    const format = modjamEventFormat(archiveId, existing);
    const nextEvent = {
      id: existing?.id || archiveId,
      label: `${titleCase(event.season)} ${event.year}`,
      season: titleCase(event.season),
      year: Number(event.year),
      banner: media.banner,
      headers: media.headers,
      resultsStreamUrl: event.results_url || existing?.resultsStreamUrl || null,
      ...format,
      hasJudgeAwards: format.hasJudgeAwards || entries.some(entry => entry.awards.length),
      entries,
    };

    if (existingIndex >= 0) nextEvents[existingIndex] = nextEvent;
    else nextEvents.push(nextEvent);
    summaries.push({
      eventId: event.event_id,
      year: Number(event.year),
      entryCount: entries.length,
    });
  }

  if (errors.length) throw new PublishingValidationError(errors);
  nextEvents.sort(compareModjamEvents);
  const profiles = reconcileModjamProfiles(
    nextEvents,
    current.profiles,
    publishing,
    sitePersonIds,
  );
  const summary = modjamSummary(nextEvents, profiles);
  const archiveChanged = !sameValue(
    { summary, events: nextEvents },
    { summary: current.archive.summary, events: current.archive.events },
  );
  const profilesChanged = !sameValue(profiles, current.profiles.modders);
  const timestamp = archiveChanged || profilesChanged
    ? generatedAt
    : (current.archive.generatedAt || current.profiles.generatedAt || generatedAt);

  return {
    archive: { generatedAt: timestamp, summary, events: nextEvents },
    profiles: { generatedAt: timestamp, modders: profiles },
    summaries,
    mediaPaths,
  };
}

function normalizeMadnessPlace(value) {
  const text = String(value || '').trim();
  const names = new Map([
    ['first place', '1st Place'],
    ['second place', '2nd Place'],
    ['runner-up', '2nd Place'],
    ['third place', '3rd Place'],
    ['fourth place', '4th Place'],
    ['fifth place', '5th Place'],
  ]);
  return names.get(text.toLowerCase()) || text || null;
}

function rankFromPlace(value) {
  const text = String(value || '');
  const numeric = text.match(/\d+/)?.[0];
  if (numeric) return Number(numeric);
  const words = new Map([
    ['first', 1],
    ['second', 2],
    ['runner-up', 2],
    ['third', 3],
    ['fourth', 4],
    ['fifth', 5],
    ['sixth', 6],
    ['seventh', 7],
  ]);
  for (const [word, rank] of words) {
    if (text.toLowerCase().includes(word)) return rank;
  }
  return 99;
}

function placeNameForProfile(value) {
  const rank = rankFromPlace(value);
  const names = new Map([
    [1, 'First Place'],
    [2, 'Second Place'],
    [3, 'Third Place'],
    [4, 'Fourth Place'],
    [5, 'Fifth Place'],
    [6, 'Sixth Place'],
    [7, 'Seventh Place'],
  ]);
  return names.get(rank) || null;
}

function teamLabel(value) {
  const name = String(value || '').trim();
  return /^team\s+/i.test(name) ? name : `Team ${name}`;
}

function madnessTeamPlace(team) {
  if (team?.place) return team.place;
  return team?.mods?.find(mod => (
    !mod.url && /^\d+(?:st|nd|rd|th) Place(?:\s*\(tie\))?$/i.test(mod.name)
  ))?.name || null;
}

function findExistingMadnessMod(existingGroup, entry) {
  const nexusId = nexusIdFor(entry.nexus_url);
  if (nexusId) {
    const byNexusId = existingGroup?.mods?.find(
      candidate => nexusIdFor(candidate.url) === nexusId,
    );
    if (byNexusId) return byNexusId;
  }
  return existingGroup?.mods?.find(
    candidate => identityKey(candidate.name) === identityKey(entry.title),
  );
}

function findCurrentMadnessProfile(currentProfiles, person) {
  const profileUrl = normalizedUrl(person.nexus_profile_url);
  if (profileUrl) {
    const byUrl = currentProfiles.find(
      profile => normalizedUrl(profile.profileUrl) === profileUrl,
    );
    if (byUrl) return byUrl;
  }
  const names = new Set(
    [person.display_name, ...splitList(person.aliases)].map(identityKey).filter(Boolean),
  );
  return currentProfiles.find(profile => names.has(identityKey(profile.name))) || null;
}

function buildMadnessProfiles(
  teamsByYear,
  currentProfiles,
  publishing,
  sitePersonIds,
) {
  const peopleById = sourcePeopleById(publishing);
  const currentByName = new Map(
    currentProfiles.map(profile => [identityKey(profile.name), profile]),
  );
  const sourceByName = new Map();
  for (const person of peopleById.values()) {
    sourceByName.set(identityKey(person.display_name), person);
    for (const alias of splitList(person.aliases)) {
      sourceByName.set(identityKey(alias), person);
    }
  }

  const histories = new Map();
  for (const group of teamsByYear) {
    for (const team of group.teams) {
      const teamPlace = madnessTeamPlace(team);
      for (const member of team.members) {
        const key = identityKey(member.name);
        const history = histories.get(key) || {
          name: member.name,
          profileUrl: member.profileUrl || null,
          avatar: member.avatar || null,
          years: [],
          placements: [],
        };
        if (!history.profileUrl && member.profileUrl) history.profileUrl = member.profileUrl;
        if (!history.avatar && member.avatar) history.avatar = member.avatar;
        history.years.push(Number(group.year));
        if (teamPlace) history.placements.push({
          year: Number(group.year),
          place: teamPlace,
        });
        histories.set(key, history);
      }
    }
  }

  const profiles = [];
  for (const history of histories.values()) {
    const person = sourceByName.get(identityKey(history.name));
    const existing = person
      ? findCurrentMadnessProfile(currentProfiles, person)
      : currentByName.get(identityKey(history.name));
    const years = [...new Set(history.years)].sort((left, right) => left - right);
    const bestRank = history.placements.reduce(
      (best, placement) => Math.min(best, rankFromPlace(placement.place)),
      99,
    );
    const highest = history.placements.filter(
      placement => rankFromPlace(placement.place) === bestRank,
    );
    const personId = person?.person_id;
    const modathonProfile = personId && sitePersonIds.get('modathon').has(personId)
      ? `https://darkelfmodding.com/modathon/modder/${slugify(person.display_name)}`
      : (existing?.modathonProfile || null);
    profiles.push({
      name: person?.display_name || history.name,
      profileUrl: person?.nexus_profile_url || history.profileUrl || existing?.profileUrl || null,
      avatar: person?.avatar_url || history.avatar || existing?.avatar || null,
      modathonProfile,
      firstYear: years[0] || null,
      totalCompetitions: years.length,
      years,
      highestPlace: highest.length ? placeNameForProfile(highest[0].place) : null,
      highestPlaceYears: highest.map(placement => placement.year).sort(),
    });
  }
  profiles.sort((left, right) => left.name.localeCompare(right.name));
  return profiles;
}

export function buildMadnessUpdate(
  publishing,
  current,
  {
    events,
    mode,
    allowRemovals,
    sitePersonIds = personIdsBySite(publishing),
  },
) {
  if (!events.length) {
    return {
      teamsByYear: clone(current.teamsByYear),
      modsByYear: clone(current.modsByYear),
      profiles: clone(current.profiles),
      summaries: [],
    };
  }

  const errors = [];
  const summaries = [];
  const nextTeamsByYear = clone(current.teamsByYear);
  const nextModsByYear = clone(current.modsByYear);
  const peopleById = sourcePeopleById(publishing);

  for (const event of events) {
    const year = Number(event.year);
    const currentTeamsIndex = nextTeamsByYear.findIndex(group => Number(group.year) === year);
    const currentModsIndex = nextModsByYear.findIndex(group => Number(group.year) === year);
    const currentTeams = currentTeamsIndex >= 0
      ? nextTeamsByYear[currentTeamsIndex]
      : { year, teams: [] };
    const currentMods = currentModsIndex >= 0
      ? nextModsByYear[currentModsIndex]
      : { year, mods: [] };
    const sourceEntries = rowsForEvent(
      publishing.sheets.Entries,
      event.event_id,
      mode,
      ['withdrawn'],
    );
    const sourceTeams = rowsForEvent(
      publishing.sheets.Teams,
      event.event_id,
      mode,
      ['withdrawn'],
    );

    if (
      currentMods.mods.length
      && sourceEntries.length < currentMods.mods.length
      && !allowRemovals
    ) {
      errors.push(countRemovalError(
        event.event_id,
        'entries',
        sourceEntries.length,
        currentMods.mods.length,
      ));
    }
    if (
      currentTeams.teams.length
      && sourceTeams.length < currentTeams.teams.length
      && !allowRemovals
    ) {
      errors.push(countRemovalError(
        event.event_id,
        'teams',
        sourceTeams.length,
        currentTeams.teams.length,
      ));
    }

    const entriesById = new Map(sourceEntries.map(entry => [entry.entry_id, entry]));
    const teamByEntryId = new Map();
    for (const team of sourceTeams) {
      for (const entryId of splitIdList(team.submission_entry_ids)) {
        if (!entriesById.has(entryId)) {
          errors.push(
            `${team.team_id}: submission ${entryId} is not included in the ${mode} import`,
          );
          continue;
        }
        if (teamByEntryId.has(entryId)) {
          errors.push(
            `${entryId}: submission is assigned to both ${teamByEntryId.get(entryId).team_id} and ${team.team_id}`,
          );
          continue;
        }
        teamByEntryId.set(entryId, team);
      }
    }
    for (const entry of sourceEntries) {
      if (!teamByEntryId.has(entry.entry_id)) {
        errors.push(`${entry.entry_id}: Madness entry is not assigned to a team`);
      }
    }
    if (errors.length) continue;

    const teams = sourceTeams.map(team => ({
      name: team.team_name,
      place: normalizeMadnessPlace(team.placement),
      mods: splitIdList(team.submission_entry_ids).map(entryId => {
        const entry = entriesById.get(entryId);
        return { name: entry.title, url: entry.nexus_url || null };
      }),
      members: splitIdList(team.member_ids).map(personId => {
        const person = peopleById.get(personId);
        return {
          name: personDisplayName(team, personId, peopleById),
          profileUrl: person.nexus_profile_url || null,
          avatar: person.avatar_url || null,
        };
      }),
    }));
    const mods = sourceEntries.map(entry => {
      const team = teamByEntryId.get(entry.entry_id);
      const existing = findExistingMadnessMod(currentMods, entry);
      return {
        name: entry.title,
        url: entry.nexus_url || null,
        team: teamLabel(team.team_name),
        category: entry.category,
        place: normalizeMadnessPlace(entry.placement),
        notes: entry.notes || null,
        ...(existing?.pictureUrl ? { pictureUrl: existing.pictureUrl } : {}),
      };
    });

    const teamGroup = { year, teams };
    const modGroup = { year, mods };
    if (currentTeamsIndex >= 0) nextTeamsByYear[currentTeamsIndex] = teamGroup;
    else nextTeamsByYear.push(teamGroup);
    if (currentModsIndex >= 0) nextModsByYear[currentModsIndex] = modGroup;
    else nextModsByYear.push(modGroup);
    summaries.push({
      eventId: event.event_id,
      year,
      entryCount: mods.length,
      teamCount: teams.length,
    });
  }

  if (errors.length) throw new PublishingValidationError(errors);
  nextTeamsByYear.sort((left, right) => Number(left.year) - Number(right.year));
  nextModsByYear.sort((left, right) => Number(left.year) - Number(right.year));
  const profiles = buildMadnessProfiles(
    nextTeamsByYear,
    current.profiles,
    publishing,
    sitePersonIds,
  );
  return {
    teamsByYear: nextTeamsByYear,
    modsByYear: nextModsByYear,
    profiles,
    summaries,
  };
}

function latestCurrentEvent(events, eventType, mode) {
  return events
    .filter(event => event.event_type === eventType)
    .filter(event => event.status !== 'archived')
    .filter(event => mode === 'draft' || event.status === 'published')
    .sort((left, right) => {
      const dateDifference = (
        Date.parse(right.start_at || right.registration_at)
        - Date.parse(left.start_at || left.registration_at)
      );
      return dateDifference || Number(right.year) - Number(left.year);
    })[0] || null;
}

function annualSchedulePoint(value) {
  const date = new Date(value);
  return {
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes(),
  };
}

export function buildEventConfig(publishing, currentConfig, mode) {
  const config = clone(currentConfig);
  const events = publishing.sheets.Events;
  const modathon = latestCurrentEvent(events, 'modathon', mode);
  const modjam = latestCurrentEvent(events, 'modjam', mode);
  const madness = latestCurrentEvent(events, 'madness', mode);

  if (modathon) {
    config.modathon = {
      ...config.modathon,
      name: modathon.name,
      timezoneLabel: modathon.timezone,
      schedule: {
        ...config.modathon.schedule,
        start: annualSchedulePoint(modathon.start_at),
        end: annualSchedulePoint(modathon.end_at),
        graceEnd: annualSchedulePoint(modathon.grace_end_at),
      },
    };
  }
  if (modjam) {
    config.modjam = {
      name: modjam.name,
      season: titleCase(modjam.season),
      year: Number(modjam.year),
      kickoffStart: new Date(modjam.kickoff_at).toISOString(),
      start: new Date(modjam.start_at).toISOString(),
      end: new Date(modjam.end_at).toISOString(),
      timezoneLabel: modjam.timezone,
      participationBannerUrl: modjam.participation_banner_url || '',
    };
  }
  if (madness) {
    config.madness = {
      name: madness.name,
      year: Number(madness.year),
      seasonNumber: Number(madness.season_number),
      registration: new Date(madness.registration_at).toISOString(),
      competition: new Date(madness.start_at).toISOString(),
      submissions: new Date(madness.submissions_at).toISOString(),
      bugFixEnd: new Date(madness.bugfix_end_at).toISOString(),
      timezoneLabel: madness.timezone,
      registrationFormId: madness.registration_form_id,
    };
  }
  return config;
}

export function renderEventConfig(config) {
  const json = JSON.stringify(config, null, 2)
    .split('\n')
    .map((line, index) => (index === 0 ? line : `  ${line}`))
    .join('\n');
  return `(function (root, factory) {
  var config = factory();
  if (typeof module === 'object' && module.exports) module.exports = config;
  root.MmsEventConfig = config;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function deepFreeze(value) {
    Object.keys(value).forEach(function (key) {
      if (value[key] && typeof value[key] === 'object' && !Object.isFrozen(value[key])) {
        deepFreeze(value[key]);
      }
    });
    return Object.freeze(value);
  }

  return deepFreeze(${json});
});
`;
}

async function readJsonFile(filePath) {
  const raw = await readFile(filePath, 'utf8');
  return {
    data: JSON.parse(raw),
    indent: raw.match(/\n([ \t]+)\S/)?.[1] || '  ',
  };
}

async function readJsonIfPresent(filePath) {
  try {
    return await readJsonFile(filePath);
  } catch (error) {
    if (error.code === 'ENOENT') return { data: null, indent: '  ' };
    throw error;
  }
}

export async function readCurrentPublishingData(repoRoot, publishing) {
  const paths = {
    eventConfig: path.join(repoRoot, 'assets', 'event-config.js'),
    modathonNexus: path.join(repoRoot, 'modathon', 'assets', 'data', 'nexus-stats.json'),
    modathonModders: path.join(repoRoot, 'modathon', 'assets', 'data', 'modders.json'),
    modjamArchive: path.join(repoRoot, 'modjam', 'data', 'modjams.json'),
    modjamProfiles: path.join(repoRoot, 'modjam', 'data', 'modders.json'),
    madnessTeams: path.join(repoRoot, 'madness', 'data', 'teams-by-year.json'),
    madnessMods: path.join(repoRoot, 'madness', 'data', 'mods-by-year.json'),
    madnessProfiles: path.join(repoRoot, 'madness', 'data', 'modders.json'),
  };
  const [
    modathonNexus,
    modathonModders,
    modjamArchive,
    modjamProfiles,
    madnessTeams,
    madnessMods,
    madnessProfiles,
  ] = await Promise.all([
    readJsonFile(paths.modathonNexus),
    readJsonFile(paths.modathonModders),
    readJsonFile(paths.modjamArchive),
    readJsonFile(paths.modjamProfiles),
    readJsonFile(paths.madnessTeams),
    readJsonFile(paths.madnessMods),
    readJsonFile(paths.madnessProfiles),
  ]);

  const achievementsByYear = new Map();
  const achievementFormatting = new Map();
  const modathonYears = new Set(
    publishing.sheets.Events
      .filter(event => event.event_type === 'modathon')
      .map(event => Number(event.year)),
  );
  await Promise.all([...modathonYears].map(async year => {
    const filePath = path.join(
      repoRoot,
      'modathon',
      'assets',
      'data',
      `${year}-achievements.json`,
    );
    const record = await readJsonIfPresent(filePath);
    achievementsByYear.set(year, record.data);
    achievementFormatting.set(year, record.indent);
  }));

  delete require.cache[require.resolve(paths.eventConfig)];
  const eventConfig = clone(require(paths.eventConfig));
  return {
    paths,
    eventConfig,
    modathon: {
      nexusStats: modathonNexus.data,
      modders: modathonModders.data,
      achievementsByYear,
    },
    modjam: {
      archive: modjamArchive.data,
      profiles: modjamProfiles.data,
    },
    madness: {
      teamsByYear: madnessTeams.data,
      modsByYear: madnessMods.data,
      profiles: madnessProfiles.data,
    },
    formatting: {
      modathonNexus: modathonNexus.indent,
      modathonModders: modathonModders.indent,
      achievementsByYear: achievementFormatting,
      modjamArchive: modjamArchive.indent,
      modjamProfiles: modjamProfiles.indent,
      madnessTeams: madnessTeams.indent,
      madnessMods: madnessMods.indent,
      madnessProfiles: madnessProfiles.indent,
    },
  };
}

export function buildPublishingUpdate(
  publishing,
  current,
  {
    mode = 'publish',
    allowRemovals = false,
    generatedAt = new Date().toISOString(),
  } = {},
) {
  if (!['draft', 'publish'].includes(mode)) {
    throw new PublishingValidationError([`Unsupported import mode: ${mode}`]);
  }
  const normalizedPublishing = normalizePersonReferences(publishing);
  validateWorkbookRelationships(normalizedPublishing);
  const selectedEvents = eventsForSync(normalizedPublishing.sheets.Events, mode);
  validateEvents(selectedEvents);
  const sitePersonIds = personIdsBySite(normalizedPublishing);
  const byType = new Map(EVENT_TYPES.map(type => [
    type,
    selectedEvents.filter(event => event.event_type === type),
  ]));

  const modathon = buildAllModathonUpdates(normalizedPublishing, current.modathon, {
    events: byType.get('modathon'),
    mode,
    allowRemovals,
    generatedAt,
  });
  const modjam = buildModjamUpdate(normalizedPublishing, current.modjam, {
    events: byType.get('modjam'),
    mode,
    allowRemovals,
    generatedAt,
    sitePersonIds,
  });
  const madness = buildMadnessUpdate(normalizedPublishing, current.madness, {
    events: byType.get('madness'),
    mode,
    allowRemovals,
    sitePersonIds,
  });
  const eventConfig = buildEventConfig(
    normalizedPublishing,
    current.eventConfig,
    mode,
  );

  const changedFiles = [];
  if (!sameValue(modathon.nexusStats, current.modathon.nexusStats)) {
    changedFiles.push('modathon/assets/data/nexus-stats.json');
  }
  if (!sameValue(modathon.modders, current.modathon.modders)) {
    changedFiles.push('modathon/assets/data/modders.json');
  }
  for (const [year, achievements] of modathon.achievementsByYear) {
    if (!sameValue(achievements, current.modathon.achievementsByYear.get(year))) {
      changedFiles.push(`modathon/assets/data/${year}-achievements.json`);
    }
  }
  if (!sameValue(modjam.archive, current.modjam.archive)) {
    changedFiles.push('modjam/data/modjams.json');
  }
  if (!sameValue(modjam.profiles, current.modjam.profiles)) {
    changedFiles.push('modjam/data/modders.json');
  }
  if (!sameValue(madness.teamsByYear, current.madness.teamsByYear)) {
    changedFiles.push('madness/data/teams-by-year.json');
  }
  if (!sameValue(madness.modsByYear, current.madness.modsByYear)) {
    changedFiles.push('madness/data/mods-by-year.json');
  }
  if (!sameValue(madness.profiles, current.madness.profiles)) {
    changedFiles.push('madness/data/modders.json');
  }
  if (!sameValue(eventConfig, current.eventConfig)) {
    changedFiles.push('assets/event-config.js');
  }

  return {
    mode,
    selectedEvents,
    eventConfig,
    modathon,
    modjam,
    madness,
    changedFiles,
    warnings: [...modathon.warnings],
    mediaPaths: [...modathon.mediaPaths, ...modjam.mediaPaths],
  };
}

async function validateMediaPaths(result, { repoRoot, strict }) {
  const missing = [];
  for (const media of result.mediaPaths) {
    const siteRoot = path.resolve(repoRoot, media.eventType);
    const absolutePath = path.resolve(siteRoot, media.relativePath);
    if (
      absolutePath !== siteRoot
      && !absolutePath.startsWith(`${siteRoot}${path.sep}`)
    ) {
      missing.push(`${media.id}: media path leaves the ${media.eventType} directory`);
      continue;
    }
    try {
      await access(absolutePath);
    } catch {
      missing.push(`${media.id}: missing ${media.relativePath}`);
    }
  }
  if (strict && missing.length) throw new PublishingValidationError(missing);
  return missing;
}

function jsonText(value, indent) {
  return `${JSON.stringify(value, null, indent)}\n`;
}

export async function writePublishingUpdate(result, current, repoRoot) {
  const writes = [];
  const changed = new Set(result.changedFiles);
  const addJsonWrite = (relativePath, value, indent) => {
    if (!changed.has(relativePath)) return;
    writes.push(writeFile(path.join(repoRoot, ...relativePath.split('/')), jsonText(value, indent)));
  };

  addJsonWrite(
    'modathon/assets/data/nexus-stats.json',
    result.modathon.nexusStats,
    current.formatting.modathonNexus,
  );
  addJsonWrite(
    'modathon/assets/data/modders.json',
    result.modathon.modders,
    current.formatting.modathonModders,
  );
  for (const [year, achievements] of result.modathon.achievementsByYear) {
    addJsonWrite(
      `modathon/assets/data/${year}-achievements.json`,
      achievements,
      current.formatting.achievementsByYear.get(year) || '  ',
    );
  }
  addJsonWrite(
    'modjam/data/modjams.json',
    result.modjam.archive,
    current.formatting.modjamArchive,
  );
  addJsonWrite(
    'modjam/data/modders.json',
    result.modjam.profiles,
    current.formatting.modjamProfiles,
  );
  addJsonWrite(
    'madness/data/teams-by-year.json',
    result.madness.teamsByYear,
    current.formatting.madnessTeams,
  );
  addJsonWrite(
    'madness/data/mods-by-year.json',
    result.madness.modsByYear,
    current.formatting.madnessMods,
  );
  addJsonWrite(
    'madness/data/modders.json',
    result.madness.profiles,
    current.formatting.madnessProfiles,
  );
  if (changed.has('assets/event-config.js')) {
    writes.push(writeFile(
      path.join(repoRoot, 'assets', 'event-config.js'),
      renderEventConfig(result.eventConfig),
    ));
  }
  await Promise.all(writes);
}

function parseArguments(argv) {
  const options = {
    sourceDirectory: null,
    mode: 'publish',
    dryRun: false,
    allowRemovals: false,
    repoRoot: path.resolve('.'),
    schemaPath: path.resolve('publishing/schema-v1.json'),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith('-') && !options.sourceDirectory) {
      options.sourceDirectory = path.resolve(argument);
    } else if (argument === '--mode') {
      options.mode = argv[++index];
    } else if (argument === '--repo-root') {
      options.repoRoot = path.resolve(argv[++index]);
    } else if (argument === '--schema') {
      options.schemaPath = path.resolve(argv[++index]);
    } else if (argument === '--dry-run') {
      options.dryRun = true;
    } else if (argument === '--allow-removals') {
      options.allowRemovals = true;
    } else {
      throw new PublishingValidationError([`Unknown argument: ${argument}`]);
    }
  }

  if (!options.sourceDirectory) {
    throw new PublishingValidationError([
      'Usage: node scripts/import-publishing.mjs <csv-directory> '
      + '[--mode draft|publish] [--dry-run] [--allow-removals]',
    ]);
  }
  return options;
}

function printSummary(result, { dryRun, missingMedia }) {
  console.log(`Workbook sync (${result.mode})`);
  for (const summary of result.modathon.summaries) {
    console.log(
      `Modathon ${summary.eventId}: ${summary.entryCount} entries, `
      + `${summary.achievementCount} achievements`,
    );
  }
  for (const summary of result.modjam.summaries) {
    console.log(`Modjam ${summary.eventId}: ${summary.entryCount} entries`);
  }
  for (const summary of result.madness.summaries) {
    console.log(
      `Madness ${summary.eventId}: ${summary.teamCount} teams, ${summary.entryCount} entries`,
    );
  }
  [...result.warnings, ...missingMedia].forEach(
    warning => console.warn(`Warning: ${warning}`),
  );
  if (result.changedFiles.length) {
    console.log('Changed site files:');
    result.changedFiles.forEach(file => console.log(`- ${file}`));
  } else {
    console.log('No site data changes detected.');
  }
  console.log(
    dryRun
      ? 'Dry run complete; no files were changed.'
      : `Workbook sync complete; ${result.changedFiles.length} files updated.`,
  );
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  const publishing = await loadPublishingDirectory(options.sourceDirectory, {
    schemaPath: options.schemaPath,
    requiredSheets: REQUIRED_SHEETS,
  });
  const current = await readCurrentPublishingData(options.repoRoot, publishing);
  const result = buildPublishingUpdate(publishing, current, {
    mode: options.mode,
    allowRemovals: options.allowRemovals,
  });
  const missingMedia = await validateMediaPaths(result, {
    repoRoot: options.repoRoot,
    strict: options.mode === 'publish',
  });
  if (!options.dryRun) {
    await writePublishingUpdate(result, current, options.repoRoot);
  }
  printSummary(result, { dryRun: options.dryRun, missingMedia });
  return result;
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (invokedPath === import.meta.url) {
  main().catch(error => {
    if (error instanceof PublishingValidationError) {
      error.messages.forEach(message => console.error(`Error: ${message}`));
      process.exitCode = 1;
      return;
    }
    throw error;
  });
}
