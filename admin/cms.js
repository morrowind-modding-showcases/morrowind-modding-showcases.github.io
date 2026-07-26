(function initializeContentManager() {
  "use strict";

  const originalDocuments = new Map();
  const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

  const preferredKeyOrders = [
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
    ["name", "url", "avatar", "aliases"],
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
      return "modders";
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
      const original = originalDocuments.get(documentKey(value));
      return `${JSON.stringify(orderLikeOriginal(value, original), null, 2)}\n`;
    },
  });

  window.initCMS();
})();
