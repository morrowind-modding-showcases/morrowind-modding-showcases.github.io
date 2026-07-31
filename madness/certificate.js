(function (root, factory) {
  'use strict';

  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.MadnessCertificate = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var SCROLL_WIDTH = 3072;
  var SCROLL_HEIGHT = 2048;
  var RIBBON_SOURCE_WIDTH = 711;
  var RIBBON_SOURCE_HEIGHT = 2100;
  var RIBBON_WIDTH = 330;
  var RIBBON_HEIGHT = RIBBON_SOURCE_HEIGHT * RIBBON_WIDTH / RIBBON_SOURCE_WIDTH;
  var RIBBON_CANVAS_HEIGHT = 2740;
  var PARTICIPATION_BADGE_SIZE = 351;
  var PARTICIPATION_BADGE_Y = 830;
  var imagePromises = new Map();

  function stableHash(value) {
    var hash = 2166136261;
    var text = String(value || '');
    for (var index = 0; index < text.length; index++) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function roman(value) {
    var number = Number(value) || 0;
    var numerals = [
      [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'],
      [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'],
      [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']
    ];
    var result = '';
    numerals.forEach(function (pair) {
      while (number >= pair[0]) {
        result += pair[1];
        number -= pair[0];
      }
    });
    return result || String(value || '?');
  }

  function ordinalSeason(value) {
    var number = Number(value) || 0;
    var words = [
      '', 'First', 'Second', 'Third', 'Fourth', 'Fifth',
      'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth',
      'Eleventh', 'Twelfth', 'Thirteenth', 'Fourteenth', 'Fifteenth',
      'Sixteenth', 'Seventeenth', 'Eighteenth', 'Nineteenth', 'Twentieth'
    ];
    if (words[number]) return words[number];
    return ordinalNumber(value);
  }

  function ordinalNumber(value) {
    var number = Number(value) || 0;
    var remainder = number % 100;
    var suffix = remainder >= 11 && remainder <= 13
      ? 'th'
      : number % 10 === 1
        ? 'st'
        : number % 10 === 2
          ? 'nd'
          : number % 10 === 3
            ? 'rd'
            : 'th';
    return number ? number + suffix : String(value || '?');
  }

  function layoutFor(entries, identity) {
    var ribbonEntries = (entries || []).slice(1);
    var count = ribbonEntries.length;
    var rightmostCenter = 2580;
    var step = 420;
    var openSlots = Math.max(0, 6 - count);
    var slotIndexes = ribbonEntries.map(function (_entry, index) {
      return openSlots + index;
    });
    for (var gapIndex = 1; gapIndex < ribbonEntries.length && openSlots > 0; gapIndex++) {
      if (Number(ribbonEntries[gapIndex].year) - Number(ribbonEntries[gapIndex - 1].year) <= 1) continue;
      for (var earlierIndex = 0; earlierIndex < gapIndex; earlierIndex++) {
        slotIndexes[earlierIndex] -= 1;
      }
      openSlots -= 1;
    }
    var ribbons = ribbonEntries.map(function (entry, index) {
      var seed = stableHash((identity || '') + '|' + entry.year + '|' + entry.name);
      var centerX = 480 + slotIndexes[index] * step;
      var edgeDistance = Math.min(
        1,
        Math.abs(centerX - SCROLL_WIDTH / 2) / (rightmostCenter - SCROLL_WIDTH / 2)
      );
      var curveLift = Math.round(125 * Math.pow(edgeDistance, 1.45));
      return {
        entry: entry,
        centerX: centerX,
        top: 1688 - curveLift + seed % 17,
        angle: ((seed >>> 8) % 701 / 100 - 3.5) * Math.PI / 180,
        flipX: index % 2 === 1,
        width: RIBBON_WIDTH,
        height: RIBBON_HEIGHT
      };
    });

    return {
      width: SCROLL_WIDTH,
      height: count ? RIBBON_CANVAS_HEIGHT : SCROLL_HEIGHT,
      ribbons: ribbons
    };
  }

  function participationBadgeLayout(data) {
    var badges = [];
    if (data && data.modjamParticipant) {
      badges.push({
        kind: 'modjam',
        centerX: 790,
        centerY: PARTICIPATION_BADGE_Y,
        size: PARTICIPATION_BADGE_SIZE,
        angle: -1.4 * Math.PI / 180
      });
    }
    if (data && data.modathonParticipant) {
      badges.push({
        kind: 'modathon',
        centerX: 2282,
        centerY: PARTICIPATION_BADGE_Y,
        size: PARTICIPATION_BADGE_SIZE,
        angle: 1.2 * Math.PI / 180
      });
    }
    return badges;
  }

  function loadImage(url, useCors) {
    if (!url) return Promise.resolve(null);
    var key = (useCors ? 'cors:' : 'plain:') + url;
    if (imagePromises.has(key)) return imagePromises.get(key);

    var promise = new Promise(function (resolve) {
      var settled = false;
      var image = new Image();
      if (useCors) {
        image.crossOrigin = 'anonymous';
        image.referrerPolicy = 'no-referrer';
      }
      function finish(value) {
        if (settled) return;
        settled = true;
        resolve(value);
      }
      image.onload = function () { finish(image); };
      image.onerror = function () { finish(null); };
      image.src = url;
      setTimeout(function () { finish(null); }, 8000);
    });
    imagePromises.set(key, promise);
    return promise;
  }

  function loadFonts() {
    if (!document.fonts || typeof document.fonts.load !== 'function') return Promise.resolve();
    return Promise.all([
      document.fonts.load('700 180px "UnifrakturCook"'),
      document.fonts.load('900 150px Cinzel'),
      document.fonts.load('700 90px Cinzel'),
      document.fonts.load('italic 82px "IM Fell English"'),
      document.fonts.load('700 72px Alegreya')
    ]).catch(function () {});
  }

  function pathRoundedRect(context, x, y, width, height, radius) {
    var r = Math.min(radius, width / 2, height / 2);
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + width, y, x + width, y + height, r);
    context.arcTo(x + width, y + height, x, y + height, r);
    context.arcTo(x, y + height, x, y, r);
    context.arcTo(x, y, x + width, y, r);
    context.closePath();
  }

  function drawImageCover(context, image, x, y, width, height) {
    var sourceWidth = image.naturalWidth || image.width;
    var sourceHeight = image.naturalHeight || image.height;
    var scale = Math.max(width / sourceWidth, height / sourceHeight);
    var cropWidth = width / scale;
    var cropHeight = height / scale;
    var sourceX = (sourceWidth - cropWidth) / 2;
    var sourceY = (sourceHeight - cropHeight) / 2;
    context.drawImage(image, sourceX, sourceY, cropWidth, cropHeight, x, y, width, height);
  }

  function initialsFor(name) {
    var words = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!words.length) return '?';
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0].charAt(0) + words[words.length - 1].charAt(0)).toUpperCase();
  }

  function setFont(context, weight, size, family, style) {
    context.font = (style ? style + ' ' : '') + weight + ' ' + size + 'px ' + family;
  }

  function fitSingleLine(context, text, maxWidth, preferredSize, minimumSize, weight, family, style) {
    var size = preferredSize;
    do {
      setFont(context, weight, size, family, style);
      if (context.measureText(text).width <= maxWidth) return size;
      size -= 2;
    } while (size >= minimumSize);
    setFont(context, weight, minimumSize, family, style);
    return minimumSize;
  }

  function splitLongWord(context, word, maxWidth) {
    var pieces = [];
    var current = '';
    Array.from(word).forEach(function (character) {
      var candidate = current + character;
      if (current && context.measureText(candidate).width > maxWidth) {
        pieces.push(current);
        current = character;
      } else {
        current = candidate;
      }
    });
    if (current) pieces.push(current);
    return pieces;
  }

  function wrapText(context, text, maxWidth) {
    var lines = [];
    var line = '';
    String(text || '').split(/\s+/).filter(Boolean).forEach(function (word) {
      var parts = context.measureText(word).width > maxWidth
        ? splitLongWord(context, word, maxWidth)
        : [word];
      parts.forEach(function (part) {
        var candidate = line ? line + ' ' + part : part;
        if (line && context.measureText(candidate).width > maxWidth) {
          lines.push(line);
          line = part;
        } else {
          line = candidate;
        }
      });
    });
    if (line) lines.push(line);
    return lines;
  }

  function fitTextBlock(context, text, maxWidth, maxHeight, preferredSize, minimumSize, weight, family, style, lineRatio) {
    var size = preferredSize;
    var lines = [];
    var lineHeight = 0;
    do {
      setFont(context, weight, size, family, style);
      lines = wrapText(context, text, maxWidth);
      lineHeight = size * lineRatio;
      if (lines.length * lineHeight <= maxHeight) break;
      size -= 2;
    } while (size >= minimumSize);
    return { size: Math.max(size, minimumSize), lines: lines, lineHeight: lineHeight };
  }

  function drawTextBlock(context, block, centerX, top) {
    context.textAlign = 'center';
    context.textBaseline = 'top';
    block.lines.forEach(function (line, index) {
      context.fillText(line, centerX, top + index * block.lineHeight);
    });
  }

  function drawTrackedText(context, text, centerX, baselineY, spacing) {
    var characters = Array.from(String(text || ''));
    var widths = characters.map(function (character) { return context.measureText(character).width; });
    var totalWidth = widths.reduce(function (sum, width) { return sum + width; }, 0)
      + Math.max(0, characters.length - 1) * spacing;
    var x = centerX - totalWidth / 2;
    context.textAlign = 'left';
    context.textBaseline = 'alphabetic';
    characters.forEach(function (character, index) {
      context.fillText(character, x, baselineY);
      x += widths[index] + spacing;
    });
  }

  function drawCurvedText(context, text, centerX, centerY, radius, spacing) {
    var characters = Array.from(String(text || ''));
    var widths = characters.map(function (character) { return context.measureText(character).width; });
    var totalAdvance = widths.reduce(function (sum, width) { return sum + width; }, 0)
      + Math.max(0, characters.length - 1) * spacing;
    var angle = -Math.PI / 2 - totalAdvance / radius / 2;

    characters.forEach(function (character, index) {
      var advance = widths[index] + (index === characters.length - 1 ? 0 : spacing);
      angle += advance / radius / 2;
      context.save();
      context.translate(
        centerX + Math.cos(angle) * radius,
        centerY + Math.sin(angle) * radius
      );
      context.rotate(angle + Math.PI / 2);
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.strokeText(character, 0, 0);
      context.fillText(character, 0, 0);
      context.restore();
      angle += advance / radius / 2;
    });
  }

  function drawRule(context, centerX, y, width, color) {
    context.save();
    context.strokeStyle = color;
    context.fillStyle = color;
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(centerX - width / 2, y);
    context.lineTo(centerX - 32, y);
    context.moveTo(centerX + 32, y);
    context.lineTo(centerX + width / 2, y);
    context.stroke();
    context.translate(centerX, y);
    context.rotate(Math.PI / 4);
    context.strokeRect(-15, -15, 30, 30);
    context.fillRect(-5, -5, 10, 10);
    context.restore();
  }

  function drawCertificateFrame(context) {
    var ink = 'rgba(67, 36, 22, .72)';
    var gold = 'rgba(128, 80, 25, .82)';
    context.save();
    context.strokeStyle = ink;
    context.lineWidth = 7;
    pathRoundedRect(context, 382, 326, 2308, 1416, 34);
    context.stroke();
    context.strokeStyle = gold;
    context.lineWidth = 3;
    pathRoundedRect(context, 405, 349, 2262, 1370, 27);
    context.stroke();
    context.setLineDash([4, 13]);
    context.lineWidth = 2;
    pathRoundedRect(context, 420, 364, 2232, 1340, 22);
    context.stroke();
    context.setLineDash([]);
    context.restore();
  }

  function drawAvatar(context, avatar, name) {
    var centerX = 1536;
    var centerY = 765;
    var radius = 205;
    context.save();
    context.shadowColor = 'rgba(40, 21, 12, .38)';
    context.shadowBlur = 30;
    context.shadowOffsetY = 16;
    context.beginPath();
    context.arc(centerX, centerY, radius + 12, 0, Math.PI * 2);
    context.fillStyle = '#8b5b25';
    context.fill();
    context.restore();

    context.save();
    context.beginPath();
    context.arc(centerX, centerY, radius, 0, Math.PI * 2);
    context.clip();
    context.fillStyle = '#4a3121';
    context.fillRect(centerX - radius, centerY - radius, radius * 2, radius * 2);
    if (avatar) {
      drawImageCover(context, avatar, centerX - radius, centerY - radius, radius * 2, radius * 2);
    } else {
      var glow = context.createRadialGradient(centerX, centerY - 60, 20, centerX, centerY, radius);
      glow.addColorStop(0, '#9d7445');
      glow.addColorStop(1, '#372317');
      context.fillStyle = glow;
      context.fillRect(centerX - radius, centerY - radius, radius * 2, radius * 2);
      context.fillStyle = '#ead39b';
      setFont(context, 800, 126, 'Cinzel, serif');
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(initialsFor(name), centerX, centerY + 10);
    }
    context.restore();

    context.save();
    context.strokeStyle = '#4b2a18';
    context.lineWidth = 12;
    context.beginPath();
    context.arc(centerX, centerY, radius + 5, 0, Math.PI * 2);
    context.stroke();
    context.strokeStyle = '#c18c3e';
    context.lineWidth = 6;
    context.beginPath();
    context.arc(centerX, centerY, radius + 20, 0, Math.PI * 2);
    context.stroke();
    context.setLineDash([4, 14]);
    context.lineWidth = 3;
    context.beginPath();
    context.arc(centerX, centerY, radius + 38, 0, Math.PI * 2);
    context.stroke();
    context.setLineDash([]);
    context.restore();
  }

  function drawFirstEntry(context, entry) {
    var centerX = 1536;
    var ink = '#4a2918';
    var gold = '#85541f';
    var proclamation = 'has been found Certifiably Mad and Committed to the Asylum of Creative Insanity.';
    context.fillStyle = ink;
    var proclamationBlock = fitTextBlock(
      context,
      proclamation,
      2040,
      130,
      58,
      44,
      400,
      '"IM Fell English", serif',
      'italic',
      1.12
    );
    setFont(context, 400, proclamationBlock.size, '"IM Fell English", serif', 'italic');
    drawTextBlock(context, proclamationBlock, centerX, 1195);

    var commitmentPrefix = 'First Committed during the ' + ordinalSeason(entry.season)
      + ' Season of Madness in the year of our Lord Sheogorath, ';
    var commitmentYear = roman(entry.year);
    var commitmentSuffix = ', long may he reign!';
    var commitmentSize = 48;
    var yearSize = 64;
    var prefixWidth;
    var yearWidth;
    var suffixWidth;
    while (true) {
      setFont(context, 400, commitmentSize, '"IM Fell English", serif', 'italic');
      prefixWidth = context.measureText(commitmentPrefix).width;
      suffixWidth = context.measureText(commitmentSuffix).width;
      setFont(context, 700, yearSize, '"IM Fell English", serif', 'italic');
      yearWidth = context.measureText(commitmentYear).width;
      if (prefixWidth + yearWidth + suffixWidth <= 2100 || commitmentSize <= 34) break;
      commitmentSize -= 2;
      yearSize -= 2;
    }

    var commitmentX = centerX - (prefixWidth + yearWidth + suffixWidth) / 2;
    var commitmentBaseline = 1400;
    context.fillStyle = ink;
    context.textAlign = 'left';
    context.textBaseline = 'alphabetic';
    setFont(context, 400, commitmentSize, '"IM Fell English", serif', 'italic');
    context.fillText(commitmentPrefix, commitmentX, commitmentBaseline);
    commitmentX += prefixWidth;
    setFont(context, 700, yearSize, '"IM Fell English", serif', 'italic');
    context.fillText(commitmentYear, commitmentX, commitmentBaseline);
    context.save();
    context.strokeStyle = gold;
    context.lineWidth = 6;
    context.lineCap = 'round';
    context.beginPath();
    context.moveTo(commitmentX - 3, commitmentBaseline + 11);
    context.lineTo(commitmentX + yearWidth + 3, commitmentBaseline + 11);
    context.stroke();
    context.restore();
    commitmentX += yearWidth;
    setFont(context, 400, commitmentSize, '"IM Fell English", serif', 'italic');
    context.fillText(commitmentSuffix, commitmentX, commitmentBaseline);

    context.fillStyle = ink;
    setFont(context, 700, 50, 'Cinzel, serif');
    drawTrackedText(context, 'TEAM', centerX, 1523, 8);
    context.fillStyle = ink;
    var teamSize = fitSingleLine(context, entry.name, 1740, 67, 38, 800, 'Cinzel, serif');
    setFont(context, 800, teamSize, 'Cinzel, serif');
    context.textAlign = 'center';
    context.textBaseline = 'alphabetic';
    context.fillText(entry.name, centerX, 1612);
    drawRule(context, centerX, 1647, 1450, 'rgba(133, 84, 31, .68)');
  }

  function drawParticipationBadges(context, badgeLayout, images) {
    badgeLayout.forEach(function (badge) {
      var image = images[badge.kind];
      if (!image) return;
      context.save();
      context.translate(badge.centerX, badge.centerY);
      context.rotate(badge.angle);
      context.shadowColor = 'rgba(38, 22, 10, .19)';
      context.shadowBlur = 11;
      context.shadowOffsetY = 6;
      context.drawImage(
        image,
        -badge.size / 2,
        -badge.size / 2,
        badge.size,
        badge.size
      );
      context.restore();
    });
  }

  function drawScrollContent(context, data, avatar) {
    var firstEntry = data.entries[0];
    var ink = '#452718';
    var gold = '#83521f';
    drawCertificateFrame(context);

    context.fillStyle = ink;
    context.strokeStyle = 'rgba(133, 84, 31, .72)';
    context.lineWidth = 3;
    context.lineJoin = 'round';
    context.shadowColor = 'rgba(45, 22, 12, .18)';
    context.shadowBlur = 4;
    context.shadowOffsetY = 3;
    setFont(context, 700, 164, '"UnifrakturCook", "IM Fell English", serif');
    drawCurvedText(context, 'Certificate of Madness', 1536, 1645, 1210, 2);
    context.shadowColor = 'transparent';

    drawAvatar(context, avatar, data.name);

    setFont(context, 400, 106, '"IM Fell English", serif');
    var nameSize = fitSingleLine(
      context,
      data.name,
      1840,
      106,
      58,
      400,
      '"IM Fell English", serif'
    );
    setFont(context, 400, nameSize, '"IM Fell English", serif');
    var nameWidth = context.measureText(data.name).width;
    context.strokeStyle = gold;
    context.fillStyle = gold;
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(530, 1133);
    context.lineTo(2542, 1133);
    context.stroke();
    context.fillStyle = ink;
    context.textAlign = 'center';
    context.textBaseline = 'alphabetic';
    context.fillText(data.name, 1536, 1121);

    drawFirstEntry(context, firstEntry);
  }

  function drawRibbonText(context, entry) {
    var ink = '#4a2918';
    var waxInk = 'rgba(158, 70, 47, .96)';
    var waxStroke = 'rgba(49, 12, 9, .9)';

    context.save();
    context.shadowColor = 'rgba(30, 6, 4, .78)';
    context.shadowBlur = 5;
    context.shadowOffsetX = 4;
    context.shadowOffsetY = 4;
    context.fillStyle = waxInk;
    context.strokeStyle = waxStroke;
    context.lineWidth = 4;
    setFont(context, 900, 154, 'Cinzel, serif');
    drawCurvedText(context, String(entry.year), 355.5, 566, 350, 0);
    setFont(context, 700, 74, 'Cinzel, serif');
    drawCurvedText(
      context,
      'SEASON',
      355.5,
      666,
      260,
      1
    );
    setFont(context, 800, 92, 'Cinzel, serif');
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.strokeText(roman(entry.season), 355.5, 551);
    context.fillText(roman(entry.season), 355.5, 551);
    context.restore();

    context.save();
    context.translate(352, 1290);
    context.rotate(Math.PI / 2);
    context.fillStyle = ink;
    var teamBlock = fitTextBlock(
      context,
      entry.name.toUpperCase(),
      920,
      270,
      128,
      68,
      800,
      'Cinzel, serif',
      '',
      1
    );
    setFont(context, 800, teamBlock.size, 'Cinzel, serif');
    drawTextBlock(
      context,
      teamBlock,
      -65,
      -teamBlock.lines.length * teamBlock.lineHeight / 2
    );
    context.restore();
  }

  function drawRibbons(context, ribbonImage, layout) {
    layout.ribbons.forEach(function (ribbon) {
      var localCanvas = document.createElement('canvas');
      localCanvas.width = RIBBON_SOURCE_WIDTH;
      localCanvas.height = RIBBON_SOURCE_HEIGHT;
      var localContext = localCanvas.getContext('2d');
      if (ribbon.flipX) {
        localContext.save();
        localContext.translate(RIBBON_SOURCE_WIDTH, 0);
        localContext.scale(-1, 1);
        localContext.drawImage(ribbonImage, 0, 0, RIBBON_SOURCE_WIDTH, RIBBON_SOURCE_HEIGHT);
        localContext.restore();
      } else {
        localContext.drawImage(ribbonImage, 0, 0, RIBBON_SOURCE_WIDTH, RIBBON_SOURCE_HEIGHT);
      }
      drawRibbonText(localContext, ribbon.entry);

      context.save();
      context.translate(ribbon.centerX, ribbon.top);
      context.rotate(ribbon.angle);
      context.shadowColor = 'rgba(31, 16, 8, .5)';
      context.shadowBlur = 24;
      context.shadowOffsetY = 18;
      context.drawImage(localCanvas, -ribbon.width / 2, 0, ribbon.width, ribbon.height);
      context.restore();
    });
  }

  async function render(canvas, data, options) {
    if (!canvas || typeof canvas.getContext !== 'function') throw new Error('Certificate canvas is unavailable');
    if (!data || !data.name || !Array.isArray(data.entries) || !data.entries.length) {
      throw new Error('Certificate history is unavailable');
    }

    var settings = options || {};
    var scrollUrl = settings.scrollUrl || 'assets/certificate/scroll.webp';
    var ribbonUrl = settings.ribbonUrl || 'assets/certificate/ribbon.webp';
    var modjamBadgeUrl = settings.modjamBadgeUrl || 'assets/certificate/badge-modjam.webp';
    var modathonBadgeUrl = settings.modathonBadgeUrl || 'assets/certificate/badge-modathon.webp';
    var layout = layoutFor(data.entries, data.id || data.name);
    var badgeLayout = participationBadgeLayout(data);
    var needsModjamBadge = badgeLayout.some(function (badge) { return badge.kind === 'modjam'; });
    var needsModathonBadge = badgeLayout.some(function (badge) { return badge.kind === 'modathon'; });
    canvas.dataset.ready = 'false';
    canvas.width = layout.width;
    canvas.height = layout.height;

    var results = await Promise.all([
      loadFonts(),
      loadImage(scrollUrl, false),
      layout.ribbons.length ? loadImage(ribbonUrl, false) : Promise.resolve(null),
      data.avatar ? loadImage(data.avatar, true) : Promise.resolve(null),
      needsModjamBadge ? loadImage(modjamBadgeUrl, false) : Promise.resolve(null),
      needsModathonBadge ? loadImage(modathonBadgeUrl, false) : Promise.resolve(null)
    ]);
    var scrollImage = results[1];
    var ribbonImage = results[2];
    var avatar = results[3];
    var badgeImages = {
      modjam: results[4],
      modathon: results[5]
    };
    if (!scrollImage) throw new Error('Certificate scroll artwork failed to load');
    if (layout.ribbons.length && !ribbonImage) throw new Error('Certificate ribbon artwork failed to load');
    if (needsModjamBadge && !badgeImages.modjam) throw new Error('ModJam badge artwork failed to load');
    if (needsModathonBadge && !badgeImages.modathon) throw new Error('Modathon badge artwork failed to load');

    var context = canvas.getContext('2d');
    context.clearRect(0, 0, layout.width, layout.height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(scrollImage, 0, 0, SCROLL_WIDTH, SCROLL_HEIGHT);
    drawScrollContent(context, data, avatar);
    drawParticipationBadges(context, badgeLayout, badgeImages);
    if (layout.ribbons.length) drawRibbons(context, ribbonImage, layout);
    canvas.dataset.ready = 'true';
    return canvas;
  }

  function canvasBlob(canvas) {
    return new Promise(function (resolve, reject) {
      try {
        canvas.toBlob(function (blob) {
          if (blob) resolve(blob);
          else reject(new Error('The certificate PNG could not be created'));
        }, 'image/png');
      } catch (error) {
        reject(error);
      }
    });
  }

  function slugify(value) {
    return String(value || 'madness-modder')
      .normalize('NFKD')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'madness-modder';
  }

  async function download(canvas, name) {
    var blob = await canvasBlob(canvas);
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = slugify(name) + '-certificate-of-madness.png';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  return {
    download: download,
    layoutFor: layoutFor,
    ordinalNumber: ordinalNumber,
    ordinalSeason: ordinalSeason,
    participationBadgeLayout: participationBadgeLayout,
    render: render,
    roman: roman
  };
});
