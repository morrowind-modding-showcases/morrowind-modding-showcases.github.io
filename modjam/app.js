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
  var postcardData = [];
  var postcardCreatorCleanup;

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

  function hydrateJudgeProfiles(registry) {
    var profilesById = new Map(modderData.modders.map(function (modder) { return [modder.id, modder]; }));
    (registry.judges || []).forEach(function (judge) {
      var modder = profilesById.get(judge.modderId);
      if (!modder) {
        modder = {
          id: judge.modderId,
          name: judge.profileName || judge.listedAs,
          profileSource: 'judge-list',
          nexusProfileUrl: judge.nexusProfileUrl || null,
          avatarUrl: judge.avatarUrl || null,
          modathonProfileUrl: judge.modathonProfileUrl || null,
          madnessProfileUrl: judge.madnessProfileUrl || null,
          firstModjam: null,
          participations: [],
          listedModjamCount: 0,
          entryIds: [],
          placementEntryIds: [],
          awardCount: 0
        };
        modderData.modders.push(modder);
        profilesById.set(modder.id, modder);
      }
      modder.isJudge = true;
      modder.judgeListedAs = judge.listedAs;
    });
    modderData.modders.sort(function (left, right) { return left.name.localeCompare(right.name); });
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

  function archiveEventUrl(event) {
    return '/modjam/archive?year=' + event.year + '&season=' + encodeURIComponent(event.season);
  }

  function eventCard(event) {
    var banner = event.banner
      ? '<img src="' + escapeHtml(event.banner) + '" alt="" loading="lazy" decoding="async">'
      : '<div class="event-card-art event-card-art--' + eventTone(event) + '" aria-hidden="true"><span>' + (event.season === 'Winter' ? '❄' : event.season === 'Spring' ? '✿' : '☀') + '</span></div>';
    var themes = Array.from(new Set(event.entries.flatMap(function (entry) { return entry.themes; }))).slice(0, 3);
    var resultsStreamUrl = safeUrl(event.resultsStreamUrl);
    var resultsStreamLink = resultsStreamUrl
      ? '<a class="results-stream-link" href="' + resultsStreamUrl + '" target="_blank" rel="noopener" aria-label="Watch the ' + escapeHtml(event.label) + ' Modjam results stream on YouTube"><span>Results</span><span>Stream</span></a>'
      : '';
    return '<article class="event-card event-card--' + eventTone(event) + '">' +
      '<a class="event-card-archive-link" href="' + archiveEventUrl(event) + '" data-route aria-label="Open the ' + escapeHtml(event.label) + ' Modjam archive"></a>' +
      '<div class="event-card-image">' + banner + '<span class="event-stamp">' + escapeHtml(event.season) + '<strong>' + event.year + '</strong></span>' + resultsStreamLink + '</div>' +
      '<div class="event-card-copy"><div><span class="eyebrow">' + escapeHtml(event.competitionLabel) + '</span><h3>' + escapeHtml(event.label) + ' Modjam</h3></div>' +
      '<p>' + event.entries.length + ' entries · ' + escapeHtml(themes.join(' · ')) + '</p>' +
      '<span class="text-link">Open the archive <span aria-hidden="true">→</span></span></div></article>';
  }

  function archiveEventGroup(event, eventEntries) {
    var headerImages = Array.isArray(event.headers) ? event.headers : [];
    var tone = eventTone(event);
    var title = '<h2 class="archive-event-title" id="archive-' + event.id + '-heading">' + escapeHtml(event.season) + ' Modjam <strong>' + event.year + '</strong></h2>';
    var artwork = headerImages.length
      ? '<div class="archive-event-art archive-event-art--' + tone + '">' + headerImages.map(function (source) {
          return '<img src="' + escapeHtml(source) + '" alt="" loading="lazy" decoding="async">';
        }).join('') + title + '</div>'
      : '<div class="archive-event-art archive-event-art--fallback archive-event-art--' + tone + '">' + title + '</div>';
    var headingId = 'archive-' + event.id + '-heading';
    return '<section class="archive-event-group archive-event-group--' + tone + '" aria-labelledby="' + headingId + '">' +
      '<header class="archive-event-header">' + artwork +
      '<div class="archive-event-caption"><span class="eyebrow">Event archive</span>' +
      '<div class="archive-event-facts"><span>' + eventEntries.length + (eventEntries.length === 1 ? ' entry' : ' entries') + '</span><span>' + escapeHtml(event.competitionLabel) + '</span></div></div></header>' +
      '<div class="entry-grid">' + eventEntries.map(function (entry) { return entryCard(entry, { hideEvent: true }); }).join('') + '</div></section>';
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
    var eventLabel = options.hideEvent ? '' : '<a class="entry-event" href="' + archiveEventUrl(event) + '" data-route>' + escapeHtml(event.label) + '</a>';
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
    var detail = view.detail ? '<p class="countdown-detail">' + escapeHtml(view.detail) + '</p>' : '';
    container.className = 'countdown-card countdown-card--' + view.mode;
    container.innerHTML = '<div class="countdown-copy">' + eyebrow + '<h2>' + escapeHtml(view.title) + '</h2></div>' + clock + detail;
  }

  function startCountdown() {
    clearInterval(countdownTimer);
    updateCountdown();
    countdownTimer = setInterval(updateCountdown, 1000);
  }

  function shuffledCopy(items) {
    var copy = items.slice();
    for (var index = copy.length - 1; index > 0; index -= 1) {
      var swapIndex = Math.floor(Math.random() * (index + 1));
      var current = copy[index];
      copy[index] = copy[swapIndex];
      copy[swapIndex] = current;
    }
    return copy;
  }

  function randomBetween(minimum, maximum) {
    return minimum + Math.random() * (maximum - minimum);
  }

  function postcardDensityMultiplier() {
    var path = location.pathname.replace(/\/+$/, '') || '/';
    if (path === '/modjam/archive') return 4;
    return 1;
  }

  function pickPostcards(count) {
    var postcards = [];
    while (postcards.length < count) postcards = postcards.concat(shuffledCopy(postcardData));
    return postcards.slice(0, count);
  }

  function postcardBackdrop() {
    if (!postcardData.length) return '';
    var viewportLimit = window.innerWidth < 1120 ? 14 : postcardData.length;
    var heightLimit = Math.max(6, Math.ceil(Math.max(main.scrollHeight, window.innerHeight) / 190));
    var postcardLimit = Math.min(viewportLimit, heightLimit) * postcardDensityMultiplier();
    var postcards = pickPostcards(postcardLimit);
    var topStart = main.classList.contains('is-home') ? 28 : 8;
    var topEnd = 95;
    return '<div class="postcard-backdrop" aria-hidden="true">' + postcards.map(function (postcard, index) {
      var file = String(postcard.file || '');
      if (!/^[a-z0-9][a-z0-9 .()'_-]*\.webp$/i.test(file)) return '';
      var progress = postcards.length === 1 ? 0.5 : index / (postcards.length - 1);
      var top = topStart + progress * (topEnd - topStart) + randomBetween(-1.35, 1.35);
      var rotation = randomBetween(-11, 11);
      var scale = randomBetween(0.78, 1.13);
      var edge = randomBetween(postcard.caption ? -0.7 : -2.6, postcard.caption ? 1.6 : 1.1).toFixed(2) + 'vw';
      var side = index % 2 ? 'right' : 'left';
      var caption = postcard.caption ? '<span class="background-postcard__message background-postcard__message--' + (postcard.captionPosition === 'lower-right' ? 'lower' : 'upper') + '" style="--caption-turn:' + randomBetween(-4, 4).toFixed(2) + 'deg">' + escapeHtml(postcard.caption) + '</span>' : '';
      return '<figure class="background-postcard background-postcard--' + side + '" style="--top:' + top.toFixed(2) + '%;--turn:' + rotation.toFixed(2) + 'deg;--scale:' + scale.toFixed(3) + ';--edge:' + edge + '">' +
        '<img class="background-postcard__photo" src="assets/postcards/thumbnail/' + escapeHtml(file) + '" alt="" loading="lazy" decoding="async">' +
        '<img class="background-postcard__overlay" src="assets/images/modjam_postcard_overlay.webp" alt="" loading="lazy" decoding="async">' + caption + '</figure>';
    }).join('') + '</div>';
  }

  function renderPage(html) {
    main.innerHTML = html;
    main.insertAdjacentHTML('afterbegin', postcardBackdrop());
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

    renderPage('<section class="hero">' +
      '<div class="season-side season-side--winter" aria-hidden="true"><span class="flake flake--one">❄</span><span class="flake flake--two">❅</span><span class="pine pine--one"></span><span class="pine pine--two"></span></div>' +
      '<div class="season-side season-side--summer" aria-hidden="true"><span class="sun"></span><span class="palm">🌴</span><span class="wave wave--one"></span><span class="wave wave--two"></span></div>' +
      '<div class="hero-copy"><span class="hero-kicker">A Morrowind modding tradition since 2020</span><h1>Morrowind<br><img class="hero-title-image" src="assets/images/modjam_text.png" alt="Modjam" width="775" height="254"></h1><p>The Modjam is a 48-hour, theme-based modding event. Once the themes are announced, participants will have 48 hours to create and release a mod based on the selected themes.</p><div class="hero-actions"><a class="button button--ink" href="/modjam/archive" data-route>Explore every entry <span aria-hidden="true">→</span></a><a class="hero-faq-link" href="/modjam/faq" data-route>FAQ <span aria-hidden="true">→</span></a></div></div>' +
      '<div class="countdown-wrap"><div data-countdown></div><div class="event-schedule" aria-label="Summer Modjam 2026 schedule"><div><strong>Kickoff Livestream</strong><time datetime="2026-08-21T23:00:00Z">August 21, 2026 · 23:00 UTC</time></div><div><strong>The Modjam</strong><time datetime="2026-08-22T00:00:00Z">August 22, 2026 · 00:00 UTC</time><time datetime="2026-08-24T00:00:00Z">August 24, 2026 · 00:00 UTC</time></div></div></div>' +
      '</section>' +
      '<section class="stat-ribbon" aria-label="Archive totals"><div><strong>' + archiveData.summary.eventCount + '</strong><span>past Modjams</span></div><div><strong>' + archiveData.summary.entryCount + '</strong><span>mods made</span></div><div><strong>' + archiveData.summary.modderCount + '</strong><span>credited modders</span></div><div><strong>' + archiveData.summary.judgeAwardCount + '</strong><span>judge awards recorded</span></div></section>' +
      '<section class="archive-section"><div class="section-heading section-heading--row"><div class="section-heading-panel"><h2>The Modjam archive</h2></div><a class="text-link" href="/modjam/archive" data-route>Browse all 164 entries <span aria-hidden="true">→</span></a></div><div class="event-grid">' + latestEvents.map(eventCard).join('') + '</div></section>' +
      '<section class="awards-marquee"><div class="awards-marquee-copy section-heading-panel"><h2>Judge Awards</h2><p>Beginning in Summer 2022, judges started honoring the memorable details that do not fit on a scorecard.</p><a class="button button--paper" href="/modjam/archive?result=awards" data-route>Browse award recipients</a></div><div class="awards-showcase"><img class="awards-trophy" src="assets/images/trophy.webp" alt="" width="281" height="846" loading="lazy" decoding="async"><div class="award-ribbons">' + favorites.map(function (award, index) { return '<span style="--turn:' + (index % 2 ? '1.5deg' : '-1.5deg') + '">' + escapeHtml(award) + '</span>'; }).join('') + '</div></div></section>' +
      '<section class="modder-callout"><div class="host-card"><a class="host-portrait" href="https://danaeplays.thenet.sk/" target="_blank" rel="noopener" aria-label="Visit Danae\'s Journal"><img src="../assets/images/modder-avatars/1233897.webp" alt="Danae" width="100" height="100" loading="lazy" decoding="async"></a><div class="host-card-copy"><span class="eyebrow">Modjam host</span><h2>Danae</h2><p>Explore her Morrowind writing, mods, and streams.</p><nav class="host-links" aria-label="Danae online"><a href="https://danaeplays.thenet.sk/" target="_blank" rel="noopener">Website <span aria-hidden="true">↗</span></a><a href="https://www.twitch.tv/danaeplays" target="_blank" rel="noopener">Twitch <span aria-hidden="true">↗</span></a><a href="https://www.nexusmods.com/profile/Danae123" target="_blank" rel="noopener">Nexus Mods <span aria-hidden="true">↗</span></a></nav></div></div><div class="modder-callout-copy section-heading-panel"><h2>Meet the Modjammers</h2><p>Follow every creator across the ModJams.</p><a class="button button--sun" href="/modjam/modders" data-route>Browse ' + modderData.modders.length + ' profiles <span aria-hidden="true">→</span></a></div></section>');
    startCountdown();
  }

  function renderFaq() {
    renderPage('<section class="faq-section faq-section--page" aria-labelledby="faq-heading"><div class="faq-shell"><div class="section-heading"><span class="eyebrow">Summer Modjam 2026</span><h1 id="faq-heading">Frequently asked questions</h1></div><div class="faq-list"><details open><summary>How long do I have?</summary><div class="faq-answer"><p>You will have 48 hours to make and release a mod based on the selected themes. There is usually a 4–6 hour grace period for final uploads, but please try to submit within the main timeframe where possible.</p></div></details><details><summary>Rules &amp; Guidelines</summary><div class="faq-answer"><ul><li>Create your mod during the Modjam.</li><li>Modders\' resources are allowed.</li><li>The use of AI is not forbidden, but I ask that its use be disclosed.</li><li>Previous projects can be a source of inspiration, but please try to make something new for the event.</li><li>Most importantly, this is intended to be a friendly community event. Please focus on having fun and making something you enjoy.</li></ul></div></details><details><summary>How to Participate</summary><div class="faq-answer"><p>To take part, create a Morrowind mod based on the selected themes and publish it on Nexus Mods during the Modjam.</p><ul><li>Add the Morrowind Summer Modjam 2026 banner to your mod description: <a href="https://i.imgur.com/7nytO4q.png" target="_blank" rel="noopener">banner link</a>.</li><li>Share your release in the MMC “Published Mods” thread.</li><li>Make sure we know about your submission.</li></ul></div></details><details><summary>Prizes</summary><div class="faq-answer"><p>There will be game keys and Nexus Donation Points available as prizes. Submitted mods may also be featured in video showcases.</p></div></details><details><summary>Results Livestream</summary><div class="faq-answer"><p><strong>Date: TBA</strong></p><p>The date will depend partly on the number of entries and how much time the judges need to review them.</p></div></details></div></div></section>');
  }

  function postcardModName(file) {
    return String(file || '')
      .replace(/\.webp$/i, '')
      .replace(/\s+-\s+\d+$/i, '')
      .replace(/\s+\(\d+\)$/i, '')
      .replace(/\s+\d{2}$/i, '')
      .trim();
  }

  function postcardDisplayName(value) {
    return String(value || '').replace(/(^|[\s-])([a-z])/g, function (_match, space, letter) {
      return space + letter.toUpperCase();
    });
  }

  function postcardLibrary() {
    var groups = new Map();
    postcardData.forEach(function (postcard) {
      var file = String(postcard.file || '');
      if (!/^[a-z0-9][a-z0-9 .()'_-]*\.webp$/i.test(file)) return;
      var name = postcardModName(file);
      if (!groups.has(name)) groups.set(name, { name: name, files: [] });
      groups.get(name).files.push(file);
    });
    return Array.from(groups.values()).sort(function (left, right) {
      return left.name.localeCompare(right.name);
    });
  }

  function renderPostcardCreator() {
    var groups = postcardLibrary();
    if (!groups.length) {
      renderPage('<div class="paper-page"><div class="load-error"><strong>The postcard box is empty.</strong><p>Please try again later.</p></div></div>');
      return;
    }

    var modOptions = groups.map(function (group, index) {
      return '<option value="' + index + '">' + escapeHtml(postcardDisplayName(group.name)) + '</option>';
    }).join('');

    renderPage('<div class="paper-page postcard-page"><section class="postcard-intro" aria-labelledby="postcard-heading"><h1 id="postcard-heading">Make a Modjam postcard</h1></section>' +
      '<section class="postcard-studio" aria-label="Postcard creator"><div class="postcard-controls">' +
      '<div class="postcard-step"><div class="postcard-step-heading"><span>1</span><div><strong>Choose your view</strong><small>Archive screenshot or your own</small></div></div>' +
      '<div class="postcard-source-switch" role="group" aria-label="Screenshot source"><button type="button" class="is-active" data-postcard-source="archive" aria-pressed="true">Modjam archive</button><button type="button" data-postcard-source="upload" aria-pressed="false">Your screenshot</button></div>' +
      '<div data-postcard-panel="archive"><label for="postcard-mod"><span>Mod</span><select id="postcard-mod">' + modOptions + '</select></label><div class="postcard-view-heading"><span>Screenshot</span><small id="postcard-view-count"></small></div><div class="postcard-shot-picker" id="postcard-shot-picker"></div></div>' +
      '<div data-postcard-panel="upload" hidden><label class="postcard-upload" id="postcard-upload-zone" for="postcard-upload"><span class="postcard-upload-mark" aria-hidden="true">+</span><strong>Choose a screenshot</strong><small>PNG, JPEG, or WebP stays on your device</small><input type="file" id="postcard-upload" accept="image/png,image/jpeg,image/webp"></label><p class="postcard-upload-status" id="postcard-upload-status" aria-live="polite">No screenshot selected.</p></div></div>' +
      '<div class="postcard-step"><div class="postcard-step-heading"><span>2</span><div><strong>Frame the scene</strong><small>Drag the preview or use the controls</small></div></div><label class="postcard-zoom" for="postcard-zoom"><span>Zoom <output id="postcard-zoom-value">100%</output></span><input type="range" id="postcard-zoom" min="100" max="300" value="100" step="1"></label><div class="postcard-position-row"><span>Position</span><div class="postcard-nudge" data-postcard-image-nudge role="group" aria-label="Move screenshot"><button type="button" data-nudge="up" aria-label="Move up">&#8593;</button><button type="button" data-nudge="left" aria-label="Move left">&#8592;</button><button type="button" data-nudge="reset">Center</button><button type="button" data-nudge="right" aria-label="Move right">&#8594;</button><button type="button" data-nudge="down" aria-label="Move down">&#8595;</button></div></div></div>' +
      '<div class="postcard-step"><div class="postcard-step-heading"><span>3</span><div><strong>Write and finish</strong><small>Size, align, and position two postcard lines</small></div></div><label class="postcard-message" for="postcard-message-line-1"><span>Line 1</span><input type="text" id="postcard-message-line-1" maxlength="72" placeholder="Wish you were here!"></label><label class="postcard-message" for="postcard-message-line-2"><span>Line 2</span><input type="text" id="postcard-message-line-2" maxlength="72" placeholder="Having a magical time"></label><div class="postcard-text-tools"><label class="postcard-text-setting" for="postcard-text-size"><span>Size <output id="postcard-text-size-value">86 px</output></span><input type="range" id="postcard-text-size" min="44" max="140" value="86" step="2"></label><label class="postcard-text-setting postcard-text-justify" for="postcard-text-align"><span>Justification</span><select id="postcard-text-align"><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label></div><div class="postcard-position-row postcard-text-position"><span>Text position</span><div class="postcard-nudge" data-postcard-text-nudge role="group" aria-label="Move postcard message"><button type="button" data-nudge="up" aria-label="Move text up">&#8593;</button><button type="button" data-nudge="left" aria-label="Move text left">&#8592;</button><button type="button" data-nudge="reset">Reset</button><button type="button" data-nudge="right" aria-label="Move text right">&#8594;</button><button type="button" data-nudge="down" aria-label="Move text down">&#8595;</button></div></div><label class="postcard-stamp-toggle"><input type="checkbox" id="postcard-stamp"><span aria-hidden="true"></span><strong>Add the Modjam stamp</strong></label></div>' +
      '<button class="button button--sun postcard-download" type="button" id="postcard-download" disabled>Download postcard <span aria-hidden="true">&#8595;</span></button><p class="postcard-download-note" id="postcard-status" role="status">Preparing the postcard press&#8230;</p></div>' +
      '<div class="postcard-preview-column"><div class="postcard-preview-heading"><span>Live preview</span><small>1920 &times; 1080 PNG</small></div><div class="postcard-preview-wrap"><canvas id="postcard-canvas" width="1920" height="1080" tabindex="0" aria-label="Postcard preview. Drag the message or screenshot to position it. Use arrow keys to adjust the screenshot."></canvas><span class="postcard-drag-hint" aria-hidden="true">Drag text or image</span></div><p>Tip: drag the message itself to move it. Use the mouse wheel over the preview to zoom the screenshot.</p></div></section></div>');

    var canvas = document.getElementById('postcard-canvas');
    var context = canvas.getContext('2d');
    var modSelect = document.getElementById('postcard-mod');
    var shotPicker = document.getElementById('postcard-shot-picker');
    var viewCount = document.getElementById('postcard-view-count');
    var uploadInput = document.getElementById('postcard-upload');
    var uploadZone = document.getElementById('postcard-upload-zone');
    var uploadStatus = document.getElementById('postcard-upload-status');
    var zoomInput = document.getElementById('postcard-zoom');
    var zoomValue = document.getElementById('postcard-zoom-value');
    var messageLineOneInput = document.getElementById('postcard-message-line-1');
    var messageLineTwoInput = document.getElementById('postcard-message-line-2');
    var textSizeInput = document.getElementById('postcard-text-size');
    var textSizeValue = document.getElementById('postcard-text-size-value');
    var textAlignSelect = document.getElementById('postcard-text-align');
    var stampInput = document.getElementById('postcard-stamp');
    var downloadButton = document.getElementById('postcard-download');
    var status = document.getElementById('postcard-status');
    var overlayImage = new Image();
    var stampImage = new Image();
    var activeImage;
    var uploadedImage;
    var uploadedUrl = '';
    var selectedFile = groups[0].files[0];
    var sourceMode = 'archive';
    var zoom = 1;
    var panX = 0;
    var panY = 0;
    var textSize = 86;
    var textAlign = 'left';
    var textBoxWidth = 1050;
    var textX = 690;
    var textY = 220;
    var dragStart;
    var readyLayers = 0;

    function loadImage(source) {
      return new Promise(function (resolve, reject) {
        var image = new Image();
        image.onload = function () { resolve(image); };
        image.onerror = reject;
        image.src = source;
      });
    }

    function clampPan() {
      if (!activeImage) return;
      var baseScale = Math.max(canvas.width / activeImage.naturalWidth, canvas.height / activeImage.naturalHeight);
      var drawWidth = activeImage.naturalWidth * baseScale * zoom;
      var drawHeight = activeImage.naturalHeight * baseScale * zoom;
      var limitX = Math.max(0, (drawWidth - canvas.width) / 2);
      var limitY = Math.max(0, (drawHeight - canvas.height) / 2);
      panX = Math.max(-limitX, Math.min(limitX, panX));
      panY = Math.max(-limitY, Math.min(limitY, panY));
    }

    function postcardMessageValues() {
      return [messageLineOneInput.value.trim(), messageLineTwoInput.value.trim()];
    }

    function postcardHasMessage() {
      return postcardMessageValues().some(function (line) { return line; });
    }

    function postcardMessageMetrics() {
      context.font = '400 ' + textSize + "px Yellowtail, 'Brush Script MT', cursive";
      var lines = postcardMessageValues();
      var finalLine = lines[1] ? 1 : (lines[0] ? 0 : -1);
      return {
        lines: lines,
        lineHeight: textSize * .9,
        width: textBoxWidth,
        height: (finalLine + 1) * textSize * .9
      };
    }

    function clampTextPosition(metrics) {
      var padding = 75;
      textX = Math.max(padding + metrics.width / 2, Math.min(canvas.width - padding - metrics.width / 2, textX));
      textY = Math.max(padding, Math.min(canvas.height - padding - metrics.height, textY));
    }

    function drawPostcardMessage() {
      if (!postcardHasMessage()) return;
      var metrics = postcardMessageMetrics();
      clampTextPosition(metrics);
      context.save();
      context.translate(textX, textY);
      context.rotate(-2 * Math.PI / 180);
      context.font = '400 ' + textSize + "px Yellowtail, 'Brush Script MT', cursive";
      context.textBaseline = 'top';
      context.textAlign = textAlign;
      context.lineJoin = 'round';
      var lineX = textAlign === 'left' ? -metrics.width / 2 : (textAlign === 'right' ? metrics.width / 2 : 0);
      metrics.lines.forEach(function (line, index) {
        if (!line) return;
        var y = index * metrics.lineHeight;
        context.fillStyle = 'rgba(41, 10, 6, .88)';
        context.fillText(line, lineX + textSize * .14, y + textSize * .17);
        context.lineWidth = Math.max(3, textSize * .08);
        context.strokeStyle = '#e94720';
        context.strokeText(line, lineX, y);
        context.fillStyle = '#ffa22f';
        context.fillText(line, lineX, y);
      });
      context.restore();
    }

    function postcardMessageHitTest(x, y) {
      if (!postcardHasMessage()) return false;
      var metrics = postcardMessageMetrics();
      clampTextPosition(metrics);
      var angle = -2 * Math.PI / 180;
      var deltaX = x - textX;
      var deltaY = y - textY;
      var localX = deltaX * Math.cos(angle) + deltaY * Math.sin(angle);
      var localY = -deltaX * Math.sin(angle) + deltaY * Math.cos(angle);
      return localX >= -metrics.width / 2 - 24 && localX <= metrics.width / 2 + 24 && localY >= -24 && localY <= metrics.height + 32;
    }

    function drawPostcard() {
      context.fillStyle = '#101b28';
      context.fillRect(0, 0, canvas.width, canvas.height);
      if (activeImage) {
        clampPan();
        var baseScale = Math.max(canvas.width / activeImage.naturalWidth, canvas.height / activeImage.naturalHeight);
        var scale = baseScale * zoom;
        var drawWidth = activeImage.naturalWidth * scale;
        var drawHeight = activeImage.naturalHeight * scale;
        context.drawImage(activeImage, (canvas.width - drawWidth) / 2 + panX, (canvas.height - drawHeight) / 2 + panY, drawWidth, drawHeight);
      }
      drawPostcardMessage();
      if (overlayImage.complete && overlayImage.naturalWidth) context.drawImage(overlayImage, 0, 0, canvas.width, canvas.height);
      if (stampInput.checked && stampImage.complete && stampImage.naturalWidth) context.drawImage(stampImage, 0, 0, canvas.width, canvas.height);
    }

    function resetFraming() {
      zoom = 1;
      panX = 0;
      panY = 0;
      zoomInput.value = '100';
      zoomValue.value = '100%';
      drawPostcard();
    }

    function setReady(message) {
      status.textContent = message;
      downloadButton.disabled = !(activeImage && readyLayers === 2);
      drawPostcard();
    }

    function selectArchiveFile(file) {
      selectedFile = file;
      shotPicker.querySelectorAll('[data-postcard-file]').forEach(function (button) {
        button.classList.toggle('is-active', button.dataset.postcardFile === file);
        button.setAttribute('aria-pressed', button.dataset.postcardFile === file ? 'true' : 'false');
      });
      status.textContent = 'Loading your view...';
      downloadButton.disabled = true;
      loadImage('assets/postcards/full/' + encodeURIComponent(file).replace(/%2F/gi, '/')).then(function (image) {
        if (sourceMode !== 'archive' || selectedFile !== file) return;
        activeImage = image;
        resetFraming();
        setReady('Your postcard is ready to download.');
      }).catch(function () {
        status.textContent = 'That archive view could not be loaded. Try another one.';
      });
    }

    function renderArchiveShots() {
      var group = groups[Number(modSelect.value)] || groups[0];
      viewCount.textContent = group.files.length + (group.files.length === 1 ? ' view' : ' views');
      shotPicker.innerHTML = group.files.map(function (file, index) {
        return '<button type="button" data-postcard-file="' + escapeHtml(file) + '" aria-pressed="false" aria-label="Use view ' + (index + 1) + ' of ' + escapeHtml(postcardDisplayName(group.name)) + '"><img src="assets/postcards/thumbnail/' + escapeHtml(file) + '" alt="" loading="lazy" decoding="async"><span>' + (index + 1) + '</span></button>';
      }).join('');
      selectArchiveFile(group.files[0]);
    }

    function switchSource(mode) {
      sourceMode = mode;
      document.querySelectorAll('[data-postcard-source]').forEach(function (button) {
        var active = button.dataset.postcardSource === mode;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
      document.querySelectorAll('[data-postcard-panel]').forEach(function (panel) {
        panel.hidden = panel.dataset.postcardPanel !== mode;
      });
      if (mode === 'upload') {
        if (uploadedImage) {
          activeImage = uploadedImage;
          resetFraming();
          setReady('Your postcard is ready to download.');
        } else {
          activeImage = null;
          downloadButton.disabled = true;
          status.textContent = 'Choose a screenshot to begin.';
          drawPostcard();
        }
      } else {
        selectArchiveFile(selectedFile);
      }
    }

    function useUploadedFile(file) {
      if (!file || !/^image\/(png|jpeg|webp)$/i.test(file.type)) {
        uploadStatus.textContent = 'Please choose a PNG, JPEG, or WebP image.';
        return;
      }
      if (uploadedUrl) URL.revokeObjectURL(uploadedUrl);
      uploadedUrl = URL.createObjectURL(file);
      uploadStatus.textContent = 'Loading ' + file.name + '...';
      downloadButton.disabled = true;
      loadImage(uploadedUrl).then(function (image) {
        uploadedImage = image;
        uploadStatus.textContent = file.name;
        if (sourceMode !== 'upload') return;
        activeImage = image;
        resetFraming();
        setReady('Your postcard is ready to download.');
      }).catch(function () {
        uploadStatus.textContent = 'That image could not be opened. Try another file.';
      });
    }

    function nudgeImage(direction, amount) {
      if (direction === 'up') panY -= amount;
      if (direction === 'down') panY += amount;
      if (direction === 'left') panX -= amount;
      if (direction === 'right') panX += amount;
      drawPostcard();
    }

    function nudgeText(direction, amount) {
      if (direction === 'up') textY -= amount;
      if (direction === 'down') textY += amount;
      if (direction === 'left') textX -= amount;
      if (direction === 'right') textX += amount;
      drawPostcard();
    }

    function resetTextPosition() {
      textX = 690;
      textY = 220;
      drawPostcard();
    }

    document.querySelectorAll('[data-postcard-source]').forEach(function (button) {
      button.addEventListener('click', function () { switchSource(button.dataset.postcardSource); });
    });
    modSelect.addEventListener('change', renderArchiveShots);
    shotPicker.addEventListener('click', function (event) {
      var button = event.target.closest('[data-postcard-file]');
      if (button) selectArchiveFile(button.dataset.postcardFile);
    });
    uploadInput.addEventListener('change', function () { useUploadedFile(uploadInput.files[0]); });
    ['dragenter', 'dragover'].forEach(function (name) {
      uploadZone.addEventListener(name, function (event) { event.preventDefault(); uploadZone.classList.add('is-dragging'); });
    });
    ['dragleave', 'drop'].forEach(function (name) {
      uploadZone.addEventListener(name, function (event) { event.preventDefault(); uploadZone.classList.remove('is-dragging'); });
    });
    uploadZone.addEventListener('drop', function (event) { useUploadedFile(event.dataTransfer.files[0]); });
    zoomInput.addEventListener('input', function () {
      zoom = Number(zoomInput.value) / 100;
      zoomValue.value = zoomInput.value + '%';
      drawPostcard();
    });
    [messageLineOneInput, messageLineTwoInput].forEach(function (input) {
      input.addEventListener('input', drawPostcard);
    });
    textSizeInput.addEventListener('input', function () {
      textSize = Number(textSizeInput.value);
      textSizeValue.value = textSizeInput.value + ' px';
      drawPostcard();
    });
    textAlignSelect.addEventListener('change', function () {
      textAlign = textAlignSelect.value;
      drawPostcard();
    });
    stampInput.addEventListener('change', drawPostcard);
    document.querySelector('[data-postcard-image-nudge]').addEventListener('click', function (event) {
      var button = event.target.closest('[data-nudge]');
      if (!button) return;
      if (button.dataset.nudge === 'reset') resetFraming();
      else nudgeImage(button.dataset.nudge, 28);
    });
    document.querySelector('[data-postcard-text-nudge]').addEventListener('click', function (event) {
      var button = event.target.closest('[data-nudge]');
      if (!button) return;
      if (button.dataset.nudge === 'reset') resetTextPosition();
      else nudgeText(button.dataset.nudge, 28);
    });

    canvas.addEventListener('pointerdown', function (event) {
      if (!activeImage) return;
      var bounds = canvas.getBoundingClientRect();
      var ratio = canvas.width / bounds.width;
      var pointerX = (event.clientX - bounds.left) * ratio;
      var pointerY = (event.clientY - bounds.top) * ratio;
      var dragMode = postcardMessageHitTest(pointerX, pointerY) ? 'text' : 'image';
      canvas.setPointerCapture(event.pointerId);
      dragStart = { mode: dragMode, x: event.clientX, y: event.clientY, panX: panX, panY: panY, textX: textX, textY: textY };
      canvas.classList.add(dragMode === 'text' ? 'is-dragging-text' : 'is-dragging');
    });
    canvas.addEventListener('pointermove', function (event) {
      if (!dragStart) return;
      var ratio = canvas.width / canvas.getBoundingClientRect().width;
      if (dragStart.mode === 'text') {
        textX = dragStart.textX + (event.clientX - dragStart.x) * ratio;
        textY = dragStart.textY + (event.clientY - dragStart.y) * ratio;
      } else {
        panX = dragStart.panX + (event.clientX - dragStart.x) * ratio;
        panY = dragStart.panY + (event.clientY - dragStart.y) * ratio;
      }
      drawPostcard();
    });
    function finishDrag() {
      dragStart = null;
      canvas.classList.remove('is-dragging');
      canvas.classList.remove('is-dragging-text');
    }
    canvas.addEventListener('pointerup', finishDrag);
    canvas.addEventListener('pointercancel', finishDrag);
    canvas.addEventListener('wheel', function (event) {
      if (!activeImage) return;
      event.preventDefault();
      zoom = Math.max(1, Math.min(3, zoom + (event.deltaY < 0 ? 0.08 : -0.08)));
      zoomInput.value = String(Math.round(zoom * 100));
      zoomValue.value = zoomInput.value + '%';
      drawPostcard();
    }, { passive: false });
    canvas.addEventListener('keydown', function (event) {
      var directions = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
      if (!directions[event.key]) return;
      event.preventDefault();
      nudgeImage(directions[event.key], event.shiftKey ? 40 : 10);
    });

    downloadButton.addEventListener('click', function () {
      if (downloadButton.disabled) return;
      downloadButton.disabled = true;
      status.textContent = 'Printing your postcard...';
      canvas.toBlob(function (blob) {
        if (!blob) {
          status.textContent = 'The postcard could not be downloaded. Please try again.';
          downloadButton.disabled = false;
          return;
        }
        var link = document.createElement('a');
        var downloadUrl = URL.createObjectURL(blob);
        link.href = downloadUrl;
        link.download = 'morrowind-modjam-postcard.png';
        link.click();
        setTimeout(function () { URL.revokeObjectURL(downloadUrl); }, 1000);
        downloadButton.disabled = false;
        status.textContent = 'Postcard downloaded. Safe travels!';
      }, 'image/png');
    });

    overlayImage.onload = function () { readyLayers += 1; setReady(readyLayers === 2 ? 'Your postcard is ready to download.' : 'Preparing the postcard press...'); };
    stampImage.onload = function () { readyLayers += 1; setReady(readyLayers === 2 ? 'Your postcard is ready to download.' : 'Preparing the postcard press...'); };
    overlayImage.onerror = stampImage.onerror = function () {
      status.textContent = 'The postcard artwork could not be loaded. Please refresh and try again.';
      downloadButton.disabled = true;
    };
    overlayImage.src = 'assets/postcards/modjam_postcard_overlay_full.webp';
    stampImage.src = 'assets/postcards/modjam_postcard_overlay_full_stamp.webp';
    if (document.fonts && document.fonts.load) {
      document.fonts.load('86px Yellowtail').then(drawPostcard).catch(function () {});
    }
    renderArchiveShots();

    postcardCreatorCleanup = function () {
      if (uploadedUrl) URL.revokeObjectURL(uploadedUrl);
      postcardCreatorCleanup = null;
    };
  }

  function renderArchive() {
    var params = new URLSearchParams(location.search);
    var legacyEvent = archiveData.events.find(function (event) { return event.id === params.get('event'); });
    var selectedYear = params.get('year') || (legacyEvent ? String(legacyEvent.year) : '');
    var selectedSeason = params.get('season') || (legacyEvent ? legacyEvent.season : '');
    var selectedResult = params.get('result') || '';
    var years = Array.from(new Set(archiveData.events.map(function (event) { return event.year; }))).sort(function (left, right) { return right - left; });
    renderPage('<div class="paper-page">' + pageIntro('', 'The entry archive') +
      '<section class="filter-panel" aria-label="Archive filters"><label><span>Search</span><input type="search" id="entry-search" placeholder="Mod, modder, theme, award…"></label><label><span>Year</span><select id="year-filter"><option value="">All years</option>' + years.map(function (year) { return '<option value="' + year + '"' + (selectedYear === String(year) ? ' selected' : '') + '>' + year + '</option>'; }).join('') + '</select></label><label><span>Season</span><select id="season-filter"><option value="">All seasons</option><option' + (selectedSeason === 'Winter' ? ' selected' : '') + '>Winter</option><option' + (selectedSeason === 'Spring' ? ' selected' : '') + '>Spring</option><option' + (selectedSeason === 'Summer' ? ' selected' : '') + '>Summer</option></select></label><label><span>Category</span><select id="category-filter"><option value="">All categories</option>' + archiveData.summary.categories.map(function (category) { return '<option>' + escapeHtml(category) + '</option>'; }).join('') + '</select></label><label><span>Recognition</span><select id="result-filter"><option value="">Everything</option><option value="placements"' + (selectedResult === 'placements' ? ' selected' : '') + '>Placed entries</option><option value="awards"' + (selectedResult === 'awards' ? ' selected' : '') + '>Judge award recipients</option><option value="placards"' + (selectedResult === 'placards' ? ' selected' : '') + '>Award placards</option><option value="just-for-fun"' + (selectedResult === 'just-for-fun' ? ' selected' : '') + '>Just-for-fun entries</option></select></label><button class="clear-button" type="button" id="clear-filters" aria-label="Clear filters" title="Clear filters"><span class="clear-filters-icon" aria-hidden="true"></span></button></section>' +
      '<div class="results-heading"><p id="entry-count" aria-live="polite"></p><div class="legend"><span class="legend-winter">Winter</span><span class="legend-spring">Spring</span><span class="legend-summer">Summer</span></div></div><div class="archive-event-list" id="entry-results"></div></div>');

    var controls = ['entry-search', 'year-filter', 'season-filter', 'category-filter', 'result-filter'].map(function (id) { return document.getElementById(id); });
    function update() {
      var query = controls[0].value.trim().toLowerCase();
      var year = controls[1].value;
      var season = controls[2].value;
      var category = controls[3].value;
      var result = controls[4].value;
      var matches = entries.filter(function (entry) {
        var haystack = [entry.title, entry.category, entry.event.label].concat(entry.themes, entry.awards, entry.authors.map(function (author) { return author.name; })).join(' ').toLowerCase();
        if (query && !haystack.includes(query)) return false;
        if (year && String(entry.event.year) !== year) return false;
        if (season && entry.event.season !== season) return false;
        if (category && entry.category !== category) return false;
        if (result === 'placements' && !entry.placement) return false;
        if (result === 'awards' && !entry.awards.length) return false;
        if (result === 'placards' && !entry.awardPlacardUrl) return false;
        if (result === 'just-for-fun' && entry.event.competitionType !== 'just-for-fun') return false;
        return true;
      });
      document.getElementById('entry-count').innerHTML = '<strong>' + matches.length + '</strong> ' + (matches.length === 1 ? 'entry' : 'entries') + ' found';
      var groups = archiveData.events.slice().reverse().map(function (event) {
        return { event: event, entries: matches.filter(function (entry) { return entry.event.id === event.id; }) };
      }).filter(function (group) { return group.entries.length; });
      document.getElementById('entry-results').innerHTML = groups.length ? groups.map(function (group) {
        return archiveEventGroup(group.event, group.entries);
      }).join('') : '<div class="empty-state"><strong>No entries found.</strong><span>Try a broader search or clear the filters.</span></div>';
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
    var history = modder.participations.length ? 'Since ' + escapeHtml(modder.firstModjam) : 'Modjam judge';
    return '<a class="modder-card" href="/modjam/modder/' + encodeURIComponent(modder.id) + '" data-route>' +
      modderAvatar(modder, false) + '<div class="modder-card-copy"><h3>' + escapeHtml(modder.name) + '</h3><p>' + history + '</p><div><span><strong>' + modder.entryIds.length + '</strong> entries</span><span><strong>' + modder.placementEntryIds.length + '</strong> placements</span><span><strong>' + modder.awardCount + '</strong> awards</span></div></div><span class="round-arrow" aria-hidden="true">→</span></a>';
  }

  function stablePassportScore(value) {
    var hash = 2166136261;
    for (var index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

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

    if (candidates.length < PASSPORT_AWARD_MAX) {
      var supplementalAwards = awardGroups.flatMap(function (awards) {
        return awards.filter(function (award) { return !usedAwards.has(award.full); });
      }).sort(function (left, right) {
        var leftIsLong = left.label.length > 48 ? 1 : 0;
        var rightIsLong = right.label.length > 48 ? 1 : 0;
        return leftIsLong - rightIsLong || left.score - right.score || left.label.localeCompare(right.label);
      });
      supplementalAwards.some(function (award) {
        if (candidates.length >= PASSPORT_AWARD_MAX) return true;
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

        var protectedRects = Array.from(book.querySelectorAll('.passport-identity, .passport-visas-title, .passport-judge-badge')).map(function (element) {
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
        var leftPageCircles = circles.filter(function (circle) { return circle.x < bookWidth * .5; });
        var firstLeftStampY = leftPageCircles.reduce(function (top, circle) { return Math.min(top, circle.y); }, bookHeight);
        var averageLeftStampRadius = leftPageCircles.length ? leftPageCircles.reduce(function (total, circle) {
          return total + circle.radius;
        }, 0) / leftPageCircles.length : 0;
        var upperLeftAwardGoal = leftPageCircles.length && notes.length >= 4 ? Math.min(2, Math.ceil(notes.length / 4)) : 0;
        var flatAwardLimit = Math.max(1, Math.floor(notes.length * .25));
        var placed = [];

        function isUpperLeftAwardSpace(geometry) {
          return geometry.centerX < bookWidth * .49 && geometry.centerY < firstLeftStampY - averageLeftStampRadius * .9;
        }

        notes.forEach(function (note, noteIndex) {
          note.classList.remove('is-placed');
          note.dataset.placed = 'false';
          note.style.left = '0';
          note.style.top = '0';
          note.style.transform = 'translate(-50%, -50%) rotate(0deg)';
          var noteWidth = note.offsetWidth;
          var noteHeight = note.offsetHeight;
          var best;
          var upperLeftPlacedCount = placed.filter(isUpperLeftAwardSpace).length;
          var flatPlacedCount = placed.filter(function (geometry) {
            return Math.abs(geometry.angle) < .5;
          }).length;
          var needsUpperLeftBalance = upperLeftPlacedCount < upperLeftAwardGoal;
          var leftPlaced = placed.filter(function (geometry) {
            return geometry.centerX < bookWidth * .5;
          });
          var rightPlaced = placed.filter(function (geometry) {
            return geometry.centerX >= bookWidth * .5;
          });

          [1, .88, .76, .64].some(function (scale) {
            preferredYs.forEach(function (centerY) {
              preferredXs.forEach(function (centerX) {
                rotations.forEach(function (angle) {
                  var geometry = noteGeometry(centerX, centerY, noteWidth * scale, noteHeight * scale, angle);
                  if (!maskAllowsGeometry(geometry)) return;
                  if (protectedRects.some(function (rect) { return rectanglesOverlap(geometry.bounds, rect); })) return;
                  if (circles.some(function (circle) { return noteHitsCircle(geometry, circle); })) return;
                  if (placed.some(function (other) { return rectanglesOverlap(geometry.bounds, other.bounds, collisionMargin); })) return;
                  var isLeftPage = centerX < bookWidth * .5;
                  var samePagePlaced = isLeftPage ? leftPlaced : rightPlaced;
                  var verticalClearance = samePagePlaced.reduce(function (distance, other) {
                    return Math.min(distance, Math.abs(centerY - other.centerY));
                  }, bookHeight);
                  var horizontalClearance = samePagePlaced.reduce(function (distance, other) {
                    return Math.min(distance, Math.abs(centerX - other.centerX));
                  }, bookWidth);
                  var verticalCrowdingPenalty = samePagePlaced.length ? Math.max(0, bookHeight * .16 - verticalClearance) * .6 : 0;
                  var horizontalCrowdingPenalty = samePagePlaced.length ? Math.max(0, bookWidth * .09 - horizontalClearance) * .35 : 0;
                  var pageMinX = isLeftPage ? bookWidth * .14 : bookWidth * .54;
                  var pageMaxX = isLeftPage ? bookWidth * .46 : bookWidth * .86;
                  var horizontalEdgePenalty = Math.max(0, pageMinX - geometry.bounds.left, geometry.bounds.right - pageMaxX) * .9;
                  var verticalEdgePenalty = Math.max(0, bookHeight * .18 - geometry.bounds.top, geometry.bounds.bottom - bookHeight * .87) * .9;
                  var pageEdgePenalty = horizontalEdgePenalty + verticalEdgePenalty;
                  var projectedLeftCount = leftPlaced.length + (isLeftPage ? 1 : 0);
                  var projectedRightCount = rightPlaced.length + (isLeftPage ? 0 : 1);
                  var pageBalancePenalty = Math.abs(projectedLeftCount - projectedRightCount) * bookWidth * .035;
                  var jitter = stablePassportScore(modder.id + '|' + note.textContent + '|' + Math.round(centerX) + '|' + Math.round(centerY) + '|' + angle) % 1000 / 100;
                  var isUpperLeft = isUpperLeftAwardSpace(geometry);
                  var rotationExcess = Math.max(0, Math.abs(angle) - 18) / 27;
                  var rotationPenalty = Math.pow(rotationExcess, 2) * bookWidth * .12 + Math.abs(angle) * .02;
                  var flatRotationPenalty = angle === 0
                    ? (flatPlacedCount >= flatAwardLimit ? bookWidth * .15 : bookWidth * .005)
                    : 0;
                  var balancePenalty = needsUpperLeftBalance && !isUpperLeft ? bookHeight * .28 :
                    upperLeftAwardGoal && upperLeftPlacedCount >= upperLeftAwardGoal && isUpperLeft ? bookHeight * .18 : 0;
                  var score = verticalCrowdingPenalty + horizontalCrowdingPenalty + pageEdgePenalty + pageBalancePenalty + jitter + rotationPenalty + flatRotationPenalty + balancePenalty + (1 - scale) * 80;
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

    Array.from(book.querySelectorAll('.passport-wordmark span, .passport-wordmark strong, .passport-details > span, .passport-details > strong, .passport-details dt, .passport-details dd')).forEach(function (element) {
      var rect = relativeRect(element);
      drawPassportCanvasText(context, element, element.textContent.trim(), rect.left, rect.centerY, outputScale, { maxWidth: rect.width });
    });

    Array.from(book.querySelectorAll('.passport-visas-title')).forEach(function (title) {
      var rect = relativeRect(title);
      var style = getComputedStyle(title);
      var paddingLeft = (parseFloat(style.paddingLeft) || 0) * outputScale;
      var lineHeight = (parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2) * outputScale;
      var textX = rect.left + paddingLeft;
      drawPassportCanvasText(context, title, title.textContent.trim(), textX, rect.top + lineHeight / 2, outputScale, { maxWidth: rect.width - paddingLeft });
      var visaRuleY = rect.bottom - Math.max(1, outputScale) / 2;
      context.save();
      context.strokeStyle = 'rgba(76,44,29,.38)';
      context.lineWidth = Math.max(1, outputScale);
      context.beginPath();
      context.moveTo(textX, visaRuleY);
      context.lineTo(textX + wordmarkRect.width * .25, visaRuleY);
      context.stroke();
      context.restore();
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

    var judgeBadge = book.querySelector('.passport-judge-badge');
    if (judgeBadge) {
      if (!judgeBadge.complete) await new Promise(function (resolve) {
        judgeBadge.addEventListener('load', resolve, { once: true });
        judgeBadge.addEventListener('error', resolve, { once: true });
      });
      if (judgeBadge.naturalWidth) {
        var judgeBadgeRect = relativeRect(judgeBadge);
        var judgeBadgeStyle = getComputedStyle(judgeBadge);
        context.save();
        context.globalAlpha = parseFloat(judgeBadgeStyle.opacity) || 1;
        context.globalCompositeOperation = judgeBadgeStyle.mixBlendMode === 'multiply' ? 'multiply' : 'source-over';
        context.drawImage(judgeBadge, judgeBadgeRect.left, judgeBadgeRect.top, judgeBadgeRect.width, judgeBadgeRect.height);
        context.restore();
      }
    }

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
      return '<a class="passport-stamp passport-stamp--' + eventTone(event) + '" href="' + archiveEventUrl(event) + '" data-route style="--stamp-turn:' + turns[index % turns.length] + 'deg" aria-label="Open the ' + escapeHtml(event.label) + ' Modjam archive">' +
        '<span>' + escapeHtml(event.season) + '</span><strong>' + event.year + '</strong><small>Modjam</small></a>';
    };
    var leftStamps = passportEvents.slice(0, leftStampCount).map(stampLink).join('');
    var rightStamps = passportEvents.slice(leftStampCount).map(function (event, index) { return stampLink(event, index + leftStampCount); }).join('');
    var rightTitle = leftStampCount ? '' : '<span class="passport-visas-title">Entry visas</span>';
    var rightVisasClass = leftStampCount ? ' passport-visas--untitled' : '';
    var densityClass = passportEvents.length > 15 ? ' passport-book--dense' : '';
    var awardNotes = passportAwardNotes(modder, work);
    var judgeBadge = modder.isJudge ? '<img class="passport-judge-badge" src="assets/passport/judge_stamp.webp" alt="Judge badge" width="800" height="288" decoding="async">' : '';
    var firstRecordLabel = passportEvents.length ? 'First stamp' : 'Role';
    var firstRecordValue = passportEvents.length ? modder.firstModjam : 'Judge';

    return '<section class="passport-section" aria-labelledby="passport-heading"><div class="passport-heading-row"><div class="section-heading section-heading-panel passport-heading"><h2 id="passport-heading">Modjam passport</h2></div><button class="button button--ink passport-download" type="button" data-passport-download>Download passport <svg class="lucide lucide-download" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3"></path><path d="m17 10-5 5-5-5"></path><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path></svg></button></div>' +
      '<div class="passport-scroll" tabindex="0" aria-label="Scrollable Modjam passport for ' + escapeHtml(modder.name) + '"><div class="passport-book' + densityClass + '">' +
      '<img class="passport-art" src="assets/images/modjam_passport.webp" alt="" width="2048" height="1024" decoding="async">' +
      '<div class="passport-identity"><div class="passport-wordmark"><span>Morrowind Modjam</span><strong>Passport</strong></div><div class="passport-holder"><div class="passport-photo">' + modderAvatar(modder, false) + '</div><div class="passport-details"><span>Passport holder</span><strong>' + escapeHtml(modder.name) + '</strong><dl><div><dt>' + firstRecordLabel + '</dt><dd>' + escapeHtml(firstRecordValue) + '</dd></div><div><dt>Stamps</dt><dd>' + passportEvents.length + '</dd></div></dl></div></div></div>' +
      judgeBadge +
      (leftStamps ? '<div class="passport-visas passport-visas--left"><span class="passport-visas-title">Entry visas</span><div class="passport-stamp-grid">' + leftStamps + '</div></div>' : '') +
      '<div class="passport-visas passport-visas--right' + rightVisasClass + '">' + rightTitle + '<div class="passport-stamp-grid">' + rightStamps + '</div></div>' +
      (awardNotes ? '<div class="passport-award-notes" aria-label="Selected judge awards">' + awardNotes + '</div>' : '') +
      '</div></div><p class="passport-mobile-hint">Swipe to explore the full passport</p></section>';
  }

  function renderModders() {
    renderPage('<div class="paper-page">' + pageIntro('', 'The Modjammers') +
      '<section class="modder-toolbar"><label><span>Find a modder</span><input id="modder-search" type="search" placeholder="Search by name…"></label><label><span>Sort by</span><select id="modder-sort"><option value="entries">Most entries</option><option value="events">Most Modjams</option><option value="awards">Most awards</option><option value="name">Name A–Z</option></select></label><p id="modder-count" aria-live="polite"></p></section><section class="modder-grid" id="modder-results"></section></div>');
    var search = document.getElementById('modder-search');
    var sort = document.getElementById('modder-sort');
    function update() {
      var query = search.value.trim().toLowerCase();
      var matches = modderData.modders.filter(function (modder) {
        return modder.name.toLowerCase().includes(query) || String(modder.judgeListedAs || '').toLowerCase().includes(query);
      });
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
      renderPage('<div class="paper-page"><div class="empty-state empty-state--page"><strong>That modder is not in the archive.</strong><a class="button button--ink" href="/modjam/modders" data-route>Browse all modders</a></div></div>');
      return;
    }
    var work = modder.entryIds.map(function (entryId) { return entryById.get(entryId); }).filter(Boolean).sort(function (a, b) { return b.event.year - a.event.year; });
    var recognized = work.filter(function (entry) { return entry.placement || entry.awards.length; });
    var links = [
      modder.nexusProfileUrl && '<a href="' + safeUrl(modder.nexusProfileUrl) + '" target="_blank" rel="noopener">Nexus Mods ↗</a>',
      modder.modathonProfileUrl && '<a href="' + safeUrl(modder.modathonProfileUrl) + '">Modathon profile ↗</a>',
      modder.madnessProfileUrl && '<a href="' + safeUrl(modder.madnessProfileUrl) + '">Madness profile ↗</a>'
    ].filter(Boolean).join('');
    var profileEyebrow = modder.participations.length
      ? (modder.isJudge ? 'Modjam judge · Modjammer since ' : 'Modjammer since ') + escapeHtml(modder.firstModjam)
      : 'Modjam judge';
    var awardCabinet = recognized.length ? '<section class="profile-section"><div class="section-heading section-heading--row"><div class="section-heading-panel"><h2>The trophy cabinet</h2></div><span class="cabinet-total">' + (modder.awardCount + modder.placementEntryIds.length) + ' recognitions</span></div><div class="cabinet-grid">' + recognized.map(function (entry) {
      return '<article class="cabinet-card"><div class="cabinet-card-copy"><div class="cabinet-card-head">' + placementBadge(entry) + '<span class="entry-event">' + escapeHtml(entry.event.label) + '</span></div><h3>' + escapeHtml(entry.title) + '</h3>' + (entry.awards.length ? '<div class="award-chips">' + entry.awards.map(function (award) { return '<span>' + escapeHtml(award) + '</span>'; }).join('') + '</div>' : '') + (entry.awardPlacardUrl ? '<a class="placard-link" href="' + safeUrl(entry.awardPlacardUrl) + '" target="_blank" rel="noopener">View award placard ↗</a>' : '') + '</div><img class="cabinet-trophy" src="assets/images/trophy.webp" alt="" width="281" height="846" loading="lazy" decoding="async"></article>';
    }).join('') + '</div></section>' : '';
    var entriesSection = work.length ? '<section class="profile-section"><div class="section-heading section-heading-panel"><h2>' + escapeHtml(modder.name) + '’s<br>Modjamography</h2></div><div class="entry-grid">' + work.map(entryCard).join('') + '</div></section>' : '';
    renderPage('<div class="paper-page"><nav class="breadcrumb" aria-label="Breadcrumb"><a href="/modjam/modders" data-route>Modders</a><span aria-hidden="true">/</span><span>' + escapeHtml(modder.name) + '</span></nav><section class="profile-hero">' + modderAvatar(modder, true) + '<div class="profile-title"><span class="eyebrow">' + profileEyebrow + '</span><h1>' + escapeHtml(modder.name) + '</h1><div class="profile-links">' + links + '</div></div><div class="profile-stats"><div><strong>' + work.length + '</strong><span>entries</span></div><div><strong>' + modder.participations.length + '</strong><span>Modjams</span></div><div><strong>' + modder.placementEntryIds.length + '</strong><span>placements</span></div><div><strong>' + modder.awardCount + '</strong><span>judge awards</span></div></div></section>' + modjamPassport(modder, work) + awardCabinet + entriesSection + '</div>');
    setupPassportAwardLayout(modder);
    document.querySelector('[data-passport-download]').addEventListener('click', function (event) { downloadPassportPng(modder, event.currentTarget); });
  }

  function setActiveNav(name) {
    document.querySelectorAll('[data-nav]').forEach(function (link) { link.classList.toggle('is-active', link.dataset.nav === name); });
  }

  function renderRoute() {
    clearInterval(countdownTimer);
    if (postcardCreatorCleanup) postcardCreatorCleanup();
    if (passportResizeObserver) {
      passportResizeObserver.disconnect();
      passportResizeObserver = null;
    }
    main.classList.remove('is-home');
    var path = location.pathname.replace(/\/+$/, '') || '/';
    if (path === '/modjam/archive') { setActiveNav('archive'); renderArchive(); }
    else if (path === '/modjam/modders') { setActiveNav('modders'); renderModders(); }
    else if (path === '/modjam/postcard') { setActiveNav('postcard'); renderPostcardCreator(); }
    else if (path === '/modjam/faq') { setActiveNav('faq'); renderFaq(); }
    else if (path.indexOf('/modjam/modder/') === 0) { setActiveNav('modders'); renderProfile(decodeURIComponent(path.slice('/modjam/modder/'.length))); }
    else { main.classList.add('is-home'); setActiveNav('home'); renderHome(); }
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
    if (!event.target.matches) return;
    if (event.target.matches('.background-postcard__photo')) {
      var sourceAspect = event.target.naturalWidth / event.target.naturalHeight;
      var postcardAspect = 16 / 9;
      var cropZoom = sourceAspect > postcardAspect + 0.2 ? Math.min(1.28, 1 + (sourceAspect - postcardAspect) * 0.18) : 1;
      event.target.style.setProperty('--photo-zoom', cropZoom.toFixed(3));
      return;
    }
    if (!event.target.matches('.entry-card-picture img')) return;
    event.target.parentElement.classList.remove('entry-card-picture--loading');
    event.target.parentElement.classList.add('entry-card-picture--loaded');
  }, true);
  window.addEventListener('popstate', renderRoute);

  Promise.all([
    fetch('./data/modjams.json').then(function (response) { if (!response.ok) throw new Error('Modjam archive failed to load'); return response.json(); }),
    fetch('./data/modders.json').then(function (response) { if (!response.ok) throw new Error('Modder archive failed to load'); return response.json(); }),
    fetch('./data/judges.json').then(function (response) { if (!response.ok) throw new Error('Judge registry failed to load'); return response.json(); }),
    fetch('../assets/data/modder-avatars.json').then(function (response) { if (!response.ok) throw new Error('Modder avatar cache failed to load'); return response.json(); }),
    fetch('./data/postcards.json').then(function (response) { if (!response.ok) throw new Error('Postcard manifest failed to load'); return response.json(); })
  ]).then(function (data) {
    archiveData = data[0];
    modderData = data[1];
    hydrateJudgeProfiles(data[2]);
    avatarAssets = data[3].avatars || {};
    postcardData = Array.isArray(data[4]) ? data[4] : [];
    entries = archiveData.events.flatMap(function (event) {
      return event.entries.map(function (entry) { return Object.assign({ event: event }, entry); });
    });
    entries.forEach(function (entry) { entryById.set(entry.id, entry); });
    renderRoute();
  }).catch(function (error) {
    main.innerHTML = '<div class="load-error"><strong>The archive would not unfold.</strong><p>' + escapeHtml(error.message) + '</p><button type="button" onclick="location.reload()">Try again</button></div>';
  });
})();
