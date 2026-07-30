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
  var RIBBON_CANVAS_HEIGHT = 2640;
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

  function layoutFor(entries, identity) {
    var ribbonEntries = (entries || []).slice(1);
    var count = ribbonEntries.length;
    var rightmostCenter = 2580;
    var step = 420;
    var firstCenter = Math.max(480, rightmostCenter - (count - 1) * step);
    var ribbons = ribbonEntries.map(function (entry, index) {
      var seed = stableHash((identity || '') + '|' + entry.year + '|' + entry.name);
      return {
        entry: entry,
        centerX: firstCenter + index * step,
        top: 1560 + seed % 35,
        angle: ((seed >>> 8) % 701 / 100 - 3.5) * Math.PI / 180,
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

  function drawCorner(context, x, y, turnX, turnY, color) {
    context.save();
    context.translate(x, y);
    context.scale(turnX, turnY);
    context.strokeStyle = color;
    context.lineWidth = 4;
    context.beginPath();
    context.moveTo(0, 92);
    context.bezierCurveTo(0, 36, 36, 0, 92, 0);
    context.moveTo(14, 115);
    context.bezierCurveTo(14, 51, 51, 14, 115, 14);
    context.moveTo(35, 35);
    context.quadraticCurveTo(78, 42, 84, 84);
    context.stroke();
    context.fillStyle = color;
    context.translate(42, 42);
    context.rotate(Math.PI / 4);
    context.fillRect(-7, -7, 14, 14);
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
    drawCorner(context, 430, 374, 1, 1, gold);
    drawCorner(context, 2642, 374, -1, 1, gold);
    drawCorner(context, 430, 1694, 1, -1, gold);
    drawCorner(context, 2642, 1694, -1, -1, gold);
    context.restore();
  }

  function drawAvatar(context, avatar, name) {
    var centerX = 760;
    var centerY = 948;
    var radius = 262;
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
      var glow = context.createRadialGradient(centerX, centerY - 80, 20, centerX, centerY, radius);
      glow.addColorStop(0, '#9d7445');
      glow.addColorStop(1, '#372317');
      context.fillStyle = glow;
      context.fillRect(centerX - radius, centerY - radius, radius * 2, radius * 2);
      context.fillStyle = '#ead39b';
      setFont(context, 800, 150, 'Cinzel, serif');
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
    context.fillStyle = '#4b2a18';
    setFont(context, 700, 28, 'Cinzel, serif');
    drawTrackedText(context, 'THE COMMITTED', centerX, centerY + radius + 43, 7);
    context.restore();
  }

  function drawFirstEntry(context, entry) {
    var centerX = 1536;
    var ink = '#4a2918';
    var gold = '#85541f';
    drawRule(context, centerX, 1280, 1740, gold);

    context.fillStyle = gold;
    setFont(context, 700, 28, 'Cinzel, serif');
    drawTrackedText(context, 'FIRST COMMITTED', centerX, 1340, 8);

    context.fillStyle = ink;
    setFont(context, 800, 82, 'Cinzel, serif');
    context.textAlign = 'center';
    context.textBaseline = 'alphabetic';
    context.fillText(String(entry.year), 1230, 1442);
    context.fillStyle = gold;
    setFont(context, 700, 42, 'Cinzel, serif');
    context.fillText('SEASON ' + roman(entry.season), 1840, 1428);

    context.fillStyle = gold;
    setFont(context, 700, 24, 'Cinzel, serif');
    drawTrackedText(context, 'TEAM', centerX, 1500, 7);
    context.fillStyle = ink;
    var teamSize = fitSingleLine(context, entry.name, 1500, 64, 36, 800, 'Cinzel, serif');
    setFont(context, 800, teamSize, 'Cinzel, serif');
    context.textAlign = 'center';
    context.fillText(entry.name, centerX, 1575);

    context.fillStyle = 'rgba(74, 41, 24, .72)';
    setFont(context, 400, 35, '"IM Fell English", serif', 'italic');
    context.fillText("Witnessed beneath the Madgod's gaze", centerX, 1660);
  }

  function drawScrollContent(context, data, avatar) {
    var firstEntry = data.entries[0];
    var ink = '#452718';
    var gold = '#83521f';
    drawCertificateFrame(context);

    context.fillStyle = ink;
    setFont(context, 900, 104, 'Cinzel, serif');
    drawTrackedText(context, 'CERTIFICATE', 1536, 492, 13);
    setFont(context, 900, 142, 'Cinzel, serif');
    drawTrackedText(context, 'OF MADNESS', 1536, 635, 6);
    drawRule(context, 1536, 674, 1050, gold);

    drawAvatar(context, avatar, data.name);

    var quote = '\u201cYe ' + data.name
      + ' has been found Certifiably Mad and Committed to the Asylum of Creative Insanity,'
      + ' in the years of our Lord Sheogorath, long may he reign!\u201d';
    context.fillStyle = ink;
    var quoteBlock = fitTextBlock(
      context,
      quote,
      1370,
      470,
      75,
      50,
      400,
      '"IM Fell English", serif',
      'italic',
      1.18
    );
    setFont(context, 400, quoteBlock.size, '"IM Fell English", serif', 'italic');
    drawTextBlock(context, quoteBlock, 1880, 730);

    drawFirstEntry(context, firstEntry);
  }

  function drawRibbonText(context, entry) {
    var ink = '#422417';
    var light = '#f2d292';
    var darkLight = '#e7bd73';

    context.save();
    context.shadowColor = 'rgba(50, 20, 10, .48)';
    context.shadowBlur = 4;
    context.shadowOffsetY = 2;
    context.fillStyle = light;
    setFont(context, 900, 92, 'Cinzel, serif');
    context.textAlign = 'center';
    context.textBaseline = 'alphabetic';
    context.fillText(String(entry.year), 355.5, 310);
    context.fillStyle = darkLight;
    setFont(context, 700, 39, 'Cinzel, serif');
    drawTrackedText(context, 'SEASON ' + roman(entry.season), 355.5, 388, 3);
    setFont(context, 700, 25, 'Cinzel, serif');
    drawTrackedText(context, 'MADNESS', 355.5, 448, 5);
    context.restore();

    context.save();
    context.fillStyle = ink;
    setFont(context, 700, 31, 'Cinzel, serif');
    drawTrackedText(context, 'TEAM', 352, 842, 8);
    drawRule(context, 352, 882, 270, 'rgba(66, 36, 23, .65)');
    var block = fitTextBlock(
      context,
      entry.name.toUpperCase(),
      390,
      620,
      66,
      36,
      800,
      'Cinzel, serif',
      '',
      1.18
    );
    setFont(context, 800, block.size, 'Cinzel, serif');
    drawTextBlock(context, block, 352, 950);
    context.fillStyle = 'rgba(66, 36, 23, .7)';
    setFont(context, 400, 28, '"IM Fell English", serif', 'italic');
    context.textAlign = 'center';
    context.textBaseline = 'alphabetic';
    context.fillText('Certifiably Mad', 352, 1740);
    context.restore();
  }

  function drawRibbons(context, ribbonImage, layout) {
    layout.ribbons.forEach(function (ribbon) {
      var localCanvas = document.createElement('canvas');
      localCanvas.width = RIBBON_SOURCE_WIDTH;
      localCanvas.height = RIBBON_SOURCE_HEIGHT;
      var localContext = localCanvas.getContext('2d');
      localContext.drawImage(ribbonImage, 0, 0, RIBBON_SOURCE_WIDTH, RIBBON_SOURCE_HEIGHT);
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
    var layout = layoutFor(data.entries, data.id || data.name);
    canvas.dataset.ready = 'false';
    canvas.width = layout.width;
    canvas.height = layout.height;

    var results = await Promise.all([
      loadFonts(),
      loadImage(scrollUrl, false),
      layout.ribbons.length ? loadImage(ribbonUrl, false) : Promise.resolve(null),
      data.avatar ? loadImage(data.avatar, true) : Promise.resolve(null)
    ]);
    var scrollImage = results[1];
    var ribbonImage = results[2];
    var avatar = results[3];
    if (!scrollImage) throw new Error('Certificate scroll artwork failed to load');
    if (layout.ribbons.length && !ribbonImage) throw new Error('Certificate ribbon artwork failed to load');

    var context = canvas.getContext('2d');
    context.clearRect(0, 0, layout.width, layout.height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(scrollImage, 0, 0, SCROLL_WIDTH, SCROLL_HEIGHT);
    drawScrollContent(context, data, avatar);
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
    render: render,
    roman: roman
  };
});
