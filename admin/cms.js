(function initializeContentManager() {
  "use strict";

  const originalDocuments = new Map();
  const adminData = {
    registry: null,
    modathon: null,
    madness: null,
    modjam: null,
  };
  const adminDataRequests = new Map();
  const adminDataUrls = {
    registry: "../assets/data/modders.json",
    modathon: "../modathon/assets/data/modathon-mods.json",
    madness: "../madness/data/madness-mods.json",
    modjam: "../modjam/data/modjam-mods.json",
  };
  const madnessRegistrationFormId = "xkodjdza";
  const modathonAwardNames = [
    "Champion of Style",
    "Champion of Legends",
    "Champion of the World",
    "Champion of Life",
    "Champion of Artistry",
    "Champion of Comfort",
    "Champion of Clutter",
    "Champion of Enhancement",
    "Champion of Culture",
    "Champion of Dungeoneering",
    "Champion of Immersion",
    "Champion of the Community",
    "The People's Choice",
    "Numbers Matter",
  ];
  const eventCountdownTemplates = {
    "event:modathon": {
      start: "2026-05-01T00:00:00.000Z",
      end: "2026-06-02T00:00:00.000Z",
      graceEnd: "2026-06-02T12:00:00.000Z",
      reset: "2026-07-01T00:00:00.000Z",
    },
    "event:madness": {
      registrationOpen: "2026-09-01T00:00:00.000Z",
      competitionStart: "2026-10-01T00:00:00.000Z",
      submissionsClose: "2026-11-07T00:00:00.000Z",
      bugFixEnd: "2026-11-15T00:00:00.000Z",
    },
    "event:modjam": {
      kickoffStart: "2026-08-21T23:00:00.000Z",
      start: "2026-08-22T00:00:00.000Z",
      end: "2026-08-24T00:00:00.000Z",
    },
  };
  const eventYears = new Map();
  const eventYearSubscribers = new Map();
  const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

  const preferredKeyOrders = [
    ["schemaVersion", "eventType", "events"],
    ["name", "year", "season", "timezoneLabel", "countdown", "registrationFormId", "note", "individualModCards", "awards"],
    ["id", "label", "name", "season", "year", "timezoneLabel", "countdown", "participationBannerUrl", "banner", "headers", "resultsStreamUrl", "competitionType", "competitionLabel", "competitionNote", "hasJudgeAwards"],
    ["start", "end", "graceEnd", "reset"],
    ["kickoffStart", "start", "end"],
    ["registrationOpen", "competitionStart", "submissionsClose", "bugFixEnd"],
    ["generated", "game", "mods"],
    ["schemaVersion", "event", "achievements"],
    ["name", "year"],
    [
      "id",
      "name",
      "requirement",
      "rarity",
      "rarityKey",
      "group",
      "masteryName",
      "imageUrl",
      "unlockedBy",
      "unlockedCount",
    ],
    [
      "year",
      "name",
      "authors",
      "category",
      "url",
      "showcaseUrl",
      "downloads",
      "uniqueDownloads",
      "endorsements",
      "available",
      "pictureUrl",
      "nexusCategory",
      "status",
    ],
    ["modders"],
    ["id", "name", "nexusProfileUrl", "avatarUrl", "aliases"],
    ["years"],
    ["year", "teams"],
    ["name", "place", "mods", "members"],
    ["id"],
    ["year", "mods"],
    ["name", "url", "team", "category", "place", "notes", "pictureUrl"],
    ["judges"],
    ["modderId"],
    ["events"],
    ["id", "label", "season", "year", "banner", "headers", "resultsStreamUrl", "competitionType", "competitionLabel", "competitionNote", "hasJudgeAwards"],
    ["generatedAt", "summary", "events"],
    ["id", "mods"],
    ["id", "title", "url", "authors", "themes", "category", "placement", "placementLabel", "awards", "awardPlacardUrl", "pictureUrl"],
    ["postcards"],
    ["file", "entryId", "caption", "captionPosition"],
    ["year", "awards", "note", "individualModCards"],
    ["award", "mods"],
    ["name", "attribution", "archiveName"],
  ];

  function identityKey(value) {
    return String(value || "")
      .normalize("NFKD")
      .toLocaleLowerCase()
      .replace(/[^a-z0-9]+/g, "");
  }

  function documentKey(value) {
    if (!value || Array.isArray(value) || typeof value !== "object") {
      return null;
    }
    if (["modathon", "modjam", "madness"].includes(value.eventType)) {
      return `event:${value.eventType}`;
    }
    if (value.mods && hasOwn(value, "generated") && hasOwn(value, "game")) {
      return "submissions";
    }
    if (value.event && Array.isArray(value.achievements)) {
      return `achievements:${value.event.year}`;
    }
    if (Array.isArray(value.modders)) {
      return "central-modders";
    }
    if (Array.isArray(value.judges)) {
      return "judges";
    }
    if (Array.isArray(value.events)) {
      return value.events.some((event) => Array.isArray(event?.mods))
        ? "modjam-mods"
        : "modjams";
    }
    if (Array.isArray(value.postcards)) {
      return "postcards";
    }
    if (Array.isArray(value.years) && value.years.some((year) => Array.isArray(year?.teams))) {
      return "madness-teams";
    }
    if (Array.isArray(value.years) && value.years.some((year) => Array.isArray(year?.mods))) {
      return "madness-mods";
    }
    if (Array.isArray(value.years)) {
      return "winners";
    }
    return null;
  }

  function cacheDocument(key, value) {
    if (key === "central-modders") adminData.registry = value;
    if (key === "submissions") adminData.modathon = value;
    if (key === "madness-mods") adminData.madness = value;
    if (key === "modjam-mods") adminData.modjam = value;
  }

  function loadAdminData(key) {
    if (adminData[key]) return Promise.resolve(adminData[key]);
    if (adminDataRequests.has(key)) return adminDataRequests.get(key);
    if (typeof window.fetch !== "function") return Promise.resolve(null);

    const request = window.fetch(adminDataUrls[key])
      .then((response) => {
        if (!response.ok) throw new Error(`Could not load ${key} admin data`);
        return response.json();
      })
      .then((value) => {
        adminData[key] = value;
        return value;
      })
      .catch(() => null);
    adminDataRequests.set(key, request);
    return request;
  }

  function preferredOrderFor(value) {
    const keys = Object.keys(value);
    let best = null;

    for (const order of preferredKeyOrders) {
      const matches = order.filter((key) => hasOwn(value, key)).length;
      if (matches && (!best || matches > best.matches)) {
        best = { matches, order };
      }
    }

    if (!best || best.matches < Math.min(2, keys.length)) {
      return keys;
    }

    return [
      ...best.order.filter((key) => hasOwn(value, key)),
      ...keys.filter((key) => !best.order.includes(key)),
    ];
  }

  function orderNewValue(value) {
    if (Array.isArray(value)) {
      return value.map(orderNewValue);
    }
    if (!value || typeof value !== "object") {
      return value;
    }

    const ordered = {};
    for (const key of preferredOrderFor(value)) {
      ordered[key] = orderNewValue(value[key]);
    }
    return ordered;
  }

  function orderLikeOriginal(value, original) {
    if (Array.isArray(value)) {
      return value.map((item, index) =>
        index < (original?.length ?? 0)
          ? orderLikeOriginal(item, original[index])
          : orderNewValue(item),
      );
    }
    if (!value || typeof value !== "object") {
      return value;
    }
    if (!original || Array.isArray(original) || typeof original !== "object") {
      return orderNewValue(value);
    }

    const ordered = {};
    for (const key of Object.keys(original)) {
      if (hasOwn(value, key)) {
        ordered[key] = orderLikeOriginal(value[key], original[key]);
      }
    }
    for (const key of Object.keys(value)) {
      if (!hasOwn(ordered, key)) {
        ordered[key] = orderNewValue(value[key]);
      }
    }
    return ordered;
  }

  function toEditorValue(value, key) {
    if (key !== "submissions" || Array.isArray(value.mods)) return value;
    return {
      ...value,
      mods: Object.entries(value.mods || {}).flatMap(([year, mods]) =>
        (mods || []).map((mod) => ({ year: Number(year), ...mod })),
      ),
    };
  }

  function toStoredValue(value, key) {
    if (key !== "submissions" || !Array.isArray(value.mods)) return value;
    const mods = {};
    for (const entry of value.mods) {
      const year = String(entry.year);
      const { year: _year, ...mod } = entry;
      if (!mods[year]) mods[year] = [];
      mods[year].push(mod);
    }
    return {
      ...value,
      mods: Object.fromEntries(
        Object.entries(mods).sort(([left], [right]) => Number(left) - Number(right)),
      ),
    };
  }

  const competitionCopy = {
    "just-for-fun": {
      label: "Just for fun",
      note: "No ranked winner; prizes were awarded by random drawing.",
    },
    "popular-choice": {
      label: "Popular Choice",
      note: "The community selected a Popular Choice winner.",
    },
    judged: {
      label: "Judged competition",
      note: "A judging panel selected the placed entries.",
    },
  };

  function madnessModsByYear() {
    const source = adminData.madness || originalDocuments.get("madness-mods");
    return new Map((source?.years || []).map((group) => [
      Number(group.year),
      new Map((group.mods || []).map((mod) => [mod.name, mod])),
    ]));
  }

  function eventItemKey(forID) {
    const match = String(forID || "").match(/^(.*?events(?:[-_.[\]]+)\d+)/i);
    return match ? match[1] : String(forID || "").replace(/[-_.[\]]+[^-_.[\]]+$/, "");
  }

  function eventItemIndex(forID) {
    const match = String(forID || "").match(/events(?:[-_.[\]]+)(\d+)/i);
    return match ? Number(match[1]) : null;
  }

  function isNewEventControl(forID, eventType) {
    const index = eventItemIndex(forID);
    const count = originalDocuments.get(`event:${eventType}`)?.events?.length;
    return index == null || count == null || index >= count;
  }

  function isoInYear(value, year) {
    if (!value || !Number.isInteger(Number(year))) return value;
    return String(value).replace(/^\d{4}(?=-)/, String(year));
  }

  function derivedModjamMetadata(event) {
    const season = String(event.season || "").trim();
    const year = Number(event.year);
    if (!season || !Number.isInteger(year)) return;
    event.id = `${season.toLocaleLowerCase()}-${year}`;
    event.label = `${season} ${year}`;
    event.name = `${season} Modjam ${year}`;
  }

  function isNewEventIndex(index, key) {
    return index >= (originalDocuments.get(key)?.events?.length || 0);
  }

  function fillNewEventDefaults(event, key) {
    const year = Number(event.year);
    if (!Number.isInteger(year)) return;
    const countdown = {
      ...(eventCountdownTemplates[key] || {}),
      ...(event.countdown || {}),
    };
    if (Object.keys(countdown).length) {
      event.countdown = Object.fromEntries(
        Object.entries(countdown).map(([name, value]) => [name, isoInYear(value, year)]),
      );
    }
    if (key === "event:modathon" && (!Array.isArray(event.awards) || !event.awards.length)) {
      event.awards = modathonAwardNames.map((award) => ({ award, mods: [] }));
    }
    if (key === "event:madness" && !event.registrationFormId) {
      event.registrationFormId = madnessRegistrationFormId;
    }
  }

  function deriveValues(value) {
    const derived = JSON.parse(JSON.stringify(value));
    const key = documentKey(derived);

    if (derived?.event && Array.isArray(derived.achievements)) {
      derived.achievements.forEach((achievement) => {
        achievement.unlockedCount = Array.isArray(achievement.unlockedBy)
          ? achievement.unlockedBy.length
          : 0;
      });
    }

    if (key === "event:modathon") {
      derived.events.forEach((event, index) => {
        const year = Number(event.year);
        if (Number.isInteger(year)) event.name = `Morrowind Modathon ${year}`;
        if (isNewEventIndex(index, key)) fillNewEventDefaults(event, key);
      });
    }

    if (key === "event:madness") {
      derived.events.forEach((event, index) => {
        const year = Number(event.year);
        if (Number.isInteger(year)) event.name = `Morrowind Modding Madness ${year}`;
        if (isNewEventIndex(index, key)) fillNewEventDefaults(event, key);
      });
    }

    if (key === "event:modjam") {
      derived.events.forEach((event, index) => {
        derivedModjamMetadata(event);
        if (isNewEventIndex(index, key)) fillNewEventDefaults(event, key);
        const copy = competitionCopy[event.competitionType] || competitionCopy.judged;
        event.competitionLabel = copy.label;
        event.competitionNote = copy.note;
      });
    }

    if (key === "judges") {
      derived.judges.forEach((judge) => delete judge.listedAs);
    }

    if (key === "madness-teams") {
      const modsByYear = madnessModsByYear();
      derived.years.forEach((group) => {
        const lookup = modsByYear.get(Number(group.year)) || new Map();
        (group.teams || []).forEach((team) => {
          team.mods = (team.mods || []).flatMap((mod) => {
            if (!mod.url && /^\d+(?:st|nd|rd|th) Place(?:\s*\(tie\))?$/i.test(mod.name || "")) {
              if (!team.place) team.place = mod.name;
              return [];
            }
            const archiveMod = lookup.get(mod.name);
            return [{
              name: mod.name,
              url: archiveMod?.url || mod.url || null,
            }];
          });
        });
      });
    }

    if (key === "modjam-mods" && derived.summary) {
      const entries = derived.events.flatMap((event) => event.mods || []);
      derived.summary.eventCount = derived.events.length;
      derived.summary.entryCount = entries.length;
      derived.summary.modderCount = new Set(
        entries.flatMap((entry) => (entry.authors || []).map((author) => author.id || author)),
      ).size;
      derived.summary.listedModderCount = derived.summary.modderCount;
      derived.summary.placementCount = entries.filter((entry) => entry.placement).length;
      derived.summary.judgeAwardCount = entries.reduce(
        (count, entry) => count + (Array.isArray(entry.awards) ? entry.awards.length : 0),
        0,
      );
      derived.summary.placardCount = entries.filter((entry) => entry.awardPlacardUrl).length;
      derived.summary.categories = [...new Set(entries.map((entry) => entry.category).filter(Boolean))]
        .sort((left, right) => left.localeCompare(right));
    }
    return derived;
  }

  window.CMS.registerCustomFormat("json", "json", {
    fromFile(text) {
      const value = JSON.parse(text);
      const key = documentKey(value);
      if (key) {
        originalDocuments.set(key, JSON.parse(text));
        cacheDocument(key, value);
      }
      return toEditorValue(value, key);
    },
    toFile(value) {
      const key = documentKey(value);
      const stored = toStoredValue(deriveValues(value), key);
      const original = originalDocuments.get(key);
      return `${JSON.stringify(orderLikeOriginal(stored, original), null, 2)}\n`;
    },
  });

  function fieldSetting(field, name, fallback = "") {
    if (!field) return fallback;
    const value = typeof field.get === "function" ? field.get(name) : field[name];
    return value == null ? fallback : value;
  }

  function previewData(entry) {
    if (!entry) return {};
    const value = typeof entry.getIn === "function"
      ? entry.getIn(["data"])
      : entry.data;
    if (value && typeof value.toJS === "function") return value.toJS();
    return value && typeof value === "object" ? value : {};
  }

  function previewText(value, fallback = "") {
    if (typeof value === "string") return value.trim() || fallback;
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    if (value && typeof value === "object") {
      return previewText(
        value.name
        || value.title
        || value.label
        || value.id
        || value.author
        || value.modder,
        fallback,
      );
    }
    return fallback;
  }

  function previewList(value) {
    const items = Array.isArray(value)
      ? value
      : value == null || value === "" ? [] : [value];
    return items
      .map((item) => {
        const id = previewText(item?.id);
        if (id) {
          return registryProfileFor(id, "id")?.name || previewText(item, id);
        }
        return previewText(item);
      })
      .filter(Boolean);
  }

  function previewListText(value, fallback = "Not yet provided") {
    const items = previewList(value);
    return items.length ? items.join(", ") : fallback;
  }

  function previewAssetUrl(props, value) {
    const path = previewText(value);
    if (!path) return "";
    try {
      const asset = typeof props.getAsset === "function" ? props.getAsset(path) : path;
      if (typeof asset === "string") return asset;
      if (asset && typeof asset.toString === "function") return asset.toString();
    } catch {
      return path;
    }
    return path;
  }

  function previewInitials(value) {
    const text = previewText(value, "?");
    return text
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toLocaleUpperCase() || "")
      .join("") || "?";
  }

  function previewNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? new Intl.NumberFormat("en-US").format(number) : "";
  }

  function previewMatches(values, query) {
    const key = String(query || "").trim().toLocaleLowerCase();
    if (!key) return true;
    return values
      .flatMap((value) => previewList(value))
      .join(" ")
      .toLocaleLowerCase()
      .includes(key);
  }

  function selectStyle() {
    return {
      boxSizing: "border-box",
      padding: "12px",
      width: "100%",
    };
  }

  function registryProfiles() {
    return (adminData.registry?.modders || [])
      .slice()
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  function registryProfileFor(value, valueType) {
    const profiles = registryProfiles();
    if (valueType === "id") return profiles.find((profile) => profile.id === value);
    const key = identityKey(value);
    return profiles.find((profile) => (
      identityKey(profile.name) === key
      || (profile.aliases || []).some((alias) => identityKey(alias) === key)
    ));
  }

  if (typeof window.CMS.registerPreviewStyle === "function") {
    window.CMS.registerPreviewStyle("./preview.css");
  }

  function archiveOptions(source) {
    if (source === "modathon") {
      return Object.entries(adminData.modathon?.mods || {}).flatMap(([year, mods]) =>
        (mods || []).map((mod) => ({
          group: String(year),
          year: Number(year),
          value: mod.name,
          label: mod.name,
        })),
      );
    }
    if (source === "madness") {
      return (adminData.madness?.years || []).flatMap((group) =>
        (group.mods || []).map((mod) => ({
          group: String(group.year),
          year: Number(group.year),
          value: mod.name,
          label: mod.name,
        })),
      );
    }
    if (source === "modjam") {
      return (adminData.modjam?.events || []).flatMap((group) =>
        (group.mods || []).map((mod) => ({
          group: group.id,
          value: mod.id,
          label: mod.title,
        })),
      );
    }
    return [];
  }

  function contextYear(forID, documentName, options, currentValue) {
    const isModathonEvents = documentName === "modathon-events";
    const key = documentName === "madness-teams"
      ? "madness-teams"
      : isModathonEvents ? "event:modathon" : "winners";
    const document = originalDocuments.get(key);
    const listName = isModathonEvents ? "events" : "years";
    const match = String(forID || "").match(new RegExp(`${listName}(?:[-_.[\\]]+)(\\d+)`, "i"));
    if (match && document?.[listName]?.[Number(match[1])]) {
      return Number(document[listName][Number(match[1])].year);
    }
    const matches = options.filter((option) => option.value === currentValue);
    return matches.length === 1 && Number.isFinite(matches[0].year)
      ? matches[0].year
      : null;
  }

  if (typeof window.createClass === "function" && typeof window.h === "function") {
    const h = window.h;
    const previewLimit = 60;

    function previewShell({
      eyebrow,
      title,
      lede,
      toolbar = null,
      total = null,
      visible = null,
      noun = "records",
      children = [],
      note = "",
    }) {
      const content = Array.isArray(children) ? children : [children];
      const hasSummary = Number.isFinite(total) && Number.isFinite(visible);
      return h("main", { className: "dem-preview" },
        h("header", { className: "dem-preview__header" },
          h("p", { className: "dem-preview__eyebrow" }, eyebrow),
          h("h1", { className: "dem-preview__title" }, title),
          lede && h("p", { className: "dem-preview__lede" }, lede)),
        toolbar,
        hasSummary && h("p", {
          className: "dem-preview__summary",
          role: "status",
        },
        h("span", null,
          h("strong", null, previewNumber(total)),
          ` ${noun}`),
        visible < total && h("span", null, `Showing ${previewNumber(visible)}`)),
        ...content,
        note && h("p", { className: "dem-preview__note" }, note));
    }

    function previewToolbar({ groups = [], selected = "", groupLabel = "Group", query = "", onGroup, onQuery }) {
      if (!groups.length && typeof onQuery !== "function") return null;
      return h("div", { className: "dem-preview__toolbar", "aria-label": "Preview filters" },
        groups.length > 0 && h("label", { className: "dem-preview__field" },
          h("span", null, groupLabel),
          h("select", {
            value: selected,
            onChange: (event) => onGroup(event.target.value),
          },
          ...groups.map((group) => h("option", { key: group, value: group }, group)))),
        typeof onQuery === "function" && h("label", { className: "dem-preview__field" },
          h("span", null, "Find in preview"),
          h("input", {
            type: "search",
            value: query,
            placeholder: "Search names, authors, or categories",
            onChange: (event) => onQuery(event.target.value),
          })));
    }

    function previewEmpty(title = "Nothing to preview", detail = "Add a record in the editor to see it here.") {
      return h("div", { className: "dem-preview__empty" },
        h("div", null,
          h("strong", null, title),
          h("span", null, detail)));
    }

    function previewMedia(props, imageValue, label) {
      const src = previewAssetUrl(props, imageValue);
      return h("div", { className: "dem-preview-card__media" },
        h("span", { className: "dem-preview-card__placeholder", "aria-hidden": "true" },
          previewInitials(label)),
        src && h("img", {
          src,
          alt: "",
          onError: (event) => {
            event.currentTarget.hidden = true;
          },
        }));
    }

    function previewModCard(props, mod, theme, context = "") {
      const title = previewText(mod.name || mod.title, "Untitled mod");
      const authors = previewListText(mod.authors || mod.members, "Author not yet provided");
      const category = previewText(mod.category);
      const team = previewText(mod.team);
      const placement = previewText(mod.place || mod.placementLabel || mod.placement);
      const themes = previewList(mod.themes);
      const awards = previewList(mod.awards);
      const downloads = previewNumber(mod.downloads);
      const endorsements = previewNumber(mod.endorsements);
      const meta = [
        category,
        team && `Team ${team}`,
        placement,
        ...themes,
        ...awards,
        downloads && `${downloads} downloads`,
        endorsements && `${endorsements} endorsements`,
      ].filter(Boolean);
      const year = previewText(mod.year);
      return h("article", {
        className: `dem-preview-card dem-preview-card--${theme}`,
        key: `${context}:${previewText(mod.id, title)}:${year}`,
      },
      previewMedia(props, mod.pictureUrl || mod.imageUrl || mod.banner, title),
      h("div", { className: "dem-preview-card__body" },
        h("div", { className: "dem-preview-card__top" },
          h("span", { className: "dem-preview-card__kicker" },
            theme === "modjam" ? "ModJam entry" : theme === "madness" ? "Madness mod" : "Modathon mod"),
          year && h("span", { className: "dem-preview-card__year" }, year)),
        h("h2", { className: "dem-preview-card__title" }, title),
        h("p", { className: "dem-preview-card__authors" }, `by ${authors}`),
        meta.length > 0 && h("div", { className: "dem-preview-card__meta" },
          ...meta.slice(0, 8).map((item, index) => h("span", {
            key: `${item}:${index}`,
            title: item,
          }, item)))));
    }

    function previewModderCard(props, modder) {
      const name = previewText(modder.name, previewText(modder.id, "Unnamed modder"));
      const avatar = previewAssetUrl(props, modder.avatarUrl);
      const aliases = previewList(modder.aliases);
      return h("article", {
        className: "dem-preview-modder",
        key: previewText(modder.id, name),
      },
      h("div", { className: "dem-preview-modder__avatar", "aria-hidden": "true" },
        h("span", null, previewInitials(name)),
        avatar && h("img", {
          src: avatar,
          alt: "",
          onError: (event) => {
            event.currentTarget.hidden = true;
          },
        })),
      h("div", { className: "dem-preview-modder__copy" },
        h("h2", null, name),
        h("p", null, aliases.length
          ? `Also known as ${aliases.join(", ")}`
          : "No previous names listed"),
        h("small", null, modder.nexusProfileUrl ? "Nexus profile linked" : "Profile link optional")));
    }

    function previewAchievementCard(props, achievement, context) {
      const name = previewText(achievement.name, "Unnamed achievement");
      const image = previewAssetUrl(props, achievement.imageUrl);
      return h("article", {
        className: "dem-preview-achievement",
        key: `${context}:${previewText(achievement.id, name)}`,
      },
      h("div", { className: "dem-preview-achievement__image", "aria-hidden": "true" },
        h("span", null, previewInitials(name)),
        image && h("img", {
          src: image,
          alt: "",
          onError: (event) => {
            event.currentTarget.hidden = true;
          },
        })),
      h("div", null,
        h("h2", null, name),
        h("p", null, previewText(achievement.requirement, "Requirement not yet provided")),
        h("small", null, [
          previewText(achievement.rarity),
          `${previewNumber(achievement.unlockedCount || previewList(achievement.unlockedBy).length)} unlocks`,
        ].filter(Boolean).join(" · "))));
    }

    function previewEventCard(event, context) {
      const year = previewText(event.year);
      const season = previewText(event.season);
      const title = previewText(
        event.label || event.name,
        [season, year].filter(Boolean).join(" ") || "Untitled event",
      );
      const countdown = event.countdown && typeof event.countdown === "object"
        ? Object.values(event.countdown).filter(Boolean).length
        : 0;
      const awards = Array.isArray(event.awards) ? event.awards.length : 0;
      const facts = [
        season,
        year,
        previewText(event.competitionLabel || event.competitionType),
        countdown && `${countdown} milestones`,
        awards && `${awards} awards`,
      ].filter(Boolean);
      return h("article", {
        className: "dem-preview-event",
        key: `${context}:${previewText(event.id, title)}:${year}`,
      },
      h("span", { className: "dem-preview__eyebrow" }, "Event record"),
      h("h2", null, title),
      h("p", null, previewText(
        event.note || event.competitionNote,
        "Schedule and public metadata preview",
      )),
      facts.length > 0 && h("div", { className: "dem-preview-event__facts" },
        ...facts.map((fact, index) => h("span", { key: `${fact}:${index}` }, fact))));
    }

    function previewGeneric(data, eyebrow, title) {
      const facts = Object.entries(data)
        .filter(([, value]) => value != null)
        .map(([key, value]) => {
          if (Array.isArray(value)) return `${value.length} ${key}`;
          if (value && typeof value === "object") return `${Object.keys(value).length} ${key}`;
          return `${key}: ${previewText(value)}`;
        })
        .filter(Boolean);
      return previewShell({
        eyebrow,
        title,
        lede: "A compact overview is shown because this document does not use a public card layout.",
        total: facts.length,
        visible: facts.length,
        noun: "document fields",
        children: facts.length
          ? h("div", { className: "dem-preview-event" },
            h("div", { className: "dem-preview-event__facts" },
              ...facts.map((fact, index) => h("span", { key: `${fact}:${index}` }, fact))))
          : previewEmpty(),
      });
    }

    const ModathonPreview = window.createClass({
      getInitialState() {
        return { group: "", query: "" };
      },
      render() {
        const data = previewData(this.props.entry);
        if (Array.isArray(data.mods)) {
          const groups = [...new Set(data.mods.map((mod) => previewText(mod.year)).filter(Boolean))]
            .sort((left, right) => Number(right) - Number(left));
          const selected = groups.includes(this.state.group) ? this.state.group : groups[0] || "";
          const matches = data.mods.filter((mod) => (
            (!selected || previewText(mod.year) === selected)
            && previewMatches([mod.name, mod.authors, mod.category], this.state.query)
          ));
          const visible = matches.slice(0, previewLimit);
          return previewShell({
            eyebrow: "Morrowind Modathon",
            title: selected ? `${selected} mod archive` : "Mod archive",
            lede: "Cards mirror the public Modathon archive and preserve multiple-author attribution.",
            toolbar: previewToolbar({
              groups,
              selected,
              groupLabel: "Year",
              query: this.state.query,
              onGroup: (group) => this.setState({ group }),
              onQuery: (query) => this.setState({ query }),
            }),
            total: matches.length,
            visible: visible.length,
            noun: matches.length === 1 ? "mod" : "mods",
            children: visible.length
              ? h("div", { className: "dem-preview__grid" },
                ...visible.map((mod, index) => previewModCard(this.props, mod, "modathon", index)))
              : previewEmpty("No matching mods", "Adjust the preview filters or add a mod record."),
            note: matches.length > previewLimit
              ? "The preview is capped to keep this large archive responsive; use the filters to narrow it."
              : "",
          });
        }
        if (Array.isArray(data.achievements)) {
          const visible = data.achievements.slice(0, previewLimit);
          const year = previewText(data.event?.year);
          return previewShell({
            eyebrow: "Morrowind Modathon",
            title: `${year ? `${year} ` : ""}achievements`,
            lede: "Achievement badges use the public archive's compact display treatment.",
            total: data.achievements.length,
            visible: visible.length,
            noun: data.achievements.length === 1 ? "achievement" : "achievements",
            children: visible.length
              ? h("div", { className: "dem-preview__grid" },
                ...visible.map((achievement) => previewAchievementCard(this.props, achievement, year)))
              : previewEmpty(),
          });
        }
        if (Array.isArray(data.events)) {
          return previewShell({
            eyebrow: "Morrowind Modathon",
            title: "Event history",
            lede: "Countdowns, awards, and annual metadata remain visible at a glance.",
            total: data.events.length,
            visible: data.events.length,
            noun: data.events.length === 1 ? "event" : "events",
            children: data.events.length
              ? h("div", { className: "dem-preview__grid" },
                ...data.events.slice().reverse().map((event) => previewEventCard(event, "modathon")))
              : previewEmpty(),
          });
        }
        return previewGeneric(data, "Morrowind Modathon", "Document preview");
      },
    });

    const ModdersPreview = window.createClass({
      getInitialState() {
        return { query: "" };
      },
      render() {
        const data = previewData(this.props.entry);
        const modders = Array.isArray(data.modders) ? data.modders : [];
        const matches = modders
          .filter((modder) => previewMatches(
            [modder.name, modder.id, modder.aliases],
            this.state.query,
          ))
          .sort((left, right) => previewText(left.name).localeCompare(previewText(right.name)));
        const visible = matches.slice(0, previewLimit);
        return previewShell({
          eyebrow: "Dark Elf Modding",
          title: "Central modder registry",
          lede: "Profile cards echo the public ModJam and Madness directories, with resilient avatar fallbacks.",
          toolbar: previewToolbar({
            query: this.state.query,
            onQuery: (query) => this.setState({ query }),
          }),
          total: matches.length,
          visible: visible.length,
          noun: matches.length === 1 ? "modder" : "modders",
          children: visible.length
            ? h("div", { className: "dem-preview__grid dem-preview__grid--modders" },
              ...visible.map((modder) => previewModderCard(this.props, modder)))
            : previewEmpty("No matching modders", "Adjust the search or add a registry record."),
          note: matches.length > previewLimit
            ? "The preview is capped to keep the central registry responsive; search for a specific name or ID."
            : "",
        });
      },
    });

    const MadnessPreview = window.createClass({
      getInitialState() {
        return { group: "", query: "" };
      },
      render() {
        const data = previewData(this.props.entry);
        if (Array.isArray(data.years)) {
          const groups = data.years
            .map((group) => previewText(group.year))
            .filter(Boolean)
            .sort((left, right) => Number(right) - Number(left));
          const selected = groups.includes(this.state.group) ? this.state.group : groups[0] || "";
          const yearGroup = data.years.find((group) => previewText(group.year) === selected) || {};
          const records = Array.isArray(yearGroup.mods)
            ? yearGroup.mods.map((mod) => ({ ...mod, year: selected }))
            : Array.isArray(yearGroup.teams)
              ? yearGroup.teams.map((team) => ({
                ...team,
                year: selected,
                authors: team.members,
                category: team.place || "Team",
              }))
              : [];
          const matches = records.filter((record) => previewMatches(
            [record.name, record.authors, record.team, record.category],
            this.state.query,
          ));
          const visible = matches.slice(0, previewLimit);
          const isTeams = Array.isArray(yearGroup.teams);
          return previewShell({
            eyebrow: "Morrowind Modding Madness",
            title: `${selected || "Madness"} ${isTeams ? "teams" : "mods"}`,
            lede: isTeams
              ? "Team cards keep member arrays readable and preserve the archive's arena styling."
              : "Compact rows are adapted into responsive cards using the public Madness palette.",
            toolbar: previewToolbar({
              groups,
              selected,
              groupLabel: "Year",
              query: this.state.query,
              onGroup: (group) => this.setState({ group }),
              onQuery: (query) => this.setState({ query }),
            }),
            total: matches.length,
            visible: visible.length,
            noun: matches.length === 1 ? (isTeams ? "team" : "mod") : (isTeams ? "teams" : "mods"),
            children: visible.length
              ? h("div", { className: "dem-preview__grid" },
                ...visible.map((record, index) => previewModCard(this.props, record, "madness", index)))
              : previewEmpty(),
          });
        }
        if (Array.isArray(data.events)) {
          return previewShell({
            eyebrow: "Morrowind Modding Madness",
            title: "Event history",
            lede: "Seasons and live countdown milestones use the restrained arena palette.",
            total: data.events.length,
            visible: data.events.length,
            noun: data.events.length === 1 ? "event" : "events",
            children: data.events.length
              ? h("div", { className: "dem-preview__grid" },
                ...data.events.slice().reverse().map((event) => previewEventCard(event, "madness")))
              : previewEmpty(),
          });
        }
        return previewGeneric(data, "Morrowind Modding Madness", "Document preview");
      },
    });

    const ModjamPreview = window.createClass({
      getInitialState() {
        return { group: "", query: "" };
      },
      render() {
        const data = previewData(this.props.entry);
        const modGroups = Array.isArray(data.events)
          && data.events.some((event) => Array.isArray(event?.mods));
        if (modGroups) {
          const groups = data.events.map((event) => previewText(event.id)).filter(Boolean).reverse();
          const selected = groups.includes(this.state.group) ? this.state.group : groups[0] || "";
          const event = data.events.find((candidate) => previewText(candidate.id) === selected) || {};
          const matches = (event.mods || []).filter((mod) => previewMatches(
            [mod.title, mod.authors, mod.category, mod.themes],
            this.state.query,
          ));
          const visible = matches.slice(0, previewLimit);
          return previewShell({
            eyebrow: "Morrowind ModJams",
            title: selected ? selected.replaceAll("-", " ") : "Mod archive",
            lede: "Entry cards match the public archive's dark blue paper panels and seasonal accents.",
            toolbar: previewToolbar({
              groups,
              selected,
              groupLabel: "Event",
              query: this.state.query,
              onGroup: (group) => this.setState({ group }),
              onQuery: (query) => this.setState({ query }),
            }),
            total: matches.length,
            visible: visible.length,
            noun: matches.length === 1 ? "mod" : "mods",
            children: visible.length
              ? h("div", { className: "dem-preview__grid" },
                ...visible.map((mod, index) => previewModCard(this.props, mod, "modjam", `${selected}:${index}`)))
              : previewEmpty(),
          });
        }
        if (Array.isArray(data.events)) {
          return previewShell({
            eyebrow: "Morrowind ModJams",
            title: "Event history",
            lede: "Season, competition type, and countdown coverage remain visible.",
            total: data.events.length,
            visible: data.events.length,
            noun: data.events.length === 1 ? "event" : "events",
            children: data.events.length
              ? h("div", { className: "dem-preview__grid" },
                ...data.events.slice().reverse().map((event) => previewEventCard(event, "modjam")))
              : previewEmpty(),
          });
        }
        if (Array.isArray(data.postcards)) {
          const cards = data.postcards.slice(0, previewLimit).map((postcard, index) => previewModCard(
            this.props,
            {
              name: previewText(postcard.caption, previewText(postcard.entryId, "Untitled postcard")),
              category: "Postcard",
              themes: [previewText(postcard.captionPosition)].filter(Boolean),
              pictureUrl: postcard.file
                ? `/modjam/assets/postcards/full/${postcard.file}`
                : "",
            },
            "modjam",
            index,
          ));
          return previewShell({
            eyebrow: "Morrowind ModJams",
            title: "Postcard cabinet",
            lede: "Postcard art uses the same 16:9 cabinet presentation as the public site.",
            total: data.postcards.length,
            visible: cards.length,
            noun: data.postcards.length === 1 ? "postcard" : "postcards",
            children: cards.length
              ? h("div", { className: "dem-preview__grid" }, ...cards)
              : previewEmpty(),
          });
        }
        if (Array.isArray(data.judges)) {
          const judges = data.judges.map((judge) => (
            registryProfileFor(judge.modderId, "id")
            || { id: judge.modderId, name: judge.modderId }
          ));
          return previewShell({
            eyebrow: "Morrowind ModJams",
            title: "Judges",
            lede: "Judge IDs resolve through the central modder registry when available.",
            total: judges.length,
            visible: judges.length,
            noun: judges.length === 1 ? "judge" : "judges",
            children: judges.length
              ? h("div", { className: "dem-preview__grid dem-preview__grid--modders" },
                ...judges.map((judge) => previewModderCard(this.props, judge)))
              : previewEmpty(),
          });
        }
        return previewGeneric(data, "Morrowind ModJams", "Document preview");
      },
    });

    if (typeof window.CMS.registerPreviewTemplate === "function") {
      window.CMS.registerPreviewTemplate("modathon", ModathonPreview);
      window.CMS.registerPreviewTemplate("modders", ModdersPreview);
      window.CMS.registerPreviewTemplate("madness", MadnessPreview);
      window.CMS.registerPreviewTemplate("modjam", ModjamPreview);
    }

    const EventYearControl = window.createClass({
      componentDidMount() {
        const value = Number(this.props.value) || new Date().getUTCFullYear();
        if (!this.props.value) this.props.onChange(value);
        this.publish(value);
      },
      componentDidUpdate(previousProps) {
        if (previousProps.value !== this.props.value) {
          this.publish(Number(this.props.value));
        }
      },
      componentWillUnmount() {
        const key = eventItemKey(this.props.forID);
        eventYears.delete(key);
      },
      publish(value) {
        if (!Number.isInteger(value)) return;
        const key = eventItemKey(this.props.forID);
        eventYears.set(key, value);
        for (const subscriber of eventYearSubscribers.get(key) || []) {
          subscriber(value);
        }
      },
      handleChange(event) {
        const value = event.target.value ? Number(event.target.value) : null;
        this.props.onChange(Number.isInteger(value) ? value : null);
        if (value != null) this.publish(value);
      },
      render() {
        return window.h("input", {
          id: this.props.forID,
          className: this.props.classNameWrapper,
          type: "number",
          value: this.props.value || "",
          min: fieldSetting(this.props.field, "min"),
          max: fieldSetting(this.props.field, "max"),
          onChange: this.handleChange,
          style: selectStyle(),
        });
      },
    });

    const EventDateTimeControl = window.createClass({
      componentDidMount() {
        const key = eventItemKey(this.props.forID);
        const eventType = fieldSetting(this.props.field, "event_type");
        this.isNewEvent = isNewEventControl(this.props.forID, eventType);
        this.updateYear = (year) => {
          const source = this.props.value
            || (this.isNewEvent ? fieldSetting(this.props.field, "event_default") : "");
          const value = isoInYear(source, year);
          if (value && value !== this.props.value) this.props.onChange(value);
        };
        if (!eventYearSubscribers.has(key)) eventYearSubscribers.set(key, new Set());
        eventYearSubscribers.get(key).add(this.updateYear);
        this.updateYear(eventYears.get(key) || new Date().getUTCFullYear());
      },
      componentWillUnmount() {
        const key = eventItemKey(this.props.forID);
        const subscribers = eventYearSubscribers.get(key);
        if (!subscribers) return;
        subscribers.delete(this.updateYear);
        if (!subscribers.size) eventYearSubscribers.delete(key);
      },
      handleChange(event) {
        const value = event.target.value;
        this.props.onChange(value ? `${value}:00.000Z` : null);
      },
      render() {
        const value = this.props.value ? String(this.props.value).slice(0, 16) : "";
        return window.h("input", {
          id: this.props.forID,
          className: this.props.classNameWrapper,
          type: "datetime-local",
          value,
          step: 60,
          onChange: this.handleChange,
          style: selectStyle(),
        });
      },
    });

    const ImagePathControl = window.createClass({
      handleChange(event) {
        this.props.onChange(event.target.value || null);
      },
      render() {
        const value = this.props.value || "";
        return window.h("div", { className: this.props.classNameWrapper },
          window.h("input", {
            id: this.props.forID,
            type: "text",
            value,
            placeholder: "https://... or /assets/...",
            onChange: this.handleChange,
            style: {
              ...selectStyle(),
              fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace",
            },
          }),
          value && window.h("img", {
            alt: "",
            src: value,
            style: {
              borderRadius: "4px",
              display: "block",
              marginTop: "10px",
              maxHeight: "180px",
              maxWidth: "100%",
              objectFit: "contain",
            },
          }));
      },
    });

    const RegistryModderControl = window.createClass({
      getInitialState() {
        return { loaded: !!adminData.registry };
      },
      componentDidMount() {
        loadAdminData("registry").then(() => this.setState({ loaded: true }));
      },
      handleChange(event) {
        const valueType = fieldSetting(this.props.field, "registry_value", "name");
        const profile = registryProfiles().find((candidate) => candidate.id === event.target.value);
        this.props.onChange(profile ? profile[valueType] : null);
      },
      render() {
        const valueType = fieldSetting(this.props.field, "registry_value", "name");
        const current = registryProfileFor(this.props.value, valueType);
        const profiles = registryProfiles();
        return window.h("select", {
          id: this.props.forID,
          className: this.props.classNameWrapper,
          value: current?.id || "",
          onChange: this.handleChange,
          style: selectStyle(),
        },
        window.h("option", { value: "" }, this.state.loaded ? "Select a modder…" : "Loading modders…"),
        !current && this.props.value && window.h("option", {
          value: String(this.props.value),
        }, `${this.props.value} (not in registry)`),
        ...profiles.map((profile) => window.h("option", {
          key: profile.id,
          value: profile.id,
        }, profile.name)));
      },
    });

    const ArchiveModControl = window.createClass({
      getInitialState() {
        const source = fieldSetting(this.props.field, "archive_source");
        return { loaded: !!adminData[source] };
      },
      componentDidMount() {
        const source = fieldSetting(this.props.field, "archive_source");
        loadAdminData(source).then(() => this.setState({ loaded: true }));
      },
      handleChange(event) {
        this.props.onChange(event.target.value || null);
      },
      render() {
        const source = fieldSetting(this.props.field, "archive_source");
        const documentName = fieldSetting(this.props.field, "year_document");
        const options = archiveOptions(source);
        const year = documentName
          ? contextYear(this.props.forID, documentName, options, this.props.value)
          : null;
        const filtered = (year == null ? options : options.filter((option) => option.year === year))
          .sort((left, right) => left.label.localeCompare(right.label));
        const groups = new Map();
        filtered.forEach((option) => {
          if (!groups.has(option.group)) groups.set(option.group, []);
          groups.get(option.group).push(option);
        });
        const currentKnown = options.some((option) => option.value === this.props.value);
        const children = [
          window.h("option", { key: "blank", value: "" },
            this.state.loaded ? "Select a mod…" : "Loading mods…"),
        ];
        if (!currentKnown && this.props.value) {
          children.push(window.h("option", {
            key: "unknown",
            value: this.props.value,
          }, `${this.props.value} (not in archive)`));
        }
        for (const [group, groupOptions] of groups) {
          const optionNodes = groupOptions.map((option) => window.h("option", {
            key: `${group}:${option.value}`,
            value: option.value,
          }, option.label));
          children.push(groups.size > 1
            ? window.h("optgroup", { key: group, label: group }, ...optionNodes)
            : optionNodes);
        }
        return window.h("select", {
          id: this.props.forID,
          className: this.props.classNameWrapper,
          value: this.props.value || "",
          onChange: this.handleChange,
          style: selectStyle(),
        }, ...children);
      },
    });

    window.CMS.registerWidget("event_year", EventYearControl);
    window.CMS.registerWidget("event_datetime", EventDateTimeControl);
    window.CMS.registerWidget("image_path", ImagePathControl);
    window.CMS.registerWidget("registry_modder", RegistryModderControl);
    window.CMS.registerWidget("archive_mod", ArchiveModControl);
  }

  Object.keys(adminDataUrls).forEach(loadAdminData);
  window.initCMS();
})();
