(function () {
  'use strict';

  var main = document.getElementById('main-content');
  var archiveData;
  var modderData;
  var entries = [];
  var entryById = new Map();
  var countdownTimer;
  var passportAwardMaskPromise;
  var passportResizeObserver;
  var avatarAssets = {};

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character];
    });
  }

  function safeUrl(value) {
    if (!value) return '';
    try {
      var parsed = new URL(value, location.origin);
      return /^https?:$/.test(parsed.protocol) ? escapeHtml(parsed.href) : '';
    } catch (_error) {
      return '';
    }
  }

  function localModderAvatarUrl(value) {
    var match = String(value || '').match(/^https:\/\/avatars\.nexusmods\.com\/(\d+)\/100(?:[/?#].*)?$/i);
    return match && avatarAssets[match[1]] ? avatarAssets[match[1]] : value;
  }

  function authorLinks(authors) {
    return authors.map(function (author) {
      return '<a href="/modjam/modder/' + encodeURIComponent(author.id) + '" data-route>' + escapeHtml(author.name) + '</a>';
    }).join('<span class="author-join"> &amp; </span>');
  }

  function placementBadge(entry) {
    if (!entry.placement) return '';
    return '<span class="placement placement--' + escapeHtml(entry.placement) + '">' + escapeHtml(entry.placementLabel) + '</span>';
  }

  function eventTone(event) {
    return event.season.toLowerCase();
  }

  function eventCard(event) {
    var banner = event.banner
      ? '<img src="' + escapeHtml(event.banner) + '" alt="" loading="lazy" decoding="async">'
      : '<div class="event-card-art event-card-art--' + eventTone(event) + '" aria-hidden="true"><span>' + (event.season === 'Winter' ? '❄' : event.season === 'Spring' ? '✿' : '☀') + '</span></div>';
    var themes = Array.from(new Set(event.entries.flatMap(function (entry) { return entry.themes; }))).slice(0, 3);
    return '<a class="event-card event-card--' + eventTone(event) + '" href="/modjam/archive?event=' + event.id + '" data-route>' +
      '<div class="event-card-image">' + banner + '<span class="event-stamp">' + escapeHtml(event.season) + '<strong>' + event.year + '</strong></span></div>' +
      '<div class="event-card-copy"><div><span class="eyebrow">' + escapeHtml(event.competitionLabel) + '</span><h3>' + escapeHtml(event.label) + ' Modjam</h3></div>' +
      '<p>' + event.entries.length + ' entries · ' + escapeHtml(themes.join(' · ')) + '</p>' +
      '<span class="text-link">Open the archive <span aria-hidden="true">→</span></span></div></a>';
  }

  function entryPicture(entry) {
    var pictureUrl = safeUrl(entry.pictureUrl);
    var tone = eventTone(entry.event);
    var fallback = '<span class="entry-card-picture-fallback" aria-hidden="true">M</span>';
    if (!pictureUrl) {
      return '<div class="entry-card-picture entry-card-picture--' + tone + '">' + fallback + '</div>';
    }
    return '<a class="entry-card-picture entry-card-picture--' + tone + ' entry-card-picture--loading" href="' + safeUrl(entry.url) + '" target="_blank" rel="noopener" aria-label="Open ' + escapeHtml(entry.title) + ' on Nexus Mods">' +
      fallback + '<img src="' + pictureUrl + '" alt="" loading="lazy" decoding="async">' +
      '</a>';
  }

  function entryCard(entry, options) {
    options = options || {};
    var event = entry.event;
    var awards = entry.awards.length
      ? '<div class="award-chips">' + entry.awards.map(function (award) { return '<span>' + escapeHtml(award) + '</span>'; }).join('') + '</div>'
      : '';
    var placard = entry.awardPlacardUrl
      ? '<a class="placard-link" href="' + safeUrl(entry.awardPlacardUrl) + '" target="_blank" rel="noopener">View award placard <span aria-hidden="true">↗</span></a>'
      : '';
    var eventLabel = options.hideEvent ? '' : '<a class="entry-event" href="/modjam/archive?event=' + event.id + '" data-route>' + escapeHtml(event.label) + '</a>';
    var title = entry.url
      ? '<a href="' + safeUrl(entry.url) + '" target="_blank" rel="noopener">' + escapeHtml(entry.title) + '<span class="external-mark" aria-hidden="true">↗</span></a>'
      : escapeHtml(entry.title);
    var justForFun = event.competitionType === 'just-for-fun' ? '<span class="just-for-fun">Just for fun · no ranked winner</span>' : '';
    return '<article class="entry-card">' +
      entryPicture(entry) +
      '<div class="entry-card-top">' + eventLabel + placementBadge(entry) + '</div>' +
      '<h3>' + title + '</h3>' +
      '<p class="entry-authors">by ' + authorLinks(entry.authors) + '</p>' +
      '<div class="entry-meta"><span>' + escapeHtml(entry.category) + '</span><span>' + escapeHtml(entry.themes.join(' · ')) + '</span></div>' +
      justForFun + awards + placard +
      '</article>';
  }

  function pageIntro(kicker, title, copy) {
    var eyebrow = kicker ? '<span class="eyebrow">' + escapeHtml(kicker) + '</span>' : '';
    var description = copy ? '<p>' + escapeHtml(copy) + '</p>' : '';
    return '<section class="page-intro">' + eyebrow + '<h1>' + escapeHtml(title) + '</h1>' + description + '</section>';
  }

  function updateCountdown() {
    var container = document.querySelector('[data-countdown]');
    if (!container) return;
    var view = ModjamSchedule.getCountdownView(Date.now());
    var eyebrow = view.eyebrow ? '<span>' + escapeHtml(view.eyebrow) + '</span>' : '';
    var clock = view.segments.length ? '<div class="countdown-clock" role="timer" aria-label="' + escapeHtml(view.ariaLabel) + '">' + view.segments.map(function (segment) {
      return '<div><strong>' + escapeHtml(segment.value) + '</strong><span>' + escapeHtml(segment.unit) + '</span></div>';
    }).join('') + '</div>' : '';
    container.className = 'countdown-card countdown-card--' + view.mode;
    container.innerHTML = '<div class="countdown-copy">' + eyebrow + '<h2>' + escapeHtml(view.title) + '</h2><p>' + escapeHtml(view.detail) + '</p></div>' + clock;
  }

  function startCountdown() {
    clearInterval(countdownTimer);
    updateCountdown();
    countdownTimer = setInterval(updateCountdown, 1000);
  }

  function renderHome() {
    var latestEvents = archiveData.events.slice().reverse();
    var awardNames = entries.flatMap(function (entry) { return entry.awards; });
    var favorites = [
      'The Gigglesnort Award',
      'Four Ancestors in a Trenchcoat Award',
      'Narco N’wah Award',
      'Lighthouse That Never Goes Out Award',
      'I Will Never Recover Award',
      '“Mom, can I get a Penguin?” Award'
    ].map(function (wanted) {
      return awardNames.find(function (award) {
        return award.toLowerCase().replace(/[“”"'’]/g, '') === wanted.toLowerCase().replace(/[“”"'’]/g, '');
      }) || wanted;
    });

    main.innerHTML = '<section class="hero">' +
      '<div class="season-side season-side--winter" aria-hidden="true"><span class="flake flake--one">❄</span><span class="flake flake--two">❅</span><span class="pine pine--one"></span><span class="pine pine--two"></span></div>' +
      '<div class="season-side season-side--summer" aria-hidden="true"><span class="sun"></span><span class="palm">🌴</span><span class="wave wave--one"></span><span class="wave wave--two"></span></div>' +
      '<div class="hero-copy"><span class="hero-kicker">A Morrowind modding tradition since 2020</span><h1>Morrowind<br><em>ModJam</em></h1><p>The Modjam is a 48-hour, theme-based modding event. Once the themes are announced, participants will have 48 hours to create and release a Morrowind mod based on the selected themes.</p><div class="hero-actions"><a class="button button--ink" href="/modjam/archive" data-route>Explore every entry <span aria-hidden="true">→</span></a><a class="hero-faq-link" href="/modjam/faq" data-route>FAQ <span aria-hidden="true">→</span></a></div></div>' +
      '<div class="countdown-wrap"><div data-countdown></div><div class="event-schedule" aria-label="Summer Modjam 2026 schedule"><div><strong>Kickoff Livestream</strong><time datetime="2026-08-21T23:00:00Z">August 21, 2026 · 23:00 UTC</time></div><div><strong>The Modjam</strong><time datetime="2026-08-21T00:00:00Z">August 21, 2026 · 00:00 UTC</time><time datetime="2026-08-23T00:00:00Z">August 23, 2026 · 00:00 UTC</time></div></div></div>' +
      '</section>' +
      '<section class="stat-ribbon" aria-label="Archive totals"><div><strong>' + archiveData.summary.eventCount + '</strong><span>past Modjams</span></div><div><strong>' + archiveData.summary.entryCount + '</strong><span>mods made</span></div><div><strong>' + archiveData.summary.modderCount + '</strong><span>credited modders</span></div><div><strong>' + archiveData.summary.judgeAwardCount + '</strong><span>judge awards recorded</span></div></section>' +
      '<section class="archive-section"><div class="section-heading section-heading--row"><div><h2>The Modjam archive</h2></div><a class="text-link" href="/modjam/archive" data-route>Browse all 164 entries <span aria-hidden="true">→</span></a></div><div class="event-grid">' + latestEvents.map(eventCard).join('') + '</div></section>' +
      '<section class="awards-marquee"><div class="awards-marquee-copy"><h2>Judge Awards</h2><p>Beginning in Summer 2022, judges started honoring the memorable details that do not fit on a scorecard.</p><a class="button button--paper" href="/modjam/awards" data-route>Visit the awards cabinet</a></div><div class="award-ribbons">' + favorites.map(function (award, index) { return '<span style="--turn:' + (index % 2 ? '1.5deg' : '-1.5deg') + '">' + escapeHtml(award) + '</span>'; }).join('') + '</div></section>' +
      '<section class="modder-callout"><div class="host-card"><a class="host-portrait" href="https://danaeplays.thenet.sk/" target="_blank" rel="noopener" aria-label="Visit Danae\'s Journal"><img src="../assets/images/modder-avatars/1233897.webp" alt="Danae" width="100" height="100" loading="lazy" decoding="async"></a><div class="host-card-copy"><span class="eyebrow">Modjam host</span><h2>Danae</h2><p>Explore her Morrowind writing, mods, and streams.</p><nav class="host-links" aria-label="Danae online"><a href="https://danaeplays.thenet.sk/" target="_blank" rel="noopener">Website <span aria-hidden="true">↗</span></a><a href="https://www.twitch.tv/danaeplays" target="_blank" rel="noopener">Twitch <span aria-hidden="true">↗</span></a><a href="https://www.nexusmods.com/profile/Danae123" target="_blank" rel="noopener">Nexus Mods <span aria-hidden="true">↗</span></a></nav></div></div><div class="modder-callout-copy"><h2>Meet the Modjammers</h2><p>Follow every creator across the ModJams.</p><a class="button button--sun" href="/modjam/modders" data-route>Browse ' + archiveData.summary.modderCount + ' profiles <span aria-hidden="true">→</span></a></div></section>';
    startCountdown();
  }

  function renderFaq() {
    main.innerHTML = '<section class="faq-section faq-section--page" aria-labelledby="faq-heading"><div class="faq-shell"><div class="section-heading"><span class="eyebrow">Summer Modjam 2026</span><h1 id="faq-heading">Frequently asked questions</h1></div><div class="faq-list"><details open><summary>How long do I have?</summary><div class="faq-answer"><p>You will have 48 hours to make and release a mod based on the selected themes. There is usually a 4–6 hour grace period for final uploads, but please try to submit within the main timeframe where possible.</p></div></details><details><summary>Rules &amp; Guidelines</summary><div class="faq-answer"><ul><li>Create your mod during the Modjam.</li><li>Modders\' resources are allowed.</li><li>The use of AI is not forbidden, but I ask that its use be disclosed.</li><li>Previous projects can be a source of inspiration, but please try to make something new for the event.</li><li>Most importantly, this is intended to be a friendly community event. Please focus on having fun and making something you enjoy.</li></ul></div></details><details><summary>How to Participate</summary><div class="faq-answer"><p>To take part, create a Morrowind mod based on the selected themes and publish it on Nexus Mods during the Modjam.</p><ul><li>Add the Morrowind Summer Modjam 2026 banner to your mod description: <a href="https://i.imgur.com/7nytO4q.png" target="_blank" rel="noopener">banner link</a>.</li><li>Share your release in the MMC “Published Mods” thread.</li><li>Make sure we know about your submission.</li></ul></div></details><details><summary>Prizes</summary><div class="faq-answer"><p>There will be game keys and Nexus Donation Points available as prizes. Submitted mods may also be featured in video showcases.</p></div></details><details><summary>Results Livestream</summary><div class="faq-answer"><p><strong>Date: TBA</strong></p><p>The date will depend partly on the number of entries and how much time the judges need to review them.</p></div></details></div></div></section>';
  }

  function renderArchive() {
    var params = new URLSearchParams(location.search);
    var selectedEvent = params.get('event') || '';
    main.innerHTML = '<div class="paper-page">' + pageIntro('', 'The entry archive') +
      '<section class="filter-panel" aria-label="Archive filters"><label><span>Search</span><input type="search" id="entry-search" placeholder="Mod, modder, theme, award…"></label><label><span>Modjam</span><select id="event-filter"><option value="">All Modjams</option>' + archiveData.events.slice().reverse().map(function (event) { return '<option value="' + event.id + '"' + (selectedEvent === event.id ? ' selected' : '') + '>' + escapeHtml(event.label) + '</option>'; }).join('') + '</select></label><label><span>Season</span><select id="season-filter"><option value="">All seasons</option><option>Winter</option><option>Spring</option><option>Summer</option></select></label><label><span>Category</span><select id="category-filter"><option value="">All categories</option>' + archiveData.summary.categories.map(function (category) { return '<option>' + escapeHtml(category) + '</option>'; }).join('') + '</select></label><label><span>Recognition</span><select id="result-filter"><option value="">Everything</option><option value="placements">Placed entries</option><option value="awards">Judge award recipients</option><option value="placards">Award placards</option><option value="just-for-fun">Just-for-fun entries</option></select></label><button class="clear-button" type="button" id="clear-filters" aria-label="Clear filters" title="Clear filters"><span class="clear-filters-icon" aria-hidden="true"></span></button></section>' +
      '<div class="results-heading"><p id="entry-count" aria-live="polite"></p><div class="legend"><span class="legend-winter">Winter</span><span class="legend-spring">Spring</span><span class="legend-summer">Summer</span></div></div><section class="entry-grid" id="entry-results"></section></div>';

    var controls = ['entry-search', 'event-filter', 'season-filter', 'category-filter', 'result-filter'].map(function (id) { return document.getElementById(id); });
    function update() {
      var query = controls[0].value.trim().toLowerCase();
      var eventValue = controls[1].value;
      var season = controls[2].value;
      var category = controls[3].value;
      var result = controls[4].value;
      var matches = entries.filter(function (entry) {
        var haystack = [entry.title, entry.category, entry.event.label].concat(entry.themes, entry.awards, entry.authors.map(function (author) { return author.name; })).join(' ').toLowerCase();
        if (query && !haystack.includes(query)) return false;
        if (eventValue && entry.event.id !== eventValue) return false;
        if (season && entry.event.season !== season) return false;
        if (category && entry.category !== category) return false;
        if (result === 'placements' && !entry.placement) return false;
        if (result === 'awards' && !entry.awards.length) return false;
        if (result === 'placards' && !entry.awardPlacardUrl) return false;
        if (result === 'just-for-fun' && entry.event.competitionType !== 'just-for-fun') return false;
        return true;
      });
      document.getElementById('entry-count').innerHTML = '<strong>' + matches.length + '</strong> ' + (matches.length === 1 ? 'entry' : 'entries') + ' found';
      document.getElementById('entry-results').innerHTML = matches.length ? matches.map(entryCard).join('') : '<div class="empty-state"><strong>No entries found.</strong><span>Try a broader search or clear the filters.</span></div>';
    }
    controls.forEach(function (control) { control.addEventListener(control.type === 'search' ? 'input' : 'change', update); });
    document.getElementById('clear-filters').addEventListener('click', function () { controls.forEach(function (control) { control.value = ''; }); update(); });
    update();
  }

  function modderAvatar(modder, large) {
    if (modder.avatarUrl) return '<img class="modder-avatar' + (large ? ' modder-avatar--large' : '') + '" src="' + safeUrl(localModderAvatarUrl(modder.avatarUrl)) + '" alt="" loading="lazy" referrerpolicy="no-referrer">';
    var initials = modder.name.split(/\s+/).map(function (piece) { return piece[0]; }).join('').slice(0, 2).toUpperCase();
    return '<span class="modder-avatar modder-avatar--fallback' + (large ? ' modder-avatar--large' : '') + '" aria-hidden="true">' + escapeHtml(initials) + '</span>';
  }

  function modderCard(modder) {
    return '<a class="modder-card" href="/modjam/modder/' + encodeURIComponent(modder.id) + '" data-route>' +
      modderAvatar(modder, false) + '<div class="modder-card-copy"><h3>' + escapeHtml(modder.name) + '</h3><p>Since ' + escapeHtml(modder.firstModjam) + '</p><div><span><strong>' + modder.entryIds.length + '</strong> entries</span><span><strong>' + modder.placementEntryIds.length + '</strong> placements</span><span><strong>' + modder.awardCount + '</strong> awards</span></div></div><span class="round-arrow" aria-hidden="true">→</span></a>';
  }

  function stablePassportScore(value) {
    var hash = 2166136261;
    for (var index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  var PASSPORT_AWARD_TARGET = 4;
  var PASSPORT_AWARD_MAX = 8;

  function passportAwardNotes(modder, work) {
    var usedAwards = new Set();
    var awardGroups = work.filter(function (entry) { return entry.awards.length; }).map(function (entry) {
      return Array.from(new Set(entry.awards)).map(function (award) {
        return {
          full: award,
          label: award.replace(/\s+Award$/i, '').trim(),
          score: stablePassportScore(modder.id + '|' + entry.id + '|' + award),
          entry: entry
        };
      }).sort(function (left, right) {
        return left.score - right.score || left.label.localeCompare(right.label);
      });
    });
    var candidates = awardGroups.map(function (awards) {
      var candidate = awards.find(function (award) { return !usedAwards.has(award.full) && award.label.length <= 48; }) ||
        awards.find(function (award) { return !usedAwards.has(award.full); }) || awards[0];
      usedAwards.add(candidate.full);
      return candidate;
    }).slice(0, PASSPORT_AWARD_MAX);

    if (work.length < PASSPORT_AWARD_TARGET && candidates.length < PASSPORT_AWARD_TARGET) {
      var supplementalAwards = awardGroups.flatMap(function (awards) {
        return awards.filter(function (award) { return !usedAwards.has(award.full); });
      }).sort(function (left, right) {
        var leftIsLong = left.label.length > 48 ? 1 : 0;
        var rightIsLong = right.label.length > 48 ? 1 : 0;
        return leftIsLong - rightIsLong || left.score - right.score || left.label.localeCompare(right.label);
      });
      supplementalAwards.some(function (award) {
        if (candidates.length >= PASSPORT_AWARD_TARGET) return true;
        if (usedAwards.has(award.full)) return false;
        usedAwards.add(award.full);
        candidates.push(award);
        return false;
      });
    }

    candidates.sort(function (left, right) {
      return right.label.length - left.label.length || left.score - right.score;
    });

    function splitAwardLabel(label) {
      var words = label.split(/\s+/);
      if (words.length < 2) return [label];
      var best;
      for (var split = 1; split < words.length; split += 1) {
        var first = words.slice(0, split).join(' ');
        var second = words.slice(split).join(' ');
        var score = Math.max(first.length, second.length) * 2 + Math.abs(first.length - second.length);
        if (!best || score < best.score) best = { lines: [first, second], score: score };
      }
      return best.lines;
    }

    return candidates.map(function (candidate, noteIndex) {
      var lines = splitAwardLabel(candidate.label);
      var shouldWrap = lines.length > 1 && (candidate.label.length > 28 || noteIndex % 2 === 1);
      if (!shouldWrap) lines = [candidate.label];
      var visualLength = Math.max.apply(Math, lines.map(function (line) { return line.length; }));
      var lengthClass = visualLength > 44 ? ' passport-award-note--very-long' : visualLength > 30 ? ' passport-award-note--long' : '';
      var wrapClass = lines.length > 1 ? ' passport-award-note--wrapped' : '';
      var content = lines.map(function (line) { return '<span>' + escapeHtml(line) + '</span>'; }).join('');
      var source = candidate.entry.title || candidate.entry.id;
      return '<span class="passport-award-note' + lengthClass + wrapClass + '" data-award-note="' + noteIndex + '" data-award-source="' + escapeHtml(candidate.entry.id) + '" aria-label="' + escapeHtml(candidate.label + ', award for ' + source) + '" title="' + escapeHtml(candidate.full + ' — ' + source) + '">' + content + '</span>';
    }).join('');
  }

  function loadPassportAwardMask() {
    if (passportAwardMaskPromise) return passportAwardMaskPromise;
    passportAwardMaskPromise = new Promise(function (resolve) {
      var image = new Image();
      image.onload = function () {
        var canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        var context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) { resolve(null); return; }
        context.drawImage(image, 0, 0);
        var pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        var integralWidth = canvas.width + 1;
        var blockedIntegral = new Uint32Array(integralWidth * (canvas.height + 1));
        for (var y = 0; y < canvas.height; y += 1) {
          var blockedInRow = 0;
          for (var x = 0; x < canvas.width; x += 1) {
            var offset = (y * canvas.width + x) * 4;
            blockedInRow += pixels[offset] > 200 && pixels[offset + 3] > 200 ? 0 : 1;
            blockedIntegral[(y + 1) * integralWidth + x + 1] = blockedIntegral[y * integralWidth + x + 1] + blockedInRow;
          }
        }
        resolve({ width: canvas.width, height: canvas.height, pixels: pixels, blockedIntegral: blockedIntegral, integralWidth: integralWidth });
      };
      image.onerror = function () { resolve(null); };
      image.src = 'assets/images/modjam_passport_mask.png';
    });
    return passportAwardMaskPromise;
  }

  function setupPassportAwardLayout(modder) {
    var book = document.querySelector('.passport-book');
    var notes = Array.from(document.querySelectorAll('.passport-award-note'));
    if (!book || !notes.length) return;

    loadPassportAwardMask().then(function (mask) {
      if (!book.isConnected) return;
      var frame;

      function scheduleLayout() {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(layoutNotes);
      }

      function layoutNotes() {
        if (!book.isConnected) return;
        var bookRect = book.getBoundingClientRect();
        if (!bookRect.width || !bookRect.height) return;
        var bookWidth = bookRect.width;
        var bookHeight = bookRect.height;
        var collisionMargin = Math.max(4, bookWidth * .005);

        function relativeRect(element, padding) {
          var rect = element.getBoundingClientRect();
          padding = padding || 0;
          return {
            left: rect.left - bookRect.left - padding,
            right: rect.right - bookRect.left + padding,
            top: rect.top - bookRect.top - padding,
            bottom: rect.bottom - bookRect.top + padding
          };
        }

        function rectanglesOverlap(left, right, padding) {
          padding = padding || 0;
          return left.left < right.right + padding && left.right > right.left - padding && left.top < right.bottom + padding && left.bottom > right.top - padding;
        }

        function noteGeometry(centerX, centerY, width, height, angle) {
          var radians = angle * Math.PI / 180;
          var cosine = Math.cos(radians);
          var sine = Math.sin(radians);
          var halfWidth = width / 2;
          var halfHeight = height / 2;
          var localCorners = [
            [-halfWidth, -halfHeight], [halfWidth, -halfHeight],
            [halfWidth, halfHeight], [-halfWidth, halfHeight]
          ];
          var corners = localCorners.map(function (corner) {
            return {
              x: centerX + corner[0] * cosine - corner[1] * sine,
              y: centerY + corner[0] * sine + corner[1] * cosine
            };
          });
          var xs = corners.map(function (point) { return point.x; });
          var ys = corners.map(function (point) { return point.y; });
          return {
            centerX: centerX,
            centerY: centerY,
            width: width,
            height: height,
            angle: angle,
            cosine: cosine,
            sine: sine,
            corners: corners,
            bounds: { left: Math.min.apply(Math, xs), right: Math.max.apply(Math, xs), top: Math.min.apply(Math, ys), bottom: Math.max.apply(Math, ys) }
          };
        }

        function maskAllowsPoint(point) {
          if (point.x < 0 || point.x > bookWidth || point.y < 0 || point.y > bookHeight) return false;
          if (!mask) {
            var normalizedX = point.x / bookWidth;
            var normalizedY = point.y / bookHeight;
            if (normalizedX < .116 || normalizedX > .883 || normalizedY < .047 || normalizedY > .94) return false;
            if (normalizedY < .23 && normalizedX > .79) return false;
            if (normalizedY > .91 && normalizedX < .248) return false;
            return true;
          }
          var maskX = Math.max(0, Math.min(mask.width - 1, Math.round(point.x / bookWidth * (mask.width - 1))));
          var maskY = Math.max(0, Math.min(mask.height - 1, Math.round(point.y / bookHeight * (mask.height - 1))));
          var offset = (maskY * mask.width + maskX) * 4;
          return mask.pixels[offset] > 200 && mask.pixels[offset + 3] > 200;
        }

        function maskAllowsGeometry(geometry) {
          if (geometry.bounds.left < 0 || geometry.bounds.right > bookWidth || geometry.bounds.top < 0 || geometry.bounds.bottom > bookHeight) return false;
          if (mask && mask.blockedIntegral) {
            var left = Math.max(0, Math.floor(geometry.bounds.left / bookWidth * mask.width));
            var right = Math.min(mask.width, Math.ceil(geometry.bounds.right / bookWidth * mask.width));
            var top = Math.max(0, Math.floor(geometry.bounds.top / bookHeight * mask.height));
            var bottom = Math.min(mask.height, Math.ceil(geometry.bounds.bottom / bookHeight * mask.height));
            var stride = mask.integralWidth;
            var blockedPixels = mask.blockedIntegral[bottom * stride + right] - mask.blockedIntegral[top * stride + right] - mask.blockedIntegral[bottom * stride + left] + mask.blockedIntegral[top * stride + left];
            if (!blockedPixels) return true;
          }
          var maskPixelSize = mask ? Math.max(bookWidth / mask.width, bookHeight / mask.height) : Math.min(bookWidth, bookHeight) * .004;
          var sampleSpacing = Math.max(1, maskPixelSize * 1.5);
          var horizontalSteps = Math.max(1, Math.ceil(geometry.width / sampleSpacing));
          var verticalSteps = Math.max(1, Math.ceil(geometry.height / sampleSpacing));
          for (var row = 0; row <= verticalSteps; row += 1) {
            var localY = -geometry.height / 2 + geometry.height * row / verticalSteps;
            for (var column = 0; column <= horizontalSteps; column += 1) {
              var localX = -geometry.width / 2 + geometry.width * column / horizontalSteps;
              if (!maskAllowsPoint({
                x: geometry.centerX + localX * geometry.cosine - localY * geometry.sine,
                y: geometry.centerY + localX * geometry.sine + localY * geometry.cosine
              })) return false;
            }
          }
          return true;
        }

        function noteHitsCircle(geometry, circle) {
          var deltaX = circle.x - geometry.centerX;
          var deltaY = circle.y - geometry.centerY;
          var localX = deltaX * geometry.cosine + deltaY * geometry.sine;
          var localY = -deltaX * geometry.sine + deltaY * geometry.cosine;
          var halfWidth = geometry.width / 2;
          var halfHeight = geometry.height / 2;
          var closestX = Math.max(-halfWidth, Math.min(halfWidth, localX));
          var closestY = Math.max(-halfHeight, Math.min(halfHeight, localY));
          var distanceX = localX - closestX;
          var distanceY = localY - closestY;
          return distanceX * distanceX + distanceY * distanceY < circle.radius * circle.radius;
        }

        var protectedRects = Array.from(book.querySelectorAll('.passport-identity, .passport-visas-title')).map(function (element) {
          return relativeRect(element, collisionMargin);
        });
        var circles = Array.from(book.querySelectorAll('.passport-stamp')).map(function (stamp) {
          var rect = stamp.getBoundingClientRect();
          return {
            x: rect.left - bookRect.left + rect.width / 2,
            y: rect.top - bookRect.top + rect.height / 2,
            radius: Math.max(rect.width, rect.height) / 2 + collisionMargin
          };
        });
        var rowTolerance = bookHeight * .035;
        var rows = [];
        circles.slice().sort(function (left, right) { return left.y - right.y; }).forEach(function (circle) {
          var row = rows.find(function (candidate) { return Math.abs(candidate.y - circle.y) <= rowTolerance; });
          if (row) {
            row.circles.push(circle);
            row.y = row.circles.reduce(function (total, item) { return total + item.y; }, 0) / row.circles.length;
          } else {
            rows.push({ y: circle.y, circles: [circle] });
          }
        });
        var preferredYs = [];
        rows.forEach(function (row) {
          var averageRadius = row.circles.reduce(function (total, circle) { return total + circle.radius; }, 0) / row.circles.length;
          preferredYs.push(row.y, row.y - averageRadius * 1.25, row.y + averageRadius * 1.25);
        });
        rows.slice(0, -1).forEach(function (row, index) { preferredYs.push((row.y + rows[index + 1].y) / 2); });
        for (var normalizedY = .1; normalizedY <= .93; normalizedY += .025) preferredYs.push(normalizedY * bookHeight);
        preferredYs = preferredYs.filter(function (value, index, values) {
          return value > 0 && value < bookHeight && values.findIndex(function (candidate) { return Math.abs(candidate - value) < 2; }) === index;
        });
        var preferredXs = [];
        for (var normalizedX = .13; normalizedX <= .87; normalizedX += .018) preferredXs.push(normalizedX * bookWidth);
        circles.forEach(function (left, index) {
          circles.slice(index + 1).forEach(function (right) {
            if (Math.abs(left.y - right.y) <= rowTolerance * 1.5) preferredXs.push((left.x + right.x) / 2);
          });
        });
        var rotations = [0, -4, 4, -8, 8, -12, 12, -18, 18, -26, 26, -35, 35, -45, 45];
        var placed = [];

        notes.forEach(function (note, noteIndex) {
          note.classList.remove('is-placed');
          note.dataset.placed = 'false';
          note.style.left = '0';
          note.style.top = '0';
          note.style.transform = 'translate(-50%, -50%) rotate(0deg)';
          var noteWidth = note.offsetWidth;
          var noteHeight = note.offsetHeight;
          var best;

          [1, .88, .76, .64].some(function (scale) {
            preferredYs.forEach(function (centerY) {
              preferredXs.forEach(function (centerX) {
                rotations.forEach(function (angle) {
                  var geometry = noteGeometry(centerX, centerY, noteWidth * scale, noteHeight * scale, angle);
                  if (!maskAllowsGeometry(geometry)) return;
                  if (protectedRects.some(function (rect) { return rectanglesOverlap(geometry.bounds, rect); })) return;
                  if (circles.some(function (circle) { return noteHitsCircle(geometry, circle); })) return;
                  if (placed.some(function (other) { return rectanglesOverlap(geometry.bounds, other.bounds, collisionMargin); })) return;
                  var gapDistance = preferredYs.slice(0, Math.max(rows.length * 3 + Math.max(0, rows.length - 1), 1)).reduce(function (distance, targetY) {
                    return Math.min(distance, Math.abs(centerY - targetY));
                  }, bookHeight);
                  var circleDistance = circles.reduce(function (distance, circle) {
                    return Math.min(distance, Math.max(0, Math.hypot(centerX - circle.x, centerY - circle.y) - circle.radius));
                  }, bookWidth);
                  var jitter = stablePassportScore(modder.id + '|' + note.textContent + '|' + Math.round(centerX) + '|' + Math.round(centerY) + '|' + angle) % 1000 / 100;
                  var score = gapDistance + Math.abs(circleDistance - bookWidth * .025) * .12 + jitter + (1 - scale) * 80;
                  if (!best || score < best.score) best = { geometry: geometry, scale: scale, score: score };
                });
              });
            });
            return Boolean(best);
          });

          if (!best) return;
          note.style.left = (best.geometry.centerX / bookWidth * 100).toFixed(3) + '%';
          note.style.top = (best.geometry.centerY / bookHeight * 100).toFixed(3) + '%';
          note.style.transform = 'translate(-50%, -50%) rotate(' + best.geometry.angle + 'deg) scale(' + best.scale + ')';
          note.classList.add('is-placed');
          note.dataset.placed = 'true';
          placed.push(best.geometry);
        });
      }

      if (passportResizeObserver) passportResizeObserver.disconnect();
      passportResizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(scheduleLayout) : null;
      if (passportResizeObserver) passportResizeObserver.observe(book);
      scheduleLayout();
    });
  }

  function passportCanvasFont(element, outputScale, elementScale) {
    var style = getComputedStyle(element);
    var size = parseFloat(style.fontSize) * outputScale * (elementScale || 1);
    return [style.fontStyle, style.fontWeight, size.toFixed(2) + 'px', style.fontFamily].filter(Boolean).join(' ');
  }

  function drawPassportCanvasText(context, element, text, x, y, outputScale, options) {
    options = options || {};
    var style = getComputedStyle(element);
    if (style.textTransform === 'uppercase') text = text.toUpperCase();
    else if (style.textTransform === 'lowercase') text = text.toLowerCase();
    var elementScale = options.elementScale || 1;
    var spacing = parseFloat(style.letterSpacing);
    spacing = Number.isFinite(spacing) ? spacing * outputScale * elementScale : 0;
    context.save();
    context.fillStyle = style.color;
    context.globalAlpha *= Number.isFinite(parseFloat(style.opacity)) ? parseFloat(style.opacity) : 1;
    context.font = passportCanvasFont(element, outputScale, elementScale);
    context.textBaseline = 'middle';
    var align = options.align || 'left';
    if (!spacing || text.length < 2) {
      context.textAlign = align;
      context.fillText(text, x, y, options.maxWidth);
      context.restore();
      return;
    }
    var characters = Array.from(text);
    var widths = characters.map(function (character) { return context.measureText(character).width; });
    var totalWidth = widths.reduce(function (total, width) { return total + width; }, 0) + spacing * (widths.length - 1);
    var cursor = align === 'center' ? x - totalWidth / 2 : align === 'right' ? x - totalWidth : x;
    characters.forEach(function (character, index) {
      context.textAlign = 'left';
      context.fillText(character, cursor, y);
      cursor += widths[index] + spacing;
    });
    context.restore();
  }

  function loadPassportCanvasImage(url, useCorsFetch) {
    if (!url) return Promise.resolve(null);
    if (!useCorsFetch) {
      return new Promise(function (resolve) {
        var image = new Image();
        image.onload = function () { resolve({ image: image }); };
        image.onerror = function () { resolve(null); };
        image.src = url;
      });
    }
    return fetch(url, { mode: 'cors', credentials: 'omit' }).then(function (response) {
      if (!response.ok) throw new Error('Image request failed');
      return response.blob();
    }).then(function (blob) {
      var objectUrl = URL.createObjectURL(blob);
      return new Promise(function (resolve) {
        var image = new Image();
        image.onload = function () { resolve({ image: image, objectUrl: objectUrl }); };
        image.onerror = function () { URL.revokeObjectURL(objectUrl); resolve(null); };
        image.src = objectUrl;
      });
    }).catch(function () { return null; });
  }

  async function renderPassportCanvas(modder) {
    var book = document.querySelector('.passport-book');
    if (!book) throw new Error('Passport is not available');
    await loadPassportAwardMask();
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    await new Promise(function (resolve) { requestAnimationFrame(function () { requestAnimationFrame(resolve); }); });

    var bookRect = book.getBoundingClientRect();
    var width = 2048;
    var height = 1024;
    var outputScale = width / bookRect.width;
    var canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    var context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas is not supported');

    function relativeRect(element) {
      var rect = element.getBoundingClientRect();
      return {
        left: (rect.left - bookRect.left) * outputScale,
        top: (rect.top - bookRect.top) * outputScale,
        right: (rect.right - bookRect.left) * outputScale,
        bottom: (rect.bottom - bookRect.top) * outputScale,
        width: rect.width * outputScale,
        height: rect.height * outputScale,
        centerX: (rect.left - bookRect.left + rect.width / 2) * outputScale,
        centerY: (rect.top - bookRect.top + rect.height / 2) * outputScale
      };
    }

    var art = book.querySelector('.passport-art');
    if (!art.complete) await new Promise(function (resolve) { art.addEventListener('load', resolve, { once: true }); });
    context.drawImage(art, 0, 0, width, height);

    var photo = book.querySelector('.passport-photo .modder-avatar');
    var photoRect = relativeRect(photo);
    var photoStyle = getComputedStyle(photo);
    context.save();
    context.fillStyle = photoStyle.borderTopColor || 'rgba(231,203,146,.58)';
    context.fillRect(photoRect.left, photoRect.top, photoRect.width, photoRect.height);
    var border = Math.max(1, parseFloat(photoStyle.borderTopWidth) * outputScale);
    var inner = { left: photoRect.left + border, top: photoRect.top + border, width: photoRect.width - border * 2, height: photoRect.height - border * 2 };
    context.fillStyle = photoStyle.backgroundColor || '#76513a';
    context.fillRect(inner.left, inner.top, inner.width, inner.height);
    var photoImage = photo.tagName === 'IMG' ? await loadPassportCanvasImage(photo.currentSrc || photo.src, true) : null;
    if (photoImage) {
      var image = photoImage.image;
      var ratio = Math.max(inner.width / image.naturalWidth, inner.height / image.naturalHeight);
      var drawWidth = image.naturalWidth * ratio;
      var drawHeight = image.naturalHeight * ratio;
      context.save();
      context.beginPath();
      context.rect(inner.left, inner.top, inner.width, inner.height);
      context.clip();
      context.filter = photoStyle.filter === 'none' ? 'none' : photoStyle.filter;
      context.drawImage(image, inner.left + (inner.width - drawWidth) / 2, inner.top + (inner.height - drawHeight) / 2, drawWidth, drawHeight);
      context.restore();
      if (photoImage.objectUrl) URL.revokeObjectURL(photoImage.objectUrl);
    } else {
      var initials = modder.name.split(/\s+/).map(function (piece) { return piece[0]; }).join('').slice(0, 2).toUpperCase();
      context.fillStyle = '#e5d7b9';
      context.font = '700 ' + Math.round(inner.height * .32) + 'px serif';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(initials, inner.left + inner.width / 2, inner.top + inner.height / 2);
    }
    context.restore();
    context.save();
    context.translate(photoRect.centerX, photoRect.centerY);
    context.rotate(-2 * Math.PI / 180);
    context.strokeStyle = 'rgba(74,42,27,.3)';
    context.lineWidth = Math.max(1, outputScale);
    context.strokeRect(-photoRect.width * .55, -photoRect.height * .55, photoRect.width * 1.1, photoRect.height * 1.1);
    context.restore();

    var wordmarkRect = relativeRect(book.querySelector('.passport-wordmark'));
    context.strokeStyle = 'rgba(73,42,27,.42)';
    context.lineWidth = Math.max(1, outputScale);
    context.beginPath();
    context.moveTo(wordmarkRect.left, wordmarkRect.bottom);
    context.lineTo(wordmarkRect.right, wordmarkRect.bottom);
    context.stroke();

    Array.from(book.querySelectorAll('.passport-wordmark span, .passport-wordmark strong, .passport-details > span, .passport-details > strong, .passport-details dt, .passport-details dd, .passport-visas-title')).forEach(function (element) {
      var rect = relativeRect(element);
      drawPassportCanvasText(context, element, element.textContent.trim(), rect.left, rect.centerY, outputScale, { maxWidth: rect.width });
    });

    Array.from(book.querySelectorAll('.passport-stamp')).forEach(function (stamp) {
      var rect = relativeRect(stamp);
      var style = getComputedStyle(stamp);
      var turn = parseFloat(style.getPropertyValue('--stamp-turn')) || 0;
      var diameter = stamp.offsetWidth * outputScale;
      var radius = diameter / 2;
      context.save();
      context.translate(rect.centerX, rect.centerY);
      context.rotate(turn * Math.PI / 180);
      context.globalAlpha = parseFloat(style.opacity) || .8;
      context.globalCompositeOperation = style.mixBlendMode === 'multiply' ? 'multiply' : 'source-over';
      context.strokeStyle = style.color;
      context.lineWidth = Math.max(2, outputScale * 2);
      context.beginPath();
      context.arc(0, 0, radius - context.lineWidth, 0, Math.PI * 2);
      context.stroke();
      context.lineWidth = Math.max(1, outputScale);
      context.setLineDash([5 * outputScale, 4 * outputScale]);
      context.beginPath();
      context.arc(0, 0, radius - 8 * outputScale, 0, Math.PI * 2);
      context.stroke();
      context.setLineDash([]);
      Array.from(stamp.children).forEach(function (child) {
        var localY = (child.offsetTop + child.offsetHeight / 2 - stamp.offsetHeight / 2) * outputScale;
        drawPassportCanvasText(context, child, child.textContent.trim(), 0, localY, outputScale, { align: 'center' });
      });
      context.restore();
    });

    Array.from(book.querySelectorAll('.passport-award-note.is-placed')).forEach(function (note) {
      var rect = relativeRect(note);
      var transform = note.style.transform || '';
      var angle = parseFloat((transform.match(/rotate\((-?[\d.]+)deg\)/) || [0, 0])[1]);
      var noteScale = parseFloat((transform.match(/scale\(([\d.]+)\)/) || [0, 1])[1]);
      var lineHeight = parseFloat(getComputedStyle(note).lineHeight) * outputScale * noteScale;
      var lines = Array.from(note.children).map(function (line) { return line.textContent.trim(); });
      context.save();
      context.translate(rect.centerX, rect.centerY);
      context.rotate(angle * Math.PI / 180);
      context.globalCompositeOperation = 'multiply';
      lines.forEach(function (line, index) {
        drawPassportCanvasText(context, note, line, 0, (index - (lines.length - 1) / 2) * lineHeight, outputScale, { align: 'center', elementScale: noteScale });
      });
      context.restore();
    });

    return canvas;
  }

  async function downloadPassportPng(modder, button) {
    var original = button.innerHTML;
    button.disabled = true;
    button.textContent = 'Preparing PNG…';
    try {
      var canvas = await renderPassportCanvas(modder);
      var blob = await new Promise(function (resolve) { canvas.toBlob(resolve, 'image/png'); });
      if (!blob) throw new Error('PNG export failed');
      var objectUrl = URL.createObjectURL(blob);
      var link = document.createElement('a');
      link.href = objectUrl;
      link.download = modder.id.replace(/[^a-z0-9-]+/gi, '-').toLowerCase() + '-modjam-passport.png';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(function () { URL.revokeObjectURL(objectUrl); }, 1000);
      button.textContent = 'Passport downloaded';
    } catch (error) {
      console.error('Passport download failed', error);
      button.textContent = 'Download failed';
    }
    setTimeout(function () { button.disabled = false; button.innerHTML = original; }, 1800);
  }

  function modjamPassport(modder, work) {
    var turns = [-7, 4, -3, 8, -5, 3, -8, 6, -2];
    var passportEvents = modder.participations.map(function (label) {
      return archiveData.events.find(function (event) { return event.label === label; });
    }).filter(Boolean);
    var leftStampCount = passportEvents.length <= 3 ? 0 : Math.min(6, Math.floor(passportEvents.length / 2));
    var stampLink = function (event, index) {
      return '<a class="passport-stamp passport-stamp--' + eventTone(event) + '" href="/modjam/archive?event=' + event.id + '" data-route style="--stamp-turn:' + turns[index % turns.length] + 'deg" aria-label="Open the ' + escapeHtml(event.label) + ' Modjam archive">' +
        '<span>' + escapeHtml(event.season) + '</span><strong>' + event.year + '</strong><small>Modjam</small></a>';
    };
    var leftStamps = passportEvents.slice(0, leftStampCount).map(stampLink).join('');
    var rightStamps = passportEvents.slice(leftStampCount).map(function (event, index) { return stampLink(event, index + leftStampCount); }).join('');
    var rightTitle = leftStampCount ? '' : '<span class="passport-visas-title">Entry visas</span>';
    var rightVisasClass = leftStampCount ? ' passport-visas--untitled' : '';
    var densityClass = passportEvents.length > 15 ? ' passport-book--dense' : '';
    var awardNotes = passportAwardNotes(modder, work);

    return '<section class="passport-section" aria-labelledby="passport-heading"><div class="passport-heading-row"><div class="section-heading passport-heading"><span class="eyebrow">Official record</span><h2 id="passport-heading">Modjam passport</h2></div><button class="button button--ink passport-download" type="button" data-passport-download>Download passport <span aria-hidden="true">⤓</span></button></div>' +
      '<div class="passport-scroll" tabindex="0" aria-label="Scrollable Modjam passport for ' + escapeHtml(modder.name) + '"><div class="passport-book' + densityClass + '">' +
      '<img class="passport-art" src="assets/images/modjam_passport.webp" alt="" width="2048" height="1024" decoding="async">' +
      '<div class="passport-identity"><div class="passport-wordmark"><span>Morrowind Modjam</span><strong>Passport</strong></div><div class="passport-holder"><div class="passport-photo">' + modderAvatar(modder, false) + '</div><div class="passport-details"><span>Passport holder</span><strong>' + escapeHtml(modder.name) + '</strong><dl><div><dt>First stamp</dt><dd>' + escapeHtml(modder.firstModjam) + '</dd></div><div><dt>Stamps</dt><dd>' + passportEvents.length + '</dd></div></dl></div></div></div>' +
      (leftStamps ? '<div class="passport-visas passport-visas--left"><span class="passport-visas-title">Entry visas</span><div class="passport-stamp-grid">' + leftStamps + '</div></div>' : '') +
      '<div class="passport-visas passport-visas--right' + rightVisasClass + '">' + rightTitle + '<div class="passport-stamp-grid">' + rightStamps + '</div></div>' +
      (awardNotes ? '<div class="passport-award-notes" aria-label="Selected judge awards">' + awardNotes + '</div>' : '') +
      '</div></div><p class="passport-mobile-hint">Swipe to explore the full passport</p></section>';
  }

  function renderModders() {
    main.innerHTML = '<div class="paper-page">' + pageIntro('', 'The Modjammers') +
      '<section class="modder-toolbar"><label><span>Find a modder</span><input id="modder-search" type="search" placeholder="Search by name…"></label><label><span>Sort by</span><select id="modder-sort"><option value="entries">Most entries</option><option value="events">Most Modjams</option><option value="awards">Most awards</option><option value="name">Name A–Z</option></select></label><p id="modder-count" aria-live="polite"></p></section><section class="modder-grid" id="modder-results"></section></div>';
    var search = document.getElementById('modder-search');
    var sort = document.getElementById('modder-sort');
    function update() {
      var query = search.value.trim().toLowerCase();
      var matches = modderData.modders.filter(function (modder) { return modder.name.toLowerCase().includes(query); });
      matches.sort(function (left, right) {
        if (sort.value === 'name') return left.name.localeCompare(right.name);
        if (sort.value === 'events') return right.participations.length - left.participations.length || left.name.localeCompare(right.name);
        if (sort.value === 'awards') return right.awardCount - left.awardCount || right.entryIds.length - left.entryIds.length;
        return right.entryIds.length - left.entryIds.length || left.name.localeCompare(right.name);
      });
      document.getElementById('modder-count').textContent = matches.length + (matches.length === 1 ? ' profile' : ' profiles');
      document.getElementById('modder-results').innerHTML = matches.map(modderCard).join('');
    }
    search.addEventListener('input', update);
    sort.addEventListener('change', update);
    update();
  }

  function renderProfile(id) {
    var modder = modderData.modders.find(function (candidate) { return candidate.id === id; });
    if (!modder) {
      main.innerHTML = '<div class="paper-page"><div class="empty-state empty-state--page"><strong>That modder is not in the archive.</strong><a class="button button--ink" href="/modjam/modders" data-route>Browse all modders</a></div></div>';
      return;
    }
    var work = modder.entryIds.map(function (entryId) { return entryById.get(entryId); }).filter(Boolean).sort(function (a, b) { return b.event.year - a.event.year; });
    var recognized = work.filter(function (entry) { return entry.placement || entry.awards.length; });
    var links = [
      modder.nexusProfileUrl && '<a href="' + safeUrl(modder.nexusProfileUrl) + '" target="_blank" rel="noopener">Nexus Mods ↗</a>',
      modder.modathonProfileUrl && '<a href="' + safeUrl(modder.modathonProfileUrl) + '">Modathon profile ↗</a>',
      modder.madnessProfileUrl && '<a href="' + safeUrl(modder.madnessProfileUrl) + '">Madness profile ↗</a>'
    ].filter(Boolean).join('');
    var awardCabinet = recognized.length ? '<section class="profile-section"><div class="section-heading section-heading--row"><div><span class="eyebrow">Placements &amp; judge awards</span><h2>The trophy cabinet</h2></div><span class="cabinet-total">' + (modder.awardCount + modder.placementEntryIds.length) + ' recognitions</span></div><div class="cabinet-grid">' + recognized.map(function (entry) {
      return '<article><div>' + placementBadge(entry) + '<span class="entry-event">' + escapeHtml(entry.event.label) + '</span></div><h3>' + escapeHtml(entry.title) + '</h3>' + (entry.awards.length ? '<div class="award-chips">' + entry.awards.map(function (award) { return '<span>' + escapeHtml(award) + '</span>'; }).join('') + '</div>' : '') + (entry.awardPlacardUrl ? '<a class="placard-link" href="' + safeUrl(entry.awardPlacardUrl) + '" target="_blank" rel="noopener">View award placard ↗</a>' : '') + '</article>';
    }).join('') + '</div></section>' : '';
    main.innerHTML = '<div class="paper-page"><nav class="breadcrumb" aria-label="Breadcrumb"><a href="/modjam/modders" data-route>Modders</a><span aria-hidden="true">/</span><span>' + escapeHtml(modder.name) + '</span></nav><section class="profile-hero">' + modderAvatar(modder, true) + '<div class="profile-title"><span class="eyebrow">Modjammer since ' + escapeHtml(modder.firstModjam) + '</span><h1>' + escapeHtml(modder.name) + '</h1><div class="profile-links">' + links + '</div></div><div class="profile-stats"><div><strong>' + work.length + '</strong><span>entries</span></div><div><strong>' + modder.participations.length + '</strong><span>Modjams</span></div><div><strong>' + modder.placementEntryIds.length + '</strong><span>placements</span></div><div><strong>' + modder.awardCount + '</strong><span>judge awards</span></div></div></section>' + modjamPassport(modder, work) + awardCabinet + '<section class="profile-section"><div class="section-heading"><span class="eyebrow">Complete Modjamography</span><h2>' + escapeHtml(modder.name) + '’s entries</h2></div><div class="entry-grid">' + work.map(entryCard).join('') + '</div></section></div>';
    setupPassportAwardLayout(modder);
    document.querySelector('[data-passport-download]').addEventListener('click', function (event) { downloadPassportPng(modder, event.currentTarget); });
  }

  function renderAwards() {
    var awardedEntries = entries.filter(function (entry) { return entry.awards.length; }).slice().reverse();
    main.innerHTML = '<div class="paper-page awards-page">' + pageIntro('', 'The judge awards cabinet') +
      '<section class="award-toolbar"><label><span>Search the cabinet</span><input id="award-search" type="search" placeholder="Try “penguin,” “lighthouse,” or a modder…"></label><label><span>Modjam</span><select id="award-event"><option value="">All award years</option>' + archiveData.events.filter(function (event) { return event.hasJudgeAwards; }).slice().reverse().map(function (event) { return '<option value="' + event.id + '">' + escapeHtml(event.label) + '</option>'; }).join('') + '</select></label><p id="award-count" aria-live="polite"></p></section><section class="award-entry-grid" id="award-results"></section></div>';
    var search = document.getElementById('award-search');
    var eventSelect = document.getElementById('award-event');
    function update() {
      var query = search.value.trim().toLowerCase();
      var eventId = eventSelect.value;
      var matches = awardedEntries.filter(function (entry) {
        var haystack = [entry.title, entry.event.label].concat(entry.awards, entry.authors.map(function (author) { return author.name; })).join(' ').toLowerCase();
        return (!query || haystack.includes(query)) && (!eventId || entry.event.id === eventId);
      });
      var count = matches.reduce(function (total, entry) { return total + entry.awards.length; }, 0);
      document.getElementById('award-count').innerHTML = '<strong>' + count + '</strong> awards across ' + matches.length + ' entries';
      document.getElementById('award-results').innerHTML = matches.length ? matches.map(function (entry) {
        return '<article class="award-entry"><div class="award-entry-head"><span class="entry-event">' + escapeHtml(entry.event.label) + '</span>' + placementBadge(entry) + '</div><h2>' + escapeHtml(entry.title) + '</h2><p>by ' + authorLinks(entry.authors) + '</p><div class="award-chips award-chips--large">' + entry.awards.map(function (award) { return '<span>' + escapeHtml(award) + '</span>'; }).join('') + '</div>' + (entry.awardPlacardUrl ? '<a class="placard-link" href="' + safeUrl(entry.awardPlacardUrl) + '" target="_blank" rel="noopener">Open the original placard ↗</a>' : '') + '</article>';
      }).join('') : '<div class="empty-state"><strong>No matching awards.</strong><span>Try a different bit of delightful nonsense.</span></div>';
    }
    search.addEventListener('input', update);
    eventSelect.addEventListener('change', update);
    update();
  }

  function setActiveNav(name) {
    document.querySelectorAll('[data-nav]').forEach(function (link) { link.classList.toggle('is-active', link.dataset.nav === name); });
  }

  function renderRoute() {
    clearInterval(countdownTimer);
    if (passportResizeObserver) {
      passportResizeObserver.disconnect();
      passportResizeObserver = null;
    }
    var path = location.pathname.replace(/\/+$/, '') || '/';
    if (path === '/modjam/archive') { setActiveNav('archive'); renderArchive(); }
    else if (path === '/modjam/modders') { setActiveNav('modders'); renderModders(); }
    else if (path === '/modjam/awards') { setActiveNav('awards'); renderAwards(); }
    else if (path === '/modjam/faq') { setActiveNav('faq'); renderFaq(); }
    else if (path.indexOf('/modjam/modder/') === 0) { setActiveNav('modders'); renderProfile(decodeURIComponent(path.slice('/modjam/modder/'.length))); }
    else { setActiveNav('home'); renderHome(); }
    window.scrollTo(0, 0);
  }

  function navigate(href) {
    history.pushState(null, '', href);
    renderRoute();
  }

  document.addEventListener('click', function (event) {
    var link = event.target.closest('a[data-route]');
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(link.getAttribute('href'));
  });
  document.addEventListener('error', function (event) {
    if (!event.target.matches || !event.target.matches('.entry-card-picture img')) return;
    event.target.parentElement.classList.remove('entry-card-picture--loading');
    event.target.parentElement.classList.add('entry-card-picture--error');
    event.target.remove();
  }, true);
  document.addEventListener('load', function (event) {
    if (!event.target.matches || !event.target.matches('.entry-card-picture img')) return;
    event.target.parentElement.classList.remove('entry-card-picture--loading');
    event.target.parentElement.classList.add('entry-card-picture--loaded');
  }, true);
  window.addEventListener('popstate', renderRoute);

  Promise.all([
    fetch('./data/modjams.json').then(function (response) { if (!response.ok) throw new Error('Modjam archive failed to load'); return response.json(); }),
    fetch('./data/modders.json').then(function (response) { if (!response.ok) throw new Error('Modder archive failed to load'); return response.json(); }),
    fetch('../assets/data/modder-avatars.json').then(function (response) { if (!response.ok) throw new Error('Modder avatar cache failed to load'); return response.json(); })
  ]).then(function (data) {
    archiveData = data[0];
    modderData = data[1];
    avatarAssets = data[2].avatars || {};
    entries = archiveData.events.flatMap(function (event) {
      return event.entries.map(function (entry) { return Object.assign({ event: event }, entry); });
    });
    entries.forEach(function (entry) { entryById.set(entry.id, entry); });
    renderRoute();
  }).catch(function (error) {
    main.innerHTML = '<div class="load-error"><strong>The archive would not unfold.</strong><p>' + escapeHtml(error.message) + '</p><button type="button" onclick="location.reload()">Try again</button></div>';
  });
})();
