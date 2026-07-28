(function initializeContentManager() {
  "use strict";

  const originalDocuments = new Map();
  const adminData = {
    registry: null,
    modathon: null,
    madness: null,
    madnessEvents: null,
    madnessTeams: null,
    modjam: null,
  };
  const adminDataRequests = new Map();
  const adminDataUrls = {
    registry: "../assets/data/modders.json",
    modathon: "../modathon/assets/data/modathon-mods.json",
    madness: "../madness/data/madness-mods.json",
    madnessEvents: "../madness/data/madness-event.json",
    madnessTeams: "../madness/data/madness-teams.json",
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
  const collectionGroups = {
    madness: [
      { name: "madness_mods", label: "Mods" },
      { name: "madness_teams", label: "Teams" },
    ],
    modathon: [
      { name: "modathon_mods", label: "Mods" },
      { name: "modathon_achievements", label: "Achievements" },
    ],
    modjam: [
      { name: "modjam_mods", label: "Mods" },
      { name: "modjam_postcards", label: "Postcards" },
    ],
  };
  const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

  const preferredKeyOrders = [
    ["schemaVersion", "eventType", "events"],
    ["schemaVersion", "eventType", "name", "year", "season", "themes", "timezoneLabel", "countdown", "registrationFormId"],
    ["name", "year", "season", "themes", "timezoneLabel", "countdown", "registrationFormId", "note", "individualModCards", "awards"],
    ["id", "name", "weekStart", "weekEnd"],
    ["id", "label", "name", "season", "year", "themes", "timezoneLabel", "countdown", "participationBannerUrl", "banner", "headers", "resultsStreamUrl", "competitionType", "competitionLabel", "competitionNote", "hasJudgeAwards"],
    ["start", "end", "graceEnd", "reset"],
    ["kickoffStart", "start", "end"],
    ["registrationOpen", "competitionStart", "submissionsClose", "bugFixEnd"],
    ["generated", "game", "mods"],
    ["schemaVersion", "event", "achievements"],
    ["schemaVersion", "year", "achievements"],
    ["schemaVersion", "year", "id", "name", "requirement", "rarity", "rarityKey", "group", "masteryName", "imageUrl", "unlockedBy", "unlockedCount"],
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
      "error",
    ],
    ["name", "contributed"],
    ["modders"],
    ["id", "name", "nexusProfileUrl", "avatarUrl", "aliases"],
    ["years"],
    ["year", "teams"],
    ["year", "name", "place", "mods", "members"],
    ["id"],
    ["year", "mods"],
    ["year", "name", "url", "team", "category", "themeId", "place", "notes", "pictureUrl"],
    ["judges"],
    ["modderId"],
    ["events"],
    ["id", "label", "season", "year", "banner", "headers", "resultsStreamUrl", "competitionType", "competitionLabel", "competitionNote", "hasJudgeAwards"],
    ["generatedAt", "summary", "events"],
    ["id", "mods"],
    ["eventId", "id", "title", "url", "authors", "category", "placement", "placementLabel", "awards", "awardPlacardUrl", "pictureUrl"],
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

  function currentCollectionName() {
    const match = String(window.location?.hash || "").match(/^#\/collections\/([^/]+)/);
    return match ? match[1] : null;
  }

  function parentCollectionName(collectionName) {
    for (const [parentName, children] of Object.entries(collectionGroups)) {
      if (children.some((child) => child.name === collectionName)) return parentName;
    }
    return null;
  }

  function collectionLandingIsOpen(collectionName) {
    return String(window.location?.hash || "") === `#/collections/${collectionName}`;
  }

  function collectionSidebarContainers(document) {
    return document.querySelectorAll('#nc-root aside, #nc-root [class*="Drawer"]');
  }

  function organizeCollectionNavigation() {
    const document = window.document;
    if (!document) return;

    const currentCollection = currentCollectionName();
    const currentParent = parentCollectionName(currentCollection);
    const sidebarContainers = collectionSidebarContainers(document);

    for (const [parentName, children] of Object.entries(collectionGroups)) {
      for (const sidebar of sidebarContainers) {
        const parentLink = sidebar.querySelector(`a[href="#/collections/${parentName}"]`);
        const parentIsCurrent = parentName === currentParent;
        if (parentLink?.hasAttribute("data-dem-parent-active") !== parentIsCurrent) {
          if (parentIsCurrent) {
            parentLink.setAttribute("data-dem-parent-active", "");
            parentLink.setAttribute("aria-current", "page");
          } else if (parentLink) {
            parentLink.removeAttribute("data-dem-parent-active");
            parentLink.removeAttribute("aria-current");
          }
        }

        for (const child of children) {
          const childLink = sidebar.querySelector(`a[href="#/collections/${child.name}"]`);
          if (!childLink) continue;
          childLink.setAttribute("data-dem-nested-collection", parentName);
          childLink.hidden = true;
        }
      }
    }

    const children = collectionGroups[currentCollection];
    if (!children || !collectionLandingIsOpen(currentCollection)) return;

    const cards = document.querySelector('#nc-root main ul[class*="CardsGrid"]');
    const template = cards?.querySelector("li");
    if (!cards || !template) return;

    const eventsLink = cards.querySelector(
      `a[href="#/collections/${currentCollection}/entries/events"]`,
    );
    let insertionPoint = eventsLink?.closest("li") || cards.lastElementChild;

    for (const child of children) {
      let card = cards.querySelector(`[data-dem-collection-link="${child.name}"]`);
      if (!card) {
        card = template.cloneNode(true);
        card.setAttribute("data-dem-collection-link", child.name);
        const link = card.querySelector("a");
        const heading = card.querySelector("h2");
        if (!link || !heading) continue;
        link.setAttribute("href", `#/collections/${child.name}`);
        heading.textContent = child.label;
      }

      if (insertionPoint?.nextElementSibling !== card) {
        insertionPoint?.after(card);
      }
      insertionPoint = card;
    }
  }

  function installCollectionNavigation() {
    const document = window.document;
    if (!document || !window.MutationObserver || !window.requestAnimationFrame) return;

    let navigationUpdatePending = false;
    const scheduleNavigationUpdate = () => {
      if (navigationUpdatePending) return;
      navigationUpdatePending = true;
      window.requestAnimationFrame(() => {
        navigationUpdatePending = false;
        organizeCollectionNavigation();
      });
    };

    const observer = new window.MutationObserver(scheduleNavigationUpdate);
    observer.observe(document.getElementById("nc-root") || document.documentElement, {
      childList: true,
      subtree: true,
    });
    window.addEventListener("hashchange", scheduleNavigationUpdate);
    scheduleNavigationUpdate();
  }

  function documentKey(value) {
    if (!value || Array.isArray(value) || typeof value !== "object") {
      return null;
    }
    if (["modathon", "modjam", "madness"].includes(value.eventType) && Array.isArray(value.events)) {
      return `event:${value.eventType}`;
    }
    if (value.eventType === "madness" && hasOwn(value, "year")) {
      return `event:madness:${value.year}`;
    }
    if (value.mods && hasOwn(value, "generated") && hasOwn(value, "game")) {
      return "submissions";
    }
    if (Array.isArray(value.achievements)) {
      return `achievements:${value.event?.year ?? value.year ?? ""}`;
    }
    if (
      hasOwn(value, "schemaVersion")
      && hasOwn(value, "year")
      && hasOwn(value, "id")
      && hasOwn(value, "requirement")
    ) {
      return `achievement:${value.year}:${value.id}`;
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
    if (key === "event:madness") adminData.madnessEvents = value;
    if (key === "madness-teams") adminData.madnessTeams = value;
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

    if (Array.isArray(derived?.achievements)) {
      if (!derived.event && /^\d{4}$/.test(String(derived.year))) {
        derived.year = Number(derived.year);
      }
      derived.achievements.forEach((achievement) => {
        achievement.unlockedCount = Array.isArray(achievement.unlockedBy)
          ? achievement.unlockedBy.length
          : 0;
      });
    }
    if (key?.startsWith("achievement:")) {
      if (/^\d{4}$/.test(String(derived.year))) derived.year = Number(derived.year);
      derived.unlockedCount = Array.isArray(derived.unlockedBy)
        ? derived.unlockedBy.length
        : 0;
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
    if (key?.startsWith("event:madness:")) {
      delete derived.name;
      if (!originalDocuments.has(key)) fillNewEventDefaults(derived, "event:madness");
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

  function selectStyle() {
    return {
      boxSizing: "border-box",
      padding: "12px",
      width: "100%",
    };
  }

  function selectOptions(field) {
    const configured = fieldSetting(field, "options", []);
    const options = typeof configured?.toJS === "function"
      ? configured.toJS()
      : configured;
    if (!Array.isArray(options)) return [];
    return options.map((option) => {
      if (option && typeof option === "object") {
        return {
          label: String(option.label ?? option.value ?? ""),
          value: String(option.value ?? option.label ?? ""),
        };
      }
      return { label: String(option), value: String(option) };
    }).filter((option) => option.value);
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

  function madnessTeamValue(name) {
    const value = String(name || "").trim();
    return /^Team(?:\s|$)/i.test(value) ? value : `Team ${value}`;
  }

  function madnessTeamOptions() {
    return (adminData.madnessTeams?.years || []).flatMap((group) =>
      (group.teams || []).map((team) => ({
        group: String(group.year),
        year: Number(group.year),
        value: madnessTeamValue(team.name),
        label: team.name,
      })),
    );
  }

  function madnessThemeOptions(year) {
    const event = (adminData.madnessEvents?.events || []).find(
      (candidate) => Number(candidate.year) === Number(year),
    );
    return (event?.themes || []).map((theme) => ({
      value: theme.id,
      label: theme.name,
    }));
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

    const MadnessTeamControl = window.createClass({
      getInitialState() {
        return {
          loaded: !!adminData.madnessTeams,
          year: null,
        };
      },
      componentDidMount() {
        const key = eventItemKey(this.props.forID);
        this.updateYear = (year) => {
          const numericYear = Number(year);
          this.setState({ year: Number.isInteger(numericYear) ? numericYear : null });
        };
        if (!eventYearSubscribers.has(key)) eventYearSubscribers.set(key, new Set());
        eventYearSubscribers.get(key).add(this.updateYear);
        this.updateYear(eventYears.get(key));
        loadAdminData("madnessTeams").then(() => this.setState({ loaded: true }));
      },
      componentWillUnmount() {
        const key = eventItemKey(this.props.forID);
        const subscribers = eventYearSubscribers.get(key);
        if (!subscribers) return;
        subscribers.delete(this.updateYear);
        if (!subscribers.size) eventYearSubscribers.delete(key);
      },
      handleChange(event) {
        this.props.onChange(event.target.value || null);
      },
      render() {
        const options = madnessTeamOptions();
        const filtered = (this.state.year == null
          ? options
          : options.filter((option) => option.year === this.state.year))
          .sort((left, right) => left.label.localeCompare(right.label));
        const currentKnown = filtered.some((option) => option.value === this.props.value);
        let placeholder = this.state.loaded ? "Select a teamâ€¦" : "Loading teamsâ€¦";
        if (this.state.loaded && this.state.year != null && !filtered.length) {
          placeholder = `No teams for ${this.state.year}`;
        }
        const children = [
          window.h("option", { key: "blank", value: "" }, placeholder),
        ];
        if (!currentKnown && this.props.value) {
          children.push(window.h("option", {
            key: "unknown",
            value: this.props.value,
          }, `${this.props.value} (not in selected year)`));
        }
        children.push(...filtered.map((option) => window.h("option", {
          key: `${option.year}:${option.value}`,
          value: option.value,
        }, option.label)));
        return window.h("select", {
          id: this.props.forID,
          className: this.props.classNameWrapper,
          value: this.props.value || "",
          onChange: this.handleChange,
          style: selectStyle(),
        }, ...children);
      },
    });

    const MadnessCategoryControl = window.createClass({
      handleChange(event) {
        this.props.onChange(event.target.value || null);
      },
      render() {
        const options = selectOptions(this.props.field);
        const currentValue = String(this.props.value || "");
        const currentKnown = options.some((option) => option.value === currentValue);
        const children = [
          window.h("option", { key: "blank", value: "" }, "Select a categoryâ€¦"),
        ];
        if (currentValue && !currentKnown) {
          children.push(window.h("option", {
            key: "unknown",
            value: currentValue,
          }, `${currentValue} (not a standard category)`));
        }
        children.push(...options.map((option) => window.h("option", {
          key: option.value,
          value: option.value,
        }, option.label)));
        return window.h("select", {
          id: this.props.forID,
          className: this.props.classNameWrapper,
          value: currentValue,
          onChange: this.handleChange,
          style: selectStyle(),
        }, ...children);
      },
    });

    const MadnessThemeControl = window.createClass({
      getInitialState() {
        return {
          loaded: !!adminData.madnessEvents,
          year: null,
        };
      },
      componentDidMount() {
        const key = eventItemKey(this.props.forID);
        this.updateYear = (year) => {
          const numericYear = Number(year);
          this.setState({ year: Number.isInteger(numericYear) ? numericYear : null });
        };
        if (!eventYearSubscribers.has(key)) eventYearSubscribers.set(key, new Set());
        eventYearSubscribers.get(key).add(this.updateYear);
        this.updateYear(eventYears.get(key));
        loadAdminData("madnessEvents").then(() => this.setState({ loaded: true }));
      },
      componentWillUnmount() {
        const key = eventItemKey(this.props.forID);
        const subscribers = eventYearSubscribers.get(key);
        if (!subscribers) return;
        subscribers.delete(this.updateYear);
        if (!subscribers.size) eventYearSubscribers.delete(key);
      },
      handleChange(event) {
        this.props.onChange(event.target.value || null);
      },
      render() {
        const options = this.state.year == null ? [] : madnessThemeOptions(this.state.year);
        const currentValue = String(this.props.value || "");
        const currentKnown = options.some((option) => option.value === currentValue);
        let placeholder = this.state.loaded ? "No theme" : "Loading themes…";
        if (this.state.loaded && this.state.year == null) placeholder = "Select a year first";
        if (this.state.loaded && this.state.year != null && !options.length) {
          placeholder = `No themes for ${this.state.year}`;
        }
        const children = [
          window.h("option", { key: "blank", value: "" }, placeholder),
        ];
        if (currentValue && !currentKnown) {
          children.push(window.h("option", {
            key: "unknown",
            value: currentValue,
          }, `${currentValue} (not in selected year)`));
        }
        children.push(...options.map((option) => window.h("option", {
          key: option.value,
          value: option.value,
        }, option.label)));
        return window.h("select", {
          id: this.props.forID,
          className: this.props.classNameWrapper,
          value: currentValue,
          onChange: this.handleChange,
          style: selectStyle(),
        }, ...children);
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
    window.CMS.registerWidget("madness_team", MadnessTeamControl);
    window.CMS.registerWidget("madness_category", MadnessCategoryControl);
    window.CMS.registerWidget("madness_theme", MadnessThemeControl);
    window.CMS.registerWidget("archive_mod", ArchiveModControl);
  }

  Object.keys(adminDataUrls).forEach(loadAdminData);
  installCollectionNavigation();
  window.initCMS();
})();
