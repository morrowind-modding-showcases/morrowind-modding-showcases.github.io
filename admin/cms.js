(function initializeContentManager() {
  "use strict";

  const originalDocuments = new Map();
  const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

  const preferredKeyOrders = [
    ["generated", "game", "mods"],
    ["generatedAt", "modders"],
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
      "name",
      "authors",
      "category",
      "url",
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
    ["showcases"],
    ["name", "url"],
    ["years"],
    ["year", "teams"],
    ["name", "place", "mods", "members"],
    ["id"],
    ["year", "mods"],
    ["name", "url", "team", "category", "place", "notes", "pictureUrl"],
    ["judges"],
    ["modderId", "listedAs"],
    ["generatedAt", "summary", "events"],
    ["id", "label", "season", "year", "banner", "headers", "resultsStreamUrl", "competitionType", "competitionLabel", "competitionNote", "hasJudgeAwards", "entries"],
    ["id", "title", "url", "authors", "themes", "category", "placement", "placementLabel", "awards", "awardPlacardUrl", "pictureUrl"],
    ["postcards"],
    ["file", "entryId", "caption", "captionPosition"],
    ["years"],
    ["year", "awards", "note", "individualModCards"],
    ["award", "mods"],
    ["name", "attribution", "archiveName"],
  ];

  function documentKey(value) {
    if (!value || Array.isArray(value) || typeof value !== "object") {
      return null;
    }
    if (value.mods && hasOwn(value, "generated") && hasOwn(value, "game")) {
      return "submissions";
    }
    if (value.event && Array.isArray(value.achievements)) {
      return `achievements:${value.event.year}`;
    }
    if (Array.isArray(value.modders)) {
      if (hasOwn(value, "generatedAt")) return "modjam-modders";
      if (value.modders.some((modder) => modder && typeof modder === "object" && hasOwn(modder, "name"))) {
        return "central-modders";
      }
      return "modder-references";
    }
    if (Array.isArray(value.showcases)) {
      return "showcases";
    }
    if (Array.isArray(value.judges)) {
      return "judges";
    }
    if (Array.isArray(value.events)) {
      return "modjams";
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

  function deriveValues(value) {
    const derived = JSON.parse(JSON.stringify(value));
    if (derived?.event && Array.isArray(derived.achievements)) {
      derived.achievements.forEach((achievement) => {
        achievement.unlockedCount = Array.isArray(achievement.unlockedBy)
          ? achievement.unlockedBy.length
          : 0;
      });
    }
    if (Array.isArray(derived?.events) && derived.summary) {
      const entries = derived.events.flatMap((event) => event.entries || []);
      derived.summary.eventCount = derived.events.length;
      derived.summary.entryCount = entries.length;
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
      }
      return value;
    },
    toFile(value) {
      const derived = deriveValues(value);
      const original = originalDocuments.get(documentKey(derived));
      return `${JSON.stringify(orderLikeOriginal(derived, original), null, 2)}\n`;
    },
  });

  if (typeof window.createClass === "function" && typeof window.h === "function") {
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
              boxSizing: "border-box",
              fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace",
              padding: "12px",
              width: "100%",
            },
          }),
          value && window.h("div", {
            style: {
              alignItems: "start",
              display: "grid",
              gap: "8px",
              marginTop: "10px",
            },
          },
          window.h("code", {
            style: {
              overflowWrap: "anywhere",
              whiteSpace: "normal",
            },
          }, value),
          window.h("img", {
            alt: "",
            src: value,
            style: {
              borderRadius: "4px",
              maxHeight: "180px",
              maxWidth: "100%",
              objectFit: "contain",
            },
          })));
      },
    });
    window.CMS.registerWidget("image_path", ImagePathControl);
  }

  window.initCMS();
})();
