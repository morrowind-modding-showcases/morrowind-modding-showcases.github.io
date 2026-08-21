export const RESOURCE_TABS = Object.freeze([
  { key: 'repositories', label: 'Repositories' },
  { key: 'community', label: 'Community', usesSections: false },
  { key: 'tutorials', label: 'Tutorials', usesSections: false },
  { key: 'tools', label: 'Tools & Utilities' },
  { key: 'frameworks', label: 'Frameworks', usesSections: false },
]);

export const RESOURCE_TAGS = Object.freeze([
  'MWSE',
  'OpenMW',
  'Scripting',
  'Dialogue',
  'Quests',
  'NPCs',
  'Interiors',
  'Exteriors',
  '3D',
  '2D',
  'Animation',
  'VFX',
  'Audio',
  'UI',
  'Compatibility',
  'Character Creation',
  'Mod Cleaning',
  'Website',
  'Discord',
  'YouTube',
  'Video',
  'Written',
  'Plugin',
]);

export function collectResourceEntries(document) {
  return RESOURCE_TABS.flatMap(({ key, usesSections = true }) => (
    usesSections
      ? document.tabs[key].sections.flatMap(section => section.entries)
      : document.tabs[key].entries
  ));
}

export function resourceEntryTags(entry) {
  const uniqueTags = new Map();
  for (const tag of [...(entry.tags || []), ...(entry.newTags || [])]) {
    const key = tag.toLocaleLowerCase();
    if (!uniqueTags.has(key)) uniqueTags.set(key, tag);
  }
  return [...uniqueTags.values()];
}

export function collectResourceTags(document) {
  const authoredTags = collectResourceEntries(document).flatMap(resourceEntryTags);
  const defaultTagKeys = new Set(RESOURCE_TAGS.map(tag => tag.toLocaleLowerCase()));
  const customTags = [...new Map(authoredTags.map(tag => [tag.toLocaleLowerCase(), tag])).entries()]
    .filter(([tagKey]) => !defaultTagKeys.has(tagKey))
    .map(([, tag]) => tag)
    .sort((left, right) => left.localeCompare(right));
  return [...RESOURCE_TAGS, ...customTags];
}
