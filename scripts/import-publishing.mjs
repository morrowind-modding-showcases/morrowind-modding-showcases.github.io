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
import { STANDARD_MOD_CATEGORIES } from './content-lib.mjs';

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

function separateModjamData(archive) {
  const {
    generatedAt,
    summary,
    events,
    ...metadata
  } = archive || {};
  return {
    archive: {
      ...metadata,
      events: (events || []).map(({ entries, ...event }) => event),
    },
    mods: {
      generatedAt,
      summary,
      events: (events || []).map(event => ({
        id: event.id,
        mods: event.entries || [],
      })),
    },
  };
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

function personDisplayName(row, personId, peopleById, existingNames = []) {
  const person = peopleById.get(personId);
  const sourceName = row._personDisplayNames?.[personId] || person.display_name;
  const sourceNames = new Set(
    [sourceName, person.display_name, ...splitList(person.aliases)]
      .map(identityKey)
      .filter(Boolean),
  );
  return existingNames.find(name => sourceNames.has(identityKey(name))) || sourceName;
}

function personIdsBySite(publishing, selectedEventIds = null) {
  const result = new Map(EVENT_TYPES.map(type => [type, new Set()]));
  const eventsById = new Map(
    publishing.sheets.Events.map(event => [event.event_id, event]),
  );

  for (const entry of publishing.sheets.Entries) {
    if (selectedEventIds && !selectedEventIds.has(entry.event_id)) continue;
    const type = eventsById.get(entry.event_id)?.event_type;
    if (!result.has(type)) continue;
    splitIdList(entry.author_ids).forEach(personId => result.get(type).add(personId));
  }
  for (const achievement of publishing.sheets.Achievements) {
    if (selectedEventIds && !selectedEventIds.has(achievement.event_id)) continue;
    const type = eventsById.get(achievement.event_id)?.event_type;
    if (!result.has(type)) continue;
    splitIdList(achievement.unlocker_ids).forEach(personId => result.get(type).add(personId));
  }
  for (const team of publishing.sheets.Teams) {
    if (selectedEventIds && !selectedEventIds.has(team.event_id)) continue;
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
    const event = eventsById.get(entry.event_id);
    if (event?.event_type === 'madness' && !STANDARD_MOD_CATEGORIES.has(entry.category)) {
      errors.push(
        `${entry.entry_id}: category must be one of the standard mod categories`,
      );
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
      const result = buildModathonUpdate(publishing, {
        ...working,
        achievements: currentAchievements,
      }, {
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
      : clone(existing?.headers?.length
        ? existing.headers
        : [`assets/headers/header-${String(event.season).toLowerCase()}.webp`]),
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
          name: personDisplayName(
            entry,
            personId,
            peopleById,
            previous?.authors?.map(author => author.name),
          ),
        })),
        themes: splitList(entry.themes),
        category: entry.category,
        placement: result.placement,
        placementLabel: result.placementLabel,
        awards: result.awards.length
          ? result.awards
          : clone(previous?.awards || []),
        awardPlacardUrl: previous?.awardPlacardUrl || null,
        ...(previous?.pictureUrl ? { pictureUrl: previous.pictureUrl } : {}),
      };
    });
    const media = modjamMediaForEvent(publishing, event, existing, mode);
    mediaPaths.push(...media.mediaPaths);
    const format = modjamEventFormat(archiveId, existing);
    const operational = event.kickoff_at && event.start_at && event.end_at
      ? {
          name: event.name,
          timezoneLabel: event.timezone,
          countdown: {
            kickoffStart: new Date(event.kickoff_at).toISOString(),
            start: new Date(event.start_at).toISOString(),
            end: new Date(event.end_at).toISOString(),
          },
          participationBannerUrl: (
            event.participation_banner_url
            || existing?.participationBannerUrl
            || ''
          ),
        }
      : {};
    const nextEvent = {
      ...existing,
      id: existing?.id || archiveId,
      label: `${titleCase(event.season)} ${event.year}`,
      season: titleCase(event.season),
      year: Number(event.year),
      ...operational,
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
    archive: {
      ...clone(current.archive),
      generatedAt: timestamp,
      summary,
      events: nextEvents,
    },
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

function isMadnessPlacementMod(mod) {
  return (
    !mod.url
    && /^\d+(?:st|nd|rd|th) Place(?:\s*\(tie\))?$/i.test(mod.name)
  );
}

function findExistingMadnessTeam(currentGroup, sourceTeam, entriesById) {
  const byName = currentGroup?.teams?.find(
    candidate => identityKey(candidate.name) === identityKey(sourceTeam.team_name),
  );
  if (byName) return byName;

  const sourceModKeys = new Set(
    splitIdList(sourceTeam.submission_entry_ids)
      .map(entryId => entriesById.get(entryId))
      .filter(Boolean)
      .flatMap(entry => [
        nexusIdFor(entry.nexus_url),
        identityKey(entry.title),
      ])
      .filter(Boolean),
  );
  return currentGroup?.teams
    ?.map(candidate => ({
      candidate,
      overlap: candidate.mods.filter(mod => (
        sourceModKeys.has(nexusIdFor(mod.url))
        || sourceModKeys.has(identityKey(mod.name))
      )).length,
    }))
    .filter(match => match.overlap)
    .sort((left, right) => right.overlap - left.overlap)[0]?.candidate || null;
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

function madnessEntryUrl(entry) {
  return /\bmod deleted\b/i.test(entry.notes)
    ? null
    : (entry.nexus_url || null);
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
      name: existing?.name || history.name,
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
    eventConfig = { events: [] },
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
    const configuredThemeIds = new Set(
      (eventConfig.events || [])
        .find(candidate => Number(candidate.year) === year)
        ?.themes
        ?.map(theme => theme.id) || [],
    );
    for (const entry of sourceEntries) {
      if (entry.theme_id && !configuredThemeIds.has(entry.theme_id)) {
        errors.push(
          `${entry.entry_id}: theme_id references unknown Madness ${year} theme ${entry.theme_id}`,
        );
      }
    }

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

    const historicalMemberNames = currentTeams.teams
      .flatMap(team => team.members || [])
      .map(member => member.name);
    const teams = sourceTeams.map(team => {
      const existingTeam = findExistingMadnessTeam(currentTeams, team, entriesById);
      const place = normalizeMadnessPlace(team.placement);
      const submissionMods = splitIdList(team.submission_entry_ids).map(entryId => {
        const entry = entriesById.get(entryId);
        return { name: entry.title, url: entry.nexus_url || null };
      });
      const placementMods = place
        ? []
        : clone(existingTeam?.mods?.filter(isMadnessPlacementMod) || []);
      return {
        name: team.team_name,
        place,
        mods: [...submissionMods, ...placementMods],
        members: splitIdList(team.member_ids).map(personId => {
          const person = peopleById.get(personId);
          return {
            id: personId,
            name: personDisplayName(
              team,
              personId,
              peopleById,
              existingTeam?.members?.map(member => member.name) || historicalMemberNames,
            ),
            profileUrl: person.nexus_profile_url || null,
            avatar: person.avatar_url || null,
          };
        }),
      };
    });
    const mods = sourceEntries.map((entry, sourceIndex) => {
      const team = teamByEntryId.get(entry.entry_id);
      const existing = findExistingMadnessMod(currentMods, entry);
      return {
        name: entry.title,
        url: madnessEntryUrl(entry),
        team: teamLabel(team.team_name),
        category: entry.category,
        ...((entry.theme_id || existing?.themeId)
          ? { themeId: entry.theme_id || existing.themeId }
          : {}),
        place: normalizeMadnessPlace(entry.placement),
        notes: entry.notes || null,
        ...(existing?.pictureUrl ? { pictureUrl: existing.pictureUrl } : {}),
        _existingIndex: existing ? currentMods.mods.indexOf(existing) : Number.MAX_SAFE_INTEGER,
        _sourceIndex: sourceIndex,
      };
    }).sort((left, right) => (
      left._existingIndex - right._existingIndex
      || left._sourceIndex - right._sourceIndex
    )).map(({ _existingIndex, _sourceIndex, ...mod }) => mod);

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

function dateInYear(value, year) {
  const date = new Date(value);
  return new Date(Date.UTC(
    year,
    date.getUTCMonth(),
    date.getUTCDate(),
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds(),
  )).toISOString();
}

function latestConfiguredEvent(document) {
  return (document?.events || []).reduce((latest, event) => (
    !latest || Number(event.year) >= Number(latest.year) ? event : latest
  ), null);
}

function upsertYearlyEvent(document, event) {
  const next = clone(document);
  const index = next.events.findIndex(candidate => Number(candidate.year) === Number(event.year));
  if (index >= 0) next.events[index] = { ...next.events[index], ...event };
  else next.events.push(event);
  next.events.sort((left, right) => Number(left.year) - Number(right.year));
  return next;
}

export function buildEventConfig(publishing, currentConfig, mode) {
  const config = clone(currentConfig);
  const events = publishing.sheets.Events;
  const modathon = latestCurrentEvent(events, 'modathon', mode);
  const madness = latestCurrentEvent(events, 'madness', mode);

  if (modathon) {
    const template = latestConfiguredEvent(config.modathon);
    config.modathon = upsertYearlyEvent(config.modathon, {
      name: modathon.name,
      year: Number(modathon.year),
      timezoneLabel: modathon.timezone,
      countdown: {
        start: new Date(modathon.start_at).toISOString(),
        end: new Date(modathon.end_at).toISOString(),
        graceEnd: new Date(modathon.grace_end_at).toISOString(),
        reset: dateInYear(template.countdown.reset, Number(modathon.year)),
      },
    });
  }
  if (madness) {
    config.madness = upsertYearlyEvent(config.madness, {
      name: madness.name,
      year: Number(madness.year),
      season: Number(madness.season_number),
      timezoneLabel: madness.timezone,
      countdown: {
        registrationOpen: new Date(madness.registration_at).toISOString(),
        competitionStart: new Date(madness.start_at).toISOString(),
        submissionsClose: new Date(madness.submissions_at).toISOString(),
        bugFixEnd: new Date(madness.bugfix_end_at).toISOString(),
      },
      registrationFormId: madness.registration_form_id,
    });
  }
  return config;
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
    modathonEvent: path.join(repoRoot, 'modathon', 'assets', 'data', 'modathon-event.json'),
    modjamEvent: path.join(repoRoot, 'modjam', 'data', 'modjam-event.json'),
    madnessEvent: path.join(repoRoot, 'madness', 'data', 'madness-event.json'),
    centralModders: path.join(repoRoot, 'assets', 'data', 'modders.json'),
    modderRegistryHelper: path.join(repoRoot, 'assets', 'modder-registry.js'),
    modathonNexus: path.join(repoRoot, 'modathon', 'assets', 'data', 'modathon-mods.json'),
    modjamMods: path.join(repoRoot, 'modjam', 'data', 'modjam-mods.json'),
    madnessTeams: path.join(repoRoot, 'madness', 'data', 'madness-teams.json'),
    madnessMods: path.join(repoRoot, 'madness', 'data', 'madness-mods.json'),
  };
  const [
    modathonEvent,
    modjamEvent,
    madnessEvent,
    centralModders,
    modathonNexus,
    modjamMods,
    madnessTeams,
    madnessMods,
  ] = await Promise.all([
    readJsonFile(paths.modathonEvent),
    readJsonFile(paths.modjamEvent),
    readJsonFile(paths.madnessEvent),
    readJsonFile(paths.centralModders),
    readJsonFile(paths.modathonNexus),
    readJsonFile(paths.modjamMods),
    readJsonFile(paths.madnessTeams),
    readJsonFile(paths.madnessMods),
  ]);

  delete require.cache[require.resolve(paths.modderRegistryHelper)];
  const modderRegistry = require(paths.modderRegistryHelper);
  const modathonReferences = modderRegistry.inferModathonReferences(
    modathonNexus.data,
    centralModders.data,
  );
  const modjamReferences = modderRegistry.inferModjamReferences(modjamMods.data);
  const madnessReferences = modderRegistry.inferMadnessReferences(madnessTeams.data);
  const modathonProfiles = {
    modders: modderRegistry.asModathonProfiles(
      centralModders.data,
      modathonReferences,
    ),
  };
  const hydratedModjamArchive = modderRegistry.combineModjamData(
    clone(modjamEvent.data),
    clone(modjamMods.data),
  );
  const hydratedModjamProfiles = {
    generatedAt: modjamMods.data.generatedAt,
    ...modderRegistry.hydrateModjam(
      hydratedModjamArchive,
      centralModders.data,
      modjamReferences,
      modathonReferences,
      madnessReferences,
    ),
  };
  const hydratedMadnessTeams = modderRegistry.hydrateMadnessTeams(
    madnessTeams.data,
    centralModders.data,
  );
  const modathonIds = new Set(modderRegistry.referenceIds(modathonReferences));
  const hydratedMadnessProfiles = modderRegistry.resolveProfiles(
    centralModders.data,
    madnessReferences,
  ).map(profile => ({
    id: profile.id,
    name: profile.name,
    profileUrl: profile.nexusProfileUrl || null,
    avatar: profile.avatarUrl || null,
    modathonProfile: modathonIds.has(profile.id)
      ? `https://darkelfmodding.com/modathon/modder/${profile.id}`
      : null,
  }));

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

  return {
    paths,
    eventConfig: {
      modathon: modathonEvent.data,
      modjam: modjamEvent.data,
      madness: madnessEvent.data,
    },
    centralModders: centralModders.data,
    modathon: {
      nexusStats: modathonNexus.data,
      modders: modathonProfiles,
      references: modathonReferences,
      achievementsByYear,
    },
    modjam: {
      archive: hydratedModjamArchive,
      rawArchive: modjamEvent.data,
      rawMods: modjamMods.data,
      profiles: hydratedModjamProfiles,
      references: modjamReferences,
    },
    madness: {
      teamsByYear: hydratedMadnessTeams,
      rawTeamsByYear: madnessTeams.data,
      modsByYear: madnessMods.data.years || [],
      rawModsByYear: madnessMods.data,
      profiles: hydratedMadnessProfiles,
      references: madnessReferences,
    },
    formatting: {
      modathonEvent: modathonEvent.indent,
      modjamEvent: modjamEvent.indent,
      madnessEvent: madnessEvent.indent,
      centralModders: centralModders.indent,
      modathonNexus: modathonNexus.indent,
      achievementsByYear: achievementFormatting,
      modjamMods: modjamMods.indent,
      madnessTeams: madnessTeams.indent,
      madnessMods: madnessMods.indent,
    },
  };
}

function reconcileCentralModders(currentRegistry, publishing, selectedPersonIds = null) {
  const registry = clone(currentRegistry);
  const remappedIds = new Map();

  for (const person of publishing.sheets.Modders) {
    if (!person.person_id || !person.display_name) continue;
    if (selectedPersonIds && !selectedPersonIds.has(person.person_id)) continue;
    const profileUrl = normalizedUrl(person.nexus_profile_url);
    const names = new Set(
      [person.display_name, ...splitList(person.aliases)].map(identityKey).filter(Boolean),
    );
    let profile = registry.modders.find(candidate => candidate.id === person.person_id);
    if (!profile && profileUrl) {
      profile = registry.modders.find(
        candidate => normalizedUrl(candidate.nexusProfileUrl) === profileUrl,
      );
    }
    if (!profile) {
      profile = registry.modders.find(candidate => (
        names.has(identityKey(candidate.name))
        || (candidate.aliases || []).some(alias => names.has(identityKey(alias)))
      ));
    }

    if (!profile) {
      registry.modders.push({
        id: person.person_id,
        name: person.display_name,
        nexusProfileUrl: person.nexus_profile_url || null,
        avatarUrl: person.avatar_url || null,
        ...(splitList(person.aliases).length ? { aliases: splitList(person.aliases) } : {}),
      });
      continue;
    }

    if (profile.id !== person.person_id) {
      if (registry.modders.some(candidate => candidate !== profile && candidate.id === person.person_id)) {
        throw new PublishingValidationError([
          `${person.person_id}: central modder ID is already assigned to another profile`,
        ]);
      }
      remappedIds.set(profile.id, person.person_id);
      profile.id = person.person_id;
    }
    const aliases = [
      ...(profile.aliases || []),
      ...splitList(person.aliases),
      ...(identityKey(profile.name) === identityKey(person.display_name) ? [] : [profile.name]),
    ].filter((alias, index, values) => (
      identityKey(alias) !== identityKey(person.display_name)
      && values.findIndex(candidate => identityKey(candidate) === identityKey(alias)) === index
    ));
    profile.name = person.display_name;
    profile.nexusProfileUrl = person.nexus_profile_url || profile.nexusProfileUrl || null;
    profile.avatarUrl = person.avatar_url || profile.avatarUrl || null;
    if (aliases.length) profile.aliases = aliases;
    else delete profile.aliases;
  }

  return { registry, remappedIds };
}

function remapReferenceId(id, remappedIds) {
  let next = id;
  const visited = new Set();
  while (remappedIds.has(next) && !visited.has(next)) {
    visited.add(next);
    next = remappedIds.get(next);
  }
  return next;
}

function uniqueReferences(values, remappedIds) {
  return [...new Set(values.map(id => remapReferenceId(id, remappedIds)).filter(Boolean))];
}

function centralProfileFor(registry, value) {
  const directId = value?.id && registry.modders.find(profile => profile.id === value.id);
  if (directId) return directId;
  const profileUrl = normalizedUrl(value?.profileUrl || value?.nexusProfileUrl);
  if (profileUrl) {
    const byUrl = registry.modders.find(
      profile => normalizedUrl(profile.nexusProfileUrl) === profileUrl,
    );
    if (byUrl) return byUrl;
  }
  const key = identityKey(value?.name);
  return registry.modders.find(profile => (
    identityKey(profile.name) === key
    || (profile.aliases || []).some(alias => identityKey(alias) === key)
  )) || null;
}

function normalizeBuiltSiteData(
  centralUpdate,
  current,
  publishing,
  sitePersonIds,
  legacyModathon,
  legacyModjam,
  legacyMadness,
) {
  const { registry, remappedIds } = centralUpdate;

  for (const profile of legacyModjam.profiles.modders) {
    if (centralProfileFor(registry, profile)) continue;
    registry.modders.push({
      id: profile.id,
      name: profile.name,
      nexusProfileUrl: profile.nexusProfileUrl || null,
      avatarUrl: profile.avatarUrl || null,
    });
  }

  const modathonIds = uniqueReferences([
    ...(current.modathon.references.modders || []),
    ...legacyModathon.modders.modders.map(profile => (
      centralProfileFor(registry, profile)?.id
    )),
  ], remappedIds);
  const modjamIds = uniqueReferences(
    legacyModjam.profiles.modders.map(profile => profile.id),
    remappedIds,
  );
  const madnessMemberIds = [];
  const madnessYears = legacyMadness.teamsByYear.map(group => ({
    ...group,
    teams: group.teams.map(team => ({
      ...team,
      members: team.members.map(member => {
        const directId = remapReferenceId(member.id, remappedIds);
        const profile = registry.modders.find(candidate => candidate.id === directId)
          || centralProfileFor(registry, member);
        if (!profile) {
          throw new PublishingValidationError([
            `${member.name || member.id}: Madness member has no central modder profile`,
          ]);
        }
        madnessMemberIds.push(profile.id);
        return { id: profile.id };
      }),
    })),
  }));
  const madnessIds = uniqueReferences([
    ...(current.madness.references.modders || []),
    ...sitePersonIds.get('madness'),
    ...madnessMemberIds,
  ], remappedIds);
  const archive = clone(legacyModjam.archive);
  archive.events.forEach(event => event.entries.forEach(entry => {
    entry.authors = entry.authors.map(author => ({
      id: remapReferenceId(author.id, remappedIds),
    }));
  }));

  return {
    centralModders: registry,
    modathon: {
      ...legacyModathon,
      modders: { modders: modathonIds },
    },
    modjam: {
      ...legacyModjam,
      archive,
      profiles: {
        generatedAt: legacyModjam.profiles.generatedAt,
        modders: modjamIds,
      },
    },
    madness: {
      ...legacyMadness,
      teamsByYear: { years: madnessYears },
      modsByYear: { years: legacyMadness.modsByYear },
      profiles: { modders: madnessIds },
    },
  };
}

function adaptLegacyCurrentData(current) {
  if (current.centralModders) return current;
  const adapted = clone(current);
  const registry = { modders: [] };

  function upsert(profile, preferredId) {
    const existing = centralProfileFor(registry, profile);
    if (existing) return existing;
    const created = {
      id: preferredId || slugify(profile.name),
      name: profile.name,
      nexusProfileUrl: profile.nexusProfileUrl || profile.profileUrl || profile.url || null,
      avatarUrl: profile.avatarUrl || profile.avatar || null,
      ...(profile.aliases?.length ? { aliases: clone(profile.aliases) } : {}),
    };
    registry.modders.push(created);
    return created;
  }

  const modathonReferences = (adapted.modathon.modders.modders || []).map(
    profile => upsert(profile).id,
  );
  const modjamReferences = (adapted.modjam.profiles.modders || []).map(
    profile => upsert(profile, profile.id).id,
  );
  const madnessReferences = (adapted.madness.profiles || []).map(
    profile => upsert(profile, profile.id).id,
  );
  adapted.madness.teamsByYear.forEach(group => group.teams.forEach(team => {
    team.members.forEach(member => {
      const profile = upsert(member, member.id);
      member.id = profile.id;
      if (!madnessReferences.includes(profile.id)) madnessReferences.push(profile.id);
    });
  }));

  adapted.centralModders = registry;
  adapted.modathon.references = { modders: modathonReferences };
  adapted.modjam.references = {
    generatedAt: adapted.modjam.profiles.generatedAt,
    modders: modjamReferences,
  };
  const rawModjam = clone(adapted.modjam.archive);
  rawModjam.events.forEach(event => event.entries.forEach(entry => {
    entry.authors = entry.authors.map(author => ({ id: author.id }));
  }));
  const separatedModjam = separateModjamData(rawModjam);
  adapted.modjam.rawArchive = separatedModjam.archive;
  adapted.modjam.rawMods = separatedModjam.mods;
  adapted.madness.references = { modders: madnessReferences };
  adapted.madness.rawTeamsByYear = {
    years: adapted.madness.teamsByYear.map(group => ({
      ...group,
      teams: group.teams.map(team => ({
        ...team,
        members: team.members.map(member => ({ id: member.id })),
      })),
    })),
  };
  adapted.madness.rawModsByYear = { years: clone(adapted.madness.modsByYear) };
  return adapted;
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
  current = adaptLegacyCurrentData(current);
  if (!['draft', 'publish'].includes(mode)) {
    throw new PublishingValidationError([`Unsupported import mode: ${mode}`]);
  }
  const normalizedPublishing = normalizePersonReferences(publishing);
  validateWorkbookRelationships(normalizedPublishing);
  const selectedEvents = eventsForSync(normalizedPublishing.sheets.Events, mode);
  validateEvents(selectedEvents);
  const selectedEventIds = new Set(selectedEvents.map(event => event.event_id));
  const sitePersonIds = personIdsBySite(normalizedPublishing, selectedEventIds);
  const selectedPersonIds = new Set(
    [...sitePersonIds.values()].flatMap(ids => [...ids]),
  );
  const byType = new Map(EVENT_TYPES.map(type => [
    type,
    selectedEvents.filter(event => event.event_type === type),
  ]));
  const eventConfig = buildEventConfig(
    normalizedPublishing,
    current.eventConfig,
    mode,
  );

  const legacyModathon = buildAllModathonUpdates(normalizedPublishing, current.modathon, {
    events: byType.get('modathon'),
    mode,
    allowRemovals,
    generatedAt,
  });
  const legacyModjam = buildModjamUpdate(normalizedPublishing, current.modjam, {
    events: byType.get('modjam'),
    mode,
    allowRemovals,
    generatedAt,
    sitePersonIds,
  });
  const legacyMadness = buildMadnessUpdate(normalizedPublishing, current.madness, {
    events: byType.get('madness'),
    mode,
    allowRemovals,
    sitePersonIds,
    eventConfig: eventConfig.madness,
  });
  const centralUpdate = reconcileCentralModders(
    current.centralModders,
    normalizedPublishing,
    selectedPersonIds,
  );
  const {
    centralModders,
    modathon,
    modjam,
    madness,
  } = normalizeBuiltSiteData(
    centralUpdate,
    current,
    normalizedPublishing,
    sitePersonIds,
    legacyModathon,
    legacyModjam,
    legacyMadness,
  );

  const changedFiles = [];
  if (!sameValue(centralModders, current.centralModders)) {
    changedFiles.push('assets/data/modders.json');
  }
  if (!sameValue(modathon.nexusStats, current.modathon.nexusStats)) {
    changedFiles.push('modathon/assets/data/modathon-mods.json');
  }
  for (const [year, achievements] of modathon.achievementsByYear) {
    if (!sameValue(achievements, current.modathon.achievementsByYear.get(year))) {
      changedFiles.push(`modathon/assets/data/${year}-achievements.json`);
    }
  }
  const separatedModjam = separateModjamData(modjam.archive);
  eventConfig.modjam = separatedModjam.archive;
  if (!sameValue(separatedModjam.mods, current.modjam.rawMods)) {
    changedFiles.push('modjam/data/modjam-mods.json');
  }
  if (!sameValue(madness.teamsByYear, current.madness.rawTeamsByYear)) {
    changedFiles.push('madness/data/madness-teams.json');
  }
  if (!sameValue(madness.modsByYear, current.madness.rawModsByYear)) {
    changedFiles.push('madness/data/madness-mods.json');
  }
  if (!sameValue(eventConfig.modathon, current.eventConfig.modathon)) {
    changedFiles.push('modathon/assets/data/modathon-event.json');
  }
  if (!sameValue(eventConfig.modjam, current.eventConfig.modjam)) {
    changedFiles.push('modjam/data/modjam-event.json');
  }
  if (!sameValue(eventConfig.madness, current.eventConfig.madness)) {
    changedFiles.push('madness/data/madness-event.json');
  }

  return {
    mode,
    selectedEvents,
    eventConfig,
    centralModders,
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
  const separatedModjam = separateModjamData(result.modjam.archive);
  const addJsonWrite = (relativePath, value, indent) => {
    if (!changed.has(relativePath)) return;
    writes.push(writeFile(path.join(repoRoot, ...relativePath.split('/')), jsonText(value, indent)));
  };

  addJsonWrite(
    'assets/data/modders.json',
    result.centralModders,
    current.formatting.centralModders,
  );
  addJsonWrite(
    'modathon/assets/data/modathon-mods.json',
    result.modathon.nexusStats,
    current.formatting.modathonNexus,
  );
  for (const [year, achievements] of result.modathon.achievementsByYear) {
    addJsonWrite(
      `modathon/assets/data/${year}-achievements.json`,
      achievements,
      current.formatting.achievementsByYear.get(year) || '  ',
    );
  }
  addJsonWrite(
    'modjam/data/modjam-mods.json',
    separatedModjam.mods,
    current.formatting.modjamMods,
  );
  addJsonWrite(
    'madness/data/madness-teams.json',
    result.madness.teamsByYear,
    current.formatting.madnessTeams,
  );
  addJsonWrite(
    'madness/data/madness-mods.json',
    result.madness.modsByYear,
    current.formatting.madnessMods,
  );
  addJsonWrite(
    'modathon/assets/data/modathon-event.json',
    result.eventConfig.modathon,
    current.formatting.modathonEvent,
  );
  addJsonWrite(
    'modjam/data/modjam-event.json',
    result.eventConfig.modjam,
    current.formatting.modjamEvent,
  );
  addJsonWrite(
    'madness/data/madness-event.json',
    result.eventConfig.madness,
    current.formatting.madnessEvent,
  );
  await Promise.all(writes);
}

function parseArguments(argv) {
  const options = {
    sourceDirectory: null,
    mode: 'publish',
    dryRun: false,
    allowRemovals: false,
    repoRoot: path.resolve('.'),
    schemaPath: path.resolve('publishing/schema-v2.json'),
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
